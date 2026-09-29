import { Castle, Diamond, Moon, Star, Sword, UserRound } from "lucide-react";
import { useState } from "react";
import type { CardDef, CategoryId, SheetMark } from "@/lib/game/types";
import { defaultCardArt, cardArt } from "@/lib/game/cards";
import { useGame } from "@/lib/game/store";
import { cn } from "@/lib/utils";

/**
 * Mobile Safari (and a flaky connection generally) can fail an <img> load —
 * a bad cache entry, a dropped request, a corrupt custom upload. Left alone,
 * the browser draws its own broken-image glyph (a box with a "?" or a torn
 * corner) right over the card. This swaps to the plain gradient-plus-icon
 * card back instead, so a failed photo never looks broken to a player.
 */
function useImgFallback(src: string | undefined) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src) && src === failedSrc;
  return {
    failed,
    onError: () => setFailedSrc(src ?? null),
  };
}

const CAT_TONE: Record<CategoryId, string> = {
  suspect: "from-[#3a2424] to-[#2a1818]",
  room: "from-[#24322c] to-[#1a2420]",
  weapon: "from-[#32281c] to-[#241c14]",
  time: "from-[#242834] to-[#181c26]",
};

const MARK: Record<CategoryId, typeof UserRound> = {
  suspect: UserRound,
  room: Castle,
  weapon: Sword,
  time: Moon,
};

const MARK_LABEL: Record<CategoryId, string> = {
  suspect: "Person",
  room: "Room",
  weapon: "Weapon",
  time: "Time",
};

export function CardBack() {
  const back = useImgFallback("/cards/back.jpg");
  return (
    <article
      className="relative block h-56 w-40 overflow-hidden rounded-[16px] border border-[#e7c98a] shadow-[0_10px_22px_rgba(0,0,0,0.45)]"
      aria-label="Card back"
    >
      {back.failed ? (
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a1c0c] to-[#1a1208]" />
      ) : (
        <img
          src="/cards/back.jpg"
          alt=""
          decoding="async"
          loading="lazy"
          onError={back.onError}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </article>
  );
}

export function CardFace({
  card,
  compact = false,
  large = false,
  choice = false,
  fill = false,
  selected = false,
  onClick,
  dimmed = false,
  badge,
  sheetMark,
}: {
  card: CardDef;
  compact?: boolean;
  large?: boolean;
  choice?: boolean;
  fill?: boolean;
  selected?: boolean;
  onClick?: () => void;
  dimmed?: boolean;
  badge?: "yours" | "shown" | "unseen" | "answer";
  sheetMark?: SheetMark;
}) {
  const heist = useGame((s) =>
    s.view === "setup" ? Boolean(s.setup.settings.heist) : Boolean(s.state?.settings.heist),
  );
  const Mark = heist && card.category === "weapon" ? Diamond : MARK[card.category];
  const markLabel = heist && card.category === "weapon" ? "Stolen" : MARK_LABEL[card.category];
  const art =
    heist && card.category === "weapon"
      ? cardArt(card.id, true)
      : card.imageDataUrl || defaultCardArt(card.id);
  const label = `${card.name}${card.clock ? `, ${card.clock}` : ""}, ${markLabel}`;
  const imgFallback = useImgFallback(art);
  const showArt = Boolean(art) && !imgFallback.failed;
  const paintedTime = card.category === "time" && showArt;
  const inner = (
    <>
      {showArt ? (
        <img
          src={art}
          alt=""
          decoding="async"
          loading="lazy"
          onError={imgFallback.onError}
          className={cn("absolute inset-0 size-full", choice || fill ? "object-contain" : "object-cover")}
        />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-b", CAT_TONE[card.category])} />
      )}
      {sheetMark && sheetMark !== "blank" ? (
        <span
          className={cn(
            "absolute top-1.5 left-1.5 grid place-items-center rounded-full font-display font-bold leading-none shadow",
            large || (choice && !fill) ? "size-8 text-lg" : "size-5 text-xs",
            sheetMark === "check" && "bg-[#178a45] text-white",
            sheetMark === "x" && "bg-[#7a1f2b] text-white",
            sheetMark === "maybe" && "bg-[#e7c98a] text-[#2a1c0c]",
            sheetMark === "answer" && "bg-[#7a1f2b] text-[#ffe7a3] ring-2 ring-[#ffe7a3]",
          )}
          title={sheetMark === "check" ? "Checked out" : sheetMark === "x" ? "Ruled out" : sheetMark === "maybe" ? "Not sure" : "Your solution"}
        >
          {sheetMark === "answer" ? (
            <Star className={large || (choice && !fill) ? "size-5 fill-current" : "size-3 fill-current"} aria-hidden />
          ) : sheetMark === "check" ? (
            "✓"
          ) : sheetMark === "x" ? (
            "✕"
          ) : (
            "?"
          )}
        </span>
      ) : badge ? (
        <span
          className={cn(
            "absolute top-1.5 left-1.5 grid place-items-center rounded-full font-display font-bold leading-none shadow",
            large || (choice && !fill) ? "size-8 text-lg" : "size-5 text-xs",
            badge === "yours" && "bg-[#e7c98a] text-[#2a1c0c]",
            badge === "shown" && "bg-[#178a45] text-white",
            badge === "unseen" && "bg-[#1c1814] text-[#f3e6c0] ring-1 ring-[#e7d7a8]",
            badge === "answer" && "bg-[#7a1f2b] text-[#ffe7a3] ring-2 ring-[#ffe7a3]",
          )}
          title={badge === "yours" ? "In your hand" : badge === "shown" ? "Shown to you" : badge === "unseen" ? "Not seen yet" : "Your solution"}
        >
          {badge === "answer" ? (
            <Star className={large || (choice && !fill) ? "size-5 fill-current" : "size-3 fill-current"} aria-hidden />
          ) : badge === "yours" ? (
            "◆"
          ) : badge === "shown" ? (
            "✓"
          ) : (
            "○"
          )}
          {badge === "answer" ? <span className="sr-only">Your solution</span> : null}
        </span>
      ) : null}
      <span
        className={cn(
          "absolute top-1.5 right-1.5 grid place-items-center rounded-full bg-ink/75 text-paper shadow",
          large ? "size-9" : fill ? "size-5" : choice ? "size-7" : compact ? "size-5" : "size-6",
        )}
        title={markLabel}
      >
        <Mark className={large ? "size-5" : fill ? "size-3" : "size-3.5"} aria-hidden />
        <span className="sr-only">{markLabel}</span>
      </span>
      {paintedTime ? null : (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 bg-ink/80 px-2 text-center font-display leading-tight text-paper",
            large
              ? "truncate py-3 text-3xl"
              : fill
                ? "truncate px-1 py-0.5 text-[10px]"
                : choice
                  ? "line-clamp-2 whitespace-normal py-1.5 text-sm"
                  : compact
                    ? "truncate py-1 text-[11px]"
                    : "truncate py-1.5 text-base",
          )}
        >
          {card.name}
        </span>
      )}
    </>
  );

  const cls = cn(
    "relative block overflow-hidden border bg-ink text-left shadow-[0_8px_18px_rgba(0,0,0,0.35)]",
    large
      ? "h-80 w-56 rounded-[18px]"
      : fill
        ? "h-full w-full rounded-[12px]"
        : choice
          ? "aspect-[2/3] h-auto w-full rounded-[14px]"
          : compact
            ? "h-24 w-16 rounded-[10px]"
            : "h-56 w-40 rounded-[16px]",
    selected ? "border-brass ring-2 ring-brass/50" : "border-paper/30",
    dimmed && "opacity-40",
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-label={label}>
        {inner}
      </button>
    );
  }
  return (
    <article className={cls} aria-label={label}>
      {inner}
    </article>
  );
}
