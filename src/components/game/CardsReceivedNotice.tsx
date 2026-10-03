import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game/store";
import type { CardDef } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { CardFace } from "./CardFace";

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "A player";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * A player left and their cards were dealt out. This tells the players who got some exactly
 * which cards landed in their hand, and stays until they tap "Got it". The journal already has
 * them marked (unless notes are manual). Above the suggestion recap, under the journal.
 */
export function CardsReceivedNotice() {
  const state = useGame((s) => s.state);
  const view = useGame((s) => s.view);
  const received = useGame((s) => s.cardsReceived);
  const dismiss = useGame((s) => s.dismissReceived);
  const manualNotes = Boolean(state?.settings.manualNotes);

  if (!state || !received || view !== "play" || state.phase === "lobby") return null;
  const cards = received.cardIds
    .map((id) => state.cards.find((card) => card.id === id))
    .filter((card): card is CardDef => Boolean(card));
  if (!cards.length) return null;
  const who = joinNames(received.fromNames);
  const many = received.fromNames.length > 1;

  return (
    <div
      className="fixed inset-0 grid place-items-center bg-[#140e0bb3] p-4"
      style={{
        zIndex: 99992,
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-label="Cards you received"
    >
      <div className="case-shell flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-[28px] px-4 py-5 text-center">
        <p className="text-xs uppercase tracking-[0.16em] text-brass">{who} left the game</p>
        <h3 className="mt-1 font-display text-3xl leading-none text-paper">
          You received {cards.length === 1 ? "a card" : `${cards.length} cards`}
        </h3>
        <div className={cn("mt-3 grid gap-2", cards.length === 1 ? "grid-cols-1 justify-items-center" : cards.length > 4 ? "grid-cols-4" : "grid-cols-3")}>
          {cards.map((card) => (
            <div key={card.id} className={cn(cards.length > 4 ? "h-24" : "h-32", cards.length === 1 && "w-24")}>
              <CardFace card={card} fill />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-paper">{cards.map((card) => card.name).join(" · ")}</p>
        <p className="mt-1 text-xs text-muted">
          {many ? "Their" : `${who}'s`} cards were dealt to the players still in the case.{" "}
          {manualNotes ? "Mark them in your journal." : "They are in your journal."}
        </p>
        <Button className="mt-4 w-full" data-sfx="confirm" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}
