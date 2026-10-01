/**
 * ============================================================
 *  UI / RENDER LAYER — the one and only journal
 * ============================================================
 *  Mounted once by AppShell, so the tab is reachable from every screen and
 *  sits above every other overlay (z-index 9000+). Screens must NOT render
 *  their own journal button or sheet; call `uiHooks.openJournal()` instead.
 */
import { useEffect } from "react";
import { useGame } from "@/lib/game/store";
import { sfxPaper } from "@/lib/game/sfx";
import { useUI } from "@/lib/ui/ui";
import { NotesBook } from "./NotesBook";

export function JournalLayer() {
  const state = useGame((s) => s.state);
  const viewing = useGame((s) => s.viewingPlayerId);
  const open = useUI((s) => s.journalOpen);
  const setOpen = useUI((s) => s.setJournalOpen);
  const active = Boolean(state && state.phase !== "lobby");

  useEffect(() => {
    if (!active && open) setOpen(false);
  }, [active, open, setOpen]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, setOpen]);

  if (!active || !state) return null;
  const shut = (state.notesLock?.[viewing] ?? 0) > 0;

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="journal-book journal-fab"
          aria-label={shut ? "Journal is shut" : "Open journal"}
          onClick={() => {
            if (!shut) sfxPaper();
            setOpen(true);
          }}
        >
          <span>{shut ? "Shut" : "Journal"}</span>
        </button>
      ) : (
        <div className="journal-layer" role="dialog" aria-label="Detective's journal">
          <div className="journal-bar">
            <p className="font-display text-2xl">Detective&rsquo;s journal</p>
            <button type="button" className="journal-close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
            <NotesBook />
          </div>
        </div>
      )}
    </>
  );
}
