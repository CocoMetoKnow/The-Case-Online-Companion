/**
 * Team Mode rooms, kept on the server the same way the main game keeps its tables.
 *
 * The server owns the real game: it runs the same pure reducer the one-phone game uses, checks that
 * a move really comes from the detective whose turn it is, and hands every phone a redacted copy of
 * the table (no solution, no unfound clues, no puzzle answer). Phones poll with a revision number and
 * the request is held open until something changes, so a move shows up on every phone in a moment.
 * Because the table lives here (and is saved to disk), a refresh or a dropped connection puts a
 * phone straight back at its seat.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { newGame, type TeamState } from "./engine.ts";
import { MAX_SEATS, MIN_SEATS, applyIntent, joinLobby, redact, type HostTable, type RosterEntry } from "./online.ts";
import { freshSeed } from "./rng.ts";

const ROOM_PATH = process.env.TEAM_ROOMS_PATH ?? join(tmpdir(), "the-case-team-rooms-v1.json");
const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const NAME = z.string().max(40).default("");

const post = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), room: ID, peer: ID, name: NAME, seed: z.string().max(40).optional() }),
  z.object({ op: z.literal("join"), room: ID, peer: ID, name: NAME }),
  z.object({ op: z.literal("start"), room: ID, peer: ID }),
  z.object({ op: z.literal("act"), room: ID, peer: ID, n: z.number().int().min(0), action: z.unknown() }),
  z.object({ op: z.literal("again"), room: ID, peer: ID, seed: z.string().max(40).optional() }),
  z.object({ op: z.literal("leave"), room: ID, peer: ID }),
]);

interface Room {
  hostPid: string;
  rev: number;
  seed: string;
  roster: RosterEntry[];
  /** null while the room is still a lobby. */
  table: HostTable | null;
  seen: Record<string, number>;
  born: number;
  touched: number;
}

const g = globalThis as typeof globalThis & { __teamRooms?: Map<string, Room> };

function readDisk(): Map<string, Room> {
  for (const path of [ROOM_PATH, `${ROOM_PATH}.bak`]) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, Room>;
      if (raw && typeof raw === "object") return new Map(Object.entries(raw));
    } catch {
      /* try the backup, then start empty */
    }
  }
  return new Map();
}

const DAY = 24 * 60 * 60 * 1000;
function rooms(): Map<string, Room> {
  if (!g.__teamRooms) {
    g.__teamRooms = readDisk();
    const now = Date.now();
    for (const [code, r] of g.__teamRooms) if (now - (r.touched ?? 0) > DAY) g.__teamRooms.delete(code);
  }
  return g.__teamRooms;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(ROOM_PATH), { recursive: true });
      const out: Record<string, Room> = {};
      for (const [code, r] of rooms()) out[code] = r;
      const tmp = `${ROOM_PATH}.tmp`;
      writeFileSync(tmp, JSON.stringify(out));
      try {
        renameSync(ROOM_PATH, `${ROOM_PATH}.bak`);
      } catch {
        /* first save */
      }
      renameSync(tmp, ROOM_PATH);
    } catch (error) {
      console.error("[team-room] save failed", error);
    }
  }, 400);
}

type Waiter = () => void;
const waiters = new Map<string, Set<Waiter>>();
const lanes = new Map<string, Promise<unknown>>();
const lastSeen = new Map<string, Record<string, number>>();

function bump(code: string, room: Room) {
  room.rev += 1;
  room.touched = Date.now();
  scheduleSave();
  const set = waiters.get(code);
  if (set) {
    for (const w of [...set]) w();
    set.clear();
  }
}

function waitForChange(code: string, rev: number, ms: number): Promise<void> {
  const room = rooms().get(code);
  if (!room || room.rev !== rev) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      waiters.get(code)?.delete(finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    let set = waiters.get(code);
    if (!set) waiters.set(code, (set = new Set()));
    set.add(finish);
  });
}

/** Moves for one room are applied one at a time, in the order they arrived. */
function lane<T>(code: string, job: () => T): Promise<T> {
  const prev = lanes.get(code) ?? Promise.resolve();
  const run = prev.then(job, job);
  lanes.set(code, run.catch(() => undefined));
  return run;
}

function touchPeer(code: string, peer: string) {
  const m = lastSeen.get(code) ?? {};
  m[peer] = Date.now();
  lastSeen.set(code, m);
}

function onlineList(code: string): string[] {
  const m = lastSeen.get(code) ?? {};
  const now = Date.now();
  return Object.keys(m).filter((p) => now - m[p] < 30_000);
}

function view(code: string, room: Room) {
  return {
    rev: room.rev,
    hostPid: room.hostPid,
    seed: room.seed,
    roster: room.roster,
    seats: room.table?.seats ?? null,
    state: room.table ? redact(room.table.state) : null,
    online: onlineList(code),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
const missing = () => json({ error: "No table with that code yet. Check the code, and make sure the host has the lobby open." }, 404);

export async function handleTeamRoom(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(new URL(request.url));
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method" }, 405);
  } catch (error) {
    console.error("[team-room]", error);
    return json({ error: "The table hit a snag. Try again." }, 500);
  }
}

async function handleGet(url: URL): Promise<Response> {
  const q = z.object({ room: ID, peer: ID, rev: z.coerce.number().int().min(0).default(0), snap: z.string().optional() }).safeParse({
    room: url.searchParams.get("room"),
    peer: url.searchParams.get("peer"),
    rev: url.searchParams.get("rev") ?? 0,
    snap: url.searchParams.get("snap") ?? undefined,
  });
  if (!q.success) return json({ error: "invalid query" }, 400);
  const { room: code, peer, rev, snap } = q.data;
  const room = rooms().get(code);
  if (!room) return missing();
  touchPeer(code, peer);
  if (!snap && rev === room.rev) await waitForChange(code, rev, 18_000);
  const fresh = rooms().get(code);
  if (!fresh) return missing();
  touchPeer(code, peer);
  if (!snap && rev === fresh.rev) return json({ rev: fresh.rev, online: onlineList(code), same: true });
  return json(view(code, fresh));
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = post.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  return lane(msg.room, () => apply(msg));
}

function apply(msg: z.infer<typeof post>): Response {
  const code = msg.room;
  const map = rooms();
  touchPeer(code, msg.peer);

  if (msg.op === "create") {
    const existing = map.get(code);
    // The same phone re-opening its own room (after a refresh) just gets the table back.
    if (existing) {
      if (existing.hostPid !== msg.peer) return json({ error: "That room code is already taken. Try a new one." }, 409);
      return json(view(code, existing));
    }
    const name = msg.name.trim().slice(0, 14) || "Host";
    const room: Room = {
      hostPid: msg.peer,
      rev: 1,
      seed: (msg.seed || "").trim() || freshSeed(),
      roster: [{ pid: msg.peer, name }],
      table: null,
      seen: {},
      born: Date.now(),
      touched: Date.now(),
    };
    map.set(code, room);
    scheduleSave();
    return json(view(code, room));
  }

  const room = map.get(code);
  if (!room) return missing();
  room.touched = Date.now();

  if (msg.op === "join") {
    if (room.table) {
      // The case is under way: only someone who already has a seat can come back to it.
      if (room.table.seats.includes(msg.peer)) return json(view(code, room));
      return json({ error: "That case has already started without you. Ask the host to start a new one.", full: true }, 409);
    }
    const next = joinLobby(room.roster, msg.peer, msg.name);
    if (!next.some((r) => r.pid === msg.peer)) return json({ error: "That table is full.", full: true }, 409);
    if (next !== room.roster && JSON.stringify(next) !== JSON.stringify(room.roster)) {
      room.roster = next;
      bump(code, room);
    }
    return json(view(code, room));
  }

  if (msg.op === "leave") {
    if (msg.peer === room.hostPid) {
      map.delete(code);
      lastSeen.delete(code);
      scheduleSave();
      const set = waiters.get(code);
      if (set) for (const w of [...set]) w();
      return json({ ok: true });
    }
    if (!room.table) {
      room.roster = room.roster.filter((r) => r.pid !== msg.peer);
      bump(code, room);
    }
    const m = lastSeen.get(code);
    if (m) delete m[msg.peer];
    return json({ ok: true });
  }

  if (msg.op === "start") {
    if (msg.peer !== room.hostPid) return json({ error: "Only the host can start the case." }, 403);
    if (room.table && room.table.state.status === "play") return json(view(code, room));
    if (room.roster.length < MIN_SEATS) return json({ error: `Waiting for at least ${MIN_SEATS} detectives.` }, 400);
    const roster = room.roster.slice(0, MAX_SEATS);
    const state = newGame(room.seed, roster.map((r) => r.name));
    room.table = { state, seats: roster.map((r) => r.pid), hostPid: room.hostPid, seen: {} };
    bump(code, room);
    return json(view(code, room));
  }

  if (msg.op === "again") {
    if (msg.peer !== room.hostPid) return json({ error: "Only the host can do that." }, 403);
    room.table = null;
    room.seed = (msg.seed || "").trim() || freshSeed();
    bump(code, room);
    return json(view(code, room));
  }

  // act
  if (!room.table) return json(view(code, room));
  const result = applyIntent(room.table, { t: "tm:act", pid: msg.peer, n: msg.n, action: msg.action as never });
  room.table = result.table;
  if (result.changed) bump(code, room);
  return json(view(code, room));
}

export type TeamTable = ReturnType<typeof view>;
export type { TeamState };
