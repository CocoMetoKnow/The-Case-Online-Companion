import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { applyClassicNames, classicName } from "./cards.ts";
import type { CardDef, GameState, Secrets } from "./types.ts";

const suspect = (id: string, name: string): CardDef => ({ id, category: "suspect", name, blurb: "", icon: "User" });

function lobby(): GameState {
  return {
    version: 1,
    code: "gmmTEST",
    hostId: "ada",
    settings: {
      maxPlayers: 6,
      locked: false,
      timeOfDayEnabled: false,
      wrongAccusationEliminates: true,
      honorHands: false,
      playMode: "online",
      cardSetId: "classic",
      enabledRoomIds: [],
    },
    cards: [
      suspect("miss-scarlet", "Miss Crimson"),
      suspect("colonel-mustard", "Colonel Flintwood"),
      suspect("mrs-white", "Mrs. Snow"),
      suspect("mr-green", "Mr. Olive"),
      suspect("mrs-peacock", "Mrs. Pearl"),
      suspect("professor-plum", "Professor Quill"),
      suspect("lord-harrington", "Lord Harrington"),
    ],
    leftover: [],
    players: [
      { id: "ada", name: "Ada", color: "#fff", seat: 0, eliminated: false, isHost: true, position: { kind: "hall", x: 0, y: 0 } },
      { id: "bo", name: "Bo", color: "#000", seat: 1, eliminated: false, isHost: false, position: { kind: "hall", x: 0, y: 0 } },
    ],
    turnOrder: [],
    turnIndex: 0,
    phase: "lobby",
    dice: null,
    moveBudget: 0,
    freeQuestion: false,
    whisperMode: false,
    question: null,
    event: null,
    log: [],
    winnerId: null,
    startedAt: null,
    eventDeck: [],
    eventDiscard: [],
    accusation: null,
  } as unknown as GameState;
}

const secrets: Secrets = { solution: {}, hands: {} } as Secrets;
const names = (s: GameState) => s.cards.map((c) => c.name);

test("the name map covers all six guests, case does not matter to the table", () => {
  assert.equal(classicName("Miss Crimson", true), "Miss Scarlet");
  assert.equal(classicName("Colonel Flintwood", true), "Colonel Mustard");
  assert.equal(classicName("Mrs. Snow", true), "Mrs. White");
  assert.equal(classicName("Mr. Olive", true), "Mr. Green");
  assert.equal(classicName("Mrs. Pearl", true), "Mrs. Peacock");
  assert.equal(classicName("Professor Quill", true), "Professor Plum");
  assert.equal(classicName("Lord Harrington", true), "Lord Harrington");
});

test("any seated guest can turn the egg on and off for everyone", () => {
  const on = applyPlay(lobby(), secrets, "bo", "classic", { on: true }).state;
  assert.equal(on.settings.classicNames, true);
  assert.deepEqual(names(on), ["Miss Scarlet", "Colonel Mustard", "Mrs. White", "Mr. Green", "Mrs. Peacock", "Professor Plum", "Lord Harrington"]);
  const off = applyPlay(on, secrets, "ada", "classic", { on: false }).state;
  assert.equal(off.settings.classicNames, false);
  assert.deepEqual(names(off), ["Miss Crimson", "Colonel Flintwood", "Mrs. Snow", "Mr. Olive", "Mrs. Pearl", "Professor Quill", "Lord Harrington"]);
});

test("strangers and started games are ignored, and a host's own renames survive", () => {
  const state = lobby();
  assert.equal(applyPlay(state, secrets, "stranger", "classic", { on: true }).state, state);
  const started = { ...state, startedAt: 1, phase: "play" } as GameState;
  assert.equal(applyPlay(started, secrets, "ada", "classic", { on: true }).state, started);
  const renamed = applyClassicNames([suspect("mr-green", "Gardener Bob")], true);
  assert.equal(renamed[0].name, "Gardener Bob");
});
