/**
 * WebRTC signaling over the app database (Neon deployed, PGLite in preview).
 * Only rendezvous traffic passes through here — roster + SDP/ICE relay while a
 * mesh forms; game data then flows peer-to-peer. DB-backed so any serverless
 * instance can serve any poll. Mount at /api/rtc (see the multiplayer-p2p
 * skill); the client side lives in `@/lib/multiplayer`.
 *
 * The GET poll is the whole peer lifecycle: the first poll (since=0) IS the
 * join — it registers the peer, returns the roster, and prunes stale rows.
 * Peer ids are random per mount, so a fresh inbox never has old signals to
 * skip and no join/cursor handshake is needed.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { addPlayer } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import type { PeerRow, RtcPollResponse, SignalRow } from "./p2p";

const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const signalSchema = z.object({
  op: z.literal("signal"),
  room: ID,
  from: ID,
  to: ID,
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 32_768, {
    message: "payload too large",
  }),
});
const mailSchema = z.object({
  op: z.literal("mail"),
  room: ID,
  from: ID,
  to: ID,
  payload: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 4_000_000, {
    message: "payload too large",
  }),
});
const holdSchema = z.object({
  op: z.literal("hold"),
  room: ID,
  peer: ID,
  seq: z.number().int().min(0).default(0),
  sentAt: z.number().int().min(0).default(0),
  state: z.unknown(),
  hands: z.record(z.string(), z.unknown()).default({}),
  ack: z.array(z.string().max(80)).max(80).default([]),
});
const knockSchema = z.object({
  op: z.literal("knock"),
  room: ID,
  peer: ID,
  name: z.string().max(64).default(""),
});
const actSchema = z.object({
  op: z.literal("act"),
  room: ID,
  peer: ID,
  name: z.string().max(64).default(""),
  id: z.string().min(1).max(80),
  kind: z.string().min(1).max(32),
  payload: z.unknown().optional(),
});
const leaveSchema = z.object({ op: z.literal("leave"), room: ID, peer: ID });
const postSchema = z.discriminatedUnion("op", [signalSchema, mailSchema, holdSchema, knockSchema, actSchema, leaveSchema]);

const PEER_TTL_SECONDS = 180;
const SIGNAL_TTL_SECONDS = 120;

const globalRef = globalThis as typeof globalThis & {
  __rtcSchemaV3__?: Promise<void>;
};

function ensureSchema(sql: Sql): Promise<void> {
  globalRef.__rtcSchemaV3__ ??= (async () => {
    await sql.query(
      `CREATE TABLE IF NOT EXISTS webrtc_peers (
         room TEXT NOT NULL,
         peer_id TEXT NOT NULL,
         name TEXT NOT NULL DEFAULT '',
         last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (room, peer_id)
       )`,
    );
    await sql.query(
      `CREATE TABLE IF NOT EXISTS webrtc_signals (
         id BIGSERIAL PRIMARY KEY,
         room TEXT NOT NULL,
         to_peer TEXT NOT NULL,
         from_peer TEXT NOT NULL,
         kind TEXT NOT NULL,
         payload JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await sql.query(
      `CREATE INDEX IF NOT EXISTS webrtc_signals_inbox
         ON webrtc_signals (room, to_peer, id)`,
    );
    await sql.query(
      `CREATE TABLE IF NOT EXISTS webrtc_mail (
         id BIGSERIAL PRIMARY KEY,
         room TEXT NOT NULL,
         to_peer TEXT NOT NULL,
         from_peer TEXT NOT NULL,
         payload JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await sql.query(
      `CREATE INDEX IF NOT EXISTS webrtc_mail_inbox
         ON webrtc_mail (room, to_peer, id)`,
    );
  })().catch((err) => {
    globalRef.__rtcSchemaV3__ = undefined;
    throw err;
  });
  return globalRef.__rtcSchemaV3__;
}

async function roster(sql: Sql, room: string): Promise<PeerRow[]> {
  const rows = await sql.query<{ peer_id: string; name: string }>(
    `SELECT peer_id, name FROM webrtc_peers
     WHERE room = $1 AND last_seen > now() - make_interval(secs => $2)
     ORDER BY peer_id LIMIT 32`,
    [room, PEER_TTL_SECONDS],
  );
  return rows.map((r) => ({ id: r.peer_id, name: r.name }));
}

async function touchPeer(sql: Sql, room: string, peer: string, name: string) {
  await sql.query(
    `INSERT INTO webrtc_peers (room, peer_id, name, last_seen)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (room, peer_id)
     DO UPDATE SET last_seen = now(), name = EXCLUDED.name`,
    [room, peer, name],
  );
}

async function prune(sql: Sql) {
  await Promise.all([
    sql.query(`DELETE FROM webrtc_signals WHERE created_at < now() - make_interval(secs => $1)`, [
      SIGNAL_TTL_SECONDS,
    ]),
    sql.query(`DELETE FROM webrtc_peers WHERE last_seen < now() - make_interval(secs => $1)`, [
      PEER_TTL_SECONDS,
    ]),
    sql.query(`DELETE FROM webrtc_mail WHERE created_at < now() - make_interval(secs => $1)`, [
      SIGNAL_TTL_SECONDS,
    ]),
  ]);
}

function decodeMail(payload: unknown): unknown {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

type Knock = { id: string; name: string; at: number };
type Act = { id: string; from: string; name: string; kind: string; payload?: unknown };
type HeldRoom = {
  hostId: string;
  rev: number;
  seq: number;
  sentAt: number;
  state: GameState | null;
  hands: Record<string, string[]>;
  knocks: Knock[];
  acts: Act[];
  seen: Record<string, { name: string; at: number }>;
};

const RELAY_PATH = "/workspace/.grok/room-relay.json";
const relayGlobal = globalThis as typeof globalThis & {
  __gmmRelay__?: Map<string, HeldRoom>;
  __gmmRelayTimer__?: ReturnType<typeof setTimeout>;
  __gmmRelayMtime__?: number;
};

function relayMap(): Map<string, HeldRoom> {
  if (!relayGlobal.__gmmRelay__) relayGlobal.__gmmRelay__ = new Map();
  try {
    const mtime = statSync(RELAY_PATH).mtimeMs;
    if (mtime !== relayGlobal.__gmmRelayMtime__) {
      relayGlobal.__gmmRelayMtime__ = mtime;
      const raw = JSON.parse(readFileSync(RELAY_PATH, "utf8")) as Record<string, HeldRoom>;
      for (const [room, row] of Object.entries(raw)) {
        const current = relayGlobal.__gmmRelay__.get(room);
        if (!current || (row.sentAt ?? row.rev ?? 0) >= (current.sentAt ?? current.rev ?? 0)) relayGlobal.__gmmRelay__.set(room, row);
      }
    }
  } catch {
    // No shared file yet.
  }
  return relayGlobal.__gmmRelay__;
}

function saveRelay() {
  if (relayGlobal.__gmmRelayTimer__) return;
  relayGlobal.__gmmRelayTimer__ = setTimeout(() => {
    relayGlobal.__gmmRelayTimer__ = undefined;
    const obj: Record<string, HeldRoom> = {};
    for (const [room, row] of relayMap()) obj[room] = row;
    try {
      mkdirSync("/workspace/.grok", { recursive: true });
      writeFileSync(RELAY_PATH, JSON.stringify(obj));
    } catch (error) {
      console.error("[rtc] relay save failed:", error);
    }
  }, 150);
}

function roomBucket(room: string): HeldRoom {
  const map = relayMap();
  let row = map.get(room);
  if (!row) {
    row = { hostId: "", rev: 0, seq: 0, sentAt: 0, state: null, hands: {}, knocks: [], acts: [], seen: {} };
    map.set(room, row);
  }
  return row;
}

function noteSeen(room: string, peer: string, name: string) {
  const row = roomBucket(room);
  const now = Date.now();
  row.seen[peer] = { name: name || row.seen[peer]?.name || "", at: now };
  const cutoff = now - PEER_TTL_SECONDS * 1000;
  for (const [id, info] of Object.entries(row.seen)) {
    if (info.at < cutoff) delete row.seen[id];
  }
  row.knocks = row.knocks.filter((knock) => knock.at >= cutoff);
  saveRelay();
}

function asHands(value: Record<string, unknown>): Record<string, string[]> {
  const hands: Record<string, string[]> = {};
  for (const [id, cards] of Object.entries(value ?? {})) {
    if (Array.isArray(cards)) hands[id] = cards.filter((card): card is string => typeof card === "string");
  }
  return hands;
}

function holdRoom(
  room: string,
  peer: string,
  seq: number,
  sentAt: number,
  state: unknown,
  hands: Record<string, unknown>,
  ack: string[] = [],
) {
  const row = roomBucket(room);
  if (ack.length && row.acts) {
    const drop = new Set(ack);
    row.acts = row.acts.filter((act) => !drop.has(act.id));
  }
  if (
    row.sentAt &&
    sentAt &&
    (sentAt < row.sentAt || (sentAt === row.sentAt && seq < row.seq))
  ) {
    saveRelay();
    return;
  }
  let next = state as GameState;
  if (next && Array.isArray(next.players)) {
    for (const knock of row.knocks) {
      next = addPlayer(next, knock.name, knock.id);
    }
  }
  row.hostId = peer;
  row.seq = seq || row.seq + 1;
  row.sentAt = sentAt || Date.now();
  row.state = next;
  row.hands = asHands(hands);
  row.rev += 1;
  const ids = new Set(next?.players?.map((player) => player.id) ?? []);
  row.knocks = row.knocks.filter((knock) => !ids.has(knock.id));
  saveRelay();
}

function pushAct(room: string, act: Act) {
  const row = roomBucket(room);
  row.acts = row.acts ?? [];
  if (row.acts.some((item) => item.id === act.id)) return;
  row.acts = [...row.acts, act].slice(-40);
  saveRelay();
}

function knockRoom(room: string, peer: string, name: string) {
  const row = roomBucket(room);
  const now = Date.now();
  const found = row.knocks.find((knock) => knock.id === peer);
  if (found) {
    found.name = name || found.name;
    found.at = now;
  } else {
    row.knocks.push({ id: peer, name, at: now });
  }
  if (row.state) {
    const seated = addPlayer(row.state, name, peer);
    if (seated !== row.state) {
      row.state = seated;
      row.rev += 1;
    }
  }
  saveRelay();
}

function relayView(room: string, peer: string) {
  const row = relayMap().get(room);
  if (!row) return { table: null, knocks: [] as Knock[], acts: [] as Act[], peers: [] as PeerRow[] };
  const peers = Object.entries(row.seen).map(([id, info]) => ({ id, name: info.name }));
  const table = row.state
    ? { hostId: row.hostId, rev: row.rev, state: row.state, hand: row.hands[peer] ?? [] }
    : null;
  const stateHost = row.state?.hostId ?? "";
  const forHost = row.hostId === peer || stateHost === peer;
  return {
    table,
    knocks: forHost ? (row.knocks ?? []) : [],
    acts: forHost ? (row.acts ?? []) : [],
    peers,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handleGet(url: URL): Promise<Response> {
  const parsed = z
    .object({
      room: ID,
      peer: ID,
      name: z.string().max(64).default(""),
      since: z.coerce.number().int().min(0).default(0),
      mailSince: z.coerce.number().int().min(0).default(0),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      since: url.searchParams.get("since") ?? 0,
      mailSince: url.searchParams.get("mailSince") ?? 0,
    });
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room, peer, name, since, mailSince } = parsed.data;
  noteSeen(room, peer, name);
  const relay = relayView(room, peer);

  try {
    const sql = await getSql();
    await ensureSchema(sql);
    if (since === 0 || Math.random() < 0.02) await prune(sql);
    await touchPeer(sql, room, peer, name);
    const rows = await sql.query<{
      id: number;
      from_peer: string;
      kind: SignalRow["kind"];
      payload: unknown;
    }>(
      `SELECT id, from_peer, kind, payload FROM webrtc_signals
       WHERE room = $1 AND to_peer = $2 AND id > $3
       ORDER BY id LIMIT 200`,
      [room, peer, since],
    );
    const mail = await sql.query<{ id: number; from_peer: string; payload: unknown }>(
      `SELECT id, from_peer, payload FROM webrtc_mail
       WHERE room = $1 AND to_peer = $2 AND id > $3
       ORDER BY id LIMIT 100`,
      [room, peer, mailSince],
    );
    const dbPeers = await roster(sql, room);
    const body: RtcPollResponse = {
      peers: dbPeers.length ? dbPeers : relay.peers,
      signals: rows.map((r) => ({
        id: r.id,
        from: r.from_peer,
        kind: r.kind,
        payload: r.payload,
      })),
      mail: mail.map((r) => ({
        id: Number(r.id),
        from: r.from_peer,
        payload: decodeMail(r.payload),
      })),
      table: relay.table,
      knocks: relay.knocks,
      acts: relay.acts,
    };
    return json(body);
  } catch (error) {
    console.error("[rtc] database poll failed, using the shared room list:", error);
    return json({
      peers: relay.peers,
      signals: [],
      mail: [],
      table: relay.table,
      knocks: relay.knocks,
      acts: relay.acts,
    });
  }
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
  if (msg.op === "hold") {
    if (JSON.stringify(msg.state).length > 1_500_000) return json({ error: "too large" }, 413);
    holdRoom(msg.room, msg.peer, msg.seq, msg.sentAt, msg.state, msg.hands, msg.ack);
    noteSeen(msg.room, msg.peer, "");
    return json({ ok: true });
  }
  if (msg.op === "knock") {
    knockRoom(msg.room, msg.peer, msg.name);
    noteSeen(msg.room, msg.peer, msg.name);
    return json({ ok: true });
  }
  if (msg.op === "act") {
    pushAct(msg.room, {
      id: msg.id,
      from: msg.peer,
      name: msg.name,
      kind: msg.kind,
      payload: msg.payload,
    });
    noteSeen(msg.room, msg.peer, msg.name);
    return json({ ok: true });
  }
  const sql = await getSql();
  await ensureSchema(sql);

  if (msg.op === "signal") {
    await sql.query(
      `INSERT INTO webrtc_signals (room, to_peer, from_peer, kind, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [msg.room, msg.to, msg.from, msg.kind, JSON.stringify(msg.payload)],
    );
  } else if (msg.op === "mail") {
    await sql.query(
      `INSERT INTO webrtc_mail (room, to_peer, from_peer, payload)
       VALUES ($1, $2, $3, $4)`,
      [msg.room, msg.to, msg.from, JSON.stringify(msg.payload)],
    );
  } else {
    await sql.query(`DELETE FROM webrtc_peers WHERE room = $1 AND peer_id = $2`, [
      msg.room,
      msg.peer,
    ]);
  }
  return json({ ok: true });
}

export async function handleSignaling(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") return await handleGet(new URL(request.url));
    if (request.method === "POST") return await handlePost(request);
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[rtc] signaling error:", error);
    return json({ error: "signaling failed" }, 500);
  }
}
