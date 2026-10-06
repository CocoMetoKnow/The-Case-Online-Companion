import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  blockedHallsFor,
  layoutFor,
  posKey,
  reachable,
  reconstructPath,
  roomLabel,
  type BoardLayout,
  type Rect,
} from "@/lib/game/board";
import type { GameState, PiecePos, Player } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { characterColor } from "@/lib/game/character-colors";
import { Camera, Crosshair, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { portraitFor } from "@/lib/game/cast";
import { portraitArt } from "@/lib/game/cards";
import { charCutout } from "@/lib/game/scene-art";

/**
 * The digital board: the painted house, one fixed floor plan. The marble squares in the picture are the squares
 * guests walk on, the gaps in the walls are the doorways, and the ten rooms never move. Hidden rooms (a stop in the
 * middle of a secret passage) are not on the house at all: a guest in one stands on a small plaque on the lawn.
 *
 * Only the guests stand up: each one is a small round base with a cut-out figure on it, a little shadow, so they read as
 * 3D while standing perfectly upright. The whole house starts scaled to fit the space it is given. It never zooms or turns by
 * pinching or dragging: one camera button in the middle of the bottom bar opens a flat control strip: a thumb stick in
 * the middle that moves the view, turn left and right, and zoom. A Recenter button shows up only after the view has been moved. The house is always drawn flat, top down, at every angle, and it
 * is fitted between the top bar and the bottom bar so the hidden rooms on the lawn are never covered. To move, tap anywhere near a lit square. Any square the roll can reach is a
 * destination, and a tap that lands close to one snaps to it. After walking into a room the steps left over can still
 * be used, by a door or by a secret passage, and the passage buttons at the bottom of the board say where each goes.
 */
const BOARD_CSS = `
.dgb-frame{position:relative;width:100%;height:100%;min-height:200px;overflow:hidden;border-radius:14px;
 background:radial-gradient(120% 100% at 50% 40%,#16241d 0%,#0c1511 70%,#070c0a 100%);
 box-shadow:inset 0 0 0 1px var(--j-ring,#9db4e640),0 8px 24px rgba(0,0,0,.45)}
.dgb-view{position:absolute;inset:0;touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.dgb-world{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .32s ease}
.dgb-upright{transition:transform .32s ease}
.dgb-tile{position:absolute;z-index:3;pointer-events:none;border-radius:4px;background:color-mix(in srgb,var(--tint) 80%,transparent);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--tint) 55%,#000),0 0 9px color-mix(in srgb,var(--tint) 70%,transparent)}
.dgb-dock{pointer-events:auto;grid-column:1/-1;grid-row:1;height:64px;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 8px;border-radius:16px;background:rgba(246,241,230,.97);border:1px solid #c4b396;box-shadow:0 4px 14px rgba(0,0,0,.6);color:#1c2430}
.dgb-side{display:flex;align-items:center;gap:6px}
.dgb-ctl{pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:46px;height:48px;padding:2px;border-radius:10px;background:#fff;color:#1c2430;border:1px solid #c4b396;font-size:9px;font-weight:700;line-height:1.05;text-align:center}
.dgb-stick{position:relative;flex:none;width:62px;height:62px;border-radius:50%;background:radial-gradient(#e9dfc8,#c9b999);border:2px solid #9b8760;touch-action:none;-webkit-user-select:none;user-select:none}
.dgb-knob{position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:#2a1e0c;border:2px solid #f0cf7a;box-shadow:0 2px 5px rgba(0,0,0,.6)}
.dgb-recenter{position:absolute;z-index:13;left:50%;bottom:76px;transform:translateX(-50%);pointer-events:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;background:#2a1e0c;color:#fbe9b4;border:2px solid #f0cf7a;font-size:12px;font-weight:800;box-shadow:0 4px 10px rgba(0,0,0,.55)}
.dgb-recenter:active{transform:translateX(-50%) scale(.96)}
.dgb-ctl:active:not(:disabled){transform:scale(.95)}
.dgb-ctl:disabled{opacity:.4}
.dgb-bar{position:absolute;z-index:12;left:0;right:0;bottom:0;height:68px;padding:0 8px;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:8px;pointer-events:none}
.dgb-cam{pointer-events:auto;grid-column:2;width:48px;height:48px;border-radius:999px;display:grid;place-items:center;background:#f6f1e6;color:#1c2430;border:2px solid #c4b396;box-shadow:0 3px 10px rgba(0,0,0,.55)}
.dgb-cam:active{transform:scale(.94)}
.dgb-ctl{pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:64px;min-height:48px;padding:4px 8px;border-radius:10px;background:#fff;color:#1c2430;border:1px solid #c4b396;font-size:10px;font-weight:700;line-height:1.05;text-align:center}
.dgb-ctl:active:not(:disabled){transform:scale(.95)}
.dgb-ctl:disabled{opacity:.4}
.dgb-passbtn{pointer-events:auto;min-width:0;max-width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:6px 10px;border-radius:12px;background:#2a1e0c;color:#fbe9b4;border:2px solid #f0cf7a;box-shadow:0 4px 10px rgba(0,0,0,.55);font-size:12px;font-weight:800;line-height:1.1;text-align:left}
.dgb-passbtn span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dgb-passbtn small{font-size:9px;font-weight:600;opacity:.85;white-space:nowrap}
.dgb-passbtn:active{transform:scale(.96)}
.dgb-reach{position:absolute;z-index:4;pointer-events:none;border-radius:3px;background:rgba(120,245,160,.46);box-shadow:inset 0 0 0 2px #2fb463,0 0 10px rgba(47,180,99,.75);animation:dgb-pulse 1.2s ease-in-out infinite}
.dgb-reach.edge{background:rgba(240,200,100,.45);box-shadow:inset 0 0 0 2px #f0cf7a,0 0 10px rgba(240,207,122,.75)}
.dgb-reach.pick{background:rgba(255,255,255,.55);box-shadow:inset 0 0 0 3px #fff,0 0 16px #fff}
.dgb-path{position:absolute;left:0;top:0;pointer-events:none;z-index:6}
.dgb-tok{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;transition-property:transform;transition-timing-function:linear}
.dgb-shadow{position:absolute;left:calc(var(--bw) * -.65);top:calc(var(--bh) * -.3);width:calc(var(--bw) * 1.3);height:calc(var(--bh) * 1.1);border-radius:50%;background:radial-gradient(#000a,#0000 70%)}
.dgb-base{position:absolute;left:calc(var(--bw) * -.5);top:calc(var(--bh) * -.5);width:var(--bw);height:var(--bh);border-radius:50%;
 background:radial-gradient(ellipse at 36% 28%,#ffffffb0,transparent 42%),var(--tok,#ddd);
 box-shadow:0 0 0 1.5px #120d0a,0 calc(var(--bh) * .34) 0 -0.5px color-mix(in srgb,var(--tok,#ddd) 55%,#000),0 calc(var(--bh) * .34) 0 1px #120d0a,0 calc(var(--bh) * .6) calc(var(--bh) * .4) rgba(0,0,0,.55)}
.dgb-tok.turn .dgb-base{animation:dgb-ring 1.3s ease-in-out infinite}
.dgb-stand{position:absolute;left:calc(var(--fw) * -.5);bottom:calc(var(--bh) * .1);width:var(--fw);height:var(--fh);transform-origin:50% 100%}
.dgb-stand img{position:absolute;left:0;bottom:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(1.5px 3px 2px rgba(0,0,0,.7)) saturate(1.06) contrast(1.04)}
.dgb-stand img.bust{height:auto;width:100%;aspect-ratio:1;bottom:12%;border-radius:50%;object-fit:cover;border:2.5px solid var(--tok,#ddd);background:#1a1410}
.dgb-tok.turn .dgb-stand{animation:dgb-bob 1.4s ease-in-out infinite}
.dgb-name{position:absolute;left:50%;top:calc(var(--fh) * -.02);transform:translate(-50%,-100%);white-space:nowrap;line-height:1;color:#1c2430;background:#f6f1e6;padding:.22em .5em;border-radius:.5em;font-weight:700;box-shadow:inset .25em 0 0 #a83434,0 2px 6px rgba(0,0,0,.55)}
.dgb-hud{position:absolute;z-index:11;pointer-events:none}
.dgb-chip{pointer-events:auto;min-width:0;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:12px;background:#f6f1e6;color:#1c2430;font-size:12px;line-height:1.25;border:1px solid #c4b396;box-shadow:inset 3px 0 0 #a83434,0 4px 10px rgba(0,0,0,.45);max-width:100%}
.dgb-chip b{font-family:var(--font-display,serif);font-size:20px;font-weight:700;line-height:1}
.dgb-stop{pointer-events:auto;padding:9px 18px;border-radius:999px;background:#f6f1e6;color:#1c2430;font-weight:700;font-size:13px;border:1px solid #1a2b50;box-shadow:0 4px 10px rgba(0,0,0,.5)}
.dgb-stop:active{transform:scale(.96)}
@keyframes dgb-hlpulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes dgb-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.28)}}
@keyframes dgb-ring{0%,100%{box-shadow:0 0 0 1.5px #120d0a,0 0 0 4px #ffe9a0,0 0 14px 5px rgba(255,226,140,.8),0 calc(var(--bh) * .34) 0 1px #120d0a}50%{box-shadow:0 0 0 1.5px #120d0a,0 0 0 4px #fff3c4,0 0 22px 9px rgba(255,226,140,.95),0 calc(var(--bh) * .34) 0 1px #120d0a}}
@keyframes dgb-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4%)}}
@media (prefers-reduced-motion:reduce){.dgb-world,.dgb-upright{transition:none!important}.dgb-reach,.dgb-room.reach,.dgb-tok.turn .dgb-base,.dgb-tok.turn .dgb-stand{animation:none}.dgb-tok{transition:none!important}}

.dgb-house{position:absolute;left:0;top:0;display:block;max-width:none;border-radius:10px;pointer-events:none;-webkit-user-drag:none}
.dgb-room{position:absolute;z-index:2;pointer-events:none;border-radius:10px}
.dgb-room.reach{z-index:5;box-shadow:inset 0 0 0 6px #2fb463,0 0 28px 6px rgba(47,180,99,.8);background:rgba(120,245,160,.16);animation:dgb-pulse 1.2s ease-in-out infinite}
.dgb-room.reach.edge{box-shadow:inset 0 0 0 6px #f0cf7a,0 0 28px 6px rgba(240,207,122,.8);background:rgba(240,200,100,.16)}
.dgb-room.reach.pick{box-shadow:inset 0 0 0 8px #fff,0 0 40px 10px #fff;background:rgba(255,255,255,.2)}
.dgb-tag{position:absolute;z-index:3;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:.3em;pointer-events:none;max-width:90%}
.dgb-plaque{padding:.2em .6em;border-radius:3px;background:rgba(0,0,0,.82);color:#fff;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;line-height:1.15;box-shadow:0 0 0 1px #b8923e}
.dgb-note{padding:.15em .45em;background:#f6f1e6;color:#1c2430;font-weight:700;line-height:1.1;box-shadow:0 2px 5px rgba(0,0,0,.55);white-space:nowrap;font-size:.82em}
.dgb-pocket{position:absolute;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:.25em;padding-top:.5em;border-radius:18px;border:5px solid #b8923e;background:rgba(10,12,16,.82);color:#e9dcc0;text-align:center;box-shadow:0 0 0 4px #000}
.dgb-pocket b{font-family:var(--font-display,serif);color:#fff;line-height:1.05}
.dgb-pocket span{letter-spacing:.14em;text-transform:uppercase;opacity:.85}
.dgb-pocket.reach{box-shadow:0 0 0 4px #000,0 0 30px 8px rgba(47,180,99,.85);border-color:#2fb463}
.dgb-pocket.reach.edge{box-shadow:0 0 0 4px #000,0 0 30px 8px rgba(240,207,122,.85);border-color:#f0cf7a}
.dgb-pocket.reach.pick{border-color:#fff;box-shadow:0 0 0 4px #000,0 0 40px 10px #fff}
`;

/** Room kept clear for the top bar (steps, Stay here) and the bottom bar (camera button, secret passages). */
const PAD_TOP = 60;
const PAD_BOTTOM = 72;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** How big one marble square is on the picture, on average. Pieces and labels are sized from it. */
const TILE = 66;
/** How far in the zoom button goes, one press at a time. 1 is the whole house. */
const ZOOMS = [1, 1.5, 2.2, 3.2];
/** Quarter turns as exact numbers, so a turned board never picks up rounding noise. */
const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

/** Where the hidden rooms are kept: two small plaques on the lawn below the house. Not part of the map. */
const POCKETS: Rect[] = [
  { x: 70, y: 1950, w: 580, h: 180 },
  { x: 1096, y: 1950, w: 580, h: 180 },
];

/** Seat order for guests who have not picked a character. */
const DEFAULT_FIGURES = ["miss-scarlet", "lady-violet", "dr-finch", "chef-marco", "colonel-mustard", "professor-plum", "the-butler", "mrs-peacock", "mr-green", "mrs-white"];

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

function rectDist(px: number, py: number, l: number, t: number, r: number, b: number) {
  const dx = px < l ? l - px : px > r ? px - r : 0;
  const dy = py < t ? t - py : py > b ? py - b : 0;
  return Math.hypot(dx, dy);
}

/** The area a room covers on the board: its place on the picture, or its plaque on the lawn when it is hidden. */
function areaOf(layout: BoardLayout, roomId: string): Rect | null {
  const room = layout.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  if (!room.hidden) return room.rect;
  const slot = layout.rooms.filter((r) => r.hidden).findIndex((r) => r.id === roomId);
  return POCKETS[slot] ?? null;
}

/**
 * Guests walk square by square across the board, however far a tap sent them. The game state jumps straight to
 * the destination, so this only decides where each piece is drawn on its way there.
 */
function useWalkers(players: Player[], layout: BoardLayout, enabled: string[], passages: Array<{ a: string; b: string }>) {
  const at = useRef<Record<string, PiecePos>>({});
  const goal = useRef<Record<string, string>>({});
  const timers = useRef<Record<string, number[]>>({});
  const [shown, setShown] = useState<Record<string, { pos: PiecePos; ms: number }>>(() =>
    Object.fromEntries(players.map((p) => [p.id, { pos: p.position, ms: 260 }])),
  );
  const sig = players.map((p) => `${p.id}=${posKey(p.position)}`).join("|");
  useEffect(() => {
    for (const p of players) {
      const key = posKey(p.position);
      if (goal.current[p.id] === key) continue;
      goal.current[p.id] = key;
      (timers.current[p.id] ?? []).forEach((t) => window.clearTimeout(t));
      timers.current[p.id] = [];
      const from = at.current[p.id];
      let path: PiecePos[] = [];
      if (from && posKey(from) !== key) {
        const { nodes } = reachable(from, 80, enabled, passages, new Set(), layout);
        path = reconstructPath(nodes, p.position);
      }
      if (path.length < 3 || path.length > 45) {
        at.current[p.id] = p.position;
        setShown((s) => ({ ...s, [p.id]: { pos: p.position, ms: 260 } }));
        continue;
      }
      const ms = clamp(1500 / path.length, 45, 110);
      path.slice(1).forEach((pos, i) => {
        timers.current[p.id].push(
          window.setTimeout(() => {
            at.current[p.id] = pos;
            setShown((s) => ({ ...s, [p.id]: { pos, ms } }));
          }, i * ms),
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, layout]);
  useEffect(
    () => () => {
      Object.values(timers.current).forEach((list) => list.forEach((t) => window.clearTimeout(t)));
    },
    [],
  );
  return shown;
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
  const passages = state.passages ?? [];
  const anywhere = interactive && state.phase === "event" && state.event?.kind === "move-anywhere";
  const walking = Boolean(interactive && actor && state.phase === "move");
  const reach = useMemo(
    () =>
      walking && actor
        ? reachable(actor.position, state.moveBudget, enabled, passages, blockedHallsFor(state.players, actor.id), layout)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walking, actor?.id, actor && posKey(actor.position), state.moveBudget, state.players, layout, enabled, state.passages],
  );
  const who = useMemo(() => figures(state.players), [state.players]);
  /** A guest's own color: their character's (Mr. Take is maroon), or the seat color until a character is picked. */
  const tintOf = (p: Player) => characterColor(p.avatar) ?? p.color;
  const shown = useWalkers(state.players, layout, enabled, passages);

  const worldW = layout.width;
  const worldH = layout.height;
  const hiddenRooms = layout.rooms.filter((r) => r.hidden);

  const view = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 520 });
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 380, h: el.clientHeight || 520 });
    read();
    const watcher = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    watcher?.observe(el);
    window.addEventListener("orientationchange", read);
    return () => {
      watcher?.disconnect();
      window.removeEventListener("orientationchange", read);
    };
  }, []);

  // Zoom and turn are buttons only. `turns` counts quarter turns (it may go negative so the house spins the short way).
  const [zoomAt, setZoomAt] = useState(0);
  const [turns, setTurns] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [camOpen, setCamOpen] = useState(false);
  const quarter = ((turns % 4) + 4) % 4;
  const cos = COS[quarter];
  const sin = SIN[quarter];
  const zoomed = zoomAt > 0;
  const sideways = quarter % 2 === 1;
  // The house is fitted between the top bar and the bottom bar, so no control ever sits on top of a room.
  const availH = Math.max(120, size.h - PAD_TOP - PAD_BOTTOM);
  const midY = PAD_TOP + availH / 2;
  const fit = Math.max(0.05, Math.min((size.w - 4) / (sideways ? worldH : worldW), (availH - 4) / (sideways ? worldW : worldH)));
  const scale = fit * ZOOMS[zoomAt];
  const inv = 1 / scale;
  const upright = `rotate(${-turns * 90}deg)`;
  /** A spot on the house as it is drawn on the screen: where it sits after the turn, left to right and top to bottom. */
  const rotX = (x: number, y: number) => x * cos - y * sin;
  const rotY = (x: number, y: number) => x * sin + y * cos;
  const spot = (pos: PiecePos): { x: number; y: number } => {
    if (pos.kind === "hall") {
      const t = layout.tiles.find((tile) => tile.x === pos.x && tile.y === pos.y);
      return t ? { x: t.px.x + t.px.w / 2, y: t.px.y + t.px.h * 0.62 } : { x: TILE, y: TILE };
    }
    const a = areaOf(layout, pos.roomId);
    return a ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : { x: TILE, y: TILE };
  };

  // Zoomed in, the view follows the guest whose turn it is. The thumb stick moves it from there.
  const focusPos = actor ? shown[actor.id]?.pos ?? actor.position : null;
  const focus = zoomed && focusPos ? spot(focusPos) : { x: worldW / 2, y: worldH / 2 };
  const offX = size.w / 2 + pan.x - scale * rotX(focus.x, focus.y);
  const offY = midY + pan.y - scale * rotY(focus.x, focus.y);

  const zoomTo = (next: number) => {
    const at = clamp(next, 0, ZOOMS.length - 1);
    setZoomAt(at);
    if (at === 0) setPan({ x: 0, y: 0 });
  };
  // Thumb stick: while it is held away from the middle the view glides that way. Screen directions, whatever the turn.
  const stickVec = useRef({ x: 0, y: 0 });
  const stickBox = useRef<{ x: number; y: number } | null>(null);
  const panLimit = useRef(0);
  panLimit.current = (Math.max(worldW, worldH) * scale) / 2;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const STICK_R = 20;
  const stickTo = (clientX: number, clientY: number) => {
    const c = stickBox.current;
    if (!c) return;
    const dx = clientX - c.x;
    const dy = clientY - c.y;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_R ? STICK_R / d : 1;
    setKnob({ x: dx * k, y: dy * k });
    stickVec.current = { x: (dx * k) / STICK_R, y: (dy * k) / STICK_R };
  };
  const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    stickBox.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    stickTo(e.clientX, e.clientY);
  };
  const stickUp = () => {
    stickBox.current = null;
    stickVec.current = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
  };
  useEffect(() => {
    if (!camOpen) return;
    let raf = 0;
    const tick = () => {
      const v = stickVec.current;
      const mag = Math.hypot(v.x, v.y);
      if (mag > 0.08) {
        const speed = 10 * mag * mag;
        const lim = panLimit.current;
        // Pushing the stick right moves the camera right, so the house slides left.
        setPan((p) => ({ x: clamp(p.x - (v.x / mag) * speed, -lim, lim), y: clamp(p.y - (v.y / mag) * speed, -lim, lim) }));
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [camOpen]);
  const moved = Math.abs(pan.x) > 2 || Math.abs(pan.y) > 2;
  const labelPx = clamp(10.5, 9, 14) * inv;
  const pieceH = clamp(TILE * scale * 1.7, 30, 84) * inv;
  const pieceBaseW = pieceH * 0.4;
  const pieceBaseH = pieceBaseW * 0.52;
  const pieceW = pieceH * 0.56;

  // Every square a tap could land on, with how far it is. A room is one destination.
  const targets = useMemo(() => {
    const out: Array<{ key: string; pos: PiecePos; boxes: Array<[number, number, number, number]>; dist: number }> = [];
    const roomTarget = (roomId: string, dist: number) => {
      const a = areaOf(layout, roomId);
      if (!a) return;
      out.push({ key: `r:${roomId}`, pos: { kind: "room", roomId }, boxes: [[a.x, a.y, a.x + a.w, a.y + a.h]], dist });
    };
    if (anywhere) {
      for (const room of layout.rooms) if (enabled.includes(room.id)) roomTarget(room.id, 1);
    } else if (reach) {
      for (const node of reach.nodes.values()) {
        if (node.dist < 1) continue;
        if (node.pos.kind === "hall") {
          const t = layout.tiles.find((tile) => tile.x === (node.pos as { x: number }).x && tile.y === (node.pos as { y: number }).y);
          if (t) out.push({ key: posKey(node.pos), pos: node.pos, boxes: [[t.px.x, t.px.y, t.px.x + t.px.w, t.px.y + t.px.h]], dist: node.dist });
        } else {
          roomTarget(node.pos.roomId, node.dist);
        }
      }
    }
    return out;
  }, [anywhere, reach, layout, enabled]);
  const targetByKey = useMemo(() => new Map(targets.map((t) => [t.key, t])), [targets]);

  /** The lit square a screen point means: the one under it, or the nearest within a thumb's width. */
  const pick = (clientX: number, clientY: number) => {
    const box = view.current?.getBoundingClientRect();
    if (!box || !targets.length) return null;
    // Undo the turn and the zoom: the screen point becomes a point on the picture.
    const vx = clientX - box.left - offX;
    const vy = clientY - box.top - offY;
    const bx = (vx * cos + vy * sin) / scale;
    const by = (-vx * sin + vy * cos) / scale;
    const reachPx = clamp(26 / scale, TILE * 0.9, TILE * 2.4);
    let best: (typeof targets)[number] | null = null;
    let bestD = Infinity;
    for (const t of targets) {
      let d = Infinity;
      for (const [l, tp, r, b] of t.boxes) {
        d = Math.min(d, rectDist(bx, by, l, tp, r, b));
        if (d === 0) break;
      }
      // A room is a big target: prefer a corridor square the finger is really on over a room it only grazes.
      const score = d === 0 ? (t.pos.kind === "room" ? 0.01 : 0) : d;
      if (score < bestD) {
        best = t;
        bestD = score;
      }
    }
    return best && bestD <= reachPx ? best : null;
  };

  const downAt = useRef<{ x: number; y: number; t: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    downAt.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = downAt.current;
    downAt.current = null;
    if (!d || !targets.length) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14 || Date.now() - d.t > 900) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit) {
      setHover(null);
      onMove(hit.pos);
    }
  };
  const onHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !targets.length) {
      if (hover) setHover(null);
      return;
    }
    const hit = pick(e.clientX, e.clientY);
    const next = hit?.key ?? null;
    if (next !== hover) setHover(next);
  };

  const hoverPath = useMemo(() => {
    if (!hover || !reach) return [];
    const target = targetByKey.get(hover);
    return target ? reconstructPath(reach.nodes, target.pos) : [];
  }, [hover, reach, targetByKey]);

  // Secret passages out of the room the walking guest is standing in, each one a button that says where it goes.
  const passageOptions = useMemo(() => {
    const out: Array<{ pos: PiecePos; name: string; hidden: boolean }> = [];
    if (!walking || !reach || !actor || actor.position.kind !== "room" || state.moveBudget < 1) return out;
    const hereKey = posKey(actor.position);
    for (const node of reach.nodes.values()) {
      if (node.dist !== 1 || node.prev !== hereKey || node.pos.kind !== "room") continue;
      const id = node.pos.roomId;
      out.push({ pos: node.pos, name: roomLabel(state, id, layout), hidden: Boolean(layout.rooms.find((r) => r.id === id)?.hidden) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, reach, actor?.id, actor && posKey(actor.position), state.moveBudget, layout]);

  const here = actor?.position.kind === "room" ? roomLabel(state, actor.position.roomId, layout) : "";
  const turnId = state.turnOrder[state.turnIndex % Math.max(1, state.turnOrder.length)];

  const lit = (roomId: string) => {
    const t = targetByKey.get(`r:${roomId}`);
    return t ? cn("reach", !anywhere && t.dist >= state.moveBudget && "edge", hover === t.key && "pick") : "";
  };

  // Where each guest stands. Guests sharing a spot spread out, so nobody hides behind another.
  const crowd = (player: Player) => {
    const mates = state.players.filter((o) => posKey(shown[o.id]?.pos ?? o.position) === posKey(shown[player.id]?.pos ?? player.position));
    const pos = shown[player.id]?.pos ?? player.position;
    const base = spot(pos);
    if (mates.length < 2) return { x: base.x, y: pos.kind === "room" ? base.y + TILE * 0.5 : base.y };
    const i = Math.max(0, mates.findIndex((o) => o.id === player.id));
    if (pos.kind === "hall") return { x: base.x + (i % 2 ? 1 : -1) * TILE * 0.18, y: base.y };
    const a = areaOf(layout, pos.roomId);
    const cols = Math.min(mates.length, 4);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const gap = Math.min(pieceW * 1.05, ((a?.w ?? 400) * 0.8) / cols);
    const inRow = Math.min(cols, mates.length - row * cols);
    return { x: base.x + (col - (inRow - 1) / 2) * gap, y: base.y + TILE * 0.5 + (row - (Math.ceil(mates.length / cols) - 1) / 2) * pieceH * 0.55 };
  };

  return (
    <div className={cn("dgb-frame", className)}>
      <style>{BOARD_CSS}</style>
      <div
        ref={view}
        className="dgb-view"
        role="application"
        aria-label={walking || anywhere ? "House board. Tap a lit square to go there." : "House board"}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => (downAt.current = null)}
        onPointerMove={onHover}
        onPointerLeave={() => setHover(null)}
      >
        <div
          ref={world}
          className="dgb-world"
          style={{ width: worldW, height: worldH, transform: `translate(${offX}px, ${offY}px) rotate(${turns * 90}deg) scale(${scale})` } as CSSProperties}
        >
          <img className="dgb-house" src="/board/house.jpg" width={worldW} height={worldH} alt="" draggable={false} />

          {layout.rooms
            .filter((room) => !room.hidden)
            .map((room) => {
              const links = passages
                .filter((p) => p.a === room.id || p.b === room.id)
                .map((p) => (p.a === room.id ? p.b : p.a))
                .map((other) => (layout.rooms.find((r) => r.id === other)?.hidden ? "Secret passage" : roomLabel(state, other, layout)));
              const name = roomLabel(state, room.id, layout);
              return (
                <div key={room.id}>
                  <div
                    className={cn("dgb-room", lit(room.id))}
                    style={{ left: room.rect.x, top: room.rect.y, width: room.rect.w, height: room.rect.h }}
                    role="img"
                    aria-label={`${name}${links.length ? `, secret passage to ${links.join(", ")}` : ""}`}
                  />
                  <div
                    className="dgb-tag dgb-upright"
                    style={{
                      left: room.rect.x + room.rect.w / 2,
                      top: room.rect.y + room.rect.h * (sideways ? 0.5 : 0.1),
                      fontSize: labelPx,
                      transformOrigin: sideways ? "50% 50%" : "50% 0",
                      transform: `translate(-50%, ${sideways ? "-50%" : "0"}) ${upright}`,
                    }}
                  >
                    <span className="dgb-plaque">{name}</span>
                    {links.length ? <span className="dgb-note">⇄ {links.join(", ")}</span> : null}
                  </div>
                </div>
              );
            })}

          {hiddenRooms.map((room, i) => {
            const a = POCKETS[i];
            if (!a) return null;
            const name = roomLabel(state, room.id, layout);
            return (
              <div key={room.id} className={cn("dgb-pocket", lit(room.id))} style={{ left: a.x, top: a.y, width: a.w, height: a.h }} role="img" aria-label={`Hidden room: ${name}`}>
                <div
                  className="dgb-upright"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: sideways ? a.h : a.w,
                    height: sideways ? a.w : a.h,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: ".25em",
                    transform: `translate(-50%, -50%) ${upright}`,
                  }}
                >
                  <span style={{ fontSize: labelPx * 1.1 }}>Hidden room</span>
                  <b style={{ fontSize: labelPx * 1.7 }}>{name}</b>
                  <span style={{ fontSize: labelPx * 0.9 }}>Only through a secret passage</span>
                </div>
              </div>
            );
          })}

          {state.players.map((p) => {
            // Each guest's own square is the one they started on. It stays put when they walk away from it.
            const at = state.spawns?.[p.id];
            if (!at) return null;
            const t = layout.tiles.find((tile) => tile.x === at.x && tile.y === at.y);
            if (!t) return null;
            return (
              <span
                key={`tile-${p.id}`}
                className="dgb-tile"
                title={p.name}
                style={{ left: t.px.x + 3, top: t.px.y + 3, width: t.px.w - 6, height: t.px.h - 6, ["--tint" as string]: tintOf(p) } as CSSProperties}
              />
            );
          })}

          {targets
            .filter((t) => t.pos.kind === "hall")
            .map((t) => {
              const [l, tp, r, b] = t.boxes[0];
              return (
                <span
                  key={`g-${t.key}`}
                  className={cn("dgb-reach", t.dist >= state.moveBudget && !anywhere && "edge", hover === t.key && "pick")}
                  style={{ left: l + 4, top: tp + 4, width: r - l - 8, height: b - tp - 8 }}
                />
              );
            })}

          {hoverPath.length > 1 ? (
            <svg className="dgb-path" width={worldW} height={worldH} aria-hidden="true">
              <polyline
                points={hoverPath
                  .map((p) => {
                    const c = spot(p);
                    return `${c.x},${p.kind === "hall" ? c.y - TILE * 0.12 : c.y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#fff"
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4 24"
              />
            </svg>
          ) : null}

          {[...state.players]
            .map((p) => ({ p, at: crowd(p) }))
            .sort((a, b) => rotY(a.at.x, a.at.y) - rotY(b.at.x, b.at.y))
            .map(({ p, at }) => (
              <Piece
                key={p.id}
                player={p}
                art={who[p.id]}
                isTurn={turnId === p.id}
                x={at.x}
                y={at.y}
                depth={rotY(at.x, at.y) + worldW + worldH}
                tint={tintOf(p)}
                upright={upright}
                ms={shown[p.id]?.ms ?? 260}
                dims={{ fh: pieceH, fw: pieceW, bw: pieceBaseW, bh: pieceBaseH, tag: labelPx }}
              />
            ))}
        </div>
      </div>

      <div className="dgb-hud" style={{ left: 8, top: 8, right: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span className="dgb-chip">
          {anywhere ? (
            <span>Tap any room</span>
          ) : walking ? (
            <>
              <b>{state.moveBudget}</b>
              <span>
                {state.moveBudget === 1 ? "step" : "steps"} · {actor?.position.kind === "room" ? "tap a lit square or use a secret passage" : "tap a lit square"}
              </span>
            </>
          ) : (
            <span>{actor ? `${actor.name}${here ? ` · ${here}` : ""}` : "Harrington House"}</span>
          )}
        </span>
        {walking && onStop ? (
          <button type="button" className="dgb-stop" onClick={onStop}>
            Stay here
          </button>
        ) : null}
      </div>

      {moved ? (
        <button type="button" className="dgb-recenter" onClick={() => setPan({ x: 0, y: 0 })} aria-label="Recenter the view" title="Recenter the view">
          <Crosshair size={16} />
          Recenter
        </button>
      ) : null}

      <div className="dgb-bar">
        {camOpen ? (
          <div className="dgb-dock" role="group" aria-label="Camera controls">
            <div className="dgb-side">
              <button type="button" className="dgb-ctl" onClick={() => setTurns((n) => n - 1)} aria-label="Turn the house left" title="Turn the house left">
                <RotateCcw size={18} />
                Turn left
              </button>
              <button type="button" className="dgb-ctl" onClick={() => zoomTo(zoomAt - 1)} disabled={zoomAt <= 0} aria-label="Zoom out" title="Zoom out">
                <ZoomOut size={18} />
                Zoom out
              </button>
            </div>
            <div
              className="dgb-stick"
              role="application"
              aria-label="Thumb stick: move the view"
              onPointerDown={stickDown}
              onPointerMove={(e) => stickBox.current && stickTo(e.clientX, e.clientY)}
              onPointerUp={stickUp}
              onPointerCancel={stickUp}
            >
              <span className="dgb-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
            </div>
            <div className="dgb-side">
              <button type="button" className="dgb-ctl" onClick={() => zoomTo(zoomAt + 1)} disabled={zoomAt >= ZOOMS.length - 1} aria-label="Zoom in" title="Zoom in">
                <ZoomIn size={18} />
                Zoom in
              </button>
              <button type="button" className="dgb-ctl" onClick={() => setTurns((n) => n + 1)} aria-label="Turn the house right" title="Turn the house right">
                <RotateCw size={18} />
                Turn right
              </button>
              <button type="button" className="dgb-ctl" onClick={() => setCamOpen(false)} aria-label="Close camera controls" title="Close camera controls">
                <X size={18} />
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {passageOptions[1] ? <PassageButton option={passageOptions[0]} onMove={onMove} style={{ gridColumn: 1, gridRow: 1, justifySelf: "end" }} /> : null}
            <button type="button" className="dgb-cam" style={{ gridRow: 1 }} onClick={() => setCamOpen(true)} aria-label="Open camera controls" aria-expanded={false} title="Camera">
              <Camera size={22} />
            </button>
            {passageOptions.length ? (
              <PassageButton option={passageOptions[passageOptions.length > 1 ? 1 : 0]} onMove={onMove} style={{ gridColumn: 3, gridRow: 1, justifySelf: "start" }} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function PassageButton({ option, onMove, style }: { option: { pos: PiecePos; name: string; hidden: boolean }; onMove: (pos: PiecePos) => void; style?: CSSProperties }) {
  return (
    <button type="button" className="dgb-passbtn" style={style} onClick={() => onMove(option.pos)}>
      <span>⇄ {option.name}</span>
      <small>{option.hidden ? "Hidden room · 1 step" : "Secret passage · 1 step"}</small>
    </button>
  );
}

function Piece({
  player,
  art,
  isTurn,
  x,
  y,
  depth,
  tint,
  upright,
  ms,
  dims,
}: {
  player: Player;
  art: string;
  isTurn: boolean;
  x: number;
  y: number;
  /** How far toward the viewer the piece is on the screen, so nearer pieces draw over farther ones. */
  depth: number;
  tint: string;
  /** Undoes the turn of the house so the figure always stands upright. */
  upright: string;
  ms: number;
  dims: { fh: number; fw: number; bw: number; bh: number; tag: number };
}) {
  const cut = charCutout({ id: art } as never);
  const face = portraitFor(player.seat);
  return (
    <div
      className={cn("dgb-tok", isTurn && "turn")}
      title={player.name}
      style={
        {
          transform: `translate(${x}px, ${y}px)`,
          transitionDuration: `${ms}ms`,
          zIndex: 10 + Math.round(depth),
          ["--tok" as string]: tint,
          ["--fh" as string]: `${dims.fh}px`,
          ["--fw" as string]: `${dims.fw}px`,
          ["--bw" as string]: `${dims.bw}px`,
          ["--bh" as string]: `${dims.bh}px`,
        } as CSSProperties
      }
    >
      <div className="dgb-upright" style={{ transform: upright }}>
      <span className="dgb-shadow" />
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
        {isTurn ? (
          <span className="dgb-name" style={{ fontSize: dims.tag }}>
            {player.name.split(" ")[0]}
          </span>
        ) : null}
      </div>
      </div>
    </div>
  );
}
