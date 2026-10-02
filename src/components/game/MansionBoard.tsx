import {
  COLS,
  ROWS,
  ROOM_LAYOUT,
  START_HALL,
  blockedHallsFor,
  hallCells,
  isDoor,
  isQuestionRoom,
  reachable,
  roomById,
  roomsAtHall,
} from "@/lib/game/board";
import type { GameState, PiecePos, Player } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { portraitFor } from "@/lib/game/cast";
import { portraitArt } from "@/lib/game/cards";

const CELL = 24;
const STARTS = new Set(START_HALL.map((s) => `${s.x},${s.y}`));

function doorFacing(x: number, y: number): "n" | "s" | "e" | "w" | null {
  const room = roomsAtHall(x, y)[0];
  if (!room) return null;
  if (y < room.y) return "s";
  if (y >= room.y + room.h) return "n";
  if (x < room.x) return "e";
  return "w";
}

export function MansionBoard({
  state,
  actorId,
  interactive,
  onMove,
}: {
  state: GameState;
  actorId: string;
  interactive: boolean;
  onMove: (pos: PiecePos) => void;
}) {
  const actor = state.players.find((p) => p.id === actorId);
  const enabled = state.settings.enabledRoomIds;
  const anywhere = state.phase === "event" && state.event?.kind === "move-anywhere";
  const reach =
    interactive && actor && state.phase === "move"
      ? reachable(
          actor.position,
          state.moveBudget,
          enabled,
          state.passages ?? [],
          blockedHallsFor(state.players, actor.id),
        )
      : null;
  const hall = hallCells();

  const hallDist = (x: number, y: number) => reach?.nodes.get(`h:${x},${y}`)?.dist ?? 0;
  const roomDist = (id: string) => reach?.nodes.get(`r:${id}`)?.dist ?? 0;

  return (
    <div className="clue-frame overflow-auto rounded-[20px] border border-line shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div
        className="clue-grid relative"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
          gap: 1,
          width: COLS * CELL + (COLS - 1),
          boxSizing: "content-box",
        }}
      >
        {hall.map((c) => {
          const dist = hallDist(c.x, c.y);
          const active = dist > 0;
          const facing = isDoor(c.x, c.y) ? doorFacing(c.x, c.y) : null;
          return (
            <button
              key={`h-${c.x}-${c.y}`}
              type="button"
              disabled={!active}
              onClick={() => onMove({ kind: "hall", x: c.x, y: c.y })}
              className={cn(
                "clue-hall relative flex items-center justify-center p-0",
                (c.x + c.y) % 2 === 1 && "clue-hall-b",
                facing && "clue-door",
                active && dist === 1 && "clue-step",
                active && dist > 1 && "clue-far",
              )}
              style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}
              aria-label={
                active
                  ? dist === 1
                    ? `Step to ${c.x},${c.y}`
                    : `Walk toward ${c.x},${c.y}`
                  : `Corridor ${c.x},${c.y}`
              }
            >
              {facing ? <span className={cn("clue-arch", `clue-arch-${facing}`)} /> : null}
              {STARTS.has(`${c.x},${c.y}`) ? <span className="clue-start" /> : null}
            </button>
          );
        })}

        {ROOM_LAYOUT.map((room) => {
          const closed = room.questionRoom && !enabled.includes(room.id);
          const dist = roomDist(room.id);
          const active = anywhere
            ? !closed && (room.id === "foyer" || enabled.includes(room.id))
            : !closed && dist > 0;
          const links = (state.passages ?? [])
            .filter((p) => p.a === room.id || p.b === room.id)
            .map((p) => ROOM_LAYOUT.find((r) => r.id === (p.a === room.id ? p.b : p.a))?.name)
            .filter(Boolean);
          return (
            <button
              key={room.id}
              type="button"
              disabled={!active}
              onClick={() => onMove({ kind: "room", roomId: room.id })}
              className={cn(
                "clue-room relative flex flex-col items-center justify-center px-1 text-center",
                closed && "clue-room-closed",
                active && dist === 1 && "clue-step",
                active && (dist > 1 || anywhere) && "clue-far",
              )}
              style={{
                gridColumn: `${room.x + 1} / span ${room.w}`,
                gridRow: `${room.y + 1} / span ${room.h}`,
                backgroundColor: closed ? "#2a241e" : room.tint,
                backgroundImage: closed
                  ? undefined
                  : `linear-gradient(to top, rgba(18,12,8,0.78), rgba(18,12,8,0.08) 46%), url(/rooms/${room.id}.jpg)`,
              }}
            >
              <span className="clue-plaque">{room.name}</span>
              {links.length ? <span className="clue-passage">passage · {links.join(", ")}</span> : null}
              {closed ? <span className="text-[8px] uppercase tracking-wider text-subtle">Closed</span> : null}
            </button>
          );
        })}
        <div className="pointer-events-none absolute inset-0">
          {state.players.map((p) => {
            const shift = crowdShift(state, p);
            return (
              <Character
                key={p.id}
                player={p}
                isTurn={currentIs(state, p.id)}
                crowd={shift.x}
                lift={shift.y}
              />
            );
          })}
        </div>
      </div>
      {actor && state.phase === "move" ? (
        <p className="px-2 py-2 text-center text-xs text-[#e7d7a8]">
          {state.moveBudget} {state.moveBudget === 1 ? "step" : "steps"} left. Tap a lit square — you move one space, and only onto squares this roll can reach.
          {actor.position.kind === "room" && isQuestionRoom(actor.position, enabled)
            ? ` In the ${roomById(actor.position.roomId)?.name}.`
            : ""}
        </p>
      ) : (
        <p className="px-2 py-2 text-center text-[11px] uppercase tracking-[0.16em] text-[#e7d7a8]/80">
          Harrington House
        </p>
      )}
    </div>
  );
}

function currentIs(state: GameState, id: string) {
  return state.turnOrder[state.turnIndex % state.turnOrder.length] === id;
}

function sameSpot(a: Player, b: Player) {
  if (a.position.kind === "hall" && b.position.kind === "hall") {
    return a.position.x === b.position.x && a.position.y === b.position.y;
  }
  if (a.position.kind === "room" && b.position.kind === "room") return a.position.roomId === b.position.roomId;
  return false;
}

function crowdShift(state: GameState, player: Player) {
  const mates = state.players.filter((other) => sameSpot(player, other));
  const i = Math.max(0, mates.findIndex((other) => other.id === player.id));
  const cols = Math.min(5, Math.max(1, mates.length));
  const col = i % cols;
  const row = Math.floor(i / cols);
  const rowCount = Math.ceil(mates.length / cols);
  const inRow = Math.min(cols, mates.length - row * cols);
  return {
    x: (col - (inRow - 1) / 2) * 14,
    y: (row - (rowCount - 1) / 2) * 16,
  };
}

const PITCH = CELL + 1;
const PAD = 6;

function anchor(player: Player) {
  if (player.position.kind === "hall") {
    return {
      x: PAD + player.position.x * PITCH + CELL / 2,
      y: PAD + player.position.y * PITCH + CELL / 2,
    };
  }
  const room = roomById(player.position.roomId);
  if (!room) return { x: 12, y: 12 };
  const w = room.w * CELL + (room.w - 1);
  const h = room.h * CELL + (room.h - 1);
  return {
    x: PAD + room.x * PITCH + w / 2,
    y: PAD + room.y * PITCH + h / 2 + 8,
  };
}

function Character({ player, isTurn, crowd, lift }: { player: Player; isTurn: boolean; crowd: number; lift: number }) {
  const at = anchor(player);
  const face = portraitFor(player.seat);
  return (
    <div
      className={cn("character", isTurn && "character-turn")}
      style={{ transform: `translate(${at.x + crowd - 16}px, ${at.y + lift - 20}px)` }}
      title={player.name}
    >
      <img
        src={portraitArt(player.avatar) ?? face.src}
        alt=""
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      {isTurn ? <span>{player.name.split(" ")[0]}</span> : null}
    </div>
  );
}
