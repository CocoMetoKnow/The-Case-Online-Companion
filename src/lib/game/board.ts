import type { GameState, Passage, PiecePos, Player } from "./types";
import { HOUSE_CENTER, HOUSE_H, HOUSE_LINKS, HOUSE_ROOMS, HOUSE_SPAWNS, HOUSE_TILES, HOUSE_W } from "./house-data";

/**
 * Digital board. One fixed house, copied from the painted floor plan (public/board/house.jpg): ten rooms that
 * always sit in the same places, marble squares to walk on, and a doorway where the picture has one. Nothing is
 * shuffled or generated.
 *
 * Position: a guest in the corridor is on a marble square, written { x, y } where y is the row of the picture and x
 * the square's number along that row. A guest in a room is { roomId }. One step of the dice moves one square, and a
 * step through a doorway or a secret passage enters a room, which ends the move.
 *
 * Secret passages join two of the ten rooms. A passage may run through a hidden room: a room card that is in the
 * game and on a guest's turn can be walked into, but is not drawn anywhere on the house.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Cell {
  x: number;
  y: number;
}
export interface Tile extends Cell {
  id: number;
  /** Where the square is on the picture, in image pixels. */
  px: Rect;
}

export interface RoomSpec {
  id: string;
  name: string;
  /** Where the room is on the picture, in image pixels. Empty for a hidden room. */
  rect: Rect;
  /** Not drawn on the house. Reached only by a secret passage. */
  hidden: boolean;
  questionRoom: boolean;
  tint: string;
}

export interface BoardLayout {
  key: string;
  /** The picture's size in image pixels. Everything on the board is placed in these units. */
  width: number;
  height: number;
  tiles: Tile[];
  /** Every walkable corridor square as "x,y". */
  hall: Set<string>;
  rooms: RoomSpec[];
  /** The corridor squares that open into each room. */
  doors: Record<string, Cell[]>;
  /** The blue circle squares guests may start on. */
  starts: Cell[];
  /** A plain corridor square near the middle, for "lost in the hall". */
  center: Cell;
}

/** Fewest and most guests the digital board seats: one for every blue circle. */
export const BOARD_MAX_PLAYERS = 8;

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

/** The ten rooms printed on the house, in the order they are listed. */
export const MAP_ROOM_IDS: string[] = HOUSE_ROOMS.map((r) => r.id);

/** Room cards that make good hidden rooms on a passage. Any other room card in the deck works as well. */
export const HIDDEN_ROOM_SUGGESTIONS = ["observatory", "catacombs", "the-vault", "smugglers-tunnel", "boiler-room"];

export function isMapRoom(id: string): boolean {
  return MAP_ROOM_IDS.includes(id);
}

/** The two secret passages a game opens with, when both of their rooms are in the game. */
export const DEFAULT_PASSAGES: Passage[] = [
  { a: "study", b: "kitchen" },
  { a: "lounge", b: "conservatory" },
];

function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The two secret passages. Rooms are the ten on the house. A passage the host set is kept when its rooms are in the
 * game; its hidden room (the "via") is kept when that room card is in the game too and is not on the house. Anything
 * left empty falls back to Study to Kitchen and Lounge to Conservatory, then to a random pair of unused rooms.
 */
export function resolvePassages(enabled: string[] | undefined, chosen: Passage[] | undefined, rand: () => number = Math.random): Passage[] {
  const ids = [...new Set((enabled ?? []).filter(Boolean))];
  const onHouse = ids.filter(isMapRoom);
  const set = new Set(onHouse);
  const used = new Set<string>();
  const usedVia = new Set<string>();
  const out: Array<Passage | null> = [null, null];
  [0, 1].forEach((i) => {
    const p = chosen?.[i];
    if (p && p.a && p.b && p.a !== p.b && set.has(p.a) && set.has(p.b) && !used.has(p.a) && !used.has(p.b)) {
      const via = p.via && ids.includes(p.via) && !isMapRoom(p.via) && !usedVia.has(p.via) ? p.via : undefined;
      out[i] = via ? { a: p.a, b: p.b, via } : { a: p.a, b: p.b };
      used.add(p.a);
      used.add(p.b);
      if (via) usedVia.add(via);
    }
  });
  for (let i = 0; i < 2; i++) {
    if (out[i]) continue;
    const preset = DEFAULT_PASSAGES.find((p) => set.has(p.a) && set.has(p.b) && !used.has(p.a) && !used.has(p.b));
    if (preset) {
      out[i] = { ...preset };
    } else {
      const free = shuffled(onHouse.filter((id) => !used.has(id)), rand);
      if (free.length >= 2) out[i] = { a: free[0], b: free[1] };
    }
    if (out[i]) {
      used.add(out[i]!.a);
      used.add(out[i]!.b);
    }
  }
  return out.filter((p): p is Passage => Boolean(p));
}

/** The walkable links of a passage list. A passage through a hidden room is two links: one in, one out. */
export function expandPassages(passages: Passage[] | undefined): Passage[] {
  const out: Passage[] = [];
  for (const p of passages ?? []) {
    if (p.via) {
      out.push({ a: p.a, b: p.via }, { a: p.via, b: p.b });
    } else {
      out.push({ a: p.a, b: p.b });
    }
  }
  return out;
}

/** The hidden rooms the host's passages run through. */
export function hiddenRoomsOf(settings: { boardPassages?: Passage[] } | null | undefined): string[] {
  const ids: string[] = [];
  for (const p of settings?.boardPassages ?? []) if (p?.via && !isMapRoom(p.via) && !ids.includes(p.via)) ids.push(p.via);
  return ids;
}

// ---------------------------------------------------------------------------------------------------------------------
// The house
// ---------------------------------------------------------------------------------------------------------------------

const ck = (x: number, y: number) => `${x},${y}`;

const TILES: Tile[] = HOUSE_TILES.map(([row, col, x, y, w, h], id) => ({ id, x: col, y: row, px: { x, y, w, h } }));
const TILE_KEYS: string[] = TILES.map((t) => ck(t.x, t.y));
const TILE_BY_KEY = new Map<string, Tile>(TILES.map((t) => [ck(t.x, t.y), t]));
const HALL = new Set<string>(TILE_KEYS);
/** Neighbouring corridor squares of every square. */
const LINKS = new Map<string, string[]>(TILES.map((t) => [TILE_KEYS[t.id], HOUSE_LINKS[t.id].map((n) => TILE_KEYS[n])]));

const layoutCache = new Map<string, BoardLayout>();

function buildLayout(hidden: string[]): BoardLayout {
  const key = hidden.join("|");
  const cached = layoutCache.get(key);
  if (cached) return cached;
  const rooms: RoomSpec[] = HOUSE_ROOMS.map((r, i) => ({
    id: r.id,
    name: prettify(r.id),
    rect: { x: r.rect[0], y: r.rect[1], w: r.rect[2], h: r.rect[3] },
    hidden: false,
    questionRoom: true,
    tint: TINTS[i % TINTS.length],
  }));
  hidden.forEach((id, i) => {
    rooms.push({ id, name: prettify(id), rect: { x: 0, y: 0, w: 0, h: 0 }, hidden: true, questionRoom: true, tint: TINTS[(rooms.length + i) % TINTS.length] });
  });
  const doors: Record<string, Cell[]> = {};
  for (const r of HOUSE_ROOMS) doors[r.id] = r.doors.map((id) => ({ x: TILES[id].x, y: TILES[id].y }));
  for (const id of hidden) doors[id] = [];
  const layout: BoardLayout = {
    key,
    width: HOUSE_W,
    height: HOUSE_H,
    tiles: TILES,
    hall: HALL,
    rooms,
    doors,
    starts: HOUSE_SPAWNS.map((id) => ({ x: TILES[id].x, y: TILES[id].y })),
    center: { x: TILES[HOUSE_CENTER].x, y: TILES[HOUSE_CENTER].y },
  };
  layoutCache.set(key, layout);
  return layout;
}

export const DEFAULT_LAYOUT: BoardLayout = buildLayout([]);
export const ROOM_LAYOUT: RoomSpec[] = DEFAULT_LAYOUT.rooms;
export const START_HALL: Cell[] = DEFAULT_LAYOUT.starts;

/** The house a game is played in: the fixed floor plan, plus any hidden rooms the host's passages run through. */
export function layoutFor(settings: { boardPassages?: Passage[] } | null | undefined): BoardLayout {
  return buildLayout(hiddenRoomsOf(settings));
}

export function isDigitalBoard(settings: { table?: string } | null | undefined): boolean {
  return settings?.table === "board";
}

/** A room's name for the table: the card's own name first, the board's name as the fallback. */
export function roomLabel(state: Pick<GameState, "cards"> | null | undefined, id: string, layout: BoardLayout = DEFAULT_LAYOUT): string {
  return state?.cards?.find((c) => c.id === id)?.name ?? roomById(id, layout)?.name ?? prettify(id);
}

export function isHall(x: number, y: number, layout: BoardLayout = DEFAULT_LAYOUT): boolean {
  return layout.hall.has(ck(x, y));
}

export function tileAt(x: number, y: number): Tile | undefined {
  return TILE_BY_KEY.get(ck(x, y));
}

export function roomById(id: string, layout: BoardLayout = DEFAULT_LAYOUT): RoomSpec | undefined {
  return layout.rooms.find((r) => r.id === id);
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

/** A suggestion can only be made from inside a room. */
export function isQuestionRoom(pos: PiecePos, enabledRoomIds: string[], layout: BoardLayout = DEFAULT_LAYOUT): boolean {
  if (pos.kind !== "room") return false;
  const spec = roomById(pos.roomId, layout);
  if (!spec?.questionRoom) return false;
  return enabledRoomIds.includes(pos.roomId);
}

/** Corridor squares another guest is standing on. You may not cross or land there. */
export function blockedHallsFor(players: Player[], exceptId: string): Set<string> {
  const blocked = new Set<string>();
  for (const p of players) {
    if (p.id === exceptId) continue;
    if (p.position.kind === "hall") blocked.add(ck(p.position.x, p.position.y));
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
    for (const k of LINKS.get(ck(pos.x, pos.y)) ?? []) {
      if (blocked.has(k)) continue;
      const t = TILE_BY_KEY.get(k);
      if (t) out.push({ kind: "hall", x: t.x, y: t.y });
    }
    for (const room of roomsAtHall(pos.x, pos.y, layout)) {
      if (enabled.has(room.id)) out.push({ kind: "room", roomId: room.id });
    }
  } else {
    for (const d of layout.doors[pos.roomId] ?? []) {
      if (blocked.has(ck(d.x, d.y))) continue;
      out.push({ kind: "hall", x: d.x, y: d.y });
    }
    for (const link of passages) {
      const other = link.a === pos.roomId ? link.b : link.b === pos.roomId ? link.a : null;
      if (!other || other === pos.roomId) continue;
      if (enabled.has(other)) out.push({ kind: "room", roomId: other });
    }
  }
  return out;
}

/**
 * The rooms closest to a piece by walking distance (a secret passage counts as one step).
 * "Fast Track" uses this. Ties at the cutoff are all included.
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

export function hallCells(layout: BoardLayout = DEFAULT_LAYOUT): Cell[] {
  return layout.tiles.map((t) => ({ x: t.x, y: t.y }));
}

/** A random order of the blue circle squares. Guests take them in turn, so no two start on the same one. */
export function shuffledStarts(layout: BoardLayout = DEFAULT_LAYOUT, rand: () => number = Math.random): Cell[] {
  return shuffled(layout.starts, rand);
}
