/**
 * ============================================================
 *  UI / RENDER LAYER — "someone shows you a card"
 * ============================================================
 *  ONE container, always mounted, reused for every reveal (no DOM is created
 *  per reveal). The card drops in from the top centre with a translate3d slide
 *  (520ms, compositor-only). The paper-slide sound is already fired by the
 *  engine's question cue (sfxReceive → paper_slide.mp3), so it is not repeated
 *  here. Tap anywhere, or wait ~6s, to dismiss: dismissing calls `onDismiss`,
 *  which is the existing acknowledge path that logs the clue to the journal.
 */
import { useEffect, useRef, useState } from "react";
import type { CardDef } from "@/lib/game/types";
import { CardFace } from "./CardFace";

export interface RevealData {
  card: CardDef;
  who: string;
}

const AUTO_MS = 6000;

export function CardReveal({ data, onDismiss }: { data: RevealData | null; onDismiss: () => void }) {
  // Keep the last card painted while the container slides back out.
  const [shown, setShown] = useState<RevealData | null>(data);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const open = Boolean(data);

  useEffect(() => {
    if (data) setShown(data);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => dismiss.current(), AUTO_MS);
    return () => window.clearTimeout(t);
  }, [data?.card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="reveal-layer"
      data-open={open}
      aria-hidden={!open}
      role="dialog"
      aria-label="A card is shown to you"
      onClick={() => open && dismiss.current()}
    >
      <div className="reveal-card">
        <p className="reveal-title">{shown ? `${shown.who} shows you a card` : ""}</p>
        <div className="mt-3 flex justify-center">{shown ? <CardFace card={shown.card} large /> : null}</div>
        <p className="reveal-hint">Tap to file it in your journal</p>
      </div>
    </div>
  );
}
