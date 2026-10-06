import assert from "node:assert/strict";
import test from "node:test";
import { applyMove } from "./engine.ts";
import { DEFAULT_LAYOUT, MAP_ROOM_IDS, reachable } from "./board.ts";
import type { GameState, PiecePos } from "./types.ts";

const ROOMS = MAP_ROOM_IDS;

// Bea stands on a faraway blue circle square, out of the way.
const BEA = { x: DEFAULT_LAYOUT.starts[5].x, y: DEFAULT_LAYOUT.starts[5].y };

function state(budget: number, from: PiecePos): GameState {
  return {
    version: 1,
    code: "gmmTAP",
    hostId: "ada",
    settings: { maxPlayers: 6, locked: false, table: "board", enabledRoomIds: ROOMS, playMode: "online", speakMode: false },
    cards: ROOMS.map((id) => ({ id, category: "room", name: id, blurb: "", icon: "Castle" })),
    leftover: [],
    players: [
      { id: "ada", name: "Ada", color: "#fff", seat: 0, eliminated: false, isHost: true, position: from },
      { id: "bea", name: "Bea", color: "#000", seat: 1, eliminated: false, isHost: false, position: { kind: "hall", ...BEA } },
    ],
    turnOrder: ["ada", "bea"],
    turnIndex: 0,
    phase: "move",
    moveBudget: budget,
    passages: [],
    log: [],
    event: null,
  } as unknown as GameState;
}

const start: PiecePos = { kind: "hall", ...DEFAULT_LAYOUT.starts[0] };


test("one tap walks to any hall square the roll can reach and only costs the steps it took", () => {
  const s = state(10, start);
  const { nodes } = reachable(start, 10, ROOMS, [], new Set([`${BEA.x},${BEA.y}`]), DEFAULT_LAYOUT);
  const far = [...nodes.values()].find((n) => n.pos.kind === "hall" && n.dist === 6);
  assert.ok(far, "a square six steps away exists");
  const next = applyMove(s, "ada", far!.pos);
  assert.deepEqual(next.players[0].position, far!.pos);
  assert.equal(next.phase, "move");
  assert.equal(next.moveBudget, 10 - far!.dist);
});

test("a hall square exactly as far as the roll ends the move", () => {
  const { nodes } = reachable(start, 10, ROOMS, [], new Set([`${BEA.x},${BEA.y}`]), DEFAULT_LAYOUT);
  const far = [...nodes.values()].find((n) => n.pos.kind === "hall" && n.dist === 6);
  assert.ok(far);
  const next = applyMove(state(6, start), "ada", far!.pos);
  assert.equal(next.phase, "action");
  assert.equal(next.moveBudget, 0);
});

test("two steps away costs two steps, not the whole roll", () => {
  const { nodes } = reachable(start, 10, ROOMS, [], new Set([`${BEA.x},${BEA.y}`]), DEFAULT_LAYOUT);
  const near = [...nodes.values()].find((n) => n.pos.kind === "hall" && n.dist === 2);
  assert.ok(near);
  const next = applyMove(state(9, start), "ada", near!.pos);
  assert.equal(next.moveBudget, 7);
  assert.equal(next.phase, "move");
});

test("a square past the roll is refused", () => {
  const s = state(3, start);
  const { nodes } = reachable(start, 12, ROOMS, [], new Set(), DEFAULT_LAYOUT);
  const tooFar = [...nodes.values()].find((n) => n.pos.kind === "hall" && n.dist === 8);
  assert.ok(tooFar);
  const next = applyMove(s, "ada", tooFar!.pos);
  assert.deepEqual(next.players[0].position, start);
  assert.equal(next.phase, "move");
});

test("tapping a room in range enters it in one go, and the steps left over can still be walked", () => {
  const s = state(14, start);
  const { nodes } = reachable(start, 14, ROOMS, [], new Set(), DEFAULT_LAYOUT);
  const room = [...nodes.values()].find((n) => n.pos.kind === "room" && n.dist > 2 && n.dist < 14);
  assert.ok(room, "some room is within 14 steps");
  const next = applyMove(s, "ada", room!.pos);
  assert.deepEqual(next.players[0].position, room!.pos);
  assert.equal(next.phase, "move");
  assert.equal(next.moveBudget, 14 - room!.dist);
});

test("a room reached with no steps left ends the move", () => {
  const { nodes } = reachable(start, 14, ROOMS, [], new Set(), DEFAULT_LAYOUT);
  const room = [...nodes.values()].find((n) => n.pos.kind === "room" && n.dist > 2);
  assert.ok(room);
  const next = applyMove(state(room!.dist, start), "ada", room!.pos);
  assert.equal(next.phase, "action");
  assert.equal(next.moveBudget, 0);
});

test("after entering a room, a secret passage can be taken with the steps left", () => {
  const s = { ...state(3, { kind: "room", roomId: "study" }), passages: [{ a: "study", b: "kitchen" }] } as GameState;
  const next = applyMove(s, "ada", { kind: "room", roomId: "kitchen" });
  assert.deepEqual(next.players[0].position, { kind: "room", roomId: "kitchen" });
  assert.equal(next.phase, "move");
  assert.equal(next.moveBudget, 2);
  // And straight back through it again.
  const back = applyMove(next, "ada", { kind: "room", roomId: "study" });
  assert.deepEqual(back.players[0].position, { kind: "room", roomId: "study" });
  assert.equal(back.moveBudget, 1);
});

test("another guest's square cannot be landed on", () => {
  const s = state(10, start);
  const next = applyMove(s, "ada", { kind: "hall", ...BEA });
  assert.deepEqual(next.players[0].position, start);
});
