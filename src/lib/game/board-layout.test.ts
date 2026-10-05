import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ROOMS, MIN_ROOMS, buildLayout, cellRuns, reachable, roomOutline, sideCounts } from "./board.ts";

const idsFor = (n: number) => Array.from({ length: n }, (_, i) => `room-${i + 1}`);
const counts = Array.from({ length: MAX_ROOMS - MIN_ROOMS + 1 }, (_, i) => MIN_ROOMS + i);
const k = (x: number, y: number) => `${x},${y}`;

test("every room count from 4 to 15 builds exactly that many distinct rooms", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    assert.equal(layout.rooms.length, n, `${n} rooms`);
    assert.equal(new Set(layout.rooms.map((r) => r.id)).size, n);
    assert.deepEqual(layout.rooms.map((r) => r.id), idsFor(n), "rooms stay in slot order");
  }
});

test("the house grows with the room count", () => {
  const sizes = counts.map((n) => buildLayout(idsFor(n)).cols);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1]);
  assert.ok(sizes[sizes.length - 1] > sizes[0]);
});

test("rooms stay inside the house, never overlap and never sit on the corridor or the staircase", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    const seen = new Set<string>();
    for (const room of layout.rooms) {
      for (const c of room.cells) {
        assert.ok(c.x >= 0 && c.y >= 0 && c.x < layout.cols && c.y < layout.rows, `${n}: ${room.id} inside`);
        assert.ok(!seen.has(k(c.x, c.y)), `${n}: ${room.id} overlaps`);
        seen.add(k(c.x, c.y));
        assert.ok(!layout.hall.has(k(c.x, c.y)), `${n}: ${room.id} on corridor`);
        const { center } = layout;
        assert.ok(!(c.x >= center.x && c.x < center.x + center.w && c.y >= center.y && c.y < center.y + center.h));
      }
    }
  }
});

test("rooms have varied footprints, not a row of plain squares", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    const odd = layout.rooms.filter((r) => r.cells.length !== r.w * r.h);
    assert.ok(odd.length >= Math.ceil(n / 2), `${n}: ${odd.length} shaped rooms`);
    assert.ok(new Set(layout.rooms.map((r) => r.shape)).size >= Math.min(3, n), `${n}: several kinds of shape`);
    assert.ok(new Set(layout.rooms.map((r) => `${r.w}x${r.h}`)).size >= Math.min(3, n), `${n}: several sizes`);
  }
});

test("no square of the house is left sealed off: every square is a room, the staircase or walkable floor", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    const roomCells = layout.rooms.reduce((sum, r) => sum + r.cells.length, 0);
    const total = layout.cols * layout.rows;
    assert.equal(layout.hall.size + roomCells + layout.center.w * layout.center.h, total, `${n}: dead squares`);
  }
});

test("the corridor is one connected floor and every start square is on it", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    const first = [...layout.hall][0].split(",").map(Number);
    const seen = new Set([k(first[0], first[1])]);
    const stack = [first];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = k(x + dx, y + dy);
        if (layout.hall.has(key) && !seen.has(key)) {
          seen.add(key);
          stack.push([x + dx, y + dy]);
        }
      }
    }
    assert.equal(seen.size, layout.hall.size, `${n}: no sealed-off corridor`);
    assert.ok(layout.starts.length >= 15, `${n}: a start square for up to 15 guests`);
    assert.equal(new Set(layout.starts.map((s) => k(s.x, s.y))).size, layout.starts.length, "start squares are distinct");
    for (const s of layout.starts) assert.ok(layout.hall.has(k(s.x, s.y)));
  }
});

test("every room has real doors onto the corridor, and bigger rooms have more", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    const used = new Set<string>();
    for (const room of layout.rooms) {
      const doors = layout.doors[room.id];
      assert.ok(doors.length >= 1 && doors.length <= 3, `${n}: ${room.id} has ${doors.length} doors`);
      if (room.cells.length >= 46) assert.ok(doors.length >= 2, `${n}: ${room.id} is big and has a single door`);
      for (const d of doors) {
        assert.ok(layout.hall.has(k(d.x, d.y)), "door square is corridor");
        assert.ok(!used.has(k(d.x, d.y)), "a corridor square is the door of only one room");
        used.add(k(d.x, d.y));
        const dx = { n: 0, s: 0, e: 1, w: -1 }[d.dir];
        const dy = { n: -1, s: 1, e: 0, w: 0 }[d.dir];
        assert.equal(layout.roomAt.get(k(d.x + dx, d.y + dy))?.id, room.id, `${n}: ${room.id} door faces its room`);
      }
    }
    const multi = layout.rooms.filter((r) => layout.doors[r.id].length >= 2).length;
    assert.ok(multi >= Math.ceil(n / 2), `${n}: most rooms have several doors`);
  }
});

test("every room can be reached on foot from every start square, whatever the room count", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    for (const start of [layout.starts[0], layout.starts[layout.starts.length - 1]]) {
      const { rooms } = reachable({ kind: "hall", ...start }, 400, idsFor(n), [], new Set(), layout);
      assert.equal(rooms.size, n, `${n}: all rooms reachable`);
    }
  }
});

test("rooms are about a roll apart: every start square is within 12 steps of a room, and a room is never a trek", () => {
  for (const n of counts) {
    const layout = buildLayout(idsFor(n));
    for (const start of layout.starts.slice(0, 15)) {
      const { nodes } = reachable({ kind: "hall", ...start }, 60, idsFor(n), [], new Set(), layout);
      const nearest = Math.min(...[...nodes.values()].filter((nd) => nd.pos.kind === "room").map((nd) => nd.dist));
      assert.ok(nearest <= 12, `${n}: nearest room ${nearest} steps from ${start.x},${start.y}`);
    }
  }
});

test("outline and runs describe the exact footprint", () => {
  for (const n of counts) {
    for (const room of buildLayout(idsFor(n)).rooms) {
      const loops = roomOutline(room);
      assert.equal(loops.length, 1, `${room.id} is one solid piece`);
      assert.ok(loops[0].length >= 4);
      assert.equal(cellRuns(room.cells).reduce((sum, r) => sum + r.w, 0), room.cells.length);
      for (let y = room.body.y; y < room.body.y + room.body.h; y++) {
        for (let x = room.body.x; x < room.body.x + room.body.w; x++) assert.ok(room.cells.some((c) => c.x === x && c.y === y), "body is inside the room");
      }
    }
  }
});

test("the same rooms always give the same house, and the plan depends only on how many rooms there are", () => {
  const a = buildLayout(idsFor(9));
  const b = buildLayout(["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9"]);
  assert.deepEqual(a.rooms.map((r) => r.cells), b.rooms.map((r) => r.cells));
  assert.deepEqual(a.doors["room-1"], b.doors["x1"]);
});

test("side rooms spread over all four walls as the room count rises", () => {
  assert.deepEqual(sideCounts(4), [0, 0, 0, 0]);
  assert.deepEqual(sideCounts(9), [2, 1, 1, 1]);
  assert.equal(sideCounts(15).reduce((a, b) => a + b, 0), 11);
  assert.ok(Math.max(...sideCounts(15)) <= 3);
});

test("fewer than four rooms still builds a playable house", () => {
  for (const n of [1, 2, 3]) {
    const layout = buildLayout(idsFor(n));
    assert.equal(layout.rooms.length, n);
    const { rooms } = reachable({ kind: "hall", ...layout.starts[0] }, 400, idsFor(n), [], new Set(), layout);
    assert.equal(rooms.size, n);
  }
});
