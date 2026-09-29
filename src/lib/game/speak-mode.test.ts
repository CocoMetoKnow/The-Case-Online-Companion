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


function threePlayers(): GameState {
  const s = base();
  s.players.push({ id: "cy", name: "Cy", color: "#888", seat: 2, eliminated: false, isHost: false, position: { kind: "hall", x: 2, y: 0 } });
  s.turnOrder = ["ada", "bea", "cy"];
  return s;
}
function threeSecrets(): Secrets {
  return { solution: { suspect: "lord", room: "study", weapon: "knife" }, hands: { ada: ["chef"], bea: ["rope", "hall"], cy: [] } };
}

test("only the player whose turn it is can make a spoken suggestion", () => {
  const s = threePlayers();
  assert.equal(canAsk(s, "ada"), true);
  assert.equal(canAsk(s, "bea"), false);
  assert.equal(applyPlay(s, threeSecrets(), "bea", "ask", {}).state.question, null);
});

test("I'm in a room asks the next player in order first", () => {
  const out = applyPlay(threePlayers(), threeSecrets(), "ada", "ask", {});
  const q = out.state.question!;
  assert.equal(out.state.phase, "question");
  assert.equal(q.spoken, true);
  assert.deepEqual(q.responderIds, ["bea", "cy"]);
  assert.equal(q.askingId, "bea");
  // Nobody else can answer for them
  assert.equal(applyPlay(out.state, threeSecrets(), "cy", "reply", { has: true }).state.question!.askingId, "bea");
});

test("answering no moves to the next player, and the last no gives everyone a notice", () => {
  let cur = applyPlay(threePlayers(), threeSecrets(), "ada", "ask", {});
  cur = applyPlay(cur.state, threeSecrets(), "bea", "reply", { has: false });
  assert.equal(cur.state.question!.askingId, "cy");
  cur = applyPlay(cur.state, threeSecrets(), "cy", "reply", { has: false });
  assert.equal(cur.state.question, null);
  assert.equal(cur.state.phase, "action");
  assert.match(cur.state.notice ?? "", /No one had a card/);
  assert.equal(cur.state.turnIndex, 0);
});

test("yes lets the player pick any card from their hand, then the asker sees it and the turn ends", () => {
  let cur = applyPlay(threePlayers(), threeSecrets(), "ada", "ask", {});
  cur = applyPlay(cur.state, threeSecrets(), "bea", "reply", { has: true });
  assert.equal(cur.state.question!.showerId, "bea");
  // a card that is not in their hand is refused
  assert.equal(applyPlay(cur.state, threeSecrets(), "bea", "show", { cardId: "chef" }).state.question!.shownCardId, null);
  const shown = applyPlay(cur.state, threeSecrets(), "bea", "show", { cardId: "hall" });
  assert.equal(shown.state.question!.shownCardId, "hall");
  assert.equal(sanitizeState(shown.state, "ada").question!.shownCardId, "hall");
  assert.equal(sanitizeState(shown.state, "cy").question!.shownCardId, null);
  const ended = applyPlay(shown.state, threeSecrets(), "ada", "ack", {});
  assert.equal(ended.state.question, null);
  assert.equal(ended.state.turnIndex, 1);
});

test("a player who leaves mid-question does not stall the table", () => {
  const cur = applyPlay(threePlayers(), threeSecrets(), "ada", "ask", {});
  const out = applyPlay(cur.state, threeSecrets(), "bea", "leave", {});
  assert.ok(out);
});
