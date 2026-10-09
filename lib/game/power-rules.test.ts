import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { endTurn, rollDice } from "./engine.ts";
import { autoResolveIfPossible } from "./events.ts";
import { ackShownCard } from "./engine.ts";
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
      enabledRoomIds: ["study", "library", "lounge"],
      speakMode: false,
    },
    cards: [
      { id: "lord", category: "suspect", name: "Lord", blurb: "", icon: "User" },
      { id: "chef", category: "suspect", name: "Chef", blurb: "", icon: "User" },
      { id: "study", category: "room", name: "Study", blurb: "", icon: "Castle" },
      { id: "library", category: "room", name: "Library", blurb: "", icon: "Castle" },
      { id: "lounge", category: "room", name: "Lounge", blurb: "", icon: "Castle" },
      { id: "knife", category: "weapon", name: "Knife", blurb: "", icon: "Sword" },
      { id: "rope", category: "weapon", name: "Rope", blurb: "", icon: "Sword" },
    ],
    leftover: [],
    players: [
      { id: "ada", name: "Ada", color: "#fff", seat: 0, eliminated: false, isHost: true, position: { kind: "room", roomId: "study" } },
      { id: "bea", name: "Bea", color: "#000", seat: 1, eliminated: false, isHost: false, position: { kind: "hall", x: 1, y: 0 } },
    ],
    turnOrder: ["ada", "bea"],
    turnIndex: 0,
    phase: "event",
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

function secrets(): Secrets {
  return {
    solution: { suspect: "lord", room: "lounge", weapon: "rope" },
    hands: { ada: ["chef"], bea: ["knife"] },
  };
}

function withEvent(kind: string, step = "intro", data: Record<string, unknown> = {}): GameState {
  return {
    ...base(),
    event: { deckId: "ev1", kind, title: "", description: "", step, data },
  };
}

test("Blocked Out now lasts one turn, for the player picked", () => {
  const out = applyPlay(withEvent("blocked-out"), secrets(), "ada", "event", { targetId: "bea" }).state;
  assert.equal(out.notesLock.bea, 1);
  assert.equal(out.notesLock.ada ?? 0, 0);
  assert.match(out.notice ?? "", /next turn/);
});

test("Food Poisoning shuts everyone's notes for their next turn, the drawer's too", () => {
  const out = autoResolveIfPossible(withEvent("food-poisoning"), secrets()).state;
  assert.equal(out.notesLock.bea, 1);
  // The drawer is mid turn, so the lock gets one extra tick to still be shut next turn.
  assert.equal(out.notesLock.ada, 2);
});

test("Speed Boost triples this turn's move and the next turn's roll, then ends", () => {
  const start = withEvent("second-wind");
  const rolled: GameState = { ...start, moveBudget: 4, settings: { ...start.settings, table: "board" } as GameState["settings"] };
  const boosted = autoResolveIfPossible(rolled, secrets()).state;
  assert.equal(boosted.moveBudget, 12, "tripled, not doubled");
  assert.deepEqual(boosted.speedBoost, { playerId: "ada", turns: 2 });

  // End Ada's boosted turn: one boosted turn left, Bea rolls normally.
  let cur = endTurn({ ...boosted, phase: "action" }, "ada");
  assert.equal(cur.speedBoost?.turns, 1);
  const realRandom = Math.random;
  Math.random = () => 0.5; // both dice show 4
  try {
    const bea = rollDice({ ...cur, phase: "roll" }, "bea").state;
    assert.equal(bea.moveBudget, 8, "Bea is not boosted");
    cur = endTurn({ ...bea, phase: "action" }, "bea");
    const ada = rollDice({ ...cur, phase: "roll" }, "ada").state;
    assert.equal(ada.moveBudget, 24, "Ada's next roll is tripled");
    assert.equal(ada.pace, 24);
    cur = endTurn({ ...ada, phase: "action" }, "ada");
    assert.equal(cur.speedBoost ?? null, null, "the boost is over after two turns");
  } finally {
    Math.random = realRandom;
  }
});

test("Only the player who drew a power-up has to confirm it", () => {
  const cur = withEvent("clunk", "reveal", { seen: [] });
  const byBea = applyPlay(cur, secrets(), "bea", "event", { confirm: true }).state;
  assert.equal(byBea.event?.step, "reveal", "another player's tap changes nothing");
  const byAda = applyPlay(cur, secrets(), "ada", "event", { confirm: true }).state;
  assert.equal(byAda.event?.step, "intro", "the drawer alone opens the power");
});

test("A won gamble tells everyone about the bonus suggestion, then moves the asker into the room they name", () => {
  const state: GameState = {
    ...base(),
    phase: "question",
    event: null,
    question: {
      askerId: "ada", suspectId: "lord", roomId: "study", weaponId: "knife", cursor: 0,
      responderIds: ["bea"], skips: [], missId: null, showerId: "bea", matchingCardIds: ["knife"],
      shownCardId: "knife", shownToAsker: false, resolved: false, nobodyHad: false, gambleResult: "won",
    } as unknown as GameState["question"],
  };
  const won = ackShownCard(state, "ada");
  assert.match(won.notice ?? "", /won the gamble/);
  assert.match(won.notice ?? "", /any room/);
  assert.match(won.notice ?? "", /move into that room/);
  assert.deepEqual(won.bonusRoom, { playerId: "ada" });
  assert.equal(won.phase, "action");
  assert.equal(won.freeQuestion, true);

  const asked = applyPlay(won, secrets(), "ada", "ask", { suspectId: "chef", roomId: "library", weaponId: "rope" }).state;
  const ada = asked.players.find((p) => p.id === "ada");
  assert.deepEqual(ada?.position, { kind: "room", roomId: "library" });
  assert.equal(asked.bonusRoom ?? null, null, "the bonus is used up");
});
