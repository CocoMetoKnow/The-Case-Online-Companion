import { Button } from "@/components/ui/button";
import { useActorId, useGame } from "@/lib/game/store";
import { NPC_ID, type CardDef } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { CardFace } from "./CardFace";

const SEEN_KEY = "gmm.suggestionClosed";

function closedBefore(id: string): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SEEN_KEY) === id;
  } catch {
    return false;
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    // Private mode or full storage: the recap still closes for this visit.
  }
}

/**
 * The suggestion that just went around the table.
 *
 * Once the question screen is gone, every player still gets one card on their own phone
 * with what was asked and who showed a card (or that no one did). It stays until that
 * player closes it. It sits above every other screen, but under the journal and the
 * journal tab (z-index 99999), so the journal can always be opened to check a clue first.
 *
 * Closing is per phone and remembered, so a refresh does not bring a closed one back.
 * It never carries the card that was shown, only who showed it.
 */
export function SuggestionRecap() {
  const state = useGame((s) => s.state);
  const view = useGame((s) => s.view);
  const passGate = useGame((s) => s.passGate);
  const actor = useActorId();
  const [closedId, setClosedId] = useState<string>("");

  const last = state?.lastSuggestion ?? null;
  const lastId = last?.id ?? "";

  // A different suggestion gets a fresh look, unless this phone already closed it.
  useEffect(() => {
    if (lastId && closedBefore(lastId)) setClosedId(lastId);
  }, [lastId]);

  if (!state || !last || view !== "play" || !state.startedAt) return null;
  if (state.phase === "lobby" || state.phase === "gameover") return null;
  // Still being answered: the question screen is doing the talking.
  if (state.question) return null;
  // One shared phone mid hand-off: wait until the next guest has confirmed.
  if (passGate && state.settings.playMode !== "online") return null;
  if (closedId === last.id) return null;

  const asker = state.players.find((p) => p.id === last.askerId);
  const mine = actor === last.askerId;
  // Extra Difficulty and speak mode keep their secrets here too, even on a shared phone.
  const showerId = last.showerId === NPC_ID && !mine ? null : last.showerId;
  const shower = showerId === NPC_ID ? null : state.players.find((p) => p.id === showerId);
  const cards = (mine || !last.spoken ? last.cardIds : [])
    .map((id) => state.cards.find((card) => card.id === id))
    .filter((card): card is CardDef => Boolean(card));

  const askerName = mine ? "You" : (asker?.name ?? "Someone");
  let result: string;
  let accent: string | undefined;
  if (showerId === NPC_ID) {
    result = "The NPC showed you a card.";
  } else if (shower) {
    result = mine ? `${shower.name} showed you a card.` : `${shower.name} showed ${asker?.name ?? "the asker"} a card.`;
    accent = shower.color;
  } else {
    result = "No one showed a card.";
  }

  return (
    <div
      className="fixed inset-0 grid place-items-center bg-[#140e0bb3] p-4"
      // Above every screen and popup, but below the journal tab and the journal pages (both 99999).
      style={{
        zIndex: 99990,
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-label="The last suggestion"
    >
      <div className="case-shell flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-[28px] px-4 py-5 text-center">
        <p className="text-xs uppercase tracking-[0.16em] text-brass">Suggestion</p>
        <h3 className="mt-1 font-display text-3xl leading-none text-paper">
          {askerName} asked
        </h3>
        {cards.length ? (
          <div className={cn("mt-3 grid gap-2", cards.length > 3 ? "grid-cols-4" : cards.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-3")}>
            {cards.map((card) => (
              <div key={card.id} className={cn(cards.length > 3 ? "h-24" : "h-32", cards.length === 1 && "w-24")}>
                <CardFace card={card} fill />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">This one was said out loud.</p>
        )}
        <div className="mt-4 rounded-[16px] border border-brass/50 bg-[#2a1410] px-3 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-brass">Who showed a card</p>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-2 font-display text-2xl leading-tight text-paper">
            {accent ? <span className="inline-block size-3.5 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" /> : null}
            <span>{result}</span>
          </p>
        </div>
        <Button
          className="mt-4 w-full"
          data-sfx="soft"
          onClick={() => {
            remember(last.id);
            setClosedId(last.id);
          }}
        >
          Close
        </Button>
        <p className="mt-2 text-xs text-subtle">It stays here until you close it. The journal button is still on top.</p>
      </div>
    </div>
  );
}
