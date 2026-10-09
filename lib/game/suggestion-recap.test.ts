import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { sanitizeState } from "./sanitize.ts";
import type { GameState, Secrets } from "./types.ts";

function base(over: Partial<GameState["settings"]> = {}): GameState {
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
      enabledRoomIds: ["study", "library", "lounge"],
      speakMode: false,
      ...over,
    },
    cards: [
      { id: "lord", category: "suspect", name: "Lord", blurb: "", icon: "User" },
      { id: "chef", category: "suspect", name: "Chef", blurb: "", icon: "User" },
      { id: "study", category: "room", name: "Study", blurb: "", icon: "Castle" },
      { id: "library", category: "room", name: "Library", blurb: "", icon: "Castle" },
      { id: "lounge", category: "room", name: "Lounge", blurb: "", icon: "Castle" },
      { id: "cellar", category: "room", name: "Cellar", blurb: "", icon: "Castle" },
      { id: "knife", category: "weapon", name: "Knife", blurb: "", icon: "Sword" },
      { id: "rope", category: "weapon", name: "Rope", blurb: "", icon: "Sword" },
    ],
    leftover: [],
    players: [
      { id: "ada", name: "Ada", color: "#fff", seat: 0, eliminated: false, isHost: true, position: { kind: "room", roomId: "lounge" } },
      { id: "bea", name: "Bea", color: "#000", seat: 1, eliminated: false, isHost: false, position: { kind: "hall", x: 1, y: 0 } },
    ],
    turnOrder: ["ada", "bea"],
    turnIndex: 0,
    phase: "action",
    dice: null,
    singleDie: false,
    moveBudget: 0,
    actionsLeft: 1,
    naming: null,
    passages: [],
    skipIds: [],
    notesLock: {},
    influences: [],
    event: null,
    winnerId: null,
    accusation: null,
    startedAt: 1,
    log: [],
    eventDeck: [],
    eventDiscard: [],
  } as unknown as GameState;
}

const secrets = (): Secrets => ({
  solution: { suspect: "lord", room: "lounge", weapon: "rope" },
  hands: { ada: ["chef"], bea: ["knife", "study"] },
});

test("a suggestion that someone answers is remembered with who showed a card, and survives the turn ending", () => {
  // Ada asks for the knife in the lounge with the lord. Bea holds the knife.
  let cur = applyPlay(base(), secrets(), "ada", "ask", { suspectId: "lord", roomId: "lounge", weaponId: "knife" }).state;
  assert.ok(cur.lastSuggestion, "recorded as soon as it is asked");
  assert.equal(cur.lastSuggestion?.askerId, "ada");
  assert.deepEqual([...(cur.lastSuggestion?.cardIds ?? [])].sort(), ["knife", "lord", "lounge"]);
  const id = cur.lastSuggestion?.id;
  cur = applyPlay(cur, secrets(), "bea", "show", { cardId: "knife" }).state;
  assert.equal(cur.lastSuggestion?.showerId, "bea", "names who showed a card");
  assert.equal(cur.lastSuggestion?.id, id, "same suggestion, same id");
  for (let i = 0; i < 6 && cur.question; i++) cur = applyPlay(cur, secrets(), "ada", "ack", {}).state;
  assert.equal(cur.question ?? null, null, "question screen is gone");
  assert.equal(cur.lastSuggestion?.showerId, "bea", "the recap is still there for every player to read");
  assert.equal(cur.lastSuggestion?.id, id);
});

test("a suggestion nobody can answer is remembered as no one showing a card", () => {
  let cur = applyPlay(base(), secrets(), "ada", "ask", { suspectId: "lord", roomId: "lounge", weaponId: "rope" }).state;
  for (let i = 0; i < 6 && cur.question; i++) cur = applyPlay(cur, secrets(), "ada", "ack", {}).state;
  assert.equal(cur.lastSuggestion?.showerId, null);
  assert.equal(cur.lastSuggestion?.cardIds.length, 3);
});

test("a new suggestion gets a new id so a closed recap does not hide it", () => {
  let cur = applyPlay(base(), secrets(), "ada", "ask", { suspectId: "lord", roomId: "lounge", weaponId: "rope" }).state;
  const first = cur.lastSuggestion?.id;
  for (let i = 0; i < 6 && cur.question; i++) cur = applyPlay(cur, secrets(), "ada", "ack", {}).state;
  cur = { ...cur, phase: "action", actionsLeft: 1, turnIndex: 1 };
  cur = applyPlay(cur, secrets(), "bea", "ask", { suspectId: "chef", roomId: "study", weaponId: "knife" }).state;
  assert.ok(cur.lastSuggestion?.id);
  assert.notEqual(cur.lastSuggestion?.id, first);
  assert.equal(cur.lastSuggestion?.askerId, "bea");
});

test("the NPC showing a card is only told to the asker, and speak mode keeps the cards off other screens", () => {
  const base1 = { ...base(), lastSuggestion: { id: "x", askerId: "ada", cardIds: ["lord", "study"], showerId: "npc", spoken: true } } as GameState;
  const forBea = sanitizeState(base1, "bea").lastSuggestion;
  assert.equal(forBea?.showerId, null, "to everyone else it looks like no one showed");
  assert.deepEqual(forBea?.cardIds, [], "said out loud, not on their screen");
  const forAda = sanitizeState(base1, "ada").lastSuggestion;
  assert.equal(forAda?.showerId, "npc");
  assert.deepEqual(forAda?.cardIds, ["lord", "study"]);
});
