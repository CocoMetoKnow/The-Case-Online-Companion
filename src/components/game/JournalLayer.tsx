import { Button } from "@/components/ui/button";
import { sfxPaper } from "@/lib/game/sfx";
import { useActorId, useGame } from "@/lib/game/store";
import { useEffect } from "react";
import { PickCharacterButton } from "./CharacterPicker";
import { NotesBook } from "./NotesBook";

/**
 * The detective journal, mounted once at the very top of the app (see AppShell) instead of
 * inside one particular screen. That is what makes it reachable from everywhere: the
 * persistent Journal tab and the open pages both live here, outside every other screen's
 * stacking order, and use the highest z-index in the game (.journal-fab / .journal-layer,
 * 99999 in styles.css) so no modal, card, verdict or overlay can ever cover them.
 */
export function JournalLayer() {
  const state = useGame((s) => s.state);
  const view = useGame((s) => s.view);
  const open = useGame((s) => s.journalOpen);
  const setOpen = useGame((s) => s.setJournalOpen);
  const passGate = useGame((s) => s.passGate);
  const actor = useActorId();

  // Escape closes the pages.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Nothing to write in until the cards are dealt.
  if (!state || view !== "play" || !state.startedAt || state.phase === "lobby") return null;
  // One shared phone, mid hand-off: the next guest has not confirmed yet, so the sheet on screen
  // is not theirs. The gate clears with a single tap, then the tab is back.
  if (passGate && state.settings.playMode !== "online") return null;

  const locked = (state.notesLock?.[actor] ?? 0) > 0;
  const me = state.players.find((player) => player.id === actor);

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="journal-book journal-book-sm journal-fab"
          aria-label={locked ? "Journal, shut" : "Open journal"}
          onClick={() => {
            if (!locked) sfxPaper();
            setOpen(true);
          }}
        >
          <span>{locked ? "Shut" : "Journal"}</span>
        </button>
      ) : (
        <div className="journal-layer flex flex-col" role="dialog" aria-label="Detective journal">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <p className="truncate font-display text-2xl text-paper">Journal</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {me ? <PickCharacterButton player={me} /> : null}
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Back in the case
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <NotesBook />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
