import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { applyPlay } from "@/lib/game/actions";
import { accusationHits, addPlayer, blockingPlayerIds, dealAndStart, dropPlayer, ensureObjective, healEmptyHands, promoteHost, releaseQuestion, rememberRound, removePlayer, restoreRound } from "@/lib/game/engine";
import { sanitizeState } from "@/lib/game/sanitize";
import { cardStamp, shortStamp, slimState } from "@/lib/game/slim";
import type { GameState, Secrets } from "@/lib/game/types";

/**
 * One room per code. The host opens it with the rules from their setup.
 * Joining, dealing, and every move happen here, then every phone reads the same table.
 */

function hostCap(settings: { table?: string; maxPlayers?: number } | undefined) {
  const hard = settings?.table === "board" ? 8 : 15;
  const picked = Number(settings?.maxPlayers);
  if (!Number.isFinite(picked)) return hard;
  return Math.max(2, Math.min(hard, Math.floor(picked)));
}

function playableSeats(cards: { category?: string }[] | undefined, time: boolean | undefined) {
  const cats = time ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
  const list = cards ?? [];
  const groups = cats.filter((cat) => list.some((card) => card.category === cat));
  const total = list.filter((card) => groups.includes(card.category ?? "")).length;
  return Math.max(0, total - groups.length);
}

/** How many can sit: the host's cap, or fewer if the deck cannot give each of them a card. */
function joinCap(state: { settings?: { table?: string; maxPlayers?: number; timeOfDayEnabled?: boolean }; cards?: { category?: string }[] }) {
  return Math.min(hostCap(state.settings), playableSeats(state.cards, state.settings?.timeOfDayEnabled));
}
// Where live rooms are saved. Set ROOMS_PATH to change it; the default works on any host.
const ROOM_PATH = process.env.ROOMS_PATH ?? join(tmpdir(), "the-case-rooms-v3.json");
const ID = z.string().min(1).max(64);

type Room = {
  hostId: string;
  born: number;
  rev: number;
  putSeq: number;
  state: GameState;
  secrets: Secrets;
  actIds: string[];
  seen: Record<string, number>;
  /** Revision every phone must receive before the next move. 0 means play is open. */
  holdRev: number;
  caught: Record<string, number>;
  stuckKey?: string;
  stuckAt?: number;
};

const g = globalThis as typeof globalThis & {
  __caseRooms3?: Map<string, Room>;
  __caseMtime3?: number;
};

function readDisk(): Map<string, Room> {
  for (const path of [ROOM_PATH, `${ROOM_PATH}.bak`]) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, Room>;
      if (!raw || typeof raw !== "object") continue;
      return new Map(Object.entries(raw));
    } catch {
      /* try the backup before giving up on a live table */
    }
  }
  return new Map();
}

function rooms(): Map<string, Room> {
  if (!g.__caseRooms3) {
    const loaded = readDisk();
    for (const room of loaded.values()) {
      if (!room.born) room.born = 1;
      room.actIds ??= [];
      room.seen ??= {};
      room.caught ??= {};
      room.holdRev ??= 0;
    }
    g.__caseRooms3 = loaded;
    try {
      g.__caseMtime3 = statSync(ROOM_PATH).mtimeMs;
    } catch {
      g.__caseMtime3 = 0;
    }
  }
  return g.__caseRooms3;
}

function saveNow(map: Map<string, Room>) {
  try {
    mkdirSync(dirname(ROOM_PATH), { recursive: true });
    const packed: Record<string, Room> = {};
    for (const [code, room] of map) {
      packed[code] = {
        ...room,
        state: {
          ...room.state,
          cards: room.state.cards.map(({ imageDataUrl: _image, ...card }) => card),
          log: room.state.log.slice(-8),
        },
      };
    }
    const tmp = `${ROOM_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(packed));
    renameSync(tmp, ROOM_PATH);
    g.__caseRooms3 = map;
    g.__caseMtime3 = statSync(ROOM_PATH).mtimeMs;
  } catch (error) {
    console.error("[room] save failed", error);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(map: Map<string, Room>) {
  g.__caseRooms3 = map;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow(rooms());
  }, 500);
}

function onlineCount(room: Room): number {
  const now = Date.now();
  return Object.values(room.seen).filter((at) => now - at < 20_000).length;
}

function settingsStamp(state: GameState): string {
  const settings = state.settings;
  return shortStamp([
    settings.playMode,
    settings.table ?? "",
    settings.heist ? "1" : "0",
    settings.manualNotes ? "1" : "0",
    settings.speakMode ? "1" : "0",
    settings.extraDifficulty ? "1" : "0",
    settings.classicNames ? "1" : "0",
    settings.hiddenRooms === false ? "0" : "1",
    settings.noRepeatRoom ? "1" : "0",
    settings.timeOfDayEnabled ? "1" : "0",
    String(settings.maxPlayers),
    (settings.enabledEvents ?? []).join(","),
    (settings.enabledRoomIds ?? []).join(","),
    (settings.boardPassages ?? []).map((p) => `${p.a}:${p.b}:${p.via ?? ""}`).join(","),
    (state.passages ?? []).map((p) => `${p.a}:${p.b}`).join(","),
  ]);
}

type Known = { sig?: string; set?: string; hand?: string; rv?: number; fx?: string };

function fxStamp(state: GameState): string {
  const spy = state.spy ? `${state.spy.byId}:${state.spy.targetId}:${state.spy.armed ? 1 : 0}` : "";
  const hush = state.hush ? `${state.hush.byId}:${state.hush.cardId}` : "";
  const locks = Object.entries(state.notesLock ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, turns]) => `${id}:${turns}`)
    .join(",");
  const influences = (state.influences ?? []).map((item) => `${item.victimId}:${item.controllerId}`).join(",");
  return shortStamp([spy, hush, locks, influences, (state.skipIds ?? []).join(","), state.shortDieId ?? "", String(state.extraDie ?? ""), state.gambler ? `${state.gambler.playerId}:${state.gambler.category}` : "", state.bonusRoom?.playerId ?? ""]);
}

/** Only what this phone needs for the current turn. The deck and rules stay on the phone after the first look. */
function wireState(state: GameState, peer: string, known: Known, answers: Set<string>): GameState {
  const safe = sanitizeState(state, peer);
  const cardsSame = Boolean(known.sig && known.sig === cardStamp(safe.cards));
  const rulesSame = Boolean(known.set && known.set === settingsStamp(safe));
  const mineLock = safe.notesLock?.[peer];
  const event = safe.event
    ? {
        deckId: safe.event.deckId,
        kind: safe.event.kind,
        title: safe.event.title,
        description: (safe.event.description ?? "").slice(0, 220),
        step: safe.event.step,
        data: safe.event.data ?? {},
      }
    : null;
  return {
    version: safe.version,
    code: safe.code,
    hostId: safe.hostId,
    settings: rulesSame ? ({} as GameState["settings"]) : safe.settings,
    cards: cardsSame
      ? []
      : safe.cards.map(({ imageDataUrl: _image, blurb, ...card }) => ({
          ...card,
          blurb: (blurb ?? "").slice(0, 80),
        })),
    leftover: (safe.leftover ?? []).filter((id) => !answers.has(String(id))),
    players: safe.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      seat: player.seat,
      eliminated: Boolean(player.eliminated),
      isHost: Boolean(player.isHost),
      position: player.position,
      avatar: player.avatar,
    })),
    turnOrder: safe.turnOrder,
    turnIndex: safe.turnIndex,
    phase: safe.phase,
    dice: safe.dice,
    moveBudget: safe.moveBudget ?? 0,
    pace: safe.pace ?? null,
    shortDieId: safe.shortDieId ?? null,
    singleDie: Boolean(safe.singleDie),
    extraDie: safe.extraDie ?? null,
    gambler: safe.gambler ?? null,
    spy: safe.spy ?? null,
    actionsLeft: safe.actionsLeft ?? 0,
    freeQuestion: Boolean(safe.freeQuestion),
    bonusRoom: safe.bonusRoom ?? null,
    whisperMode: Boolean(safe.whisperMode),
    question: safe.phase === "question" ? safe.question : null,
    notice: safe.noticeFor === peer && safe.noticeSelf ? safe.noticeSelf : (safe.notice ?? null),
    event: safe.phase === "event" ? event : null,
    log: (safe.log ?? []).slice(-3).map((entry) => ({
      id: entry.id,
      text: (entry.text ?? "").slice(0, 160),
      turn: entry.turn,
    })),
    winnerId: safe.winnerId,
    startedAt: safe.startedAt,
    eventDeck: [],
    eventDiscard: [],
    accusation: safe.accusation,
    passages: rulesSame ? [] : (safe.passages ?? []),
    skipIds: safe.skipIds ?? [],
    notesLock: { [peer]: mineLock ?? 0 },
    influences: safe.influences ?? [],
    hush: safe.hush ?? null,
    wait: safe.wait ?? null,
    // The in-game chat is public to the whole table.
    chat: (safe.chat ?? []).slice(-60),
    sync: safe.sync ? { byId: String(safe.sync.byId), agreed: (safe.sync.agreed ?? []).map(String).slice(0, 15) } : null,
    // Solve the Case picks are shown live to the whole table, so every phone gets them, not just the guesser's.
    naming: safe.naming ?? null,
    // Live suggestion picks. Phones only use them for the Extra Visuals background, and only when it is on.
    drafting: safe.drafting ?? null,
    privateShow: safe.privateShow ?? null,
    lastSuggestion: safe.lastSuggestion ?? null,
    // Private to the guest it belongs to: it spells out which cards are in the envelope.
    pendingAnswer: safe.pendingAnswer && safe.pendingAnswer.askerId === peer ? safe.pendingAnswer : null,
  } as GameState;
}

function view(room: Room, peer: string, known: Known = {}) {
  if (room.holdRev) room.caught[peer] = Math.max(room.caught[peer] ?? 0, room.rev);
  const answers = new Set(
    Object.values(room.secrets.solution ?? {})
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const hand = (room.secrets.hands[peer] ?? []).filter((id) => !answers.has(String(id)));
  const fx = fxStamp(room.state);
  return {
    rev: room.rev,
    born: room.born,
    putSeq: room.putSeq,
    online: onlineCount(room),
    cardSig: cardStamp(room.state.cards),
    setSig: settingsStamp(room.state),
    fxSig: fx,
    state: wireState(room.state, peer, known, answers),
    hand,
    solution: room.state.phase === "gameover" ? room.secrets.solution : undefined,
    hits: accusationHits(room.state, room.secrets, peer),
  };
}

type Waiter = { resolve: () => void };
const waiters = new Map<string, Set<Waiter>>();
const lanes = new Map<string, Promise<void>>();

function notify(code: string) {
  const set = waiters.get(code);
  if (!set) return;
  for (const waiter of set) waiter.resolve();
  set.clear();
}

function waitForChange(code: string, rev: number, ms: number): Promise<void> {
  const room = rooms().get(code);
  if (!room || room.rev !== rev) return Promise.resolve();
  return new Promise((resolve) => {
    const waiter: Waiter = {
      resolve: () => {
        windowClear();
        resolve();
      },
    };
    const windowClear = () => {
      clearTimeout(timer);
      waiters.get(code)?.delete(waiter);
    };
    const timer = setTimeout(() => {
      waiters.get(code)?.delete(waiter);
      resolve();
    }, ms);
    let set = waiters.get(code);
    if (!set) {
      set = new Set();
      waiters.set(code, set);
    }
    set.add(waiter);
  });
}

function bump(map: Map<string, Room>, code: string, room: Room) {
  room.rev += 1;
  scheduleSave(map);
  notify(code);
}

function enqueue(code: string, job: () => Response): Promise<Response> {
  const prev = lanes.get(code) ?? Promise.resolve();
  const run = prev.then(job, job);
  lanes.set(
    code,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

const PAUSE_AFTER = 20_000;
const FRESH_MS = 15_000;
const KICK_AFTER = 45_000;
const LOBBY_AWAY = 60_000;

function seatHost(state: GameState): GameState {
  if (state.startedAt || state.phase !== "lobby") return state;
  const seated = state.players.filter((player) => !player.eliminated);
  if (!seated.length) return { ...state, hostId: state.hostId };
  if (seated.some((player) => player.id === state.hostId)) {
    return { ...state, players: state.players.map((player) => ({ ...player, isHost: player.id === state.hostId })) };
  }
  const hostId = seated[0].id;
  return {
    ...state,
    hostId,
    players: state.players.map((player) => ({ ...player, isHost: player.id === hostId })),
  };
}

function leaveLobby(state: GameState, playerId: string): GameState {
  if (state.startedAt) return state;
  const remaining = state.players.filter((player) => player.id !== playerId);
  return seatHost({
    ...state,
    players: remaining,
    turnOrder: state.turnOrder.filter((id) => id !== playerId),
    hostId: remaining.some((player) => player.id === state.hostId) ? state.hostId : "",
  });
}

function reseatLobby(room: Room, peer: string, name: string): boolean {
  if (room.state.startedAt || room.state.phase !== "lobby") return false;
  if (room.state.players.some((player) => player.id === peer)) return false;
  const cap = joinCap(room.state);
  if (room.state.players.length >= cap) return false;
  const opened = { ...room.state, settings: { ...room.state.settings, locked: false } };
  const added = addPlayer(opened, name || "Guest", peer);
  if (added === opened) return false;
  const seated = seatHost({ ...added, settings: room.state.settings });
  room.state = seated;
  room.hostId = seated.hostId || room.hostId;
  return true;
}

function sweepLobby(room: Room): boolean {
  if (room.state.startedAt || room.state.phase !== "lobby") return false;
  const now = Date.now();
  const gone = room.state.players.filter((player) => {
    const at = room.seen?.[player.id];
    return typeof at === "number" && now - at > LOBBY_AWAY;
  });
  if (!gone.length) return false;
  let state = room.state;
  for (const player of gone) {
    state = leaveLobby(state, player.id);
    delete room.seen[player.id];
  }
  room.state = state;
  room.hostId = state.hostId || room.hostId;
  return true;
}

function claimHand(room: Room, peer: string, raw: string): boolean {
  if (!room.state.startedAt || !raw) return false;
  const mine = room.secrets.hands?.[peer];
  if (Array.isArray(mine) && mine.length > 0) return false;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!ids.length) return false;
  const used = new Set<string>();
  for (const id of Object.values(room.secrets.solution ?? {})) if (id) used.add(String(id));
  for (const [id, pile] of Object.entries(room.secrets.hands ?? {})) {
    if (id === peer || !Array.isArray(pile)) continue;
    for (const card of pile) used.add(String(card));
  }
  for (const id of room.state.leftover ?? []) used.add(String(id));
  const safe = ids.filter((id) => !used.has(id));
  if (!safe.length) return false;
  room.secrets = { ...room.secrets, hands: { ...(room.secrets.hands ?? {}), [peer]: safe } };
  return true;
}

function syncCatchup(room: Room): boolean {
  if (!room.holdRev || !room.state.startedAt) {
    room.holdRev = 0;
    return false;
  }
  const pending = room.state.players
    .map((player) => player.id)
    .filter((id) => (room.caught[id] ?? 0) < room.holdRev)
    .sort();
  if (!pending.length) {
    room.holdRev = 0;
    if (!room.state.wait) return false;
    room.state = { ...room.state, wait: null };
    return true;
  }
  const prev = room.state.wait;
  const since = prev?.since ?? Date.now();
  const same = Boolean(prev && prev.ids.length === pending.length && prev.ids.every((id, index) => id === pending[index]));
  if (same) return false;
  room.state = { ...room.state, wait: { ids: pending, since } };
  return true;
}

function beginCatchup(room: Room) {
  room.caught = {};
  room.holdRev = room.rev;
  const ids = room.state.players.map((player) => player.id);
  if (!ids.length) {
    room.holdRev = 0;
    return;
  }
  room.state = { ...room.state, wait: { ids, since: Date.now() } };
}

function sweepRoom(room: Room): boolean {
  room.caught ??= {};
  room.holdRev ??= 0;
  let changed = false;
  if (room.state.startedAt && room.state.phase === "event" && !room.state.event) {
    room.state = { ...room.state, phase: "action", actionsLeft: Math.max(1, room.state.actionsLeft ?? 1) };
    changed = true;
  }
  if (room.state.startedAt) {
    const hosted = promoteHost(room.state);
    if (hosted !== room.state) {
      room.state = hosted;
      room.hostId = hosted.hostId;
      changed = true;
    }
  }
  if (room.holdRev) {
    if (syncCatchup(room)) changed = true;
  }
  if (room.state.phase === "question") {
    const released = releaseQuestion(room.state, room.secrets);
    if (released !== room.state) {
      room.state = released;
      changed = true;
    }
  }
  const healed = healEmptyHands(room.state, room.secrets);
  if (healed.state !== room.state || healed.secrets !== room.secrets) {
    room.state = healed.state;
    room.secrets = healed.secrets;
    changed = true;
  }
  const fixed = ensureObjective(room.state, room.secrets);
  if (fixed.state !== room.state || fixed.secrets !== room.secrets) {
    room.state = fixed.state;
    room.secrets = fixed.secrets;
    changed = true;
  }
  if (!room.holdRev && syncPause(room)) changed = true;
  const seated = new Set(room.state.players.map((player) => player.id));
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, at] of Object.entries(room.seen)) {
    if (!seated.has(id) && at < cutoff) delete room.seen[id];
  }
  return changed;
}

function syncPause(room: Room): boolean {
  const state = room.state;
  if (!state.startedAt || state.phase === "gameover" || state.phase === "lobby") {
    if (!state.wait) return false;
    room.state = { ...state, wait: null };
    return true;
  }
  const now = Date.now();
  const needed = new Set(blockingPlayerIds(state));
  const fresh = state.players.some((player) => {
    const at = room.seen[player.id];
    return typeof at === "number" && now - at < FRESH_MS;
  });
  const ids = state.players
    .filter((player) => needed.has(player.id))
    .filter((player) => {
      const at = room.seen[player.id];
      return typeof at !== "number" || now - at >= PAUSE_AFTER;
    })
    .map((player) => player.id)
    .sort();
  if (!fresh || ids.length === 0) {
    if (!state.wait) return false;
    room.state = { ...state, wait: null };
    return true;
  }
  const prev = state.wait;
  const same = Boolean(prev && prev.ids.length === ids.length && prev.ids.every((id, index) => id === ids[index]));
  if (same) return false;
  const since = prev && ids.some((id) => prev.ids.includes(id)) ? prev.since : now;
  room.state = { ...state, wait: { ids, since } };
  return true;
}
function touch(room: Room, peer: string) {
  if (!room.born) room.born = 1;
  room.actIds ??= [];
  room.seen ??= {};
  room.seen[peer] = Date.now();
}

const secretsSchema = z.object({
  solution: z.record(z.string(), z.string()).optional(),
  hands: z.record(z.string(), z.array(z.string())).default({}),
});

const postSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("join"), room: ID, peer: ID, name: z.string().max(32).default("") }),
  z.object({
    op: z.literal("put"),
    room: ID,
    peer: ID,
    seq: z.number().int().min(0).default(0),
    state: z.unknown(),
    secrets: secretsSchema.optional(),
  }),
  z.object({
    op: z.literal("play"),
    room: ID,
    peer: ID,
    id: z.string().min(1).max(80),
    kind: z.string().min(1).max(16),
    payload: z.unknown().optional(),
    sig: z.string().max(16).optional(),
    set: z.string().max(16).optional(),
    hand: z.string().max(16).optional(),
    rv: z.number().int().min(0).max(5000).optional(),
    fx: z.string().max(16).optional(),
  }),
  z.object({ op: z.literal("leave"), room: ID, peer: ID }),
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function asState(value: unknown): GameState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as GameState;
  if (!state.hostId || !Array.isArray(state.players) || !state.settings) return null;
  return slimState(state);
}

export async function handleRoom(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET") return handleGet(url);
  if (request.method === "POST") return handlePost(request);
  return json({ error: "method" }, 405);
}

async function handleGet(url: URL): Promise<Response> {
  const parsed = z
    .object({
      room: ID,
      peer: ID,
      name: z.string().max(32).default(""),
      rev: z.coerce.number().int().min(0).default(0),
      sig: z.string().max(16).default(""),
      set: z.string().max(16).default(""),
      hs: z.string().max(16).default(""),
      rv: z.coerce.number().int().min(0).max(5000).default(0),
      fx: z.string().max(16).default(""),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      rev: url.searchParams.get("rev") ?? 0,
      sig: url.searchParams.get("sig") ?? "",
      set: url.searchParams.get("set") ?? "",
      hs: url.searchParams.get("hs") ?? "",
      rv: url.searchParams.get("rv") ?? 0,
      fx: url.searchParams.get("fx") ?? "",
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room: code, peer, rev, sig, set, hs, rv, fx } = parsed.data;
  const snap = url.searchParams.get("snap") === "1";
  const map = rooms();
  const room = map.get(code);
  if (!room) return json({ error: "No table with that code yet." }, 404);
  touch(room, peer);
  if (sweepRoom(room)) bump(map, code, room);
  if (!snap && rev === room.rev) await waitForChange(code, rev, 18000);
  const fresh = rooms().get(code);
  if (!fresh) return json({ error: "No table with that code yet." }, 404);
  touch(fresh, peer);
  if (!snap && rev === fresh.rev) return json({ rev: fresh.rev, born: fresh.born, putSeq: fresh.putSeq, online: onlineCount(fresh) });
  return json(view(fresh, peer, snap ? {} : { sig, set, hand: hs, rv, fx }));
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid request" }, 400);
  const msg = parsed.data;
  return enqueue(msg.room, () => applyMessage(msg));
}

function applyMessage(msg: z.infer<typeof postSchema>): Response {
  const map = rooms();
  const known: Known = msg.op === "play" ? { sig: msg.sig, set: msg.set, hand: msg.hand, rv: msg.rv, fx: msg.fx } : {};

  if (msg.op === "leave") {
    const room = map.get(msg.room);
    if (!room) return json({ ok: true });
    if (!room.state.startedAt && room.state.phase === "lobby") {
      const next = leaveLobby(room.state, msg.peer);
      room.state = next;
      room.hostId = next.hostId || room.hostId;
      delete room.seen[msg.peer];
      bump(map, msg.room, room);
      return json({ ok: true });
    }
    const dropped = dropPlayer(room.state, room.secrets, msg.peer);
    if (dropped.state !== room.state || dropped.secrets !== room.secrets) {
      const healed = healEmptyHands(dropped.state, rememberRound(dropped.state, dropped.secrets));
      room.state = healed.state;
      room.secrets = healed.secrets;
      room.hostId = room.state.hostId;
      delete room.seen[msg.peer];
      bump(map, msg.room, room);
    }
    return json({ ok: true });
  }

  const present = map.get(msg.room);
  if (present) {
    touch(present, msg.peer);
    if (sweepRoom(present)) bump(map, msg.room, present);
  }

  if (msg.op === "join") {
    const room = map.get(msg.room);
    if (!room) return json({ error: "No table with that code yet." }, 404);
    touch(room, msg.peer);
    const already = room.state.players.some((player) => player.id === msg.peer);
    if (room.state.startedAt && !already) return json({ error: "The evening has already begun." }, 403);
    const cap = joinCap(room.state);
    const picked = hostCap(room.state.settings);
    if (!room.state.startedAt && room.state.settings.maxPlayers !== picked) {
      room.state = { ...room.state, settings: { ...room.state.settings, maxPlayers: picked } };
      bump(map, msg.room, room);
    }
    if (!already && room.state.players.length >= cap) {
      return json({ error: `This table is full. ${cap} players is the limit.` }, 403);
    }
    if (already && !room.state.startedAt) {
      const name = msg.name.trim().slice(0, 24);
      if (name && !/^detective$/i.test(name)) {
        const players = room.state.players.map((player) => (player.id === msg.peer ? { ...player, name } : player));
        if (players.some((player, i) => player.name !== room.state.players[i].name)) {
          room.state = { ...room.state, players };
          bump(map, msg.room, room);
        }
      }
      return json(view(room, msg.peer, known));
    }
    if (!already) {
      if (reseatLobby(room, msg.peer, msg.name)) bump(map, msg.room, room);
    }
    return json(view(room, msg.peer, known));
  }

  if (msg.op === "put") {
    const incoming = asState(msg.state);
    if (!incoming || incoming.hostId !== msg.peer) return json({ error: "Only the host can open the table." }, 403);
    const cap = hostCap(incoming.settings);
    incoming.settings = { ...incoming.settings, maxPlayers: cap };
    let room = map.get(msg.room);
    if (room && room.hostId !== msg.peer) return json({ error: "That code belongs to someone else." }, 403);
    if (!room) {
      const state = incoming;
      room = {
        hostId: msg.peer,
        born: Date.now(),
        rev: 1,
        putSeq: msg.seq,
        state: { ...state, code: state.code || msg.room },
        secrets: { solution: {}, hands: {} },
        actIds: [],
        seen: {},
        holdRev: 0,
        caught: {},
      };
      map.set(msg.room, room);
      touch(room, msg.peer);
      saveNow(map);
      notify(msg.room);
      return json(view(room, msg.peer, known));
    }
    if (room.state.startedAt) return json(view(room, msg.peer, known));
    if (msg.seq && room.putSeq && msg.seq < room.putSeq) return json(view(room, msg.peer, known));
    const players = room.state.players.map((player) => {
      const fresh = incoming.players.find((item) => item.id === player.id);
      return fresh ? { ...player, name: fresh.name } : player;
    });
    room.putSeq = msg.seq || room.putSeq;
    room.hostId = room.state.hostId || msg.peer;
    room.state = {
      ...room.state,
      cards: Array.isArray(incoming.cards) && incoming.cards.length ? incoming.cards : room.state.cards,
      settings: { ...room.state.settings, ...incoming.settings, maxPlayers: hostCap(incoming.settings) },
      players,
      turnOrder: players.map((player) => player.id),
      hostId: room.hostId,
      phase: "lobby",
      startedAt: null,
      question: null,
      event: null,
      dice: null,
      accusation: null,
      winnerId: null,
    };
    touch(room, msg.peer);
    bump(map, msg.room, room);
    return json(view(room, msg.peer, known));
  }

  const room = map.get(msg.room);
  if (!room) return json({ error: "No table with that code yet." }, 404);
  touch(room, msg.peer);
  if (!room.state.players.some((player) => player.id === msg.peer)) {
    return json({ error: "You are not seated at this table." }, 403);
  }
  if (room.actIds.includes(msg.id)) return json(view(room, msg.peer, known));

  if (msg.kind === "deal") {
    if (msg.peer === room.hostId && !room.state.startedAt && room.state.players.length >= 2 && room.state.players.length <= joinCap(room.state)) {
      const dealt = dealAndStart(room.state, room.secrets);
      if (!dealt.state.startedAt) {
        return json({ ...view(room, msg.peer, known), error: "Need two players, and one card each after the answers are set aside." });
      }
      room.state = { ...dealt.state, wait: null };
      room.secrets = dealt.secrets;
      room.holdRev = 0;
      room.caught = {};
      room.actIds = [];
      bump(map, msg.room, room);
    }
    return json(view(room, msg.peer, known));
  }

  if (msg.kind === "again") {
    if (msg.peer === room.hostId && room.state.phase === "gameover") {
      const fresh = {
        ...room.state,
        phase: "lobby" as const,
        startedAt: null,
        winnerId: null,
        accusation: null,
        question: null,
        event: null,
        dice: null,
        wait: null,
        players: room.state.players.map((player) => ({ ...player, eliminated: false })),
      };
      const dealt = dealAndStart(fresh, { solution: {}, hands: {} });
      if (dealt.state.startedAt) {
        room.state = { ...dealt.state, wait: null };
        room.secrets = dealt.secrets;
        room.holdRev = 0;
        room.caught = {};
        room.actIds = [];
        bump(map, msg.room, room);
      }
    }
    return json(view(room, msg.peer, known));
  }

  if (msg.kind === "kick") {
    const playerId = String((msg.payload as { playerId?: string } | undefined)?.playerId ?? "");
    const stalled = Boolean(
      room.state.startedAt &&
        room.state.wait &&
        room.state.wait.ids.includes(playerId) &&
        Date.now() - room.state.wait.since >= KICK_AFTER,
    );
    const hostLobby = !room.state.startedAt && msg.peer === room.hostId;
    const allowed = playerId && playerId !== msg.peer && room.state.players.some((player) => player.id === msg.peer) && (stalled || hostLobby);
    if (allowed && room.state.startedAt) {
      const next = dropPlayer(room.state, room.secrets, playerId);
      if (next.state !== room.state || next.secrets !== room.secrets) {
        const healed = healEmptyHands(next.state, rememberRound(next.state, next.secrets));
        room.state = healed.state;
        room.secrets = healed.secrets;
        room.hostId = room.state.hostId;
        delete room.seen[playerId];
        bump(map, msg.room, room);
      }
    } else if (allowed) {
      const next = removePlayer(room.state, playerId);
      if (next !== room.state) {
        room.state = next;
        delete room.seen[playerId];
        bump(map, msg.room, room);
      }
    }
    return json(view(room, msg.peer, known));
  }

  room.actIds.push(msg.id);
  if (room.actIds.length > 40) room.actIds.splice(0, room.actIds.length - 40);

  try {
    const hadSync = Boolean(room.state.sync);
    const prevTurn = room.state.turnIndex;
    const prevStart = room.state.startedAt;
    const next = applyPlay(room.state, room.secrets, msg.peer, msg.kind, msg.payload ?? {});
    if (next.state !== room.state || next.secrets !== room.secrets || (hadSync && !next.state.sync)) {
      let state = next.state;
      let secrets = next.secrets.reveals?.length ? { ...next.secrets, reveals: [] } : next.secrets;
      if ((state.turnIndex !== prevTurn || state.startedAt !== prevStart)) {
        secrets = rememberRound(state, secrets);
        if ((state.log?.length ?? 0) > 1) state = { ...state, log: state.log.slice(-1) };
        room.actIds = [msg.id];
      } else if ((state.log?.length ?? 0) > 8) {
        state = { ...state, log: state.log.slice(-8) };
      }
      const healed = healEmptyHands(state, secrets);
      room.state = healed.state;
      room.secrets = healed.secrets;
      bump(map, msg.room, room);
    }
  } catch (error) {
    console.error("[room] play failed", error);
    return json({ error: "That move could not be made." }, 400);
  }
  return json(view(room, msg.peer, known));
}
