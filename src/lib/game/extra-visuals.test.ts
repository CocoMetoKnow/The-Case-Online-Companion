import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { canAsk } from "./engine.ts";
import { sanitizeState } from "./sanitize.ts";
import type { GameState, Secrets } from "./types.ts";

function base(): GameState {
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
      enabledRoomIds: ["study"],
      speakMode: true,
    },
    cards: [
      { id: "lord", category: "suspect", name: "Lord", blurb: "", icon: "User" },
      { id: "chef", category: "suspect", name: "Chef", blurb: "", icon: "User" },
      { id: "study", category: "room", name: "Study", blurb: "", icon: "Castle" },
      { id: "hall", category: "room", name: "Hall", blurb: "", icon: "Castle" },
      { id: "knife", category: "weapon", name: "Knife", blurb: "", icon: "Sword" },
      { id: "rope", category: "weapon", name: "Rope", blurb: "", icon: "Sword" },
    ],
    leftover: [],
    players: [
      { id: "ada", name: "Ada", color: "#fff", seat: 0, eliminated: false, isHost: true, position: { kind: "hall", x: 0, y: 0 } },
      { id: "bea", name: "Bea", color: "#000", seat: 1, eliminated: false, isHost: false, position: { kind: "hall", x: 1, y: 0 } },
    ],
    turnOrder: ["ada", "bea"],
    turnIndex: 0,
    phase: "action",
    dice: null,
    moveBudget: 0,
    actionsLeft: 1,
    freeQuestion: false,
    whisperMode: false,
    question: null,
    event: null,
    log: [],
    winnerId: null,
    startedAt: 1,
    eventDeck: ["peek"],
    eventDiscard: [],
    accusation: null,
    passages: [],
    skipIds: [],
    notesLock: {},
    influences: [],
    naming: null,
    privateShow: null,
  };
}

function secrets(): Secrets {
  return {
    solution: { suspect: "lord", room: "study", weapon: "knife" },
    hands: { ada: ["chef"], bea: ["rope", "hall"] },
  };
}


test("speak mode: other phones lose the card list but keep what Extra Visuals needs", () => {
  const out = applyPlay(base(), secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "knife" });
  const look = out.state.lastSuggestion?.look;
  assert.deepEqual(look, { suspectId: "lord", roomId: "study", weaponId: "knife" });
  const other = sanitizeState(out.state, "bea");
  assert.deepEqual(other.lastSuggestion?.cardIds, [], "speak mode still keeps the card list off other phones");
  assert.equal(other.question?.roomId, "", "and the question itself");
  assert.deepEqual(other.lastSuggestion?.look, look, "but the background can still be dressed");
});

test("the look follows the suggestion through to the answer", () => {
  let cur = applyPlay(base(), secrets(), "ada", "ask", { suspectId: "chef", roomId: "hall", weaponId: "rope" });
  const id = cur.state.lastSuggestion?.id;
  cur = applyPlay(cur.state, secrets(), "bea", "reply", { has: false });
  assert.equal(cur.state.lastSuggestion?.id, id);
  assert.equal(cur.state.lastSuggestion?.look?.roomId, "hall");
});
