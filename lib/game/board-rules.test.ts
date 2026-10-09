import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { DEFAULT_CARDS } from "./cards.ts";
import { addPlayer, canAsk, createLobby, dealAndStart } from "./engine.ts";
import { MAP_ROOM_IDS, expandPassages, layoutFor, nearestRooms, resolvePassages } from "./board.ts";
import { autoResolveIfPossible } from "./events.ts";
import type { CardDef, GameSettings, GameState, Secrets } from "./types.ts";

const rooms = MAP_ROOM_IDS.map((id) => DEFAULT_CARDS.find((c) => c.id === id)!) as CardDef[];
const extra = ["observatory"].map((id) => DEFAULT_CARDS.find((c) => c.id === id)!) as CardDef[];
const others = DEFAULT_CARDS.filter((c) => c.category !== "room" && c.category !== "time");

function game(players: number, boardPassages?: GameSettings["boardPassages"], hidden: CardDef[] = []) {
  const cards = [...others, ...rooms, ...hidden];
  const enabled = cards.filter((c) => c.category === "room").map((c) => c.id);
  const settings = {
    maxPlayers: 8,
    locked: false,
    timeOfDayEnabled: false,
    wrongAccusationEliminates: true,
    honorHands: false,
    playMode: "online",
    table: "board",
    cardSetId: "classic",
    enabledRoomIds: enabled,
    boardPassages: resolvePassages(enabled, boardPassages),
  } as unknown as GameSettings;
  let { state, secrets } = createLobby("Ada", settings, cards);
  for (let i = 1; i < players; i++) state = addPlayer(state, `P${i}`, `p${i}`);
  const dealt = dealAndStart(state, secrets);
  return { state: dealt.state as GameState, secrets: dealt.secrets as Secrets };
}

const k = (p: { kind: string; x?: number; y?: number }) => `${p.x},${p.y}`;

test("eight guests start on eight different blue circle squares", () => {
  const { state } = game(8);
  const house = layoutFor(state.settings);
  const blue = new Set(house.starts.map((s) => `${s.x},${s.y}`));
  const seen = new Set<string>();
  for (const p of state.players) {
    assert.equal(p.position.kind, "hall");
    assert.ok(blue.has(k(p.position as never)), `${p.name} is on a blue circle square`);
    seen.add(k(p.position as never));
    assert.deepEqual(state.spawns?.[p.id], { x: (p.position as { x: number }).x, y: (p.position as { y: number }).y });
  }
  assert.equal(seen.size, 8);
});

test("spawn squares are random, but always blue circle squares", () => {
  const orders = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const { state } = game(3);
    orders.add(state.players.map((p) => k(p.position as never)).join("|"));
  }
  assert.ok(orders.size > 1, "different games seat guests differently");
});

test("a suggestion can only be made from inside a room", () => {
  const { state } = game(3);
  const me = state.turnOrder[0];
  const ready = (position: GameState["players"][number]["position"]): GameState => ({
    ...state,
    phase: "action",
    actionsLeft: 1,
    freeQuestion: true,
    players: state.players.map((p) => (p.id === me ? { ...p, position } : p)),
  });
  assert.equal(canAsk(ready({ kind: "hall", ...layoutFor(state.settings).starts[0] }), me), false, "not in the corridor, even with a free question");
  assert.equal(canAsk(ready({ kind: "room", roomId: "library" }), me), true);
  const speak = { ...ready({ kind: "hall", ...layoutFor(state.settings).starts[0] }), settings: { ...state.settings, speakMode: true } } as GameState;
  assert.equal(canAsk(speak, me), false, "speak mode does not lift it either");
});

test("the Free Question power is not in the deck on the digital board", () => {
  const { state } = game(4);
  assert.ok(!state.eventDeck.some((e) => String((e as { kind?: string }).kind ?? e).includes("free-question")));
});

function withEvent(state: GameState, kind: string, step = "intro", data: Record<string, unknown> = {}): GameState {
  return { ...state, phase: "event", moveBudget: 0, event: { deckId: "ev", kind, title: "", description: "", step, data } as never };
}
const posOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.position;

test("Swap Places trades two guests, wherever they stand", () => {
  const { state, secrets } = game(3);
  const [a, b] = state.turnOrder;
  const placed: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === a ? { ...p, position: { kind: "room", roomId: "study" } } : p)),
  };
  const before = posOf(placed, b);
  const out = applyPlay(withEvent(placed, "trade-places"), secrets, a, "event", { targetId: b }).state;
  assert.deepEqual(posOf(out, a), before);
  assert.deepEqual(posOf(out, b), { kind: "room", roomId: "study" });
});

test("Teleport (move anywhere) puts you in any of the ten rooms", () => {
  const { state, secrets } = game(2);
  const a = state.turnOrder[0];
  for (const id of MAP_ROOM_IDS) {
    const out = applyPlay(withEvent(state, "move-anywhere"), secrets, a, "event", { roomId: id }).state;
    assert.deepEqual(posOf(out, a), { kind: "room", roomId: id }, id);
  }
});

test("Fast Track jumps to one of the nearest rooms, and refuses a far one", () => {
  const { state, secrets } = game(2);
  const a = state.turnOrder[0];
  const house = layoutFor(state.settings);
  const from = posOf(state, a);
  const near = nearestRooms(from, state.settings.enabledRoomIds, state.passages ?? [], 3, house);
  assert.ok(near.length >= 3);
  const far = MAP_ROOM_IDS.find((id) => !near.includes(id))!;
  const refused = applyPlay(withEvent(state, "fast-track"), secrets, a, "event", { roomId: far }).state;
  assert.equal(refused.event?.kind, "fast-track");
  const out = applyPlay(withEvent(state, "fast-track"), secrets, a, "event", { roomId: near[0] }).state;
  assert.deepEqual(posOf(out, a), { kind: "room", roomId: near[0] });
});

test("Shortcut walks a passage, including one through a hidden room", () => {
  const { state, secrets } = game(2, [{ a: "study", b: "kitchen", via: "observatory" }], extra);
  const a = state.turnOrder[0];
  const links = expandPassages(state.settings.boardPassages);
  assert.deepEqual(state.passages, links);
  const inStudy: GameState = { ...state, passages: links, players: state.players.map((p) => (p.id === a ? { ...p, position: { kind: "room", roomId: "study" } } : p)) };
  const out = applyPlay(withEvent(inStudy, "shortcut"), secrets, a, "event", { roomId: "observatory" }).state;
  assert.deepEqual(posOf(out, a), { kind: "room", roomId: "observatory" });
});

test("Come Here and That Noise move guests into a room (all eight fit)", () => {
  const { state, secrets } = game(8);
  const [a, b] = state.turnOrder;
  const one = applyPlay(withEvent(state, "come-here"), secrets, a, "event", { targetId: b, roomId: "cellar" }).state;
  assert.deepEqual(posOf(one, b), { kind: "room", roomId: "cellar" });
  const all = applyPlay(withEvent(state, "that-noise"), secrets, a, "event", { roomId: "dining-room" }).state;
  assert.ok(all.players.every((p) => p.position.kind === "room" && p.position.roomId === "dining-room"));
});

test("Lost in the Hall drops you on a corridor square; Send Home returns everyone to their own blue circle", () => {
  const { state, secrets } = game(4);
  const a = state.turnOrder[0];
  const house = layoutFor(state.settings);
  const lost = autoResolveIfPossible(withEvent(state, "lost-in-hall"), secrets).state;
  const p = posOf(lost, a) as { kind: string; x: number; y: number };
  assert.equal(p.kind, "hall");
  assert.ok(house.hall.has(`${p.x},${p.y}`));

  const scattered: GameState = { ...state, players: state.players.map((q) => ({ ...q, position: { kind: "room", roomId: "library" } as never })) };
  const home = autoResolveIfPossible(withEvent(scattered, "send-home"), secrets).state;
  for (const q of home.players) {
    if (q.id === a) continue;
    assert.deepEqual(q.position, { kind: "hall", ...state.spawns![q.id] }, `${q.name} is back on their own start square`);
  }
});

test("a guest in a room may suggest with steps still left, and the leftover steps are taken away", () => {
  const { state, secrets } = game(3);
  const me = state.turnOrder[0];
  const walking: GameState = {
    ...state,
    phase: "move",
    moveBudget: 6,
    actionsLeft: 1,
    players: state.players.map((p) => (p.id === me ? { ...p, position: { kind: "room", roomId: "library" } } : p)),
  };
  assert.equal(canAsk(walking, me), true, "in a room, mid-move");
  const inHall: GameState = { ...walking, players: walking.players.map((p) => (p.id === me ? { ...p, position: { kind: "hall", ...layoutFor(state.settings).starts[0] } } : p)) };
  assert.equal(canAsk(inHall, me), false, "not in the corridor");
  const suspect = state.cards.find((c) => c.category === "suspect")!.id;
  const weapon = state.cards.find((c) => c.category === "weapon")!.id;
  const out = applyPlay(walking, secrets, me, "ask", { suspectId: suspect, roomId: "library", weaponId: weapon }).state;
  assert.equal(out.phase, "question");
  assert.equal(out.moveBudget, 0, "the rest of the roll does not carry over");
});
