import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { roomsInPlay } from "./engine.ts";
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
  hands: { ada: ["chef"], bea: ["knife"] },
});

test("a wrong Solve the Case eliminates, even when the saved setting is missing", () => {
  for (const flag of [true, undefined]) {
    const state = base({ wrongAccusationEliminates: flag as boolean });
    const out = applyPlay(state, secrets(), "ada", "accuse", { suspectId: "chef", roomId: "lounge", weaponId: "rope" }).state;
    assert.equal(out.players.find((p) => p.id === "ada")?.eliminated, true, `flag=${flag}`);
  }
});

test("a suggestion that names the whole solution ends the turn, no accusation prompt", () => {
  let cur = applyPlay(base(), secrets(), "ada", "ask", { suspectId: "lord", roomId: "lounge", weaponId: "rope" }).state;
  for (let i = 0; i < 6 && cur.question; i++) {
    assert.ok(!cur.question.offerAccusation, "never offers an accusation");
    cur = applyPlay(cur, secrets(), "ada", "ack", {}).state;
  }
  assert.equal(cur.question ?? null, null);
  assert.equal(cur.naming ?? null, null, "no solve-the-case naming flow was opened");
  assert.equal(cur.turnOrder[cur.turnIndex % cur.turnOrder.length], "bea", "turn moved to the next player");
});

test("passages and move powers only accept rooms whose cards are in play", () => {
  const state = base();
  assert.deepEqual(roomsInPlay(state).sort(), ["library", "lounge", "study"]);
  const ev: GameState = { ...state, phase: "event", event: { deckId: "e", kind: "new-passage", title: "", description: "", step: "intro", data: {} } as never };
  const bad = applyPlay(ev, secrets(), "ada", "event", { roomA: "study", roomB: "cellar" }).state;
  assert.equal((bad.passages ?? []).length, 0);
});

test("Pick Your Character sets one suspect card per seat", () => {
  let cur = applyPlay(base(), secrets(), "ada", "avatar", { playerId: "ada", cardId: "lord" }).state;
  assert.equal(cur.players[0].avatar, "lord");
  cur = applyPlay(cur, secrets(), "bea", "avatar", { playerId: "bea", cardId: "lord" }).state;
  assert.equal(cur.players[1].avatar, undefined, "already taken");
  cur = applyPlay(cur, secrets(), "bea", "avatar", { playerId: "ada", cardId: "chef" }).state;
  assert.equal(cur.players[0].avatar, "lord", "online you can only set your own seat");
  cur = applyPlay(cur, secrets(), "bea", "avatar", { playerId: "bea", cardId: "knife" }).state;
  assert.equal(cur.players[1].avatar, undefined, "weapons are not characters");
});
