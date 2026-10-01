import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CardDef } from "@/lib/game/types";
import { sfxPaper } from "@/lib/game/sfx";
import { CardBack, CardFace } from "./CardFace";

export function CardHand({
  cards,
  onOpen,
  facesDown = false,
  spread = false,
}: {
  cards: CardDef[];
  onOpen: (card: CardDef) => void;
  facesDown?: boolean;
  spread?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0, axis: "" as "" | "x" | "y" });
  const stage = useRef<HTMLDivElement>(null);
  const hold = useRef<number | null>(null);
  const [scale, setScale] = useState(1);
  const sig = cards.map((c) => c.id).join("|");

  useEffect(() => {
    setIndex(0);
    setDrag(0);
  }, [sig]);

  useEffect(() => {
    return () => {
      if (hold.current != null) window.clearInterval(hold.current);
    };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => {
      const room = el.clientHeight;
      setScale(Math.min(1, Math.max(0.45, (room - 4) / 224)));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [sig, spread]);

  const safe = cards.length ? Math.min(index, cards.length - 1) : 0;
  const current = cards[safe];

  function stopHold() {
    if (hold.current == null) return;
    window.clearInterval(hold.current);
    hold.current = null;
  }

  function step(dir: number, quiet = false) {
    const next = Math.min(cards.length - 1, Math.max(0, safe + dir));
    if (next === safe) return false;
    if (!quiet) sfxPaper();
    setIndex(next);
    return true;
  }

  function startHold(dir: number) {
    stopHold();
    if (!step(dir)) return;
    hold.current = window.setInterval(() => {
      setIndex((i) => {
        const next = Math.min(cards.length - 1, Math.max(0, i + dir));
        if (next === i) {
          if (hold.current != null) window.clearInterval(hold.current);
          hold.current = null;
          return i;
        }
        return next;
      });
    }, 180);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    start.current = { x: e.clientX, y: e.clientY, axis: "" };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!start.current.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (start.current.axis === "y") {
        setDragging(false);
        setDrag(0);
        return;
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic event cannot capture the pointer */
      }
    }
    if (start.current.axis === "x") setDrag(dx);
  }

  function finish(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging && start.current.axis !== "x") return;
    const dx = e.clientX - start.current.x;
    const wasDrag = start.current.axis === "x";
    setDragging(false);
    setDrag(0);
    start.current.axis = "";
    if (!wasDrag) {
      if (Math.abs(dx) < 8 && current) onOpen(current);
      return;
    }
    if (dx <= -56) step(1);
    else if (dx >= 56) step(-1);
  }

  if (!cards.length) {
    return <p className="text-sm text-muted">No cards in this hand yet.</p>;
  }

  if (spread) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-[10px] uppercase tracking-[0.16em] text-subtle">In your hand · {cards.length}</p>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {cards.map((card) => (
            <button key={card.id} type="button" className="relative h-28 w-full" onClick={() => onOpen(card)}>
              {facesDown ? (
                <span className="grid h-full w-full place-items-center rounded-[12px] border border-paper/30 bg-black font-display text-3xl text-paper">?</span>
              ) : (
                <CardFace card={card} fill />
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-36 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.16em] text-subtle">In your hand</p>
        <p className="text-[10px] text-subtle">
          {safe + 1}/{cards.length}
        </p>
      </div>
      <div className="relative mt-0.5 min-h-0 flex-1">
        <button
          type="button"
          aria-label="Previous card"
          data-sfx="none"
          className="absolute top-0 bottom-0 left-0 z-30 grid w-11 place-items-center text-paper disabled:opacity-20"
          disabled={safe === 0}
          onPointerDown={(event) => {
            event.stopPropagation();
            startHold(-1);
          }}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          <ChevronLeft className="size-8" />
        </button>
        <button
          type="button"
          aria-label="Next card"
          data-sfx="none"
          className="absolute top-0 bottom-0 right-0 z-30 grid w-11 place-items-center text-paper disabled:opacity-20"
          disabled={safe >= cards.length - 1}
          onPointerDown={(event) => {
            event.stopPropagation();
            startHold(1);
          }}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          <ChevronRight className="size-8" />
        </button>
        <div
          ref={stage}
          className="card-hand relative h-full touch-pan-y overflow-hidden select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={() => {
            setDragging(false);
            setDrag(0);
            start.current.axis = "";
          }}
        >
          {cards.map((card, i) => {
            const rel = i - safe;
            if (Math.abs(rel) > 3) return null;
            const pull = dragging ? drag : 0;
            const x = rel * 28 * scale + (rel === 0 ? pull : pull * 0.12);
            const y = Math.abs(rel) * 8 * scale + (rel === 0 ? Math.min(12, Math.abs(pull) / 22) : 0);
            const rot = rel * 8 + (rel === 0 ? pull / 16 : 0);
            const size = (rel === 0 ? 1.02 : 0.9) * scale;
            return (
              <div
                key={card.id}
                className="absolute top-0 left-1/2 origin-top"
                style={{
                  zIndex: 20 - Math.abs(rel),
                  transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${rot}deg) scale(${size})`,
                  transition: dragging ? "none" : "transform 280ms cubic-bezier(.2,.7,.2,1)",
                  opacity: Math.abs(rel) === 3 ? 0.45 : 1,
                }}
              >
                {facesDown ? <CardBack /> : <CardFace card={card} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
