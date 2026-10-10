/**
 * Team Mode online play: one host phone runs the game, every other phone is a seat at the table.
 *
 * The host is the only place the real game state lives. Guests send what they want to do ("intents")
 * and the host checks that it is really that player's turn before applying it, then sends everyone a
 * redacted copy of the table. The redaction means a guest's phone never receives the hidden solution,
 * the unfound clues, the card decks or the puzzle answer, so nobody can peek by poking at the app.
 *
 * Pure functions only. The transport (the room relay already used by the main game) lives in
 * components/team/TeamOnline.tsx.
 */
import { reduce, type Action, type TeamState } from "./engine.ts";

export const ROOM_PREFIX = "tm";
export const MAX_SEATS = 6;
export const MIN_SEATS = 2;

export type Msg =
  | { t: "tm:join"; pid: string; name: string }
  | { t: "tm:lobby"; host: string; roster: RosterEntry[]; seed: string }
  | { t: "tm:start"; host: string; seats: string[]; state: TeamState }
  | { t: "tm:state"; host: string; seq: number; seats: string[]; state: TeamState }
  | { t: "tm:act"; pid: string; n: number; action: Action }
  | { t: "tm:full"; host: string }
  | { t: "tm:leave"; pid: string };

export interface RosterEntry {
  pid: string;
  name: string;
}

/** Room codes avoid look-alike letters so they can be read out across a table. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRoomCode(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return s;
}
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^TM/, "").slice(0, 5);
}
export const roomId = (code: string) => `${ROOM_PREFIX}${normalizeCode(code)}`;

/** What a guest phone is allowed to see. */
export function redact(s: TeamState): TeamState {
  const clues = s.game.clues.map((c) =>
    s.clueStatus[c.id] === "hidden"
      ? ({ id: c.id, kind: "exclude", where: c.where, object: c.object, text: "", short: "", tier: c.tier, noise: c.noise, vault: c.vault } as typeof c)
      : c,
  );
  const pending =
    s.pending?.type === "puzzle"
      ? {
          ...s.pending,
          puzzle: {
            ...s.pending.puzzle,
            answer: "",
            hints: s.pending.puzzle.hints.map((h, i) => (i < (s.pending as { shown: number }).shown ? h : "")),
          },
        }
      : s.pending;
  return {
    ...s,
    rng: 0,
    game: { ...s.game, clues, solution: {} as TeamState["game"]["solution"], profile: {}, vaultItems: [] },
    decks: { evidence: [], environment: [], intel: [] },
    pending,
  };
}

/** Who may do what. The host can always step in (for a phone that dropped out). */
export function seatOf(seats: string[], pid: string): number {
  return seats.indexOf(pid);
}

export function mayAct(s: TeamState, seats: string[], pid: string, hostPid: string, a: Action): boolean {
  if (s.status !== "play") return false;
  if (pid === hostPid) return true;
  const seat = seatOf(seats, pid);
  if (seat < 0) return false;
  // Everything, notices included, belongs to the detective whose turn it is.
  return seat === s.turn;
}

export interface HostTable {
  state: TeamState;
  seats: string[];
  hostPid: string;
  /** Highest act number seen from each phone, so a repeated message is never applied twice. */
  seen: Record<string, number>;
}

export function applyIntent(t: HostTable, msg: Extract<Msg, { t: "tm:act" }>): { table: HostTable; changed: boolean } {
  if ((t.seen[msg.pid] ?? -1) >= msg.n) return { table: t, changed: false };
  const seen = { ...t.seen, [msg.pid]: msg.n };
  const a = msg.action;
  if (!a || typeof a !== "object" || typeof (a as { type?: unknown }).type !== "string" || (a as { type: string }).type === "set") return { table: { ...t, seen }, changed: false };
  if (!mayAct(t.state, t.seats, msg.pid, t.hostPid, a)) return { table: { ...t, seen }, changed: false };
  const next = reduce(t.state, a);
  if (next === t.state) return { table: { ...t, seen }, changed: false };
  return { table: { ...t, state: next, seen }, changed: true };
}

/** Lobby bookkeeping: a phone joining with a name it has used before keeps its seat. */
export function joinLobby(roster: RosterEntry[], pid: string, name: string): RosterEntry[] {
  const clean = name.trim().slice(0, 14) || "Detective";
  const i = roster.findIndex((r) => r.pid === pid);
  if (i >= 0) return roster.map((r, j) => (j === i ? { ...r, name: clean } : r));
  if (roster.length >= MAX_SEATS) return roster;
  // Two players with the same name get told apart.
  const taken = roster.filter((r) => r.name.replace(/ \d+$/, "") === clean).length;
  return [...roster, { pid, name: taken ? `${clean} ${taken + 1}` : clean }];
}
