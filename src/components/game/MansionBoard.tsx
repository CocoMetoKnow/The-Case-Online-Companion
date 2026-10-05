import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  blockedHallsFor,
  cellRuns,
  hallCells,
  layoutFor,
  posKey,
  reachable,
  reconstructPath,
  roomCenter,
  roomLabel,
  roomOutline,
  type BoardLayout,
  type RoomSpec,
} from "@/lib/game/board";
import type { GameState, PiecePos, Player } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { portraitFor } from "@/lib/game/cast";
import { defaultCardArt, portraitArt } from "@/lib/game/cards";
import { charCutout, roomBackdrop } from "@/lib/game/scene-art";

/**
 * The digital board, drawn flat and top-down like the printed one.
 *
 * Rooms are big painted panels with thick black outlines and their own footprints (L shapes, bays, wings), and the
 * corridor is one continuous pale marble floor that runs between and around them, with a red carpet frame round the
 * staircase in the middle. Only the guests stand up: each one is a small
 * round base with a cut-out figure on it, a little shadow and a slight lean so they read as 3D.
 *
 * The whole house is always scaled to fit the space it is given. There is no zoom: nothing to pinch, nothing to
 * mis-tap, and iPhone pages are never zoomed by accident. To move, tap anywhere near a lit square. Any square
 * the roll can reach is a destination, and a tap that lands close to one snaps to it.
 */
const CELL = 40;
const PAD = 22;
/** Seat order for guests who have not picked a character. */
const DEFAULT_FIGURES = ["miss-scarlet", "lady-violet", "dr-finch", "chef-marco", "colonel-mustard", "professor-plum", "the-butler", "mrs-peacock", "mr-green", "mrs-white"];

const BOARD_CSS = `
.dgb-frame{position:relative;width:100%;height:100%;min-height:200px;overflow:hidden;border-radius:14px;
 background:radial-gradient(120% 100% at 50% 40%,#16241d 0%,#0c1511 70%,#070c0a 100%);
 box-shadow:inset 0 0 0 1px var(--j-ring,#9db4e640),0 8px 24px rgba(0,0,0,.45)}
.dgb-view{position:absolute;inset:0;touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.dgb-world{position:absolute;left:0;top:0;transform-origin:0 0}
.dgb-ground{position:absolute;inset:0;border-radius:26px;overflow:hidden;box-shadow:0 0 0 4px #050807,0 18px 30px rgba(0,0,0,.55);
 background:
  radial-gradient(circle at 5% 7%,#2f5a37 0 3.4%,transparent 3.8%),radial-gradient(circle at 9% 4%,#27502f 0 2.8%,transparent 3.2%),
  radial-gradient(circle at 95% 6%,#2f5a37 0 3.2%,transparent 3.6%),radial-gradient(circle at 91% 3.5%,#27502f 0 2.6%,transparent 3%),
  radial-gradient(circle at 6% 95%,#2f5a37 0 3.4%,transparent 3.8%),radial-gradient(circle at 94% 94%,#2f5a37 0 3.4%,transparent 3.8%),
  linear-gradient(160deg,#1c3a2d,#122a3c 55%,#173324)}
.dgb-house{position:absolute;border-radius:8px;background:
  repeating-linear-gradient(45deg,rgba(255,255,255,.025) 0 5px,transparent 5px 10px),#1d1b22;
 box-shadow:0 0 0 5px #000,0 0 0 7px #b8923e,inset 0 0 40px rgba(0,0,0,.7)}
.dgb-floor{position:absolute;left:0;top:0;z-index:1;pointer-events:none}
.dgb-atrium{position:absolute;z-index:1;border-radius:4px;display:grid;place-items:center;color:rgba(240,210,130,.9);font-size:${CELL * 0.6}px;
 box-shadow:0 0 0 3px #000,0 0 0 5px #b8923e,inset 0 0 34px rgba(0,0,0,.65);
 background:repeating-linear-gradient(180deg,#8a6038 0 7px,#2e1d10 7px 9px),linear-gradient(135deg,#6e4c2d,#4a3120)}
.dgb-door{position:absolute;z-index:3;background:#d8bb74;box-shadow:inset 0 0 0 1px #8a6d2c}
.dgb-door::after{content:"";position:absolute;background:#d8bb74;box-shadow:0 0 0 1px #8a6d2c}
.dgb-door.door-n::after{left:18%;right:18%;top:-7px;height:9px}
.dgb-door.door-s::after{left:18%;right:18%;bottom:-7px;height:9px}
.dgb-door.door-e::after{top:18%;bottom:18%;right:-7px;width:9px}
.dgb-door.door-w::after{top:18%;bottom:18%;left:-7px;width:9px}
.dgb-reach{position:absolute;z-index:4;pointer-events:none;border-radius:3px;background:rgba(120,245,160,.46);box-shadow:inset 0 0 0 2px #2fb463,0 0 10px rgba(47,180,99,.75);animation:dgb-pulse 1.2s ease-in-out infinite}
.dgb-reach.edge{background:rgba(240,200,100,.45);box-shadow:inset 0 0 0 2px #f0cf7a,0 0 10px rgba(240,207,122,.75)}
.dgb-reach.pick{background:rgba(255,255,255,.55);box-shadow:inset 0 0 0 3px #fff,0 0 16px #fff}
.dgb-room{position:absolute;z-index:2;pointer-events:none}
.dgb-room-art{position:absolute;inset:0;background-size:cover;background-position:center}
.dgb-room-art::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(255,200,115,.22),transparent 66%),linear-gradient(180deg,rgba(0,0,0,.25),transparent 30%,rgba(0,0,0,.4));mix-blend-mode:normal;pointer-events:none}
.dgb-room-edge{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.dgb-hl{stroke:none}
.dgb-label{position:absolute;pointer-events:none;z-index:3}
.dgb-room.reach{z-index:5;filter:drop-shadow(0 0 4px #2fb463) drop-shadow(0 0 10px rgba(47,180,99,.85))}
.dgb-room.reach .dgb-hl{stroke:#2fb463;animation:dgb-hlpulse 1.2s ease-in-out infinite}
.dgb-room.reach.edge{filter:drop-shadow(0 0 4px #f0cf7a) drop-shadow(0 0 10px rgba(240,207,122,.8))}
.dgb-room.reach.edge .dgb-hl{stroke:#f0cf7a}
.dgb-room.pick{filter:drop-shadow(0 0 5px #fff) drop-shadow(0 0 14px rgba(255,255,255,.85))}
.dgb-room.pick .dgb-hl{stroke:#fff;animation:none}
.dgb-plaque{position:absolute;left:50%;top:6%;transform:translateX(-50%);max-width:94%;padding:.18em .55em;border-radius:3px;background:#000;color:#fff;text-align:center;font-weight:800;letter-spacing:.07em;text-transform:uppercase;line-height:1.1;box-shadow:0 2px 6px rgba(0,0,0,.6);z-index:3}
.dgb-plaque.v-s{top:auto;bottom:6%}
.dgb-plaque.v-e,.dgb-plaque.v-w{top:50%;max-width:none;max-height:94%;writing-mode:vertical-rl;padding:.5em .2em;letter-spacing:.02em;font-size:.84em}
.dgb-plaque.v-e{left:auto;right:5%;transform:translateY(-50%)}
.dgb-plaque.v-w{left:5%;transform:translateY(-50%) rotate(180deg)}
.dgb-note{position:absolute;right:3%;bottom:4%;max-width:60%;padding:.15em .4em;background:#f6f1e6;color:#1c2430;font-weight:700;line-height:1.1;transform:rotate(-5deg);box-shadow:0 2px 5px rgba(0,0,0,.55);z-index:3}
.dgb-plaque.v-s~.dgb-note{bottom:auto;top:4%}
.dgb-plaque.v-e~.dgb-note,.dgb-plaque.v-w~.dgb-note{right:auto;left:4%;bottom:3%;max-width:92%}
.dgb-path{position:absolute;left:0;top:0;pointer-events:none;z-index:6}
.dgb-tok{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;transition-property:transform;transition-timing-function:linear}
.dgb-shadow{position:absolute;left:calc(var(--bw) * -.65);top:calc(var(--bh) * -.3);width:calc(var(--bw) * 1.3);height:calc(var(--bh) * 1.1);border-radius:50%;background:radial-gradient(#000a,#0000 70%)}
.dgb-base{position:absolute;left:calc(var(--bw) * -.5);top:calc(var(--bh) * -.5);width:var(--bw);height:var(--bh);border-radius:50%;
 background:radial-gradient(ellipse at 36% 28%,#ffffffb0,transparent 42%),var(--tok,#ddd);
 box-shadow:0 0 0 1.5px #120d0a,0 calc(var(--bh) * .34) 0 -0.5px color-mix(in srgb,var(--tok,#ddd) 55%,#000),0 calc(var(--bh) * .34) 0 1px #120d0a,0 calc(var(--bh) * .6) calc(var(--bh) * .4) rgba(0,0,0,.55)}
.dgb-tok.turn .dgb-base{animation:dgb-ring 1.3s ease-in-out infinite}
.dgb-stand{position:absolute;left:calc(var(--fw) * -.5);bottom:calc(var(--bh) * .1);width:var(--fw);height:var(--fh);transform-origin:50% 100%;transform:perspective(220px) rotateX(-7deg)}
.dgb-stand img{position:absolute;left:0;bottom:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(1.5px 3px 2px rgba(0,0,0,.7)) saturate(1.06) contrast(1.04)}
.dgb-stand img.bust{height:auto;width:100%;aspect-ratio:1;bottom:12%;border-radius:50%;object-fit:cover;border:2.5px solid var(--tok,#ddd);background:#1a1410}
.dgb-tok.turn .dgb-stand{animation:dgb-bob 1.4s ease-in-out infinite}
.dgb-name{position:absolute;left:50%;top:calc(var(--fh) * -.02);transform:translate(-50%,-100%);white-space:nowrap;line-height:1;color:#1c2430;background:#f6f1e6;padding:.22em .5em;border-radius:.5em;font-weight:700;box-shadow:inset .25em 0 0 #a83434,0 2px 6px rgba(0,0,0,.55)}
.dgb-hud{position:absolute;z-index:11;pointer-events:none}
.dgb-chip{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:12px;background:#f6f1e6;color:#1c2430;font-size:12px;line-height:1.25;border:1px solid #c4b396;box-shadow:inset 3px 0 0 #a83434,0 4px 10px rgba(0,0,0,.45);max-width:100%}
.dgb-chip b{font-family:var(--font-display,serif);font-size:20px;font-weight:700;line-height:1}
.dgb-stop{pointer-events:auto;padding:9px 18px;border-radius:999px;background:#f6f1e6;color:#1c2430;font-weight:700;font-size:13px;border:1px solid #1a2b50;box-shadow:0 4px 10px rgba(0,0,0,.5)}
.dgb-stop:active{transform:scale(.96)}
@keyframes dgb-hlpulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes dgb-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.28)}}
@keyframes dgb-ring{0%,100%{box-shadow:0 0 0 1.5px #120d0a,0 0 0 4px #ffe9a0,0 0 14px 5px rgba(255,226,140,.8),0 calc(var(--bh) * .34) 0 1px #120d0a}50%{box-shadow:0 0 0 1.5px #120d0a,0 0 0 4px #fff3c4,0 0 22px 9px rgba(255,226,140,.95),0 calc(var(--bh) * .34) 0 1px #120d0a}}
@keyframes dgb-bob{0%,100%{transform:perspective(220px) rotateX(-7deg) translateY(0)}50%{transform:perspective(220px) rotateX(-7deg) translateY(-4%)}}
@media (prefers-reduced-motion:reduce){.dgb-reach,.dgb-room.reach .dgb-hl,.dgb-tok.turn .dgb-base,.dgb-tok.turn .dgb-stand{animation:none}.dgb-tok{transition:none!important}}
`;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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

function rectDist(px: number, py: number, l: number, t: number, r: number, b: number) {
  const dx = px < l ? l - px : px > r ? px - r : 0;
  const dy = py < t ? t - py : py > b ? py - b : 0;
  return Math.hypot(dx, dy);
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
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const floor = useMemo(() => {
    const path = (cells: Iterable<{ x: number; y: number }>) =>
      cellRuns(cells)
        .map((r) => `M${r.x * CELL} ${r.y * CELL}h${r.w * CELL}v${CELL}h${-r.w * CELL}z`)
        .join("");
    return {
      hall: path(hallCells(layout)),
      carpet: path([...layout.carpet].map((k) => ({ x: Number(k.split(",")[0]), y: Number(k.split(",")[1]) }))),
    };
  }, [layout]);
  /** Each room's exact footprint: an outline to clip the painting to, and runs of squares to tap. */
  const shapes = useMemo(
    () =>
      new Map(
        layout.rooms.map((room) => [
          room.id,
          {
            path: roomOutline(room)
              .map((loop) => `M${loop.map(([x, y]) => `${(x - room.x) * CELL} ${(y - room.y) * CELL}`).join("L")}Z`)
              .join(""),
            // A room's footprint is a single loop of straight edges, so a polygon clips it exactly (and Safari reads it everywhere).
            poly: `polygon(${(roomOutline(room)[0] ?? []).map(([x, y]) => `${(x - room.x) * CELL}px ${(y - room.y) * CELL}px`).join(",")})`,
            runs: cellRuns(room.cells).map((r) => [r.x * CELL, r.y * CELL, (r.x + r.w) * CELL, (r.y + 1) * CELL] as [number, number, number, number]),
          },
        ]),
      ),
    [layout],
  );
  const who = useMemo(() => figures(state.players), [state.players]);
  const shown = useWalkers(state.players, layout, enabled, passages);

  const boardW = layout.cols * CELL;
  const boardH = layout.rows * CELL;
  const worldW = boardW + PAD * 2;
  const worldH = boardH + PAD * 2;

  const view = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 420 });
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 380, h: el.clientHeight || 420 });
    read();
    const watcher = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    watcher?.observe(el);
    window.addEventListener("orientationchange", read);
    return () => {
      watcher?.disconnect();
      window.removeEventListener("orientationchange", read);
    };
  }, []);

  // The whole house always fits. No zoom.
  const scale = Math.max(0.1, Math.min((size.w - 6) / worldW, (size.h - 6) / worldH));
  const offX = (size.w - worldW * scale) / 2;
  const offY = (size.h - worldH * scale) / 2;
  const inv = 1 / scale;
  const labelPx = clamp(CELL * scale * 0.3, 9.5, 15) * inv;
  const pieceH = clamp(CELL * scale * 1.6, 28, 84) * inv;
  const pieceBaseW = pieceH * 0.4;
  const pieceBaseH = pieceBaseW * 0.52;
  const pieceW = pieceH * 0.56;

  // Every square a tap could land on, with how far it is. Rooms are one destination each.
  const targets = useMemo(() => {
    type Box = [number, number, number, number];
    const out: Array<{ key: string; pos: PiecePos; l: number; t: number; r: number; b: number; boxes: Box[]; dist: number }> = [];
    const roomTarget = (roomId: string, dist: number) => {
      const boxes = shapes.get(roomId)?.runs;
      if (!boxes?.length) return;
      out.push({ key: `r:${roomId}`, pos: { kind: "room", roomId }, l: 0, t: 0, r: 0, b: 0, boxes, dist });
    };
    if (anywhere) {
      for (const room of layout.rooms) if (enabled.includes(room.id)) roomTarget(room.id, 1);
    } else if (reach) {
      for (const node of reach.nodes.values()) {
        if (node.dist < 1) continue;
        if (node.pos.kind === "hall") {
          const l = node.pos.x * CELL;
          const t = node.pos.y * CELL;
          out.push({ key: posKey(node.pos), pos: node.pos, l, t, r: l + CELL, b: t + CELL, boxes: [[l, t, l + CELL, t + CELL]], dist: node.dist });
        } else {
          roomTarget(node.pos.roomId, node.dist);
        }
      }
    }
    return out;
  }, [anywhere, reach, layout, enabled, shapes]);
  const targetByKey = useMemo(() => new Map(targets.map((t) => [t.key, t])), [targets]);

  /** The lit square a screen point means: the one under it, or the nearest within a thumb's width. */
  const pick = (clientX: number, clientY: number) => {
    const box = world.current?.getBoundingClientRect();
    if (!box || !targets.length) return null;
    const bx = (clientX - box.left) / scale - PAD;
    const by = (clientY - box.top) / scale - PAD;
    const reachPx = clamp(26 / scale, CELL * 0.9, CELL * 2.4);
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

  const here = actor?.position.kind === "room" ? roomLabel(state, actor.position.roomId, layout) : "";
  const turnId = state.turnOrder[state.turnIndex % Math.max(1, state.turnOrder.length)];

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
          style={
            {
              width: worldW,
              height: worldH,
              transform: `translate(${offX}px, ${offY}px) scale(${scale})`,
            } as CSSProperties
          }
        >
          <div className="dgb-ground" />
          <div style={{ position: "absolute", left: PAD, top: PAD, width: boardW, height: boardH }}>
            <div className="dgb-house" style={{ left: 0, top: 0, width: boardW, height: boardH }} />
            <svg className="dgb-floor" width={boardW} height={boardH} aria-hidden="true">
              <defs>
                <pattern id={`${uid}-chk`} width={CELL * 2} height={CELL * 2} patternUnits="userSpaceOnUse">
                  <rect x={CELL} y={0} width={CELL} height={CELL} fill="#e6dcc4" />
                  <rect x={0} y={CELL} width={CELL} height={CELL} fill="#e6dcc4" />
                </pattern>
                <pattern id={`${uid}-rug`} width={CELL * 2} height={CELL * 2} patternUnits="userSpaceOnUse">
                  <rect x={CELL} y={0} width={CELL} height={CELL} fill="#702333" />
                  <rect x={0} y={CELL} width={CELL} height={CELL} fill="#702333" />
                </pattern>
                <pattern id={`${uid}-grid`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                  <path d={`M0 0H${CELL}M0 0V${CELL}`} fill="none" stroke="rgba(120,102,70,.32)" strokeWidth={1} />
                </pattern>
                <pattern id={`${uid}-gold`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                  <path d={`M0 0H${CELL}M0 0V${CELL}`} fill="none" stroke="rgba(214,178,92,.5)" strokeWidth={1} />
                </pattern>
              </defs>
              <path d={floor.hall} fill="#000" stroke="#000" strokeWidth={6} strokeLinejoin="round" />
              <path d={floor.hall} fill="#efe8d6" />
              <path d={floor.hall} fill={`url(#${uid}-chk)`} />
              <path d={floor.hall} fill={`url(#${uid}-grid)`} />
              <path d={floor.carpet} fill="#7d2a3a" />
              <path d={floor.carpet} fill={`url(#${uid}-rug)`} />
              <path d={floor.carpet} fill={`url(#${uid}-gold)`} />
            </svg>
            <div
              className="dgb-atrium"
              style={{ left: layout.center.x * CELL, top: layout.center.y * CELL, width: layout.center.w * CELL, height: layout.center.h * CELL }}
              aria-hidden="true"
            >
              ✦
            </div>

            {layout.rooms.flatMap((room) =>
              (layout.doors[room.id] ?? []).map((d, i) => (
                <div key={`d-${room.id}-${i}`} className={cn("dgb-door", `door-${d.dir}`)} style={{ left: d.x * CELL, top: d.y * CELL, width: CELL, height: CELL }} />
              )),
            )}

            {targets
              .filter((t) => t.pos.kind === "hall")
              .map((t) => (
                <span
                  key={`g-${t.key}`}
                  className={cn("dgb-reach", t.dist >= state.moveBudget && !anywhere && "edge", hover === t.key && "pick")}
                  style={{ left: t.l + 1, top: t.t + 1, width: CELL - 2, height: CELL - 2 }}
                />
              ))}

            {hoverPath.length > 1 ? (
              <svg className="dgb-path" width={boardW} height={boardH} aria-hidden="true">
                <polyline
                  points={hoverPath
                    .map((p) => {
                      if (p.kind === "hall") return `${(p.x + 0.5) * CELL},${(p.y + 0.5) * CELL}`;
                      const r = layout.rooms.find((x) => x.id === p.roomId);
                      if (!r) return "";
                      const c = roomCenter(r);
                      return `${c.x * CELL},${c.y * CELL}`;
                    })
                    .filter(Boolean)
                    .join(" ")}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="2 9"
                />
              </svg>
            ) : null}

            {layout.rooms.map((room, index) => {
              const t = targetByKey.get(`r:${room.id}`);
              const links = passages
                .filter((p) => p.a === room.id || p.b === room.id)
                .map((p) => roomLabel(state, p.a === room.id ? p.b : p.a, layout))
                .filter(Boolean);
              const art = roomArt(state, room);
              const name = roomLabel(state, room.id, layout);
              const shape = shapes.get(room.id);
              const clipId = `${uid}-c${index}`;
              const body = room.body;
              // Shrink the name plate until the longest word fits along the wall it sits on.
              const longest = Math.max(4, ...name.split(/\s+/).map((w) => w.length));
              const along = (room.side === "e" || room.side === "w" ? body.h : body.w) * CELL * 0.88;
              const plateFont = Math.max(6 * inv, Math.min(labelPx, along / (longest * 0.8)));
              return (
                <div
                  key={room.id}
                  className={cn("dgb-room", t && "reach", t && !anywhere && t.dist >= state.moveBudget && "edge", t && hover === t.key && "pick")}
                  role="img"
                  aria-label={`${name}${links.length ? `, secret passage to ${links.join(", ")}` : ""}`}
                  style={
                    {
                      left: room.x * CELL,
                      top: room.y * CELL,
                      width: room.w * CELL,
                      height: room.h * CELL,
                      ["--tint" as string]: room.tint,
                    } as CSSProperties
                  }
                >
                  <div
                    className="dgb-room-art"
                    style={{
                      backgroundColor: room.tint,
                      backgroundImage: art ? `url(${art})` : undefined,
                      clipPath: shape?.poly,
                      WebkitClipPath: shape?.poly,
                    }}
                  />
                  <svg className="dgb-room-edge" width={room.w * CELL} height={room.h * CELL} aria-hidden="true">
                    <defs>
                      <clipPath id={clipId}>
                        <path d={shape?.path} />
                      </clipPath>
                    </defs>
                    <path className="dgb-hl" d={shape?.path} fill="none" strokeWidth={13} strokeLinejoin="round" />
                    <path d={shape?.path} fill="none" stroke={room.tint} strokeWidth={11} clipPath={`url(#${clipId})`} />
                    <path d={shape?.path} fill="none" stroke="#000" strokeWidth={6} strokeLinejoin="miter" />
                  </svg>
                  <div
                    className="dgb-label"
                    style={{ left: (body.x - room.x) * CELL, top: (body.y - room.y) * CELL, width: body.w * CELL, height: body.h * CELL }}
                  >
                    <span className={cn("dgb-plaque", `v-${room.side}`)} style={{ fontSize: plateFont }}>
                      {name}
                    </span>
                    {links.length ? (
                      <span className="dgb-note" style={{ fontSize: Math.min(labelPx * 0.78, plateFont * 0.85) }}>
                        ⇄ {links.join(", ")}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {[...state.players]
              .map((p) => ({ p, at: anchor(shown[p.id]?.pos ?? p.position, layout, pieceBaseH) }))
              .map(({ p, at }) => ({ p, at, shift: crowdShift(state, p, pieceW * 0.95, layout) }))
              .sort((a, b) => a.at.y + a.shift.y - (b.at.y + b.shift.y))
              .map(({ p, at, shift }) => (
                <Piece
                  key={p.id}
                  player={p}
                  art={who[p.id]}
                  isTurn={turnId === p.id}
                  x={at.x + shift.x}
                  y={at.y + shift.y}
                  ms={shown[p.id]?.ms ?? 260}
                  dims={{ fh: pieceH, fw: pieceW, bw: pieceBaseW, bh: pieceBaseH, tag: labelPx }}
                />
              ))}
          </div>
        </div>
      </div>

      <div className="dgb-hud" style={{ left: 8, top: 8, right: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span className="dgb-chip">
          {anywhere ? (
            <span>Tap any room</span>
          ) : walking ? (
            <>
              <b>{state.moveBudget}</b>
              <span>{state.moveBudget === 1 ? "step" : "steps"} · tap a lit square</span>
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
    </div>
  );
}

function sameSpot(a: Player, b: Player) {
  if (a.position.kind === "hall" && b.position.kind === "hall") {
    return a.position.x === b.position.x && a.position.y === b.position.y;
  }
  if (a.position.kind === "room" && b.position.kind === "room") return a.position.roomId === b.position.roomId;
  return false;
}

function crowdShift(state: GameState, player: Player, gap: number, layout: BoardLayout) {
  const mates = state.players.filter((other) => sameSpot(player, other));
  if (mates.length < 2) return { x: 0, y: 0 };
  const i = Math.max(0, mates.findIndex((other) => other.id === player.id));
  const inRoom = player.position.kind === "room";
  const roomId = player.position.kind === "room" ? player.position.roomId : "";
  const side = layout.rooms.find((r) => r.id === roomId)?.side;
  // Side rooms are only three squares across, so a crowd there stacks in two columns instead of spreading wide.
  const cols = Math.min(inRoom ? (side === "e" || side === "w" ? 2 : 4) : 3, mates.length);
  const col = i % cols;
  const row = Math.floor(i / cols);
  const rowCount = Math.ceil(mates.length / cols);
  const inRow = Math.min(cols, mates.length - row * cols);
  return { x: (col - (inRow - 1) / 2) * gap, y: (row - (rowCount - 1) / 2) * gap * 0.6 };
}

/** Where a guest's feet are, in board pixels. */
function anchor(pos: PiecePos, layout: BoardLayout, baseH: number) {
  if (pos.kind === "hall") return { x: pos.x * CELL + CELL / 2, y: pos.y * CELL + CELL * 0.62 };
  const room = layout.rooms.find((r) => r.id === pos.roomId);
  if (!room) return { x: CELL / 2, y: CELL / 2 };
  // Guests stand in the main body of the room, on the half nearest the door; the name plate takes the far wall.
  const b = room.body;
  const cx = (b.x + b.w / 2) * CELL;
  const cy = (b.y + b.h / 2) * CELL;
  const top = b.y * CELL;
  const bottom = (b.y + b.h) * CELL;
  if (room.side === "n") return { x: cx, y: bottom - CELL * 0.55 - baseH * 0.2 };
  if (room.side === "s") return { x: cx, y: Math.min(top + CELL * 1.75, bottom - CELL * 0.5) };
  const y = Math.min(cy + CELL * 0.7, bottom - CELL * 0.5);
  if (room.side === "e") return { x: b.x * CELL + Math.min(CELL, b.w * CELL * 0.4), y };
  return { x: (b.x + b.w) * CELL - Math.min(CELL, b.w * CELL * 0.4), y };
}

function Piece({
  player,
  art,
  isTurn,
  x,
  y,
  ms,
  dims,
}: {
  player: Player;
  art: string;
  isTurn: boolean;
  x: number;
  y: number;
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
          zIndex: 10 + Math.round(y),
          ["--tok" as string]: player.color,
          ["--fh" as string]: `${dims.fh}px`,
          ["--fw" as string]: `${dims.fw}px`,
          ["--bw" as string]: `${dims.bw}px`,
          ["--bh" as string]: `${dims.bh}px`,
        } as CSSProperties
      }
    >
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
  );
}
