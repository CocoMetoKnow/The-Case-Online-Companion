import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { canAsk, declareSnakeEyes, endTurn, makeAccusation, rollDice, sendPrivateCard, setNaming } from "./engine.ts";
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
    phase: "roll",
    dice: null,
    moveBudget: 0,
    actionsLeft: 0,
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

function secrets(): Secrets {
  return {
    solution: { suspect: "lord", room: "study", weapon: "knife" },
    hands: { ada: ["chef"], bea: ["rope", "hall"] },
  };
}

test("speak mode has no in-app suggestion", () => {
  const state = { ...base(), phase: "action" as const, actionsLeft: 1 };
  assert.equal(canAsk(state, "ada"), false);
});

test("anyone can show a card, and only the two of them see it", () => {
  const sent = sendPrivateCard(base(), secrets(), "bea", "ada", "rope");
  assert.equal(sent.phase, "roll");
  assert.equal(sent.privateShow?.fromId, "bea");
  assert.equal(sent.privateShow?.toId, "ada");
  assert.equal(sent.privateShow?.cardId, "rope");
  assert.match(sent.log.at(-1)?.text ?? "", /Bea shows a card privately to Ada/);
  assert.equal(sanitizeState(sent, "ada").privateShow?.cardId, "rope");
  assert.equal(sanitizeState(sent, "bea").privateShow?.cardId, "rope");
  assert.equal(sanitizeState(sent, "cy").privateShow?.cardId, "");
  const refused = sendPrivateCard(base(), secrets(), "bea", "ada", "chef");
  assert.equal(refused.privateShow ?? null, null);
});

test("a guest can accuse during someone else's roll", () => {
  const state = {
    ...base(),
    players: [
      ...base().players,
      { id: "cy", name: "Cy", color: "#888", seat: 2, eliminated: false, isHost: false, position: { kind: "hall" as const, x: 2, y: 0 } },
    ],
    turnOrder: ["ada", "bea", "cy"],
  };
  const book = secrets();
  book.hands.cy = [];
  const result = makeAccusation(state, "bea", { suspectId: "chef", roomId: "hall", weaponId: "rope" }, book);
  assert.equal(result.state.accusation?.playerId, "bea");
  assert.equal(result.state.accusation?.correct, false);
  assert.equal(result.state.phase, "roll");
  assert.equal(result.state.turnOrder[result.state.turnIndex], "ada");
  assert.equal(result.state.players.find((player) => player.id === "bea")?.eliminated, true);
  const named = setNaming(state, "bea", { suspectId: "chef", roomId: "hall", weaponId: "rope" });
  assert.equal(named.naming?.playerId, "bea");
  assert.equal(named.naming?.weaponId, "rope");
  const onTheClock = makeAccusation(state, "ada", { suspectId: "chef", roomId: "hall", weaponId: "rope" }, book);
  assert.equal(onTheClock.state.phase, "roll");
  assert.equal(onTheClock.state.turnOrder[onTheClock.state.turnIndex], "ada");
  assert.doesNotMatch(onTheClock.state.log.at(-1)?.text ?? "", /'s turn/);
});

test("anyone can roll at any time, and rolling does not pass a turn", () => {
  const waiting = { ...base(), phase: "action" as const, actionsLeft: 0, dice: [4, 2] as [number, number] };
  const rolled = rollDice(waiting, "bea");
  assert.notEqual(rolled.state.dice, null);
  assert.equal(rolled.state.turnIndex, 1);
  assert.match(rolled.state.log.at(-1)?.text ?? "", /Bea rolls/);
  assert.doesNotMatch(rolled.state.log.at(-1)?.text ?? "", /turn/);
  assert.ok(rolled.state.phase === "action" || rolled.state.phase === "event");
  const stopped = endTurn({ ...base(), phase: "action" as const, actionsLeft: 1 }, "ada");
  assert.equal(stopped.turnIndex, 0);
  assert.equal(stopped.phase, "action");
  assert.equal(stopped.log.length, 0);
  const eliminated = rollDice(base(), "bea");
  const gone = {
    ...eliminated.state,
    players: eliminated.state.players.map((player) => player.id === "bea" ? { ...player, eliminated: true } : player),
  };
  const ignored = rollDice(gone, "bea");
  assert.equal(ignored.state, gone);
});

test("only the host can mark snake eyes in speak mode", () => {
  const ignored = declareSnakeEyes(base(), "bea");
  assert.equal(ignored.phase, "roll");
  assert.equal(ignored.event, null);
  const drawn = declareSnakeEyes(base(), "ada");
  assert.equal(drawn.phase, "event");
  assert.deepEqual(drawn.dice, [1, 1]);
  assert.match(drawn.log.at(-1)?.text ?? "", /Snake eyes was rolled/);
});

test("send goes through the shared play pass", () => {
  const next = applyPlay(base(), secrets(), "ada", "send", { toId: "bea", cardId: "chef" });
  assert.equal(next.state.privateShow?.cardId, "chef");
  assert.equal(next.state.privateShow?.toId, "bea");
  assert.deepEqual(next.secrets.hands.ada, ["chef"]);
});
