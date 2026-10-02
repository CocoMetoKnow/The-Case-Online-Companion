import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { dealAndStart, endTurn } from "./engine.ts";
import { sanitizeState } from "./sanitize.ts";
import { NPC_ID, type GameState, type Secrets } from "./types.ts";

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
      enabledRoomIds: ["study"],
      ...over,
    },
    cards: [
      { id: "lord", category: "suspect", name: "Lord", blurb: "", icon: "User" },
      { id: "chef", category: "suspect", name: "Chef", blurb: "", icon: "User" },
      { id: "maid", category: "suspect", name: "Maid", blurb: "", icon: "User" },
      { id: "study", category: "room", name: "Study", blurb: "", icon: "Castle" },
      { id: "hall", category: "room", name: "Hall", blurb: "", icon: "Castle" },
      { id: "attic", category: "room", name: "Attic", blurb: "", icon: "Castle" },
      { id: "knife", category: "weapon", name: "Knife", blurb: "", icon: "Sword" },
      { id: "rope", category: "weapon", name: "Rope", blurb: "", icon: "Sword" },
      { id: "vase", category: "weapon", name: "Vase", blurb: "", icon: "Sword" },
    ],
    leftover: [],
    players: [
      { id: "ada", name: "Ada", color: "#fff", seat: 0, eliminated: false, isHost: true, position: { kind: "hall", x: 0, y: 0 } },
      { id: "bea", name: "Bea", color: "#000", seat: 1, eliminated: false, isHost: false, position: { kind: "hall", x: 1, y: 0 } },
      { id: "cy", name: "Cy", color: "#888", seat: 2, eliminated: false, isHost: false, position: { kind: "hall", x: 2, y: 0 } },
    ],
    turnOrder: ["ada", "bea", "cy"],
    turnIndex: 0,
    phase: "action",
    dice: null,
    moveBudget: 0,
    actionsLeft: 1,
    freeQuestion: true,
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

// The envelope is lord / study / knife. Ada holds chef. Bea holds rope + hall. Cy holds maid. The NPC holds vase + attic.
function secrets(): Secrets {
  return {
    solution: { suspect: "lord", room: "study", weapon: "knife" },
    hands: { ada: ["chef"], bea: ["rope", "hall"], cy: ["maid"], [NPC_ID]: ["vase", "attic"] },
  };
}

function withEvent(kind: string, state = base()): GameState {
  return {
    ...state,
    phase: "event",
    event: { deckId: "ev1", kind: kind as never, title: kind, description: "", step: "intro", data: {} },
  };
}

test("Thief: the thief gets a visible third die that is counted in the move, and it clears at the end of the turn", () => {
  const start = { ...withEvent("thief"), moveBudget: 5, pace: 5 };
  const out = applyPlay(start, secrets(), "ada", "event", { targetId: "bea" });
  assert.ok(out.state.extraDie && out.state.extraDie >= 1 && out.state.extraDie <= 6);
  assert.equal(out.state.pace, 5 + (out.state.extraDie as number));
  assert.equal(out.state.shortDieId, "bea");
  const next = endTurn(out.state, "ada");
  assert.equal(next.extraDie, null);
  assert.equal(next.pace, null);
});

test("Gambler: choosing not to gamble tells the table and arms nothing", () => {
  const out = applyPlay(withEvent("gambler"), secrets(), "ada", "event", { gamble: false });
  assert.match(out.state.notice ?? "", /Ada has chosen not to gamble/);
  assert.equal(out.state.gambler ?? null, null);
  assert.equal(out.state.phase, "action");
});

test("Gambler: a bet is stored, hidden from the table, and refused for a made-up category", () => {
  assert.equal(applyPlay(withEvent("gambler"), secrets(), "ada", "event", { category: "banana" }).state.gambler ?? null, null);
  const out = applyPlay(withEvent("gambler"), secrets(), "ada", "event", { category: "weapon" });
  assert.deepEqual(out.state.gambler, { playerId: "ada", category: "weapon" });
  assert.equal(sanitizeState(out.state, "bea").gambler?.category, "");
  assert.equal(sanitizeState(out.state, "ada").gambler?.category, "weapon");
});

function armed(category: string): GameState {
  return { ...base(), gambler: { playerId: "ada", category: category as never } };
}

test("Gambler: right category means the same player gets another suggestion", () => {
  const asked = applyPlay(armed("weapon"), secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "rope" });
  assert.equal(asked.state.question?.gamble?.category, "weapon");
  assert.equal(asked.state.gambler ?? null, null);
  assert.equal(asked.state.question?.showerId, "bea");
  const shown = applyPlay(asked.state, secrets(), "bea", "show", { cardId: "rope" });
  assert.equal(shown.state.question?.gambleResult, "won");
  // the table can see the bet was won, but not what the bet was
  assert.equal(sanitizeState(shown.state, "cy").question?.gamble?.category, "");
  const done = applyPlay(shown.state, secrets(), "ada", "ack", {});
  assert.equal(done.state.phase, "action");
  assert.equal(done.state.actionsLeft, 1);
  assert.equal(done.state.question, null);
  assert.equal(done.state.turnIndex, 0);
  assert.match(done.state.notice ?? "", /Ada won the gamble/);
});

test("Gambler: wrong category hides the card from the asker and ends the turn", () => {
  const asked = applyPlay(armed("room"), secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "rope" });
  const shown = applyPlay(asked.state, secrets(), "bea", "show", { cardId: "rope" });
  assert.equal(shown.state.question?.gambleResult, "lost");
  assert.equal(sanitizeState(shown.state, "ada").question?.shownCardId, null);
  assert.equal(sanitizeState(shown.state, "bea").question?.shownCardId, "rope");
  const done = applyPlay(shown.state, secrets(), "ada", "ack", {});
  assert.equal(done.state.turnIndex, 1);
  assert.match(done.state.notice ?? "", /Ada lost the gamble/);
});

test("Gambler: naming a card you hold calls the gamble off and tells the table", () => {
  const asked = applyPlay(armed("weapon"), secrets(), "ada", "ask", { suspectId: "chef", roomId: "study", weaponId: "rope" });
  assert.equal(asked.state.question?.gamble ?? null, null);
  assert.equal(asked.state.question?.gambleOff, true);
  assert.match(asked.state.log.map((l) => l.text).join(" "), /Ada has chosen not to gamble/);
  const shown = applyPlay(asked.state, secrets(), "bea", "show", { cardId: "rope" });
  assert.equal(shown.state.question?.gambleResult ?? null, null);
  assert.equal(applyPlay(shown.state, secrets(), "ada", "ack", {}).state.turnIndex, 1);
});

test("Gambler: an unused bet goes away when the turn ends", () => {
  assert.equal(endTurn(armed("weapon"), "ada").gambler ?? null, null);
});

test("Extra Difficulty: the NPC shows last, only to the asker, and only if nobody else has a card", () => {
  const state = base({ extraDifficulty: true });
  // Bea holds the rope, so she shows and the NPC is never reached.
  const first = applyPlay(state, secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "rope" });
  assert.equal(first.state.question?.showerId, "bea");
  assert.notEqual(first.state.question?.npcShown, true);
  // Nobody at the table holds the vase, but the NPC does.
  const asked = applyPlay(state, secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "vase" });
  const q = asked.state.question!;
  assert.equal(asked.state.phase, "question");
  assert.equal(q.showerId, NPC_ID);
  assert.equal(q.shownCardId, "vase");
  assert.equal(q.npcShown, true);
  assert.ok(!asked.state.log.some((l) => /npc|NPC/.test(l.text)));
  const mine = sanitizeState(asked.state, "ada").question!;
  assert.equal(mine.shownCardId, "vase");
  const theirs = sanitizeState(asked.state, "cy").question!;
  assert.equal(theirs.shownCardId, null);
  assert.equal(theirs.showerId, null);
  assert.notEqual(theirs.npcShown, true);
  assert.notEqual(theirs.cardShown, true);
  const done = applyPlay(asked.state, secrets(), "ada", "ack", {});
  assert.equal(done.state.question, null);
  assert.equal(done.state.turnIndex, 1);
});

test("Extra Difficulty off: the NPC hand is ignored", () => {
  const asked = applyPlay(base(), secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "vase" });
  assert.equal(asked.state.phase, "roll");
});

test("Extra Difficulty: the NPC is dealt a hand, but never gets a seat or a turn", () => {
  const lobby = { ...base({ extraDifficulty: true }), phase: "lobby" as const, startedAt: null };
  const dealt = dealAndStart(lobby, { solution: {}, hands: {} });
  assert.equal(dealt.state.players.length, 3);
  assert.ok(!dealt.state.turnOrder.includes(NPC_ID));
  const sizes = [...dealt.state.players.map((p) => p.id), NPC_ID].map((id) => (dealt.secrets.hands[id] ?? []).length);
  assert.ok(sizes[sizes.length - 1] > 0, "NPC holds cards");
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 0, `even deal, got ${sizes}`);
  const plain = dealAndStart({ ...lobby, settings: { ...lobby.settings, extraDifficulty: false } }, { solution: {}, hands: {} });
  assert.equal(plain.secrets.hands[NPC_ID], undefined);
});

test("Speak mode: the picks are kept for the asker only, and the prompt still goes round the table in order", () => {
  const state = base({ speakMode: true });
  const out = applyPlay(state, secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "rope" });
  const q = out.state.question!;
  assert.equal(q.spoken, true);
  assert.equal(q.askingId, "bea");
  assert.equal(sanitizeState(out.state, "ada").question?.weaponId, "rope");
  assert.equal(sanitizeState(out.state, "bea").question?.weaponId, "");
  // a pick that is not a real card is dropped
  const bad = applyPlay(state, secrets(), "ada", "ask", { suspectId: "ghost", roomId: "study", weaponId: "rope" });
  assert.equal(bad.state.question?.suspectId, "");
});

test("Speak mode + Extra Difficulty: after every player says no, the NPC shows a named card to the asker", () => {
  const state = base({ speakMode: true, extraDifficulty: true });
  let cur = applyPlay(state, secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "vase" });
  cur = applyPlay(cur.state, secrets(), "bea", "reply", { has: false });
  cur = applyPlay(cur.state, secrets(), "cy", "reply", { has: false });
  assert.equal(cur.state.question?.showerId, NPC_ID);
  assert.equal(cur.state.question?.shownCardId, "vase");
  assert.equal(sanitizeState(cur.state, "bea").question?.shownCardId, null);
  const done = applyPlay(cur.state, secrets(), "ada", "ack", {});
  assert.equal(done.state.turnIndex, 1);
  // and with nothing the NPC holds, it ends the turn as before
  let none = applyPlay(state, secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "knife" });
  none = applyPlay(none.state, secrets(), "bea", "reply", { has: false });
  none = applyPlay(none.state, secrets(), "cy", "reply", { has: false });
  assert.equal(none.state.question, null);
  assert.equal(none.state.turnIndex, 1);
});

test("Speak mode + Gambler: a bet is settled on the category of the card shown", () => {
  const state = { ...base({ speakMode: true }), gambler: { playerId: "ada", category: "weapon" as const } };
  let cur = applyPlay(state, secrets(), "ada", "ask", { suspectId: "lord", roomId: "study", weaponId: "rope" });
  cur = applyPlay(cur.state, secrets(), "bea", "reply", { has: true });
  cur = applyPlay(cur.state, secrets(), "bea", "show", { cardId: "hall" });
  assert.equal(cur.state.question?.gambleResult, "lost");
  assert.equal(sanitizeState(cur.state, "ada").question?.shownCardId, null);
});
