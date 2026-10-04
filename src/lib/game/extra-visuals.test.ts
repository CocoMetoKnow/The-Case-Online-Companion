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

test("live suggestion picks reach everyone and end when the question is asked", () => {
  const start = base();
  let cur = applyPlay(start, secrets(), "ada", "suggesting", { roomId: "study" });
  assert.equal(cur.state.suggesting?.roomId, "study");
  cur = applyPlay(cur.state, secrets(), "ada", "suggesting", { roomId: "study", suspectId: "lord", weaponId: "knife" });
  const seen = sanitizeState(cur.state, "bea");
  assert.equal(seen.suggesting?.suspectId, "lord", "other phones see the picks as they are made");
  cur = applyPlay(cur.state, secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "knife" });
  assert.equal(cur.state.suggesting ?? null, null);
});

test("someone who is not on turn cannot put a live suggestion on the table", () => {
  const out = applyPlay(base(), secrets(), "bea", "suggesting", { roomId: "study" });
  assert.equal(out.state.suggesting ?? null, null);
});

test("closing the picker clears the live suggestion", () => {
  let cur = applyPlay(base(), secrets(), "ada", "suggesting", { roomId: "study" });
  cur = applyPlay(cur.state, secrets(), "ada", "suggesting", { clear: true });
  assert.equal(cur.state.suggesting ?? null, null);
});

test("rooms and saved decks that still say Poison Bottle show Poison", async () => {
  const { retireBorrowedNames } = await import("./cards.ts");
  const old = [{ id: "poison-bottle", category: "weapon", name: "Poison Bottle", blurb: "x", icon: "Sword" }] as never;
  assert.equal(retireBorrowedNames(old)[0].name, "Poison");
  const live = { ...base(), cards: old } as never;
  assert.equal(sanitizeState(live, "ada").cards[0].name, "Poison");
});

// ---- Power-ups that change a suggestion, in speak mode ----

function third(state: GameState, sec: Secrets) {
  const s = { ...state, players: [...state.players, { id: "cy", name: "Cy", color: "#0f0", seat: 2, eliminated: false, isHost: false, position: { kind: "hall", x: 2, y: 0 } }], turnOrder: ["ada", "bea", "cy"] } as GameState;
  return { state: s, secrets: { ...sec, hands: { ...sec.hands, cy: ["chef"] } } as Secrets };
}
const ASK = { suspectId: "chef", roomId: "hall", weaponId: "rope" };

test("speak mode with no power-up still asks the table out loud", () => {
  const out = applyPlay(base(), secrets(), "ada", "ask", ASK);
  assert.equal(out.state.question?.askingId, "bea");
  assert.equal(out.state.question?.shownCardId, null);
});

test("Stealth Auto-Reveal in speak mode sends a card secretly, without asking anyone", () => {
  const out = applyPlay({ ...base(), autoShowTurn: true }, secrets(), "ada", "ask", ASK);
  const q = out.state.question!;
  assert.equal(q.askingId, null, "nobody is asked out loud");
  assert.ok(["rope", "hall"].includes(String(q.shownCardId)), "a card Bea holds was sent");
  assert.equal(q.stealth, true);
  assert.equal(out.state.autoShowTurn, false, "the power is used up");
  assert.equal(sanitizeState(out.state, "ada").question?.showerId, null, "the asker is not told who sent it");
  assert.equal(sanitizeState(out.state, "bea").question?.showerId, "bea", "the sender knows it was them");
});

test("Stealth Auto-Reveal skips players with nothing and finds the first holder", () => {
  const { state, secrets: sec } = third(base(), { solution: { suspect: "lord", room: "study", weapon: "knife" }, hands: { ada: [], bea: [] } });
  const out = applyPlay({ ...state, autoShowTurn: true }, sec, "ada", "ask", { suspectId: "chef", roomId: "hall", weaponId: "knife" });
  assert.equal(out.state.question?.showerId, "cy");
  assert.equal(out.state.question?.shownCardId, "chef");
});

test("Stealth Auto-Reveal with nobody holding a card is used up and the turn ends as usual", () => {
  const out = applyPlay({ ...base(), autoShowTurn: true }, { solution: { suspect: "lord", room: "study", weapon: "knife" }, hands: { ada: [], bea: [] } }, "ada", "ask", ASK);
  assert.equal(out.state.question ?? null, null);
  assert.equal(out.state.autoShowTurn, false);
});

test("Hush in speak mode silences the named card and nobody can show it", () => {
  const hushed = { ...base(), hush: { cardId: "rope", byId: "bea" } } as GameState;
  const own = applyPlay({ ...hushed, hush: { cardId: "rope", byId: "ada" } }, secrets(), "ada", "ask", ASK);
  assert.equal(own.state.question?.silencedId ?? null, null, "the one who hushed a card is not silenced by it");
  const out = applyPlay(hushed, secrets(), "ada", "ask", ASK);
  assert.equal(out.state.question?.silencedId, "rope");
  assert.equal(out.state.hush ?? null, null, "the hush lifts");
  const asked = applyPlay(out.state, secrets(), "bea", "reply", { has: true });
  const shown = applyPlay(asked.state, secrets(), "bea", "show", { cardId: "rope" });
  assert.equal(shown.state.question?.shownCardId ?? null, null, "the silenced card cannot be shown");
});

test("Whisper in speak mode still limits a suggestion to three cards", () => {
  const withTime = { ...base(), whisperMode: true, cards: [...base().cards, { id: "t1", category: "time", name: "Dusk", blurb: "", icon: "Clock" }], settings: { ...base().settings, timeOfDayEnabled: true } } as GameState;
  const four = applyPlay(withTime, secrets(), "ada", "ask", { ...ASK, timeId: "t1" });
  assert.equal(four.state.question ?? null, null, "four cards are refused");
  const three = applyPlay(withTime, secrets(), "ada", "ask", ASK);
  assert.ok(three.state.question, "three cards go through");
});
