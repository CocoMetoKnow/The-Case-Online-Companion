import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { drawEvent } from "./engine.ts";
import { autoResolveIfPossible } from "./events.ts";
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

test("Sabotage picks a target and cancels their very next power-up draw", () => {
  let cur = withEvent("sabotage");
  cur = applyPlay(cur, secrets(), "ada", "event", { targetId: "bea" }).state;
  assert.deepEqual(cur.sabotage, { targetId: "bea", byId: "ada" });

  // Bea's turn: whatever card she would have drawn is cancelled instead.
  const rolling: GameState = { ...cur, phase: "action", event: null, turnIndex: 1 };
  const drawn = drawEvent(rolling);
  assert.equal(drawn.event?.kind, "sabotage-block");
  assert.equal(drawn.sabotage, null);

  // It only cancels once — the draw after that is untouched by sabotage.
  const again = drawEvent({ ...drawn, phase: "action", event: null });
  assert.notEqual(again.event?.kind, "sabotage-block");
});

test("Sabotage never fires for a player who wasn't targeted", () => {
  const cur = { ...withEvent("sabotage"), sabotage: { targetId: "bea", byId: "ada" } };
  const rolling: GameState = { ...cur, phase: "action", event: null, turnIndex: 0 };
  const drawn = drawEvent(rolling);
  assert.notEqual(drawn.event?.kind, "sabotage-block");
  assert.deepEqual(drawn.sabotage, { targetId: "bea", byId: "ada" });
});

test("Wild Card hands off to whichever power-up is picked", () => {
  let cur = withEvent("wild-card");
  cur = applyPlay(cur, secrets(), "ada", "event", { kind: "extra-roll" }).state;
  // extra-roll auto-resolves the instant it's drawn, so by now the turn has
  // already moved on and left a plain notice behind.
  assert.equal(cur.phase, "action");
  assert.match(cur.notice ?? "", /Bonus roll/);
});

test("Wild Card refuses to hand off to itself", () => {
  const cur = withEvent("wild-card");
  const out = applyPlay(cur, secrets(), "ada", "event", { kind: "wild-card" }).state;
  assert.equal(out.event?.kind, "wild-card");
});

test("Call the Card is a real choice, not a random pick", () => {
  let cur = withEvent("call-card");
  cur = applyPlay(cur, secrets(), "ada", "event", { category: "weapon" }).state;
  assert.equal(cur.event?.step, "pick-card");
  cur = applyPlay(cur, secrets(), "ada", "event", { cardId: "knife" }).state;
  // Bea holds "knife" in this fixture, so it's shown to the whole table.
  assert.equal(cur.event?.step, "show-all");
  assert.equal(cur.event?.data.holderId, "bea");
});

test("Call the Card says so out loud when nobody holds it", () => {
  let cur = withEvent("call-card");
  cur = applyPlay(cur, secrets(), "ada", "event", { category: "weapon" }).state;
  cur = applyPlay(cur, secrets(), "ada", "event", { cardId: "rope" }).state;
  // "rope" is the solution weapon — nobody's hand has it.
  assert.match(cur.notice ?? cur.event?.description ?? "", /no one|nobody/i);
});

test("Peek auto-resolves to a random card from a random opponent — no manual pick", () => {
  // Bea is the only other player and holds exactly one card, so the result
  // is fully determined even though the pick is random.
  const { state: drawn } = autoResolveIfPossible(withEvent("peek"), secrets());
  assert.equal(drawn.event?.step, "show-private");
  assert.equal(drawn.event?.data.viewerId, "ada");
  assert.equal(drawn.event?.data.targetId, "bea");
  assert.equal(drawn.event?.data.cardId, "knife");
});

test("Teleport moves to any enabled room except the one you're already in", () => {
  let cur = withEvent("move-anywhere");
  const rejected = applyPlay(cur, secrets(), "ada", "event", { roomId: "study" }).state;
  assert.equal(rejected.event?.kind, "move-anywhere"); // same room refused, event still open
  cur = applyPlay(cur, secrets(), "ada", "event", { roomId: "library" }).state;
  const ada = cur.players.find((p) => p.id === "ada");
  assert.deepEqual(ada?.position, { kind: "room", roomId: "library" });
});

test("An unmatched suggestion ends the turn on its own and queues a delayed answer", () => {
  const cur = { ...withEvent("peek"), event: null, phase: "action" };
  // Ada names the true solution's room and weapon, but leaves out a
  // suspect — an incomplete suggestion, so it can't officially offer a win,
  // yet nobody holds either named card because they really are the answer.
  const clean = applyPlay(cur, secrets(), "ada", "ask", { suspectId: "", roomId: "lounge", weaponId: "rope" });
  const state = clean.state;
  assert.equal(state.question, null);
  // The turn already moved on by itself — no manual "end turn" needed; the
  // next player lands on "roll", exactly like any other fresh turn.
  assert.equal(state.phase, "roll");
  assert.equal(state.turnIndex, 1);
  assert.ok(state.pendingAnswer);
  assert.equal(state.pendingAnswer?.askerId, "ada");
  assert.deepEqual([...state.pendingAnswer!.ids].sort(), ["lounge", "rope"]);
  assert.equal(state.pendingAnswer?.turnIndex, 0);
});

test("Lost in the Hall sends the current player back to the hall", () => {
  const cur = withEvent("lost-in-hall");
  const { state } = autoResolveIfPossible(cur, secrets());
  const ada = state.players.find((p) => p.id === "ada");
  // Without a digital board the hall is the middle of the printed one; with it, a corridor square near the middle of the house.
  assert.equal(ada?.position.kind, "hall");
});

test("Shortcut only offers rooms linked by an existing passage", () => {
  const withPassage: GameState = { ...withEvent("shortcut"), passages: [{ a: "study", b: "lounge" }] };
  const blocked = applyPlay(withPassage, secrets(), "ada", "event", { roomId: "library" }).state;
  assert.equal(blocked.event?.kind, "shortcut"); // library isn't on a passage, refused
  const ok = applyPlay(withPassage, secrets(), "ada", "event", { roomId: "lounge" }).state;
  const ada = ok.players.find((p) => p.id === "ada");
  assert.deepEqual(ada?.position, { kind: "room", roomId: "lounge" });
});

test("every power-up step can be finished by the player whose turn it is", () => {
  const steps: Array<[string, string, Record<string, unknown>]> = [
    ["move-anywhere", "intro", {}],
    ["fast-track", "intro", {}],
    ["shortcut", "intro", {}],
    ["thief", "pick-player", {}],
    ["spy", "intro", {}],
    ["swap-card", "pick-give", {}],
    ["red-herring", "pick-truth", {}],
    ["new-passage", "intro", {}],
    ["wild-card", "intro", {}],
    ["influenced", "intro", {}],
    ["peek", "show-private", { viewerId: "ada" }],
    ["hush", "ack", { acked: [] }],
    ["name-room", "show-all", { holderId: "bea", cardId: "knife" }],
    ["clunk", "reveal", { seen: [] }],
    ["blocked-out", "board", {}],
  ];
  for (const [kind, step, data] of steps) {
    const out = applyPlay(withEvent(kind, step, data), secrets(), "ada", "event", { finish: true }).state;
    assert.equal(out.event, null, `${kind}/${step} is cleared`);
    assert.equal(out.phase, "action", `${kind}/${step} hands the turn back`);
    assert.match(out.notice ?? "", /finished/, `${kind}/${step} tells the table`);
  }
});

test("finish is refused for a guest who is not playing and is not being waited on", () => {
  const out = applyPlay(withEvent("move-anywhere"), secrets(), "bea", "event", { finish: true }).state;
  assert.equal(out.phase, "event");
  assert.equal(out.event?.kind, "move-anywhere");
});

test("the guest a power is waiting on can finish it too", () => {
  const out = applyPlay(withEvent("swap-card", "pick-take", { targetId: "bea", giveId: "chef", giverId: "ada" }), secrets(), "bea", "event", { finish: true }).state;
  assert.equal(out.event, null);
  assert.equal(out.phase, "action");
});
