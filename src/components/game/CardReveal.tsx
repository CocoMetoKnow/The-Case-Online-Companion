import { cardArt, defaultCardArt } from "@/lib/game/cards";
import { sfxReveal } from "@/lib/game/sfx";
import { useGame } from "@/lib/game/store";
import type { CardDef } from "@/lib/game/types";
import { useEffect, useRef, useState } from "react";

/**
 * The card an opponent just revealed to you.
 *
 * One dedicated container, mounted once and kept in the page. It is never created or torn
 * down per card: a card arriving only swaps the picture and title inside it and flips
 * data-open, so there is no DOM churn on mobile Safari. Motion is a pure
 * transform: translate3d + opacity transition (GPU composited, no layout or paint work)
 * of 520ms, inside the 400-600ms window. The paper-slide sound is started on the same
 * animation frame that starts the slide.
 *
 * It is dismissed by tapping anywhere on it (or the button). The clue is already in the
 * journal by then: the sheet is synced the moment the card appears.
 */
export function CardReveal({
  card,
  who,
  note,
  onDismiss,
}: {
  card: CardDef | null;
  who: string;
  note?: string;
  onDismiss: () => void;
}) {
  const syncSheet = useGame((s) => s.syncSheet);
  const heist = useGame((s) => Boolean(s.state?.settings.heist));
  const manualNotes = useGame((s) => Boolean(s.state?.settings.manualNotes));
  // Keep the last card painted while the container slides away, so it never blanks mid-motion.
  const [held, setHeld] = useState<{ card: CardDef; who: string; note?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const cardId = card?.id ?? "";

  useEffect(() => {
    if (!card) {
      setOpen(false);
      return;
    }
    setHeld({ card, who, note });
    // Log the clue first, then start sound and motion together on the next frame.
    syncSheet();
    const frame = requestAnimationFrame(() => {
      setOpen(true);
      sfxReveal();
    });
    return () => cancelAnimationFrame(frame);
    // Only a different card re-triggers the reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => {
    if (!open) return;
    button.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  const shown = held?.card;
  const art = shown ? (heist && shown.category === "weapon" ? cardArt(shown.id, true) : shown.imageDataUrl || defaultCardArt(shown.id)) : undefined;

  return (
    <div
      className="reveal-layer"
      data-open={open}
      aria-hidden={!open}
      role="dialog"
      aria-label={shown ? `${held?.who} shows you ${shown.name}` : "Card shown to you"}
      onClick={open ? onDismiss : undefined}
    >
      <div className="reveal-stack">
        <p className="reveal-kicker">Shown only to you</p>
        <p className="reveal-who">{held?.who ?? ""} shows you a card</p>
        <div className="reveal-card">
          {art ? <img src={art} alt="" decoding="async" draggable={false} /> : null}
          <span className="reveal-name">{shown?.name ?? ""}</span>
        </div>
        <p className="reveal-note">
          {held?.note ?? (manualNotes ? "Mark it in your journal." : "Added to your journal.")}
        </p>
        <button ref={button} type="button" className="reveal-ok" tabIndex={open ? 0 : -1} onClick={onDismiss}>
          Tap to dismiss
        </button>
      </div>
    </div>
  );
}
