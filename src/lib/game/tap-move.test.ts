import assert from "node:assert/strict";
import test from "node:test";
import { applyMove } from "./engine.ts";
import { DEFAULT_LAYOUT, reachable } from "./board.ts";
import type { GameState, PiecePos } from "./types.ts";

const ROOMS = ["lounge", "dining-room", "kitchen", "grand-hall", "ballroom", "study", "library", "billiard-room", "conservatory"];

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
      { id: "bea", name: "Bea", color: "#000", seat: 1, eliminated: false, isHost: false, position: { kind: "hall", x: 9, y: 9 } },
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

const start: PiecePos = { kind: "hall", x: 11, y: 8 };

test("one tap walks to any hall square the roll can reach, and the move ends there", () => {
  const s = state(10, start);
  const { nodes } = reachable(start, 10, ROOMS, [], new Set(["h:9,9"].map((k) => k.slice(2))), DEFAULT_LAYOUT);
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
  const next = applyMove(s, "ada", { kind: "hall", x: 9, y: 9 });
  assert.deepEqual(next.players[0].position, start);
});
