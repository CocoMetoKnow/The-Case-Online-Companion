import { Pointer } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

export function DicePair({
  values,
  toss,
  snake,
  small = false,
  large = false,
  ready = false,
  single = false,
  extra = null,
  onRoll,
}: {
  values: [number, number] | null;
  toss: number;
  snake?: boolean;
  small?: boolean;
  large?: boolean;
  ready?: boolean;
  single?: boolean;
  /** Thief: the die stolen from another player. Drawn as a third die beside the pair. */
  extra?: number | null;
  onRoll?: () => void;
}) {
  const a = values?.[0] ?? 5;
  const b = values?.[1] ?? 2;
  const live = values != null;
  const glass = live && !single && a === 3;
  const eyes = Boolean(snake) || (live && !single && a === 1 && b === 1);
  const body = (
    <div
      className={cn("dice-drop", small && "dice-sm", large && "dice-lg", ready && "dice-ready")}
      aria-label={
        !live
          ? "Dice"
          : single
            ? `Rolled ${a}`
            : extra
              ? `${glass ? "Magnifying glass" : a}, ${b} and a stolen die showing ${extra}`
              : glass
                ? `Magnifying glass and ${b}`
                : `Rolled ${a} and ${b}`
      }
    >
      <span className="dice-shadow" />
      <Die n={a} toss={toss} delay={0} snake={eyes || glass} live={live} glass={glass} large={large} small={small} />
      {single ? null : (
        <Die n={b} toss={toss} delay={90} snake={eyes && !glass} live={live} large={large} small={small} />
      )}
      {live && !single && extra ? (
        <Die n={extra} toss={toss} delay={180} live={live} large={large} small={small} />
      ) : null}
      {ready ? (
        <span className="dice-tap" aria-hidden>
          <Pointer className="size-4" />
        </span>
      ) : null}
    </div>
  );
  if (!onRoll) return body;
  return (
    <button type="button" className="dice-hit" data-sfx="none" onClick={onRoll} aria-label="Roll the dice">
      {body}
    </button>
  );
}

/**
 * A real roll: the faces flick through random numbers while the die tumbles, then it lands on the
 * result. Players who ask their phone to reduce motion just see the result.
 */
const TUMBLE_MS = 850;
const FLICK_MS = 70;
function useTumble(n: number, toss: number, delay: number, live: boolean) {
  const [shown, setShown] = useState(n);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!live || toss <= 0 || calm) {
      setShown(n);
      setRolling(false);
      return;
    }
    let flick: ReturnType<typeof setInterval> | undefined;
    let land: ReturnType<typeof setTimeout> | undefined;
    // Each die starts on its own beat, so the pair does not move in lockstep.
    const start = setTimeout(() => {
      setRolling(true);
      let last = 0;
      flick = setInterval(() => {
        // Never the same face twice in a row, so it always looks like it is moving.
        let next = 1 + Math.floor(Math.random() * 6);
        if (next === last) next = (next % 6) + 1;
        last = next;
        setShown(next);
      }, FLICK_MS);
      land = setTimeout(() => {
        if (flick) clearInterval(flick);
        setShown(n);
        setRolling(false);
      }, TUMBLE_MS - delay);
    }, delay);
    return () => {
      clearTimeout(start);
      if (flick) clearInterval(flick);
      if (land) clearTimeout(land);
    };
  }, [n, toss, delay, live]);
  return { shown, rolling };
}

function Die({
  n,
  toss,
  delay,
  snake,
  live,
  glass = false,
  large = false,
  small = false,
}: {
  n: number;
  toss: number;
  delay: number;
  snake?: boolean;
  live: boolean;
  glass?: boolean;
  large?: boolean;
  small?: boolean;
}) {
  const { shown, rolling } = useTumble(n, toss, delay, live);
  const face = PIPS[shown] ?? PIPS[1];
  // The magnifying glass and the snake eyes ring only show once the die has stopped.
  const showGlass = glass && !rolling;
  return (
    <div
      key={toss}
      className={cn("die-body", live && toss > 0 && "die-hit", snake && !rolling && "die-snake")}
      style={{ animationDelay: `${delay}ms` }}
    >
      {!showGlass ? (
        face.map(([x, y], i) => (
          <span
            key={i}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink",
              large ? "size-4" : small ? "size-2" : "size-2.5",
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        ))
      ) : (
        <span
          className={cn(
            "absolute inset-0 grid place-items-center font-display font-bold leading-none text-ink",
            large ? "text-5xl" : small ? "text-2xl" : "text-4xl",
          )}
          aria-hidden
        >
          ?
        </span>
      )}
    </div>
  );
}
