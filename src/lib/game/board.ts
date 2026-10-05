import type { GameState, Passage, PiecePos, Player } from "./types";

/**
 * Digital board. It is built from the rooms that are in the game, so five room cards make a five room house and
 * fifteen make a fifteen room house (four to fifteen are supported; the house grows with the room count).
 *
 * Shape: modelled on the printed Clue board. Rooms of different sizes and outlines line the outer walls, with the
 * four biggest wrapping the corners. Everything that is not a room is open, walkable floor around a staircase block
 * in the middle, so the corridors flow between and around the rooms instead of cutting the house into boxes. Every
 * room has one to three doors that open straight onto the floor next to it. Every guest starts on the carpet round
 * the staircase.
 *
 * One step of the dice per square. Entering a room ends the move.
 */
export type Dir = "n" | "e" | "s" | "w";
export interface Cell {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A doorway: the corridor square it opens onto, and which way the room lies from that square. */
export interface Door extends Cell {
  dir: Dir;
}

export interface RoomSpec {
  id: string;
  name: string;
  /** Bounding box of the footprint. Rooms are not always rectangles, so use `cells` for the exact shape. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Every square the room covers. */
  cells: Cell[];
  /** The biggest plain rectangle inside the footprint: where the name plate and the guests go. */
  body: Rect;
  /** Name of the footprint, e.g. "rect", "bay", "wings", "L". */
  shape: string;
  /** Where it sits, for the setup screen: "Top", "Bottom right", ... */
  place: string;
  questionRoom: boolean;
  tint: string;
  /** Which edge the name plate hugs. Side rooms use their wall, corner rooms use whichever way their body runs. */
  side: Dir;
}

export interface BoardLayout {
  key: string;
  cols: number;
  rows: number;
  rooms: RoomSpec[];
  /** Every doorway of every room. Bigger rooms get more of them. */
  doors: Record<string, Door[]>;
  /** Start squares on the carpet round the staircase, best seat first. */
  starts: Cell[];
  /** The staircase block in the middle: decoration, nobody walks on it. */
  center: Rect;
  /** The red carpet frame round the staircase, where everyone starts. */
  carpet: Set<string>;
  /** Every walkable corridor square as "x,y". */
  hall: Set<string>;
  roomAt: Map<string, RoomSpec>;
}

/** Fewest and most rooms a house is built for. */
export const MIN_ROOMS = 4;
export const MAX_ROOMS = 15;

const KNOWN_NAMES: Record<string, string> = {
  lounge: "Lounge",
  "dining-room": "Dining Room",
  kitchen: "Kitchen",
  "grand-hall": "Hall",
  ballroom: "Ballroom",
  study: "Study",
  library: "Library",
  "billiard-room": "Billiard Room",
  conservatory: "Conservatory",
  observatory: "Observatory",
  foyer: "Foyer",
  cellar: "Cellar",
  "smugglers-tunnel": "Smuggler's Tunnel",
  "the-vault": "The Vault",
  catacombs: "Catacombs",
  "boiler-room": "Boiler Room",
};

const TINTS = ["#6a3030", "#7a4038", "#6b5138", "#6e3030", "#6a4552", "#5c4632", "#3a5244", "#2c4a44", "#355848", "#4a4468", "#5a3a52", "#44505c"];

function prettify(id: string): string {
  return KNOWN_NAMES[id] ?? id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The two secret passages a game opens with, when both of their rooms are in the game. */
export const DEFAULT_PASSAGES: Passage[] = [
  { a: "study", b: "kitchen" },
  { a: "lounge", b: "conservatory" },
];

const CLASSIC_IDS = ["lounge", "dining-room", "kitchen", "grand-hall", "ballroom", "study", "library", "billiard-room", "conservatory"];

function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter(Boolean))];
}

/**
 * Where each room sits around the ring, first slot first. A slot the host picked keeps its room. Every
 * other slot is filled from the rooms left over, in the order they were given.
 */
export function orderRooms(enabled: string[] | undefined, chosen: string[] | undefined): string[] {
  const ids = uniqueIds(enabled);
  const set = new Set(ids);
  const used = new Set<string>();
  const slots: string[] = ids.map(() => "");
  (chosen ?? []).slice(0, ids.length).forEach((id, i) => {
    if (id && set.has(id) && !used.has(id)) {
      slots[i] = id;
      used.add(id);
    }
  });
  const rest = ids.filter((id) => !used.has(id));
  return slots.map((slot) => slot || (rest.shift() as string));
}

/** The host left the placement alone, or only part of it: the game fills the empty slots at random. */
export function autoBoardRooms(enabled: string[] | undefined, chosen: string[] | undefined, rand: () => number = Math.random): string[] {
  const ids = uniqueIds(enabled);
  const set = new Set(ids);
  const used = new Set<string>();
  const slots: string[] = ids.map(() => "");
  (chosen ?? []).slice(0, ids.length).forEach((id, i) => {
    if (id && set.has(id) && !used.has(id)) {
      slots[i] = id;
      used.add(id);
    }
  });
  const rest = shuffled(ids.filter((id) => !used.has(id)), rand);
  return slots.map((slot) => slot || (rest.shift() as string));
}

/**
 * The two secret passages. A passage the host set is kept when both of its rooms are in the game.
 * Anything left empty falls back to Study to Kitchen and Lounge to Conservatory when those rooms are
 * in play, and to a random pair of unused rooms when they are not.
 */
export function resolvePassages(enabled: string[] | undefined, chosen: Passage[] | undefined, rand: () => number = Math.random): Passage[] {
  const ids = uniqueIds(enabled);
  const set = new Set(ids);
  const used = new Set<string>();
  const out: Array<Passage | null> = [null, null];
  [0, 1].forEach((i) => {
    const p = chosen?.[i];
    if (p && p.a && p.b && p.a !== p.b && set.has(p.a) && set.has(p.b) && !used.has(p.a) && !used.has(p.b)) {
      out[i] = { a: p.a, b: p.b };
      used.add(p.a);
      used.add(p.b);
    }
  });
  for (let i = 0; i < 2; i++) {
    if (out[i]) continue;
    const preset = DEFAULT_PASSAGES.find((p) => set.has(p.a) && set.has(p.b) && !used.has(p.a) && !used.has(p.b));
    if (preset) {
      out[i] = { ...preset };
    } else {
      const free = shuffled(ids.filter((id) => !used.has(id)), rand);
      if (free.length >= 2) out[i] = { a: free[0], b: free[1] };
    }
    if (out[i]) {
      used.add(out[i]!.a);
      used.add(out[i]!.b);
    }
  }
  return out.filter((p): p is Passage => Boolean(p));
}

const layoutCache = new Map<string, BoardLayout>();

// ---------------------------------------------------------------------------------------------------------------------
// The house generator
// ---------------------------------------------------------------------------------------------------------------------

function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ck = (x: number, y: number) => `${x},${y}`;
const DIRS: Array<{ dir: Dir; dx: number; dy: number }> = [
  { dir: "n", dx: 0, dy: -1 },
  { dir: "e", dx: 1, dy: 0 },
  { dir: "s", dx: 0, dy: 1 },
  { dir: "w", dx: -1, dy: 0 },
];
const OPPOSITE: Record<Dir, Dir> = { n: "s", s: "n", e: "w", w: "e" };

/** How big the board is for this many rooms. 4 rooms fit a 22 square house, 15 rooms a 33 square one. */
export function houseSize(roomCount: number): number {
  const n = Math.max(MIN_ROOMS, roomCount);
  return Math.max(22, Math.round(20 + (n - MIN_ROOMS) * 1.2));
}

/** How many side rooms (between the four corner rooms) go on [top, right, bottom, left]. */
export function sideCounts(roomCount: number): [number, number, number, number] {
  const mids = Math.max(0, Math.max(MIN_ROOMS, roomCount) - 4);
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  // Top and bottom first so the house grows evenly in both directions.
  const order = [0, 2, 1, 3];
  for (let i = 0; i < mids; i++) counts[order[i % 4]] += 1;
  return counts;
}

/** Split a wall of `total` squares into two corner rooms and `k` side rooms, with a corridor gap between each. */
function partition(total: number, k: number, rnd: () => number) {
  const gap = k === 0 ? 2 : 1;
  const avail = total - (k + 1) * gap;
  const weights = [1.3 + rnd() * 0.25, ...Array.from({ length: k }, () => 1 + rnd() * 0.45), 1.3 + rnd() * 0.25];
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (avail * w) / sum);
  const sizes = raw.map((r) => Math.floor(r));
  let left = avail - sizes.reduce((a, b) => a + b, 0);
  const byFraction = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let j = 0; left > 0; j = (j + 1) % byFraction.length, left--) sizes[byFraction[j].i] += 1;
  return { gap, first: sizes[0], last: sizes[k + 1], mids: sizes.slice(1, k + 1) };
}

type Mask = boolean[][]; // [row][col]

function fullMask(cols: number, rows: number): Mask {
  return Array.from({ length: rows }, () => Array<boolean>(cols).fill(true));
}
function cutMask(mask: Mask, c0: number, c1: number, r0: number, r1: number) {
  for (let r = Math.max(0, r0); r < Math.min(mask.length, r1); r++) {
    for (let c = Math.max(0, c0); c < Math.min(mask[0].length, c1); c++) mask[r][c] = false;
  }
}
function maskCells(mask: Mask): number {
  return mask.reduce((n, row) => n + row.filter(Boolean).length, 0);
}
function maskConnected(mask: Mask): boolean {
  const rows = mask.length;
  const cols = mask[0].length;
  let start: [number, number] | null = null;
  for (let r = 0; r < rows && !start; r++) for (let c = 0; c < cols; c++) if (mask[r][c]) { start = [r, c]; break; }
  if (!start) return false;
  const seen = new Set<string>([ck(start[1], start[0])]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const { dx, dy } of DIRS) {
      const rr = r + dy;
      const cc = c + dx;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || !mask[rr][cc] || seen.has(ck(cc, rr))) continue;
      seen.add(ck(cc, rr));
      stack.push([rr, cc]);
    }
  }
  return seen.size === maskCells(mask);
}
/** Cuts must leave a real room behind: connected, most of its box, and never thinner than 3 squares. */
function maskOk(mask: Mask): boolean {
  const rows = mask.length;
  const cols = mask[0].length;
  if (!maskConnected(mask) || maskCells(mask) < rows * cols * 0.6) return false;
  return mask.some((row) => row.filter(Boolean).length >= 3) && mask[0].some((_, c) => mask.filter((row) => row[c]).length >= 3);
}

const CORNER_SHAPES = ["L", "stair", "hook"] as const;
export const SIDE_SHAPES = ["rect", "bay", "step", "wings", "flare", "chamfer", "zig"] as const;

/**
 * A side room, drawn as if it stood on the top wall: columns run along the wall, row 0 is the outer wall and the
 * last row faces the corridors. Cuts make the alcoves and bays that give each room its own outline.
 */
function sideMask(shape: string, W: number, D: number, rnd: () => number): { mask: Mask; shape: string } {
  const m = fullMask(W, D);
  const flip = rnd() < 0.5;
  switch (shape) {
    case "bay": {
      const cu = W >= 8 ? 2 : 1;
      const cv = D >= 6 ? 2 : 1;
      cutMask(m, 0, cu, D - cv, D);
      cutMask(m, W - cu, W, D - cv, D);
      break;
    }
    case "step": {
      const cu = Math.max(1, Math.round(W * 0.3));
      const cv = Math.max(1, Math.round(D * 0.4));
      if (flip) cutMask(m, 0, cu, D - cv, D);
      else cutMask(m, W - cu, W, D - cv, D);
      break;
    }
    case "wings": {
      if (W < 7) return { mask: fullMask(W, D), shape: "rect" };
      const cu = Math.floor((W - 3) / 2);
      cutMask(m, 0, cu, 2, D);
      cutMask(m, W - cu, W, 2, D);
      break;
    }
    case "flare": {
      const cu = W >= 7 ? 2 : 1;
      const cv = D >= 6 ? 2 : 1;
      cutMask(m, 0, cu, 0, cv);
      cutMask(m, W - cu, W, 0, cv);
      break;
    }
    case "chamfer": {
      cutMask(m, 0, 1, 0, 1);
      cutMask(m, W - 1, W, 0, 1);
      cutMask(m, 0, 1, D - 1, D);
      cutMask(m, W - 1, W, D - 1, D);
      break;
    }
    case "zig": {
      const cu = W >= 7 ? 2 : 1;
      if (flip) {
        cutMask(m, 0, cu, 0, 2);
        cutMask(m, W - cu, W, D - 2, D);
      } else {
        cutMask(m, W - cu, W, 0, 2);
        cutMask(m, 0, cu, D - 2, D);
      }
      break;
    }
    default:
      return { mask: m, shape: "rect" };
  }
  return maskOk(m) ? { mask: m, shape } : { mask: fullMask(W, D), shape: "rect" };
}

/**
 * A corner room, drawn as if it stood in the top left corner: the inner corner is cut away so the room wraps the
 * corner as an L, or as a staircase of steps. It runs a long way along both walls.
 */
function cornerMask(shape: string, A: number, B: number, armV: number, armH: number): { mask: Mask; shape: string } {
  const m = fullMask(A, B);
  const p = Math.max(1, A - armV);
  const q = Math.max(1, B - armH);
  if (shape === "stair") {
    // The cut is two nested blocks: a wide shallow one and a narrow deep one, which leaves a staircase edge.
    const p1 = Math.max(1, Math.round(p * 0.55));
    const q2 = Math.max(1, Math.round(q * 0.55));
    const out = fullMask(A, B);
    cutMask(out, A - p, A, B - q2, B);
    cutMask(out, A - p1, A, B - q, B);
    return maskOk(out) ? { mask: out, shape: "stair" } : { mask: fullMask(A, B), shape: "rect" };
  }
  cutMask(m, A - p, A, B - q, B);
  if (shape === "hook") {
    // An L whose two arms each end in a small bite out of the outer wall, so the room looks hooked at both tips.
    cutMask(m, 0, 1, B - 2, B);
    cutMask(m, A - 2, A, 0, 1);
    return maskOk(m) ? { mask: m, shape: "hook" } : cornerMask("L", A, B, armV, armH);
  }
  return maskOk(m) ? { mask: m, shape: "L" } : { mask: fullMask(A, B), shape: "rect" };
}

function largestRect(cells: Cell[]): Rect {
  const set = new Set(cells.map((c) => ck(c.x, c.y)));
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  let best: Rect = { x: x0, y: y0, w: 1, h: 1 };
  let bestArea = 0;
  for (let ya = y0; ya <= y1; ya++) {
    for (let xa = x0; xa <= x1; xa++) {
      if (!set.has(ck(xa, ya))) continue;
      for (let yb = ya; yb <= y1; yb++) {
        for (let xb = xa; xb <= x1; xb++) {
          const area = (xb - xa + 1) * (yb - ya + 1);
          if (area <= bestArea) continue;
          let full = true;
          for (let y = ya; y <= yb && full; y++) for (let x = xa; x <= xb; x++) if (!set.has(ck(x, y))) { full = false; break; }
          if (full) {
            best = { x: xa, y: ya, w: xb - xa + 1, h: yb - ya + 1 };
            bestArea = area;
          }
        }
      }
    }
  }
  return best;
}

interface Slot {
  kind: "corner" | "side";
  /** Which edge a side room sits on, or which corner a corner room fills. */
  at: Dir | "nw" | "ne" | "se" | "sw";
  /** Along the wall, for side rooms: where it starts and how long it is. */
  from: number;
  len: number;
  /** For corner rooms the box is explicit. */
  box?: Rect;
  depth: number;
}

const PLACE: Record<string, string> = {
  n: "Top",
  e: "Right",
  s: "Bottom",
  w: "Left",
  nw: "Top left",
  ne: "Top right",
  se: "Bottom right",
  sw: "Bottom left",
};

/**
 * The outline of a room as closed loops of corner points, in square coordinates. Straight runs are merged, so an L
 * is six points. Used to draw the room's clip shape and its black wall.
 */
export function roomOutline(room: Pick<RoomSpec, "cells">): Array<Array<[number, number]>> {
  const set = new Set(room.cells.map((c) => ck(c.x, c.y)));
  const next = new Map<string, Array<[number, number]>>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const key = ck(ax, ay);
    const list = next.get(key) ?? [];
    list.push([bx, by]);
    next.set(key, list);
  };
  for (const { x, y } of room.cells) {
    if (!set.has(ck(x, y - 1))) add(x, y, x + 1, y);
    if (!set.has(ck(x + 1, y))) add(x + 1, y, x + 1, y + 1);
    if (!set.has(ck(x, y + 1))) add(x + 1, y + 1, x, y + 1);
    if (!set.has(ck(x - 1, y))) add(x, y + 1, x, y);
  }
  const loops: Array<Array<[number, number]>> = [];
  while (next.size) {
    const startKey = next.keys().next().value as string;
    const [sx, sy] = startKey.split(",").map(Number);
    const pts: Array<[number, number]> = [[sx, sy]];
    let cx = sx;
    let cy = sy;
    for (let guard = 0; guard < 4000; guard++) {
      const list = next.get(ck(cx, cy));
      if (!list?.length) break;
      const [nx, ny] = list.shift()!;
      if (!list.length) next.delete(ck(cx, cy));
      if (nx === sx && ny === sy) break;
      pts.push([nx, ny]);
      cx = nx;
      cy = ny;
    }
    next.delete(startKey);
    const merged = pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[(i + 1) % pts.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    });
    if (merged.length >= 3) loops.push(merged);
  }
  return loops;
}

/** Row by row runs of squares: one rectangle per run. Used for tap targets and for drawing the corridor cheaply. */
export function cellRuns(cells: Iterable<Cell>): Array<{ x: number; y: number; w: number }> {
  const rows = new Map<number, number[]>();
  for (const c of cells) {
    const list = rows.get(c.y) ?? [];
    list.push(c.x);
    rows.set(c.y, list);
  }
  const out: Array<{ x: number; y: number; w: number }> = [];
  for (const [y, xs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1) {
        prev = xs[i];
        continue;
      }
      out.push({ x: start, y, w: prev - start + 1 });
      start = xs[i];
      prev = xs[i];
    }
  }
  return out;
}

/**
 * Build the house for these rooms, in slot order. The same rooms in the same order always give the same house, and
 * the shape of the house depends only on how many rooms there are, so every player sees the same plan.
 *
 * The plan, like the printed board:
 *  - four corner rooms (L shaped or stepped) and the side rooms between them line the outer walls; the more rooms
 *    there are, the more side rooms each wall carries and the bigger the house grows (4 to 15 rooms);
 *  - side rooms differ in width, depth and outline (bays, wings, steps, flares) and sometimes sit deeper than their
 *    neighbours, so the inner edge of the room ring is ragged rather than a straight line;
 *  - a narrow corridor slips between neighbouring rooms out to the house wall, and every room has one to three doors
 *    opening onto the corridor next to it;
 *  - everything that is not a room is walkable floor, round a staircase block in the middle with a red carpet frame
 *    where the guests start. There are no sealed-off blocks and no dead strips.
 * Entering a room still ends the move.
 */
export function buildLayout(roomIds: string[]): BoardLayout {
  const key = roomIds.join("|");
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const N = Math.max(MIN_ROOMS, roomIds.length);
  const S = houseSize(N);
  const rnd = rngFrom(N * 7919 + 17);
  const counts = sideCounts(N);
  const [kTop, kRight, kBottom, kLeft] = counts;
  const D = Math.max(5, Math.min(7, Math.round(S * 0.2)));
  const depthFor = () => Math.max(4, D + [-1, 0, 0, 1][Math.floor(rnd() * 4)]);

  const top = partition(S, kTop, rnd);
  const bottom = partition(S, kBottom, rnd);
  const left = partition(S, kLeft, rnd);
  const right = partition(S, kRight, rnd);

  const slots: Slot[] = [];
  const armOf = () => Math.max(3, D + [-1, 0, 0, 1][Math.floor(rnd() * 4)]);

  const sideSlots = (
    at: Dir,
    p: ReturnType<typeof partition>,
    order: "forward" | "reverse",
    firstCorner: number,
  ): Slot[] => {
    const list: Slot[] = [];
    let cursor = firstCorner + p.gap;
    p.mids.forEach((len) => {
      list.push({ kind: "side", at, from: cursor, len, depth: depthFor() });
      cursor += len + p.gap;
    });
    return order === "reverse" ? list.reverse() : list;
  };

  // Clockwise from the top left corner: corner, top rooms left to right, corner, right rooms top to bottom, corner,
  // bottom rooms right to left, corner, left rooms bottom to top.
  slots.push({ kind: "corner", at: "nw", from: 0, len: 0, box: { x: 0, y: 0, w: top.first, h: left.first }, depth: armOf() });
  slots.push(...sideSlots("n", top, "forward", top.first));
  slots.push({ kind: "corner", at: "ne", from: 0, len: 0, box: { x: S - top.last, y: 0, w: top.last, h: right.first }, depth: armOf() });
  slots.push(...sideSlots("e", right, "forward", right.first));
  slots.push({ kind: "corner", at: "se", from: 0, len: 0, box: { x: S - bottom.last, y: S - right.last, w: bottom.last, h: right.last }, depth: armOf() });
  slots.push(...sideSlots("s", bottom, "reverse", bottom.first));
  slots.push({ kind: "corner", at: "sw", from: 0, len: 0, box: { x: 0, y: S - left.last, w: bottom.first, h: left.last }, depth: armOf() });
  slots.push(...sideSlots("w", left, "reverse", left.first));

  // Two side rooms next to the same corner, one on each wall, must not touch: if both ran deep they would wall in
  // the corner room's notch. One of them is kept shallow enough to leave a corridor between them.
  const wallRooms = (at: Dir) => slots.filter((slot) => slot.kind === "side" && slot.at === at);
  const wallN = wallRooms("n");
  const wallE = wallRooms("e");
  const wallS = wallRooms("s"); // right to left
  const wallW = wallRooms("w"); // bottom to top
  const keepApart = (h: Slot | undefined, v: Slot | undefined, hDist: number, vDist: number) => {
    if (!h || !v) return;
    if (v.depth <= hDist - 1 || h.depth <= vDist - 1) return;
    v.depth = Math.max(4, Math.min(v.depth, hDist - 1));
    if (v.depth > hDist - 1) h.depth = Math.max(4, Math.min(h.depth, vDist - 1));
  };
  const endOf = (slot: Slot) => slot.from + slot.len;
  keepApart(wallN[0], wallW[wallW.length - 1], wallN[0]?.from, wallW[wallW.length - 1]?.from);
  keepApart(wallN[wallN.length - 1], wallE[0], S - endOf(wallN[wallN.length - 1] ?? { from: 0, len: 0 } as Slot), wallE[0]?.from);
  keepApart(wallS[0], wallE[wallE.length - 1], S - endOf(wallS[0] ?? { from: 0, len: 0 } as Slot), S - endOf(wallE[wallE.length - 1] ?? { from: 0, len: 0 } as Slot));
  keepApart(wallS[wallS.length - 1], wallW[0], wallS[wallS.length - 1]?.from, S - endOf(wallW[0] ?? { from: 0, len: 0 } as Slot));

  // ---- footprints -------------------------------------------------------------------------------------------------
  const roomAtAll = new Map<string, number>();
  interface Draft {
    slot: Slot;
    cells: Cell[];
    shape: string;
  }
  const drafts: Draft[] = [];
  let lastSide = "";
  let cornerNo = 0;
  const cornerOffset = Math.floor(rnd() * CORNER_SHAPES.length);
  slots.forEach((slot, idx) => {
    const cells: Cell[] = [];
    let shape = "rect";
    if (slot.kind === "corner") {
      const box = slot.box!;
      const armV = Math.min(box.w - 2, slot.depth);
      const armH = Math.min(box.h - 2, Math.max(3, slot.depth + (rnd() < 0.3 ? 1 : 0)));
      // Corners take the three outlines in turn, starting from a different one for each house size.
      const wanted = CORNER_SHAPES[(cornerNo++ + cornerOffset) % CORNER_SHAPES.length];
      const made = cornerMask(wanted, box.w, box.h, armV, armH);
      shape = made.shape;
      for (let r = 0; r < box.h; r++) {
        for (let c = 0; c < box.w; c++) {
          if (!made.mask[r][c]) continue;
          // The mask is drawn for the top left corner; mirror it into the real one.
          const x = slot.at === "nw" || slot.at === "sw" ? box.x + c : box.x + (box.w - 1 - c);
          const y = slot.at === "nw" || slot.at === "ne" ? box.y + r : box.y + (box.h - 1 - r);
          cells.push({ x, y });
        }
      }
    } else {
      const W = slot.len;
      const Dp = slot.depth;
      const prev = idx > 0 && slots[idx - 1].kind === "side" && slots[idx - 1].at === slot.at ? lastSide : "";
      const pool = SIDE_SHAPES.filter((s) => s !== prev || s === "rect");
      const wanted = pool[Math.floor(rnd() * pool.length)];
      const made = sideMask(wanted, W, Dp, rnd);
      shape = made.shape;
      lastSide = shape;
      for (let v = 0; v < Dp; v++) {
        for (let u = 0; u < W; u++) {
          if (!made.mask[v][u]) continue;
          let x = 0;
          let y = 0;
          if (slot.at === "n") (x = slot.from + u), (y = v);
          else if (slot.at === "s") (x = slot.from + u), (y = S - Dp + (Dp - 1 - v));
          else if (slot.at === "w") (x = v), (y = slot.from + u);
          else (x = S - Dp + (Dp - 1 - v)), (y = slot.from + u);
          cells.push({ x, y });
        }
      }
    }
    for (const c of cells) roomAtAll.set(ck(c.x, c.y), idx);
    drafts.push({ slot, cells, shape });
  });

  // ---- the staircase block in the middle -------------------------------------------------------------------------
  const parity = S % 2;
  const isRoomCell = (x: number, y: number) => roomAtAll.has(ck(x, y));
  const squareFree = (m: number) => {
    const x0 = Math.floor((S - m) / 2);
    for (let y = x0; y < x0 + m; y++) for (let x = x0; x < x0 + m; x++) if (isRoomCell(x, y)) return false;
    return true;
  };
  let free = parity ? 1 : 2;
  while (free + 2 <= S && squareFree(free + 2)) free += 2;
  let block = Math.round(free * 0.42);
  if (block % 2 !== parity) block -= 1;
  block = Math.max(parity ? 3 : 2, block);
  // Always leave a corridor at least three squares wide between the carpet and the nearest room.
  while (block > (parity ? 3 : 2) && (free - block) / 2 < 4) block -= 2;
  const bx = Math.floor((S - block) / 2);
  const center: Rect = { x: bx, y: bx, w: block, h: block };
  const inCenter = (x: number, y: number) => x >= center.x && x < center.x + center.w && y >= center.y && y < center.y + center.h;

  // ---- corridor: everything that is neither a room nor the staircase ---------------------------------------------
  let hall = new Set<string>();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!isRoomCell(x, y) && !inCenter(x, y)) hall.add(ck(x, y));

  // Anything the walkway cannot reach is sealed off, so no one can be stranded and no dead tile is drawn as floor.
  const ring = (radius: number) => {
    const found: Cell[] = [];
    const x0 = center.x - radius;
    const x1 = center.x + center.w - 1 + radius;
    const y0 = center.y - radius;
    const y1 = center.y + center.h - 1 + radius;
    for (let x = x0; x < x1; x++) found.push({ x, y: y0 });
    for (let y = y0; y < y1; y++) found.push({ x: x1, y });
    for (let x = x1; x > x0; x--) found.push({ x, y: y1 });
    for (let y = y1; y > y0; y--) found.push({ x: x0, y });
    return found.filter((c) => hall.has(ck(c.x, c.y)));
  };
  const ring1 = ring(1);
  const seed = ring1[0] ?? { x: 0, y: 0 };
  const reachableHall = new Set<string>([ck(seed.x, seed.y)]);
  const stack: Cell[] = [seed];
  while (stack.length) {
    const c = stack.pop()!;
    for (const { dx, dy } of DIRS) {
      const k = ck(c.x + dx, c.y + dy);
      if (hall.has(k) && !reachableHall.has(k)) {
        reachableHall.add(k);
        stack.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  hall = reachableHall;

  const carpet = new Set(ring1.map((c) => ck(c.x, c.y)));
  const odd = (list: Cell[]) => list.filter((_, i) => i % 2 === 1);
  const even = (list: Cell[]) => list.filter((_, i) => i % 2 === 0);
  const ring2 = ring(2);
  const starts: Cell[] = [...even(ring1), ...odd(ring1), ...even(ring2), ...odd(ring2)];
  const mid = { x: center.x + Math.floor(center.w / 2), y: center.y + Math.floor(center.h / 2) };
  if (!starts.length) starts.push(mid);

  // ---- doors -----------------------------------------------------------------------------------------------------
  const usedDoorCells = new Set<string>();
  const doorsOf = (cells: Cell[], wantCount: number): Door[] => {
    const inRoom = new Set(cells.map((c) => ck(c.x, c.y)));
    const seen = new Set<string>();
    const cands: Array<Door & { open: number }> = [];
    for (const c of cells) {
      for (const { dir, dx, dy } of DIRS) {
        const hx = c.x + dx;
        const hy = c.y + dy;
        const hk = ck(hx, hy);
        if (!hall.has(hk) || inRoom.has(hk) || usedDoorCells.has(hk) || seen.has(hk)) continue;
        seen.add(hk);
        const open = DIRS.filter((d) => hall.has(ck(hx + d.dx, hy + d.dy))).length;
        cands.push({ x: hx, y: hy, dir: OPPOSITE[dir], open });
      }
    }
    const chosen: Door[] = [];
    const dist = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    for (let n = 0; n < wantCount && cands.length; n++) {
      let best = -1;
      let bestScore = -Infinity;
      cands.forEach((cand, i) => {
        if (chosen.some((d) => d.x === cand.x && d.y === cand.y)) return;
        // Doors open onto roomy floor: squares on the house wall and in one wide dead end alleys score low.
        const onWall = cand.x === 0 || cand.y === 0 || cand.x === S - 1 || cand.y === S - 1;
        let score = rnd() * 1.5 + (cand.open >= 3 ? 1.5 : 0) - (onWall ? 5 : 0) - (cand.open <= 1 ? 4 : 0);
        if (!chosen.length) {
          // The first door faces the open corridor, towards the middle of the house.
          score += 6 - Math.hypot(cand.x - mid.x, cand.y - mid.y) * 0.25;
        } else {
          const nearest = Math.min(...chosen.map((d) => dist(d, cand)));
          if (nearest < 3) return;
          score += Math.min(nearest, 9) + (chosen.every((d) => d.dir !== cand.dir) ? 3 : 0);
        }
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best < 0) break;
      const pick = cands[best];
      chosen.push({ x: pick.x, y: pick.y, dir: pick.dir });
      usedDoorCells.add(ck(pick.x, pick.y));
    }
    return chosen;
  };

  const rooms: RoomSpec[] = [];
  const doors: Record<string, Door[]> = {};
  const roomAt = new Map<string, RoomSpec>();
  roomIds.forEach((id, i) => {
    const draft = drafts[i];
    const cells = draft.cells;
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x + 1;
    const h = Math.max(...ys) - y + 1;
    const body = largestRect(cells);
    let side: Dir;
    if (draft.slot.kind === "side") side = draft.slot.at as Dir;
    else if (body.w >= body.h) side = body.y + body.h / 2 < S / 2 ? "n" : "s";
    else side = body.x + body.w / 2 < S / 2 ? "w" : "e";
    const want = cells.length >= 46 ? 3 : cells.length >= 24 ? 2 : 1;
    const bonus = cells.length >= 22 && want < 3 && rnd() < 0.3 ? 1 : 0;
    const spec: RoomSpec = {
      id,
      name: prettify(id),
      x,
      y,
      w,
      h,
      cells,
      body,
      shape: draft.shape,
      place: PLACE[draft.slot.at],
      questionRoom: true,
      tint: TINTS[i % TINTS.length],
      side,
    };
    rooms.push(spec);
    doors[id] = doorsOf(cells, want + bonus);
    for (const c of cells) roomAt.set(ck(c.x, c.y), spec);
  });

  // Rooms that are not in this game (fewer than four) leave their corner as open floor.
  for (let i = roomIds.length; i < drafts.length; i++) {
    for (const c of drafts[i].cells) if (!inCenter(c.x, c.y)) hall.add(ck(c.x, c.y));
  }

  const layout: BoardLayout = { key, cols: S, rows: S, rooms, doors, starts, center, carpet, hall, roomAt };
  layoutCache.set(key, layout);
  return layout;
}

export const DEFAULT_LAYOUT: BoardLayout = buildLayout(CLASSIC_IDS);
export const ROOM_LAYOUT: RoomSpec[] = DEFAULT_LAYOUT.rooms;
export const START_HALL: Array<{ x: number; y: number }> = DEFAULT_LAYOUT.starts;
export const BOARD_ROOM_IDS = CLASSIC_IDS;

/** The house a game is played in: its enabled rooms, placed the way the host picked, the rest filled in. */
export function layoutFor(
  settings: { enabledRoomIds?: string[]; boardRooms?: string[] } | null | undefined,
): BoardLayout {
  const ids = uniqueIds(settings?.enabledRoomIds);
  if (!ids.length) return DEFAULT_LAYOUT;
  return buildLayout(orderRooms(ids, settings?.boardRooms));
}

export function isDigitalBoard(settings: { table?: string } | null | undefined): boolean {
  return settings?.table === "board";
}

/** A room's name for the table: the card's own name first, the board's name as the fallback. */
export function roomLabel(state: Pick<GameState, "cards"> | null | undefined, id: string, layout: BoardLayout = DEFAULT_LAYOUT): string {
  return state?.cards?.find((c) => c.id === id)?.name ?? roomById(id, layout)?.name ?? id;
}

export function isHall(x: number, y: number, layout: BoardLayout = DEFAULT_LAYOUT): boolean {
  return layout.hall.has(`${x},${y}`);
}

export function roomById(id: string, layout: BoardLayout = DEFAULT_LAYOUT): RoomSpec | undefined {
  return layout.rooms.find((r) => r.id === id);
}

export function roomContainingCell(x: number, y: number, layout: BoardLayout = DEFAULT_LAYOUT): RoomSpec | undefined {
  return layout.roomAt.get(`${x},${y}`);
}

export function roomsAtHall(x: number, y: number, layout: BoardLayout = DEFAULT_LAYOUT): RoomSpec[] {
  const found: RoomSpec[] = [];
  for (const room of layout.rooms) {
    if ((layout.doors[room.id] ?? []).some((d) => d.x === x && d.y === y)) found.push(room);
  }
  return found;
}

export function isDoor(x: number, y: number, layout: BoardLayout = DEFAULT_LAYOUT): boolean {
  return roomsAtHall(x, y, layout).length > 0;
}

export function posKey(pos: PiecePos): string {
  return pos.kind === "hall" ? `h:${pos.x},${pos.y}` : `r:${pos.roomId}`;
}

export function occupyingRoom(pos: PiecePos): string | null {
  return pos.kind === "room" ? pos.roomId : null;
}

export function isLegalPos(pos: PiecePos, layout: BoardLayout = DEFAULT_LAYOUT): boolean {
  if (pos.kind === "room") return !!roomById(pos.roomId, layout);
  return isHall(pos.x, pos.y, layout);
}

export function isQuestionRoom(pos: PiecePos, enabledRoomIds: string[], layout: BoardLayout = DEFAULT_LAYOUT): boolean {
  if (pos.kind !== "room") return false;
  const spec = roomById(pos.roomId, layout);
  if (!spec?.questionRoom) return false;
  return enabledRoomIds.includes(pos.roomId);
}

/** Hall squares another guest is standing on. You may not cross or land there. */
export function blockedHallsFor(players: Player[], exceptId: string): Set<string> {
  const blocked = new Set<string>();
  for (const p of players) {
    if (p.id === exceptId) continue;
    if (p.position.kind === "hall") blocked.add(`${p.position.x},${p.position.y}`);
  }
  return blocked;
}

interface ReachNode {
  pos: PiecePos;
  dist: number;
  prev: string | null;
}

export function reachable(
  from: PiecePos,
  budget: number,
  enabledRoomIds: string[],
  passages: Passage[] = [],
  blockedHalls: Set<string> = new Set(),
  layout: BoardLayout = DEFAULT_LAYOUT,
): {
  nodes: Map<string, ReachNode>;
  rooms: Set<string>;
} {
  const nodes = new Map<string, ReachNode>();
  const rooms = new Set<string>();
  const q: ReachNode[] = [{ pos: from, dist: 0, prev: null }];
  nodes.set(posKey(from), q[0]);

  const enabled = new Set(enabledRoomIds);

  while (q.length) {
    const cur = q.shift()!;
    if (cur.dist >= budget) continue;
    // Entering a room ends the move, so a room is a destination, not a shortcut.
    if (cur.dist > 0 && cur.pos.kind === "room") continue;
    for (const n of neighbors(cur.pos, enabled, passages, blockedHalls, layout)) {
      const k = posKey(n);
      if (nodes.has(k)) continue;
      const next: ReachNode = { pos: n, dist: cur.dist + 1, prev: posKey(cur.pos) };
      nodes.set(k, next);
      q.push(next);
      if (n.kind === "room") rooms.add(n.roomId);
    }
  }
  return { nodes, rooms };
}

function neighbors(pos: PiecePos, enabled: Set<string>, passages: Passage[], blocked: Set<string>, layout: BoardLayout): PiecePos[] {
  const out: PiecePos[] = [];
  if (pos.kind === "hall") {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (!isHall(x, y, layout) || blocked.has(`${x},${y}`)) continue;
      out.push({ kind: "hall", x, y });
    }
    for (const room of roomsAtHall(pos.x, pos.y, layout)) {
      if (room.id === "foyer" || enabled.has(room.id)) {
        out.push({ kind: "room", roomId: room.id });
      }
    }
  } else {
    for (const d of layout.doors[pos.roomId] ?? []) {
      if (blocked.has(`${d.x},${d.y}`)) continue;
      out.push({ kind: "hall", x: d.x, y: d.y });
    }
    for (const link of passages) {
      const other = link.a === pos.roomId ? link.b : link.b === pos.roomId ? link.a : null;
      if (!other || other === pos.roomId) continue;
      if (other === "foyer" || enabled.has(other)) out.push({ kind: "room", roomId: other });
    }
  }
  return out;
}

/**
 * The rooms closest to a piece by walking distance (a secret passage counts as one step).
 * "Fast Track" uses this: rooms in this game are never one door apart, so a plain two step
 * search found nothing and the power did nothing. Ties at the cutoff are all included.
 */
export function nearestRooms(
  from: PiecePos,
  enabledRoomIds: string[],
  passages: Passage[] = [],
  count = 3,
  layout: BoardLayout = DEFAULT_LAYOUT,
): string[] {
  const { nodes } = reachable(from, 200, enabledRoomIds, passages, new Set(), layout);
  const here = from.kind === "room" ? from.roomId : null;
  const found: Array<{ id: string; dist: number }> = [];
  for (const node of nodes.values()) {
    if (node.pos.kind !== "room" || node.pos.roomId === here) continue;
    found.push({ id: node.pos.roomId, dist: node.dist });
  }
  found.sort((a, b) => a.dist - b.dist);
  if (found.length <= count) return found.map((room) => room.id);
  const cutoff = found[count - 1].dist;
  return found.filter((room) => room.dist <= cutoff).map((room) => room.id);
}

export function reconstructPath(nodes: Map<string, ReachNode>, dest: PiecePos): PiecePos[] {
  const path: PiecePos[] = [];
  let k: string | null = posKey(dest);
  const guard = new Set<string>();
  while (k && !guard.has(k)) {
    guard.add(k);
    const n = nodes.get(k);
    if (!n) break;
    path.push(n.pos);
    k = n.prev;
  }
  return path.reverse();
}

export function tokenAnchor(pos: PiecePos, layout: BoardLayout = DEFAULT_LAYOUT): { x: number; y: number } {
  if (pos.kind === "hall") return { x: pos.x + 0.5, y: pos.y + 0.5 };
  const room = roomById(pos.roomId, layout);
  if (!room) return { x: 0.5, y: 0.5 };
  return roomCenter(room);
}

/** The middle of a room's main body. Rooms are not always rectangles, so the box centre can fall outside them. */
export function roomCenter(room: Pick<RoomSpec, "body">): { x: number; y: number } {
  return { x: room.body.x + room.body.w / 2, y: room.body.y + room.body.h / 2 };
}

export function hallCells(layout: BoardLayout = DEFAULT_LAYOUT): Array<{ x: number; y: number }> {
  return [...layout.hall].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
}
