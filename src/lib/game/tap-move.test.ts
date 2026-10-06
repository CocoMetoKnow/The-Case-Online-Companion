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


test("one tap walks to any hall square the roll can reach, and the move ends there", () => {
  const s = state(10, start);
  const { nodes } = reachable(start, 10, ROOMS, [], new Set([`${BEA.x},${BEA.y}`]), DEFAULT_LAYOUT);
  const far = [...nodes.values()].find((n) => n.pos.kind === "hall" && n.dist === 6);
  assert.ok(far, "a square six steps away exists");
  const next = applyMove(s, "ada", far!.pos);
  assert.deepEqual(next.players[0].position, far!.pos);
  assert.equal(next.phase, "action");
  assert.equal(next.moveBudget, 0);
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

test("tapping a room in range enters it in one go", () => {
  const s = state(14, start);
  const { nodes } = reachable(start, 14, ROOMS, [], new Set(), DEFAULT_LAYOUT);
  const room = [...nodes.values()].find((n) => n.pos.kind === "room" && n.dist > 2);
  assert.ok(room, "some room is within 14 steps");
  const next = applyMove(s, "ada", room!.pos);
  assert.deepEqual(next.players[0].position, room!.pos);
  assert.equal(next.phase, "action");
});

test("another guest's square cannot be landed on", () => {
  const s = state(10, start);
  const next = applyMove(s, "ada", { kind: "hall", ...BEA });
  assert.deepEqual(next.players[0].position, start);
});
