import type { Passage, PiecePos, Player } from "./types";

/**
 * Digital house. Salon, dining room, and kitchen across the top; main hall
 * and gala hall beside the stair; den, library, pool room, and greenhouse
 * along the bottom. Corridors are one square wide. One step of the dice
 * per square.
 *
 * Columns 0 and 23, rows 0 and 24, are the outer walk.
 */
export const COLS = 24;
export const ROWS = 25;

export interface RoomSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  questionRoom: boolean;
  tint: string;
}

export const ROOM_LAYOUT: RoomSpec[] = [
  { id: "lounge", name: "Salon", x: 1, y: 1, w: 6, h: 6, questionRoom: true, tint: "#6a3030" },
  { id: "dining-room", name: "Dining Room", x: 10, y: 1, w: 5, h: 7, questionRoom: true, tint: "#7a4038" },
  { id: "kitchen", name: "Kitchen", x: 17, y: 1, w: 6, h: 6, questionRoom: true, tint: "#6b5138" },
  { id: "grand-hall", name: "Main Hall", x: 1, y: 9, w: 6, h: 6, questionRoom: true, tint: "#6e3030" },
  { id: "ballroom", name: "Gala Hall", x: 17, y: 9, w: 6, h: 6, questionRoom: true, tint: "#6a4552" },
  { id: "study", name: "Den", x: 1, y: 18, w: 5, h: 6, questionRoom: true, tint: "#5c4632" },
  { id: "library", name: "Library", x: 7, y: 17, w: 5, h: 6, questionRoom: true, tint: "#3a5244" },
  { id: "billiard-room", name: "Pool Room", x: 13, y: 17, w: 5, h: 6, questionRoom: true, tint: "#2c4a44" },
  { id: "conservatory", name: "Greenhouse", x: 19, y: 17, w: 4, h: 7, questionRoom: true, tint: "#355848" },
];

/** The center stair is not a room and not a walkway. */
export const STAIRS = { x: 9, y: 9, w: 6, h: 7 };

/** Hall squares that open into a room. A doorway is the only way in or out. */
export const ROOM_DOORS: Record<string, Array<{ x: number; y: number }>> = {
  lounge: [{ x: 4, y: 7 }],
  "dining-room": [
    { x: 9, y: 4 },
    { x: 12, y: 8 },
  ],
  kitchen: [{ x: 19, y: 7 }],
  "grand-hall": [{ x: 7, y: 11 }],
  ballroom: [{ x: 16, y: 11 }],
  study: [{ x: 6, y: 20 }],
  library: [{ x: 9, y: 16 }],
  "billiard-room": [{ x: 15, y: 16 }],
  conservatory: [{ x: 18, y: 20 }],
};

/** Start squares on the outer walk. The first six match the colored squares on the board. */
export const START_HALL: Array<{ x: number; y: number }> = [
  { x: 0, y: 8 },
  { x: 8, y: 0 },
  { x: 23, y: 7 },
  { x: 23, y: 13 },
  { x: 15, y: 24 },
  { x: 8, y: 24 },
  { x: 0, y: 18 },
  { x: 4, y: 0 },
  { x: 20, y: 0 },
  { x: 12, y: 24 },
];

export const BOARD_ROOM_IDS = ROOM_LAYOUT.map((room) => room.id);

export function isDigitalBoard(settings: { table?: string } | null | undefined): boolean {
  return settings?.table === "board";
}

const ROOM_AT = new Map<string, RoomSpec>();
for (const room of ROOM_LAYOUT) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      ROOM_AT.set(`${x},${y}`, room);
    }
  }
}

export function isHall(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  if (x >= STAIRS.x && x < STAIRS.x + STAIRS.w && y >= STAIRS.y && y < STAIRS.y + STAIRS.h) return false;
  return !ROOM_AT.has(`${x},${y}`);
}

export function roomById(id: string): RoomSpec | undefined {
  return ROOM_LAYOUT.find((r) => r.id === id);
}

export function roomContainingCell(x: number, y: number): RoomSpec | undefined {
  return ROOM_AT.get(`${x},${y}`);
}

export function roomsAtHall(x: number, y: number): RoomSpec[] {
  const found: RoomSpec[] = [];
  for (const room of ROOM_LAYOUT) {
    if ((ROOM_DOORS[room.id] ?? []).some((d) => d.x === x && d.y === y)) found.push(room);
  }
  return found;
}

export function isDoor(x: number, y: number): boolean {
  return roomsAtHall(x, y).length > 0;
}

export function posKey(pos: PiecePos): string {
  return pos.kind === "hall" ? `h:${pos.x},${pos.y}` : `r:${pos.roomId}`;
}

export function occupyingRoom(pos: PiecePos): string | null {
  return pos.kind === "room" ? pos.roomId : null;
}

export function isLegalPos(pos: PiecePos): boolean {
  if (pos.kind === "room") return !!roomById(pos.roomId);
  return isHall(pos.x, pos.y);
}

export function isQuestionRoom(pos: PiecePos, enabledRoomIds: string[]): boolean {
  if (pos.kind !== "room") return false;
  const spec = roomById(pos.roomId);
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
    for (const n of neighbors(cur.pos, enabled, passages, blockedHalls)) {
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

function neighbors(pos: PiecePos, enabled: Set<string>, passages: Passage[], blocked: Set<string>): PiecePos[] {
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
      if (!isHall(x, y) || blocked.has(`${x},${y}`)) continue;
      out.push({ kind: "hall", x, y });
    }
    for (const room of roomsAtHall(pos.x, pos.y)) {
      if (room.id === "foyer" || enabled.has(room.id)) {
        out.push({ kind: "room", roomId: room.id });
      }
    }
  } else {
    for (const d of ROOM_DOORS[pos.roomId] ?? []) {
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

export function tokenAnchor(pos: PiecePos): { x: number; y: number } {
  if (pos.kind === "hall") return { x: pos.x + 0.5, y: pos.y + 0.5 };
  const room = roomById(pos.roomId);
  if (!room) return { x: 0.5, y: 0.5 };
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

export function hallCells(): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (isHall(x, y)) cells.push({ x, y });
    }
  }
  return cells;
}
