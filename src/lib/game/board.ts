import type { GameState, Passage, PiecePos, Player } from "./types";

/**
 * Digital board. It is built from the rooms that are in the game, so five room cards make a
 * five room house and fifteen make a fifteen room house.
 *
 * Shape: a square walking ring with a cross of spokes into a middle plaza. Every guest starts in the
 * plaza. Each room is a 3 by 3 block (nine spaces) outside the ring with one door onto it. The ring is
 * sized so the doors of neighbouring rooms are about 6 to 9 steps apart, which keeps every room about
 * one roll away from the next, whatever the room count.
 *
 * One step of the dice per square. Entering a room ends the move.
 */
export interface RoomSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  questionRoom: boolean;
  tint: string;
  /** Which side of the ring the room sits on. */
  side: "n" | "e" | "s" | "w";
}

export interface BoardLayout {
  key: string;
  cols: number;
  rows: number;
  /** Cells of empty margin around the ring, where the rooms sit. */
  margin: number;
  /** Ring side length in cells. */
  ring: number;
  rooms: RoomSpec[];
  doors: Record<string, Array<{ x: number; y: number }>>;
  /** Start squares in the middle plaza, best seat first. */
  starts: Array<{ x: number; y: number }>;
  plaza: { x: number; y: number; w: number; h: number };
  /** Every walkable corridor cell as "x,y". */
  hall: Set<string>;
  roomAt: Map<string, RoomSpec>;
}

export const ROOM_SIZE = 3;
/** Wanted walking distance between the doors of neighbouring rooms. */
const DOOR_GAP = 7;
const MIN_RING = 8;

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

/** Build the house for these rooms, in slot order. The same rooms in the same order always give the same house. */
export function buildLayout(roomIds: string[]): BoardLayout {
  const key = roomIds.join("|");
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const n = Math.max(1, roomIds.length);
  let ring = Math.max(MIN_RING, Math.ceil((n * DOOR_GAP) / 4));
  if (ring % 2) ring += 1;
  const margin = ROOM_SIZE;
  const size = ring + 1 + margin * 2;
  const mid = margin + ring / 2;
  const lo = margin;
  const hi = margin + ring;

  const hall = new Set<string>();
  for (let i = lo; i <= hi; i++) {
    hall.add(`${i},${lo}`);
    hall.add(`${i},${hi}`);
    hall.add(`${lo},${i}`);
    hall.add(`${hi},${i}`);
    hall.add(`${i},${mid}`);
    hall.add(`${mid},${i}`);
  }
  const plaza = { x: mid - 2, y: mid - 2, w: 5, h: 5 };
  for (let y = plaza.y; y < plaza.y + plaza.h; y++) {
    for (let x = plaza.x; x < plaza.x + plaza.w; x++) hall.add(`${x},${y}`);
  }

  // Start squares are spread across the plaza so the standing pieces do not stack on top of each other:
  // every other square of the outer ring first, then the rest of the ring, then the inner squares.
  // The squares of a square ring, in walking order round it.
  const cellsAtRadius = (radius: number) => {
    const found: Array<{ x: number; y: number }> = [];
    const x0 = mid - radius;
    const x1 = mid + radius;
    for (let x = x0; x < x1; x++) found.push({ x, y: x0 });
    for (let y = x0; y < x1; y++) found.push({ x: x1, y });
    for (let x = x1; x > x0; x--) found.push({ x, y: x1 });
    for (let y = x1; y > x0; y--) found.push({ x: x0, y });
    return found;
  };
  const outer = cellsAtRadius(2);
  const starts: Array<{ x: number; y: number }> = [
    ...outer.filter((_, i) => i % 2 === 0),
    ...outer.filter((_, i) => i % 2 === 1),
    ...cellsAtRadius(1).filter((_, i) => i % 2 === 0),
    ...cellsAtRadius(1).filter((_, i) => i % 2 === 1),
    { x: mid, y: mid },
  ];

  const rooms: RoomSpec[] = [];
  const doors: Record<string, Array<{ x: number; y: number }>> = {};
  const roomAt = new Map<string, RoomSpec>();
  const perimeter = ring * 4;
  // Doors are spread evenly round the ring. Rooms may not sit on a corner, so try a few starting phases and
  // keep the one that leaves the most even gaps once doors are pushed off the corners.
  const arcOf = (phase: number, i: number) => {
    const t = ((i + phase) * perimeter) / n;
    const side = Math.min(3, Math.floor(t / ring));
    const off = Math.max(2, Math.min(ring - 2, Math.round(t - side * ring)));
    return { side, off, arc: side * ring + off };
  };
  let phase = 0.5;
  let bestScore = Infinity;
  for (let step = 0; step < 20; step++) {
    const candidate = step / 20;
    let widest = 0;
    let drift = 0;
    for (let i = 0; i < n; i++) {
      const here = arcOf(candidate, i).arc;
      const next = arcOf(candidate, (i + 1) % n).arc;
      widest = Math.max(widest, (next - here + perimeter) % perimeter || perimeter);
      drift += Math.abs(here - (((i + candidate) * perimeter) / n) % perimeter);
    }
    const score = widest * 100 + drift;
    if (score < bestScore) {
      bestScore = score;
      phase = candidate;
    }
  }
  roomIds.forEach((id, i) => {
    const { side, off } = arcOf(phase, i);
    let x = 0;
    let y = 0;
    let door = { x: 0, y: 0 };
    let dir: RoomSpec["side"] = "n";
    if (side === 0) {
      dir = "n";
      door = { x: lo + off, y: lo };
      x = door.x - 1;
      y = lo - ROOM_SIZE;
    } else if (side === 1) {
      dir = "e";
      door = { x: hi, y: lo + off };
      x = hi + 1;
      y = door.y - 1;
    } else if (side === 2) {
      dir = "s";
      door = { x: hi - off, y: hi };
      x = door.x - 1;
      y = hi + 1;
    } else {
      dir = "w";
      door = { x: lo, y: hi - off };
      x = lo - ROOM_SIZE;
      y = door.y - 1;
    }
    const spec: RoomSpec = {
      id,
      name: prettify(id),
      x,
      y,
      w: ROOM_SIZE,
      h: ROOM_SIZE,
      questionRoom: true,
      tint: TINTS[i % TINTS.length],
      side: dir,
    };
    rooms.push(spec);
    doors[id] = [door];
    for (let yy = y; yy < y + ROOM_SIZE; yy++) for (let xx = x; xx < x + ROOM_SIZE; xx++) roomAt.set(`${xx},${yy}`, spec);
  });

  const layout: BoardLayout = { key, cols: size, rows: size, margin, ring, rooms, doors, starts, plaza, hall, roomAt };
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
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

export function hallCells(layout: BoardLayout = DEFAULT_LAYOUT): Array<{ x: number; y: number }> {
  return [...layout.hall].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
}
