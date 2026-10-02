import assert from "node:assert/strict";
import test from "node:test";
import { resolveEventChoice } from "./events.ts";
import type { GameState, Secrets } from "./types.ts";

const secrets: Secrets = { solution: {}, hands: {} } as Secrets;

function showAll(): GameState {
  const player = (id: string, seat: number) => ({ id, name: id, color: "#fff", seat, eliminated: false, isHost: seat === 0, position: { kind: "hall", x: 0, y: 0 } });
  return {
    version: 1,
    code: "gmmTEST",
    hostId: "cody",
    settings: { maxPlayers: 6, locked: false, timeOfDayEnabled: false, wrongAccusationEliminates: true, honorHands: false, playMode: "online", cardSetId: "classic", enabledRoomIds: [] },
    cards: [{ id: "colonel-mustard", category: "suspect", name: "Colonel Flintwood", blurb: "", icon: "User" }],
    leftover: [],
    players: [player("cody", 0), player("violet", 1), player("bunny", 2)],
    turnOrder: ["bunny", "cody", "violet"],
    turnIndex: 2,
    phase: "event",
    dice: [1, 1],
    moveBudget: 0,
    freeQuestion: false,
    whisperMode: false,
    question: null,
    event: { deckId: "d1", kind: "name-suspect", title: "Name a Character", description: "", step: "show-all", data: { cardId: "colonel-mustard", holderId: "bunny" } },
    log: [],
    winnerId: null,
    startedAt: 1,
    eventDeck: [],
    eventDiscard: [],
    accusation: null,
  } as unknown as GameState;
}

test("every guest's I've seen it counts, and the power ends when the last one taps", () => {
  let state = showAll();
  // Cody is not holding the card and it is not his turn. His tap used to do nothing.
  state = resolveEventChoice(state, secrets, "cody", {}).state;
  assert.deepEqual(state.event?.data.seen, ["cody"]);
  assert.equal(state.phase, "event");
  // Tapping twice does not count twice.
  assert.equal(resolveEventChoice(state, secrets, "cody", {}).state, state);
  state = resolveEventChoice(state, secrets, "violet", {}).state;
  assert.equal(state.phase, "event");
  state = resolveEventChoice(state, secrets, "bunny", {}).state;
  assert.equal(state.event, null);
  assert.notEqual(state.phase, "event");
});

test("someone who is not at the table cannot end it", () => {
  const state = showAll();
  assert.equal(resolveEventChoice(state, secrets, "stranger", {}).state, state);
});
