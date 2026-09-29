import assert from "node:assert/strict";
import test from "node:test";
import { accusationHits, makeAccusation, rollDice, setNaming } from "./engine.ts";
import type { GameState } from "./types.ts";

function base(): GameState {
  return {
    version: 1,
    code: "gmmTEST",
    hostId: "ada",
    settings: {
      maxPlayers: 15,
      locked: false,
      timeOfDayEnabled: true,
      wrongAccusationEliminates: true,
      honorHands: false,
      playMode: "hotseat",
      cardSetId: "harrington",
      enabledRoomIds: ["study"],
    },
    cards: [
      { id: "lord", category: "suspect", name: "Lord", blurb: "", icon: "User" },
      { id: "chef", category: "suspect", name: "Chef", blurb: "", icon: "User" },
      { id: "study", category: "room", name: "Study", blurb: "", icon: "Castle" },
      { id: "hall", category: "room", name: "Hall", blurb: "", icon: "Castle" },
      { id: "knife", category: "weapon", name: "Knife", blurb: "", icon: "Sword" },
      { id: "rope", category: "weapon", name: "Rope", blurb: "", icon: "Sword" },
      { id: "dawn", category: "time", name: "Dawn", blurb: "", icon: "Moon" },
      { id: "dusk", category: "time", name: "Dusk", blurb: "", icon: "Moon" },
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
    wait: null,
    naming: null,
  };
}

function withDice(d1: number, d2: number, run: () => void) {
  const faces = [(d1 - 1) / 6 + 1e-4, (d2 - 1) / 6 + 1e-4];
  let n = 0;
  const orig = Math.random;
  Math.random = () => {
    if (n < faces.length) return faces[n++];
    return orig();
  };
  try {
    run();
  } finally {
    Math.random = orig;
  }
}

test("magnifying glass draws a power and counts as 0", () => {
  withDice(3, 5, () => {
    const rolled = rollDice(base(), "ada");
    assert.equal(rolled.snakeEyes, true);
    assert.deepEqual(rolled.state.dice, [3, 5]);
    assert.equal(rolled.state.moveBudget, 5);
    assert.equal(rolled.state.phase, "event");
    assert.match(rolled.state.log.at(-1)?.text ?? "", /magnifying glass/);
    assert.match(rolled.state.log.at(-1)?.text ?? "", /Move 5/);
  });
});

test("a three on the second die is a normal roll", () => {
  withDice(4, 3, () => {
    const rolled = rollDice(base(), "ada");
    assert.equal(rolled.snakeEyes, false);
    assert.deepEqual(rolled.state.dice, [4, 3]);
    assert.equal(rolled.state.phase, "action");
    assert.match(rolled.state.log.at(-1)?.text ?? "", /rolls 4 and 3/);
  });
});

test("snake eyes still draw an event", () => {
  withDice(1, 1, () => {
    const rolled = rollDice(base(), "ada");
    assert.equal(rolled.snakeEyes, true);
    assert.equal(rolled.state.phase, "event");
    assert.match(rolled.state.log.at(-1)?.text ?? "", /snake eyes/);
  });
});

test("naming replaces one card and keeps the others", () => {
  const state = { ...base(), phase: "action" as const, actionsLeft: 1 };
  const first = setNaming(state, "ada", { suspectId: "lord", roomId: "study", weaponId: "knife" });
  assert.equal(first.naming?.suspectId, "lord");
  assert.equal(first.naming?.roomId, "study");
  assert.equal(first.naming?.weaponId, "knife");
  const changed = setNaming(first, "ada", {
    suspectId: "chef",
    roomId: "study",
    weaponId: "knife",
    timeId: "dawn",
  });
  assert.equal(changed.naming?.suspectId, "chef");
  assert.equal(changed.naming?.roomId, "study");
  assert.equal(changed.naming?.weaponId, "knife");
  assert.equal(changed.naming?.timeId, "dawn");
  const cleared = setNaming(changed, "ada", { clear: true });
  assert.equal(cleared.naming, null);
});

test("a wrong accusation stays up and only the accuser can be scored", () => {
  const state = {
    ...base(),
    phase: "action" as const,
    actionsLeft: 1,
    settings: { ...base().settings, wrongAccusationEliminates: false },
  };
  const secrets = {
    solution: { suspect: "lord", room: "study", weapon: "knife", time: "dawn" },
    hands: { ada: ["chef"], bea: ["rope"] },
  };
  const result = makeAccusation(state, "ada", { suspectId: "chef", roomId: "study", weaponId: "rope", timeId: "dawn" }, secrets);
  assert.equal(result.state.phase, "roll");
  assert.equal(result.state.accusation?.correct, false);
  assert.equal(result.state.accusation?.playerId, "ada");
  assert.equal(result.state.turnOrder[result.state.turnIndex], "bea");
  assert.deepEqual(accusationHits(result.state, secrets, "ada"), {
    suspect: false,
    room: true,
    weapon: false,
    time: true,
  });
  assert.equal(accusationHits(result.state, secrets, "bea"), null);
});
