import { Pointer, Search } from "lucide-react";
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
  onRoll,
}: {
  values: [number, number] | null;
  toss: number;
  snake?: boolean;
  small?: boolean;
  large?: boolean;
  ready?: boolean;
  single?: boolean;
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
      aria-label={!live ? "Dice" : single ? `Rolled ${a}` : glass ? `Magnifying glass and ${b}` : `Rolled ${a} and ${b}`}
    >
      <span className="dice-shadow" />
      <Die n={a} toss={toss} delay={0} snake={eyes || glass} live={live} glass={glass} large={large} small={small} />
      {single ? null : (
        <Die n={b} toss={toss} delay={90} snake={eyes && !glass} live={live} large={large} small={small} />
      )}
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
  const face = PIPS[n] ?? PIPS[1];
  return (
    <div
      key={toss}
      className={cn("die-body", live && toss > 0 && "die-hit", snake && "die-snake")}
      style={{ animationDelay: `${delay}ms` }}
    >
      {!glass ? (
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
        <Search className="die-glass" strokeWidth={2.25} aria-hidden />
      )}
    </div>
  );
}
