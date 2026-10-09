import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_MAX_PLAYERS, DEFAULT_LAYOUT, MAP_ROOM_IDS, expandPassages, hiddenRoomsOf, layoutFor, nearestRooms, reachable, resolvePassages, shuffledStarts } from "./board.ts";

const k = (x: number, y: number) => `${x},${y}`;
const L = DEFAULT_LAYOUT;

test("the house is the ten fixed rooms, and never changes", () => {
  assert.deepEqual(MAP_ROOM_IDS.slice().sort(), ["ballroom", "billiard-room", "cellar", "conservatory", "dining-room", "grand-hall", "kitchen", "library", "lounge", "study"]);
  assert.equal(L.rooms.length, 10);
  assert.equal(layoutFor({}), L);
  assert.equal(layoutFor({ boardPassages: [{ a: "study", b: "kitchen" }] }), L, "passages without a hidden room leave the house alone");
});

test("the Cellar sits in the middle and has a single entrance, on the Dining Room side", () => {
  const cellar = L.rooms.find((r) => r.id === "cellar")!;
  const dining = L.rooms.find((r) => r.id === "dining-room")!;
  assert.ok(cellar.rect.x > dining.rect.x + dining.rect.w - 100, "cellar is to the right of the dining room");
  assert.ok(Math.abs(cellar.rect.x + cellar.rect.w / 2 - L.width / 2) < 100, "cellar is centred");
  assert.equal(L.doors.cellar.length, 1);
  const door = L.tiles.find((t) => t.x === L.doors.cellar[0].x && t.y === L.doors.cellar[0].y)!;
  assert.ok(door.px.x + door.px.w <= cellar.rect.x + 30, "the door tile is on the cellar's left, dining room side");
});

test("every room has doors on the corridor, and every corridor square is connected", () => {
  for (const room of L.rooms) {
    assert.ok(L.doors[room.id].length >= 1, `${room.id} has a door`);
    for (const d of L.doors[room.id]) assert.ok(L.hall.has(k(d.x, d.y)));
  }
  const start = L.starts[0];
  const { nodes } = reachable({ kind: "hall", ...start }, 500, MAP_ROOM_IDS, [], new Set(), L);
  const halls = [...nodes.values()].filter((n) => n.pos.kind === "hall").length;
  assert.equal(halls, L.hall.size, "no sealed-off squares");
  assert.equal([...nodes.values()].filter((n) => n.pos.kind === "room").length, 10, "every room can be reached");
});

test("there are eight start squares, all different, all on the corridor", () => {
  assert.equal(L.starts.length, 8);
  assert.equal(new Set(L.starts.map((s) => k(s.x, s.y))).size, 8);
  for (const s of L.starts) assert.ok(L.hall.has(k(s.x, s.y)));
  const a = shuffledStarts(L, () => 0.3);
  assert.deepEqual(a.map((s) => k(s.x, s.y)).sort(), L.starts.map((s) => k(s.x, s.y)).sort());
});

test("fifteen guests get fifteen different start squares: the eight plus the extra blue dots", () => {
  assert.equal(BOARD_MAX_PLAYERS, 15);
  const all = shuffledStarts(L, () => 0.6, 15);
  assert.ok(all.length >= 15);
  assert.equal(new Set(all.map((s) => k(s.x, s.y))).size, all.length);
  for (const s of all) assert.ok(L.hall.has(k(s.x, s.y)));
  assert.equal(shuffledStarts(L, () => 0.6, 8).length, 8);
});

test("a doorway is one step, and entering a room ends the move", () => {
  const door = L.doors.kitchen[0];
  const { nodes } = reachable({ kind: "hall", ...door }, 6, MAP_ROOM_IDS, [], new Set(), L);
  assert.equal(nodes.get("r:kitchen")?.dist, 1);
  const inside = reachable({ kind: "room", roomId: "kitchen" }, 3, MAP_ROOM_IDS, [], new Set(), L);
  assert.ok(inside.nodes.has(`h:${door.x},${door.y}`));
});

test("a guest standing in the corridor blocks that square", () => {
  const door = L.doors.kitchen[0];
  const from = { kind: "hall" as const, ...L.starts[2] };
  const open = reachable(from, 40, MAP_ROOM_IDS, [], new Set(), L);
  const shut = reachable(from, 40, MAP_ROOM_IDS, [], new Set([k(door.x, door.y)]), L);
  assert.ok(open.nodes.has("r:kitchen"));
  assert.ok(!shut.nodes.has("r:kitchen"), "the kitchen has one door and it is blocked");
});

test("secret passages cost one step between rooms, and a hidden room sits in between", () => {
  const plain = resolvePassages(MAP_ROOM_IDS, [{ a: "study", b: "kitchen" }, { a: "lounge", b: "conservatory" }]);
  assert.deepEqual(plain, [{ a: "study", b: "kitchen" }, { a: "lounge", b: "conservatory" }]);
  const direct = reachable({ kind: "room", roomId: "study" }, 1, MAP_ROOM_IDS, expandPassages(plain), new Set(), L);
  assert.ok(direct.nodes.has("r:kitchen"));

  const withHidden = resolvePassages([...MAP_ROOM_IDS, "observatory", "catacombs"], [{ a: "study", b: "kitchen", via: "observatory" }, { a: "lounge", b: "conservatory", via: "catacombs" }]);
  assert.deepEqual(hiddenRoomsOf({ boardPassages: withHidden }), ["observatory", "catacombs"]);
  const house = layoutFor({ boardPassages: withHidden });
  assert.equal(house.rooms.length, 12);
  assert.ok(house.rooms.filter((r) => r.hidden).every((r) => r.rect.w === 0), "hidden rooms are not drawn on the map");
  const links = expandPassages(withHidden);
  const enabled = [...MAP_ROOM_IDS, "observatory", "catacombs"];
  const oneStep = reachable({ kind: "room", roomId: "study" }, 1, enabled, links, new Set(), house);
  assert.ok(oneStep.nodes.has("r:observatory"));
  assert.ok(!oneStep.nodes.has("r:kitchen"), "the hidden room is a stop; it ends the move");
  const next = reachable({ kind: "room", roomId: "observatory" }, 1, enabled, links, new Set(), house);
  assert.ok(next.nodes.has("r:kitchen") && next.nodes.has("r:study"));
  for (const bad of [{ a: "study", b: "kitchen", via: "ballroom" }, { a: "study", b: "kitchen", via: "not-a-card" }]) {
    assert.equal(resolvePassages(MAP_ROOM_IDS, [bad])[0].via, undefined, "a via that is not a hidden room card is ignored");
  }
});

test("fast track finds the nearest rooms on the fixed house", () => {
  const near = nearestRooms({ kind: "hall", ...L.starts[0] }, MAP_ROOM_IDS, [], 3, L);
  assert.ok(near.length >= 3 && near.every((id) => MAP_ROOM_IDS.includes(id)));
});
