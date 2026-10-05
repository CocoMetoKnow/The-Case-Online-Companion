import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Box, Maximize2, Minus, Plus } from "lucide-react";
import {
  blockedHallsFor,
  hallCells,
  isDoor,
  layoutFor,
  reachable,
  roomLabel,
  type BoardLayout,
  type RoomSpec,
} from "@/lib/game/board";
import type { GameState, PiecePos, Player } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { portraitFor } from "@/lib/game/cast";
import { defaultCardArt, portraitArt } from "@/lib/game/cards";
import { charCutout, roomBackdrop } from "@/lib/game/scene-art";

/**
 * The digital board, drawn as a tilted, top-down diorama.
 *
 * The house lies flat and is tipped back by --tilt. Rooms are open-fronted boxes: a floor, a back wall and
 * side walls painted from that room's card art. Guests are standing cut-out figures on round bases that always
 * face the camera. The frame, chips and buttons use the journal's navy cover and cream pages.
 */
const CELL = 36;
const PAD = 14;
const FIG_H = 92;
const FIG_W = 34;
const TILTS = [18, 32, 48];

/** Seat order for guests who have not picked a character. */
const DEFAULT_FIGURES = ["miss-scarlet", "lady-violet", "dr-finch", "chef-marco", "colonel-mustard", "professor-plum", "the-butler", "mrs-peacock", "mr-green", "mrs-white"];

const BOARD_CSS = `
.dgb-frame{position:relative;height:100%;min-height:260px;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;
 background:linear-gradient(90deg,var(--j-spine,#1a2b50) 0 26px,var(--j-cover,#24396a) 26px);
 box-shadow:0 14px 34px rgba(0,0,0,.5),inset 0 0 0 1px var(--j-ring,#9db4e640);padding:6px 6px 6px 0}
.dgb-spiral{position:absolute;left:0;top:0;bottom:0;width:26px;z-index:12;pointer-events:none;
 background:radial-gradient(circle at 13px 16px,#f4f7fb 0 4px,#9aa3ad 5px 7px,transparent 8px) 0 0/26px 32px repeat-y}
.dgb-view{position:relative;flex:1;min-height:0;margin-left:28px;border-radius:12px;overflow:hidden;perspective:1050px;perspective-origin:50% 36%;touch-action:none;cursor:grab;
 background:radial-gradient(120% 90% at 50% 40%,#2d4636 0%,#1a2a20 60%,#0d1610 100%);box-shadow:inset 0 0 0 2px rgba(0,0,0,.55),inset 0 0 40px rgba(0,0,0,.6)}
.dgb-view.drag{cursor:grabbing}
.dgb-world{position:absolute;left:50%;top:50%;transform-origin:0 0;transform-style:preserve-3d;transition:transform .65s cubic-bezier(.2,.7,.2,1)}
.dgb-view.drag .dgb-world{transition:none}
.dgb-ground{position:absolute;border-radius:18px;background:
  radial-gradient(circle at 50% 50%,rgba(255,255,255,.05),transparent 60%),
  repeating-linear-gradient(45deg,rgba(255,255,255,.03) 0 6px,transparent 6px 12px),
  linear-gradient(#27402e,#1c3024);box-shadow:0 0 0 3px #0c140f,0 24px 40px rgba(0,0,0,.6)}
.dgb-tile{position:absolute;padding:0;border:0;background:#efe3c6;box-shadow:inset 0 0 0 1px rgba(122,98,52,.6),inset 0 -3px 0 rgba(90,70,36,.28);transform:translateZ(1px)}
.dgb-tile.b{background:#dccca4}
.dgb-tile.plaza{background:#6e2635;box-shadow:inset 0 0 0 1px rgba(214,178,92,.6),inset 0 -3px 0 rgba(0,0,0,.25)}
.dgb-tile.plaza.b{background:#7c2e3f}
.dgb-tile.mid::after{content:"✦";position:absolute;inset:0;display:grid;place-items:center;color:rgba(240,210,130,.85);font-size:20px}
.dgb-tile.door{background:#cfb26c;box-shadow:inset 0 0 0 1px #7a6234,inset 0 -3px 0 rgba(0,0,0,.2)}
.dgb-tile:disabled{cursor:inherit}
.dgb-tile.step{cursor:pointer;transform:translateZ(3px);background:#d8f5de;box-shadow:inset 0 0 0 2px #2fb463,0 0 14px rgba(47,180,99,.9);animation:dgb-pulse 1.1s ease-in-out infinite}
.dgb-tile.far{cursor:pointer;transform:translateZ(2px);box-shadow:inset 0 0 0 2px rgba(240,200,100,.95),0 0 9px rgba(240,200,100,.55)}
.dgb-lines{position:absolute;left:0;top:0;pointer-events:none;transform:translateZ(2px)}
.dgb-room{position:absolute;transform-style:preserve-3d;pointer-events:none;transform:translateZ(3px)}
.dgb-floor{position:absolute;inset:0;padding:0;overflow:hidden;pointer-events:auto;border:3px solid #b8923e;border-radius:3px;background-size:100% auto;background-position:center bottom;
 box-shadow:inset 0 16px 20px rgba(0,0,0,.6),inset 0 0 0 1px rgba(0,0,0,.6),0 6px 14px rgba(0,0,0,.55)}
.dgb-floor:disabled{cursor:inherit}
.dgb-floor.step{cursor:pointer;border-color:#2fb463;box-shadow:inset 0 16px 20px rgba(0,0,0,.5),0 0 22px rgba(47,180,99,.95);animation:dgb-pulse 1.1s ease-in-out infinite}
.dgb-floor.far{cursor:pointer;border-color:#f0cf7a;box-shadow:inset 0 16px 20px rgba(0,0,0,.5),0 0 16px rgba(240,207,122,.7)}
.dgb-glow{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle at 50% 38%,rgba(255,200,115,.42),rgba(255,170,80,0) 66%);animation:dgb-flicker 3.8s ease-in-out infinite}
.dgb-wall{position:absolute;pointer-events:none;background-repeat:no-repeat;box-shadow:inset 0 0 0 1px rgba(0,0,0,.55)}
.dgb-wall.back{border-top:4px solid #b8923e;border-bottom:5px solid #3a2616;background-size:100% auto;background-position:center top;transform-origin:50% 100%;transform:rotateX(-90deg);
 box-shadow:inset 0 0 0 1px rgba(0,0,0,.55),inset 0 -22px 20px -10px rgba(0,0,0,.55),inset 0 26px 22px -12px rgba(0,0,0,.5)}
.dgb-wall.west{transform-origin:100% 50%;transform:rotateY(90deg);border-top:4px solid #8d6f2f;background-size:330% auto;background-position:0 12%}
.dgb-wall.east{transform-origin:0 50%;transform:rotateY(-90deg);border-top:4px solid #8d6f2f;background-size:330% auto;background-position:100% 12%}
.dgb-wall.west,.dgb-wall.east{filter:brightness(.62) saturate(.9)}
.dgb-flame{position:absolute;width:7px;height:11px;border-radius:50% 50% 45% 45%;background:radial-gradient(circle at 50% 70%,#fff6c8,#ffb43c 55%,transparent 72%);box-shadow:0 0 14px 6px rgba(255,170,60,.55);animation:dgb-flicker 1.7s ease-in-out infinite}
.dgb-label{position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d;pointer-events:none}
.dgb-label>div{position:absolute;left:0;bottom:0;transform:translateX(-50%) rotateX(calc(var(--tilt) * -1));transform-origin:50% 100%;text-align:center;white-space:nowrap}
.dgb-plaque{display:inline-block;padding:3px 9px;border-radius:7px;background:#f6f1e6;color:#1c2430;font-family:var(--font-display,serif);font-size:13px;line-height:1.1;border:1px solid #b8923e;box-shadow:inset 3px 0 0 #a83434,0 3px 8px rgba(0,0,0,.5)}
.dgb-pass{display:inline-block;margin-top:3px;padding:1px 6px;border-radius:6px;background:rgba(18,12,8,.82);font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#f0cf7a}
.dgb-tok{position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d;pointer-events:none;transition:transform .5s cubic-bezier(.3,.7,.2,1)}
.dgb-base{position:absolute;left:-15px;top:-15px;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#fff6,transparent 45%),var(--tok,#ddd);box-shadow:0 0 0 2px #1a1410,0 0 0 4px rgba(255,255,255,.35),0 5px 8px rgba(0,0,0,.65)}
.dgb-tok.turn .dgb-base{box-shadow:0 0 0 2px #1a1410,0 0 0 4px #ffe9a0,0 0 18px 6px rgba(255,226,140,.85);animation:dgb-pulse 1.1s ease-in-out infinite}
.dgb-stand{position:absolute;left:${-FIG_W / 2}px;top:${-FIG_H + 6}px;width:${FIG_W}px;height:${FIG_H}px;transform-origin:50% 100%;transform:rotateX(calc(var(--tilt) * -1));transform-style:flat}
.dgb-stand img{position:absolute;left:0;bottom:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 4px 3px rgba(0,0,0,.65));animation:dgb-breathe 3.2s ease-in-out infinite;transform-origin:50% 100%}
.dgb-stand img.bust{height:auto;aspect-ratio:1;bottom:18px;border-radius:50%;object-fit:cover;border:2px solid var(--tok,#ddd);background:#1a1410}
.dgb-name{position:absolute;left:50%;top:-16px;transform:translateX(-50%);white-space:nowrap;font-size:10px;line-height:1;color:#1c2430;background:#f6f1e6;padding:3px 7px;border-radius:7px;box-shadow:inset 3px 0 0 #a83434,0 2px 6px rgba(0,0,0,.5)}
.dgb-hud{position:absolute;z-index:11;pointer-events:none}
.dgb-chip{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:12px;background:#f6f1e6;color:#1c2430;font-size:12px;line-height:1.25;border:1px solid #c4b396;box-shadow:inset 3px 0 0 #a83434,0 4px 10px rgba(0,0,0,.45);max-width:100%}
.dgb-chip b{font-family:var(--font-display,serif);font-size:18px;font-weight:700;line-height:1}
.dgb-btn{pointer-events:auto;display:grid;place-items:center;width:38px;height:38px;border-radius:999px;background:var(--j-spine,#1a2b50);color:#f6f1e6;border:1px solid var(--j-ring,#9db4e6);box-shadow:0 3px 8px rgba(0,0,0,.45)}
.dgb-btn:active{transform:scale(.95)}
.dgb-stop{pointer-events:auto;padding:8px 16px;border-radius:999px;background:#f6f1e6;color:#1c2430;font-weight:600;font-size:13px;border:1px solid #1a2b50;box-shadow:0 4px 10px rgba(0,0,0,.5)}
@keyframes dgb-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.3)}}
@keyframes dgb-flicker{0%,100%{opacity:.75}22%{opacity:1}41%{opacity:.62}63%{opacity:.95}82%{opacity:.7}}
@keyframes dgb-breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.018)}}
@media (prefers-reduced-motion:reduce){.dgb-glow,.dgb-flame,.dgb-stand img,.dgb-tile.step,.dgb-floor.step,.dgb-tok.turn .dgb-base{animation:none}.dgb-world,.dgb-tok{transition:none}}
`;

const wallHeight = (room: RoomSpec) => (room.side === "s" ? Math.round(CELL * 0.5) : Math.round(CELL * 1.7));

function roomArt(state: GameState, room: RoomSpec): string | undefined {
  const card = state.cards.find((c) => c.id === room.id);
  return roomBackdrop(card) || card?.imageDataUrl || defaultCardArt(room.id) || `/rooms/${room.id}.jpg`;
}

/** A character for every guest: the one they picked, otherwise the next free one in seat order. */
function figures(players: Player[]): Record<string, string> {
  const taken = new Set(players.map((p) => p.avatar).filter(Boolean) as string[]);
  const out: Record<string, string> = {};
  const free = DEFAULT_FIGURES.filter((id) => !taken.has(id));
  for (const p of players) {
    if (p.avatar) out[p.id] = p.avatar;
    else out[p.id] = free.shift() ?? DEFAULT_FIGURES[p.seat % DEFAULT_FIGURES.length];
  }
  return out;
}

export function MansionBoard({
  state,
  actorId,
  interactive,
  onMove,
  onStop,
  className,
}: {
  state: GameState;
  actorId: string;
  interactive: boolean;
  onMove: (pos: PiecePos) => void;
  /** Shown while the walking guest may stop short of the full roll. */
  onStop?: () => void;
  className?: string;
}) {
  const layout = useMemo(() => layoutFor(state.settings), [state.settings]);
  const actor = state.players.find((p) => p.id === actorId);
  const enabled = state.settings.enabledRoomIds;
  const anywhere = state.phase === "event" && state.event?.kind === "move-anywhere";
  const reach =
    interactive && actor && state.phase === "move"
      ? reachable(actor.position, state.moveBudget, enabled, state.passages ?? [], blockedHallsFor(state.players, actor.id), layout)
      : null;
  const hall = useMemo(() => hallCells(layout), [layout]);
  const who = useMemo(() => figures(state.players), [state.players]);

  const hallDist = (x: number, y: number) => reach?.nodes.get(`h:${x},${y}`)?.dist ?? 0;
  const roomDist = (id: string) => reach?.nodes.get(`r:${id}`)?.dist ?? 0;

  const boardW = layout.cols * CELL;
  const boardH = layout.rows * CELL;

  const view = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 420 });
  const [tiltIx, setTiltIx] = useState(1);
  const tilt = TILTS[tiltIx];
  const [zoomPick, setZoomPick] = useState<number | null>(null);
  const [fit, setFit] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 380, h: el.clientHeight || 420 });
    read();
    const watcher = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    watcher?.observe(el);
    return () => watcher?.disconnect();
  }, []);

  const baseZoom = Math.max(0.5, Math.min(1.15, size.w / (13 * CELL)));
  const fitZoom = Math.max(
    0.2,
    Math.min(size.w / (boardW + PAD * 2), size.h / (boardH * Math.cos((tilt * Math.PI) / 180) + 120)) * 0.96,
  );
  const zoom = fit ? fitZoom : (zoomPick ?? baseZoom);

  const mover = state.players.find((p) => p.id === actorId);
  const moverKey = mover ? (mover.position.kind === "hall" ? `${mover.position.x},${mover.position.y}` : mover.position.roomId) : "";
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [moverKey, actorId]);

  const at = mover ? anchor(mover, layout) : { x: boardW / 2, y: boardH / 2 };
  const fx = (fit ? boardW / 2 : at.x) + (fit ? 0 : pan.x);
  const fy = (fit ? boardH / 2 : at.y) + (fit ? 0 : pan.y);

  // Drag to look around, pinch to zoom. A tap on a lit square is still a tap.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ sx: 0, sy: 0, moved: false, pinch: 0, pinchZoom: 1 });
  const justDragged = useRef(false);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current.sx = e.clientX;
    gesture.current.sy = e.clientY;
    gesture.current.moved = false;
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.pinchZoom = zoom;
    }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinch > 0) {
        setFit(false);
        setZoomPick(Math.max(0.35, Math.min(1.8, gesture.current.pinchZoom * (d / gesture.current.pinch))));
        gesture.current.moved = true;
        justDragged.current = true;
      }
      return;
    }
    const total = Math.hypot(e.clientX - gesture.current.sx, e.clientY - gesture.current.sy);
    if (!gesture.current.moved && total < 7) return;
    if (!gesture.current.moved) {
      gesture.current.moved = true;
      setDragging(true);
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
    }
    justDragged.current = true;
    if (fit) setFit(false);
    const c = Math.cos((tilt * Math.PI) / 180);
    setPan((p) => ({ x: p.x - (e.clientX - prev.x) / zoom, y: p.y - (e.clientY - prev.y) / (zoom * Math.max(0.35, c)) }));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) gesture.current.pinch = 0;
    if (pts.current.size === 0) {
      setDragging(false);
      window.setTimeout(() => {
        justDragged.current = false;
      }, 0);
    }
  };

  const passages = state.passages ?? [];
  const walking = Boolean(actor && state.phase === "move");
  const here = actor?.position.kind === "room" ? roomLabel(state, actor.position.roomId, layout) : "";

  return (
    <div className={cn("dgb-frame", className)}>
      <style>{BOARD_CSS}</style>
      <span className="dgb-spiral" aria-hidden="true" />
      <div
        ref={view}
        className={cn("dgb-view", dragging && "drag")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (justDragged.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onWheel={(e) => {
          setFit(false);
          setZoomPick((z) => Math.max(0.35, Math.min(1.8, (z ?? zoom) * (e.deltaY > 0 ? 0.92 : 1.08))));
        }}
      >
        <div
          className="dgb-world"
          style={
            {
              width: boardW,
              height: boardH,
              ["--tilt" as string]: `${tilt}deg`,
              transform: `rotateX(${tilt}deg) scale(${zoom}) translate(${-fx}px, ${-fy}px)`,
            } as CSSProperties
          }
        >
          <div className="dgb-ground" style={{ left: -PAD, top: -PAD, width: boardW + PAD * 2, height: boardH + PAD * 2 }} />

          {hall.map((c) => {
            const dist = hallDist(c.x, c.y);
            const active = dist > 0;
            const inPlaza =
              c.x >= layout.plaza.x && c.x < layout.plaza.x + layout.plaza.w && c.y >= layout.plaza.y && c.y < layout.plaza.y + layout.plaza.h;
            const middle = c.x === layout.plaza.x + 2 && c.y === layout.plaza.y + 2;
            return (
              <button
                key={`h-${c.x}-${c.y}`}
                type="button"
                disabled={!active}
                onClick={() => onMove({ kind: "hall", x: c.x, y: c.y })}
                className={cn(
                  "dgb-tile",
                  (c.x + c.y) % 2 === 1 && "b",
                  inPlaza && "plaza",
                  middle && "mid",
                  isDoor(c.x, c.y, layout) && "door",
                  active && dist === 1 && "step",
                  active && dist > 1 && "far",
                )}
                style={{ left: c.x * CELL, top: c.y * CELL, width: CELL, height: CELL }}
                aria-label={active ? (dist === 1 ? `Step to ${c.x},${c.y}` : `Walk toward ${c.x},${c.y}`) : `Corridor ${c.x},${c.y}`}
              />
            );
          })}

          <svg className="dgb-lines" width={boardW} height={boardH} aria-hidden="true">
            {passages.map((p) => {
              const a = layout.rooms.find((r) => r.id === p.a);
              const b = layout.rooms.find((r) => r.id === p.b);
              if (!a || !b) return null;
              return (
                <line
                  key={`${p.a}:${p.b}`}
                  x1={(a.x + a.w / 2) * CELL}
                  y1={(a.y + a.h / 2) * CELL}
                  x2={(b.x + b.w / 2) * CELL}
                  y2={(b.y + b.h / 2) * CELL}
                  stroke="#f0cf7a"
                  strokeOpacity="0.55"
                  strokeWidth="3"
                  strokeDasharray="3 9"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {layout.rooms.map((room, index) => {
            const dist = roomDist(room.id);
            const active = anywhere ? enabled.includes(room.id) : dist > 0;
            const links = passages
              .filter((p) => p.a === room.id || p.b === room.id)
              .map((p) => roomLabel(state, p.a === room.id ? p.b : p.a, layout))
              .filter(Boolean);
            const art = roomArt(state, room);
            const wallH = wallHeight(room);
            const W = room.w * CELL;
            const D = room.h * CELL;
            const tall = room.side !== "s";
            const door = (layout.doors[room.id] ?? [])[0];
            const gap = door ? (door.x + 0.5) * CELL - room.x * CELL : W / 2;
            const maskGap = room.side === "s" ? `linear-gradient(90deg,#000 ${gap - 15}px,transparent ${gap - 15}px ${gap + 15}px,#000 ${gap + 15}px)` : undefined;
            const wallArt = art ? `url(${art})` : undefined;
            return (
              <div key={room.id} className="dgb-room" style={{ left: room.x * CELL, top: room.y * CELL, width: W, height: D }}>
                <button
                  type="button"
                  disabled={!active}
                  onClick={() => onMove({ kind: "room", roomId: room.id })}
                  className={cn("dgb-floor", active && dist === 1 && "step", active && (dist > 1 || anywhere) && "far")}
                  style={{
                    backgroundColor: room.tint,
                    backgroundImage: wallArt,
                  }}
                  aria-label={`${roomLabel(state, room.id, layout)}${links.length ? `, secret passage to ${links.join(", ")}` : ""}`}
                >
                  <span className="dgb-glow" style={{ animationDelay: `${-(index % 7) * 0.6}s` }} />
                </button>

                <div
                  className="dgb-wall back"
                  style={{
                    left: 0,
                    top: -wallH,
                    width: W,
                    height: wallH,
                    backgroundColor: room.tint,
                    backgroundImage: wallArt ? `linear-gradient(to bottom, rgba(0,0,0,.3), rgba(0,0,0,0) 35%), ${wallArt}` : undefined,
                    WebkitMaskImage: maskGap,
                    maskImage: maskGap,
                  }}
                >
                  {tall ? (
                    <>
                      <span className="dgb-flame" style={{ left: "13%", bottom: "26%", animationDelay: `${-(index % 5) * 0.4}s` }} />
                      <span className="dgb-flame" style={{ right: "13%", bottom: "26%", animationDelay: `${-(index % 4) * 0.55}s` }} />
                    </>
                  ) : null}
                </div>
                {room.side !== "e" ? (
                  <div
                    className="dgb-wall west"
                    style={{ left: -wallH, top: 0, width: wallH, height: D, backgroundColor: room.tint, backgroundImage: wallArt }}
                  />
                ) : null}
                {room.side !== "w" ? (
                  <div
                    className="dgb-wall east"
                    style={{ left: W, top: 0, width: wallH, height: D, backgroundColor: room.tint, backgroundImage: wallArt }}
                  />
                ) : null}

                <div className="dgb-label" style={{ left: W / 2, top: -wallH }}>
                  <div style={{ marginBottom: 6 }}>
                    <span className="dgb-plaque">{roomLabel(state, room.id, layout)}</span>
                    {links.length ? <span className="dgb-pass">⇄ {links.join(", ")}</span> : null}
                  </div>
                </div>
              </div>
            );
          })}

          {state.players.map((p) => {
            const shift = crowdShift(state, p);
            return <Piece key={p.id} player={p} art={who[p.id]} layout={layout} isTurn={currentIs(state, p.id)} crowd={shift.x} lift={shift.y} />;
          })}
        </div>

        <div className="dgb-hud" style={{ left: 10, top: 10, right: 120 }}>
          <span className="dgb-chip">
            {walking ? (
              <>
                <b>{state.moveBudget}</b>
                <span>{state.moveBudget === 1 ? "step left" : "steps left"}</span>
              </>
            ) : (
              <span>{mover ? `${mover.name}${here ? ` · ${here}` : ""}` : "Harrington House"}</span>
            )}
          </span>
        </div>
        <div className="dgb-hud" style={{ right: 10, top: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="dgb-btn" aria-label="Zoom in" onClick={() => (setFit(false), setZoomPick(Math.min(1.8, zoom + 0.15)))}>
            <Plus className="size-4" />
          </button>
          <button type="button" className="dgb-btn" aria-label="Zoom out" onClick={() => (setFit(false), setZoomPick(Math.max(0.35, zoom - 0.15)))}>
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            className="dgb-btn"
            aria-label="Show the whole house"
            onClick={() => (setFit((v) => !v), setPan({ x: 0, y: 0 }))}
          >
            <Maximize2 className="size-4" />
          </button>
          <button type="button" className="dgb-btn" aria-label="Change the camera angle" onClick={() => setTiltIx((i) => (i + 1) % TILTS.length)}>
            <Box className="size-4" />
          </button>
        </div>
        {walking && interactive ? (
          <div className="dgb-hud" style={{ left: 10, right: 10, bottom: 10, display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
            <span className="dgb-chip">Tap a lit square. A doorway ends your walk.</span>
            {onStop ? (
              <button type="button" className="dgb-stop" onClick={onStop}>
                Stop here
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
  if (mates.length < 2) return { x: 0, y: 0 };
  const i = Math.max(0, mates.findIndex((other) => other.id === player.id));
  const inRoom = player.position.kind === "room";
  const cols = Math.min(inRoom ? 4 : 3, mates.length);
  const col = i % cols;
  const row = Math.floor(i / cols);
  const rowCount = Math.ceil(mates.length / cols);
  const inRow = Math.min(cols, mates.length - row * cols);
  const gap = inRoom ? 26 : 20;
  return { x: (col - (inRow - 1) / 2) * gap, y: (row - (rowCount - 1) / 2) * 20 };
}

/** Where a guest's feet are, in board pixels. */
function anchor(player: Player, layout: BoardLayout) {
  if (player.position.kind === "hall") {
    return { x: player.position.x * CELL + CELL / 2, y: player.position.y * CELL + CELL / 2 };
  }
  const roomId = player.position.roomId;
  const room = layout.rooms.find((r) => r.id === roomId);
  if (!room) return { x: CELL / 2, y: CELL / 2 };
  return { x: (room.x + room.w / 2) * CELL, y: (room.y + room.h / 2) * CELL + 8 };
}

function Piece({ player, art, layout, isTurn, crowd, lift }: { player: Player; art: string; layout: BoardLayout; isTurn: boolean; crowd: number; lift: number }) {
  const at = anchor(player, layout);
  const cut = charCutout({ id: art } as never);
  const face = portraitFor(player.seat);
  return (
    <div
      className={cn("dgb-tok", isTurn && "turn")}
      style={{ transform: `translate3d(${at.x + crowd}px, ${at.y + lift}px, 4px)`, ["--tok" as string]: player.color }}
      title={player.name}
    >
      <span className="dgb-base" />
      <div className="dgb-stand">
        {cut ? (
          <img src={cut} alt="" draggable={false} />
        ) : (
          <img
            className="bust"
            src={portraitArt(player.avatar) ?? face.src}
            alt=""
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        )}
        {isTurn ? <span className="dgb-name">{player.name.split(" ")[0]}</span> : null}
      </div>
    </div>
  );
}
