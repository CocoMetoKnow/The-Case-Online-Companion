// ===== UI LAYER: turn tracker. Display only, it reads the game state and never changes it. =====
// The players sit on a ring seen from above, like the chambers of a cylinder. The player up now is on the
// left, the next player is on the right, and everyone else waits along the back of the ring. When a turn
// ends the ring turns one notch: the next player swings across the front to the left, and the one who just
// played slips round to the back. Only transform and opacity are animated, so it stays on the GPU.
import { currentPlayer, useActorId, useGame } from "@/lib/game/store";
import type { GameState, Player } from "@/lib/game/types";
import { avatarFor, Headshot } from "./PlayerBadge";
import { useLayoutEffect, useRef, useState } from "react";

/** Players who still take turns, starting with whoever is up now and then in seating order. */
function lineUp(state: GameState): Player[] {
  const cur = currentPlayer(state);
  const seats = state.turnOrder
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p) && !p!.eliminated);
  const at = cur ? seats.findIndex((p) => p.id === cur.id) : -1;
  return at <= 0 ? seats : [...seats.slice(at), ...seats.slice(0, at)];
}

/* ---------- ring geometry (degrees; 180 = left, 360 = right, 90 = front, 270 = back) ---------- */
const FACE = 40;
const RY = 11;
const mod360 = (n: number) => ((n % 360) + 360) % 360;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Slot 0 (up now) is left, slot 1 (next) is right, the rest are spread along the back of the ring. */
function slotAngle(slot: number, n: number): number {
  if (slot === 0) return 180;
  if (slot === 1) return 360;
  return 360 - ((slot - 1) * 180) / (n - 1);
}
const emphFor = (slot: number, n: number) => (slot === 0 ? 1.1 : slot === 1 ? 0.95 : Math.max(0.45, 0.78 - n * 0.02));
const opacityFor = (slot: number) => (slot < 2 ? 1 : 0.7);

function pose(theta: number, emph: number, base: number, rx: number) {
  const r = (theta * Math.PI) / 180;
  const depth = (Math.sin(r) + 1) / 2; // 1 at the front of the ring, 0 at the back
  return {
    transform: `translate3d(${(rx * Math.cos(r)).toFixed(1)}px, ${(RY * Math.sin(r)).toFixed(1)}px, 0) scale(${((0.75 + 0.25 * depth) * emph).toFixed(3)})`,
    opacity: Number((base * (0.75 + 0.25 * depth)).toFixed(3)),
  };
}

function Face({ player }: { player: Player }) {
  const cards = useGame((s) => s.state?.cards ?? []);
  const art = avatarFor(player, cards);
  const letter = (player.name.trim().slice(0, 1) || "?").toUpperCase();
  return (
    <span className="turn-face" style={{ borderColor: player.color }}>
      {art ? (
        <Headshot src={art} className="size-full" />
      ) : (
        <span className="grid size-full place-items-center rounded-full text-base font-semibold text-[#f6f1e6]" style={{ background: player.color }}>
          {letter}
        </span>
      )}
    </span>
  );
}

function Wheel({ order, actor }: { order: Player[]; actor: string | undefined }) {
  const n = order.length;
  const ids = order.map((p) => p.id);
  const stage = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const previous = useRef<string[] | null>(null);
  const [width, setWidth] = useState(320);
  const rx = Math.max(60, Math.min(width / 2 - FACE * 0.55, 150));

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 320);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  // When the turn moves on, every face travels along the ring to its new slot.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = ids;
    if (!before || before.join("|") === ids.join("|")) return;
    if (before.length !== n || ids.some((id) => !before.includes(id))) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    ids.forEach((id) => {
      const el = nodes.current.get(id);
      if (!el || typeof el.animate !== "function") return;
      const from = before.indexOf(id);
      const to = ids.indexOf(id);
      const steps = (from - to + n) % n;
      if (!steps) return;
      const per = Math.max(3, Math.floor(24 / steps));
      let slot = from;
      let theta = slotAngle(slot, n);
      const frames = [pose(theta, emphFor(slot, n), opacityFor(slot), rx)];
      for (let s = 0; s < steps; s += 1) {
        const next = (slot - 1 + n) % n;
        const delta = mod360(slotAngle(next, n) - slotAngle(slot, n));
        for (let i = 1; i <= per; i += 1) {
          const t = i / per;
          frames.push(
            pose(theta + delta * t, lerp(emphFor(slot, n), emphFor(next, n), t), lerp(opacityFor(slot), opacityFor(next), t), rx),
          );
        }
        theta += delta;
        slot = next;
      }
      el.getAnimations?.().forEach((a) => a.cancel());
      el.animate(frames, { duration: Math.min(950, 560 + (steps - 1) * 160), easing: "cubic-bezier(0.45, 0, 0.2, 1)" });
    });
  });

  const now = order[0];
  const next = order[1];
  const nowMine = now.id === actor;
  const nextMine = next.id === actor;

  return (
    <div className="turn-tracker" role="group" aria-label="Turn order">
      <div ref={stage} className="turn-wheel" aria-hidden>
        {order.map((player, slot) => {
          const p = pose(slotAngle(slot, n), emphFor(slot, n), opacityFor(slot), rx);
          return (
            <span
              key={player.id}
              ref={(el) => {
                if (el) nodes.current.set(player.id, el);
                else nodes.current.delete(player.id);
              }}
              className={slot === 0 ? "turn-spot turn-spot-now" : "turn-spot"}
              style={{ transform: p.transform, opacity: p.opacity, zIndex: slot === 0 ? 5 : slot === 1 ? 4 : 1 }}
            >
              {slot === 0 ? <span className="turn-halo" /> : null}
              <Face player={player} />
              {player.id === actor ? <span className="turn-you" /> : null}
            </span>
          );
        })}
      </div>
      <div className="turn-caps" aria-hidden>
        <div className="turn-cap" key={`now-${now.id}`}>
          <span className="turn-tag turn-tag-now">{nowMine ? "Your turn" : "Up now"}</span>
          <span className="turn-name">{nowMine ? "You" : now.name}</span>
        </div>
        <div className="turn-cap turn-cap-right" key={`next-${next.id}`}>
          <span className="turn-tag turn-tag-next">{nextMine ? "You're next" : "Next"}</span>
          <span className="turn-name">{nextMine ? "You" : next.name}</span>
        </div>
      </div>
      <span className="sr-only">
        {nowMine ? "It is your turn." : `${now.name} is up now.`} {nextMine ? "You are next." : `${next.name} is next.`}
      </span>
    </div>
  );
}

export function TurnTracker() {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  if (!state || state.phase === "lobby" || state.phase === "gameover") return null;
  const order = lineUp(state);
  if (order.length < 2) return null;
  return <Wheel order={order} actor={actor} />;
}
