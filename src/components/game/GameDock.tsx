import { useActorId, useGame } from "@/lib/game/store";

/**
 * The bottom bar of the digital board: Board, Cards, Journal and Chat. It is mounted once in AppShell, outside every
 * screen, and sits above every prompt, card, banner and the journal itself (z-index 100000), so a player can always
 * get to the journal, their cards, the board or the chat, whatever else is open.
 */
export const DOCK_HEIGHT = 56;

export function GameDock() {
  const state = useGame((s) => s.state);
  const view = useGame((s) => s.view);
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const journalOpen = useGame((s) => s.journalOpen);
  const setJournalOpen = useGame((s) => s.setJournalOpen);
  const passGate = useGame((s) => s.passGate);
  const verdict = useGame((s) => s.verdict);
  const chatSeen = useGame((s) => s.chatSeen);
  const actor = useActorId();

  if (!state || view !== "play" || !state.startedAt || state.phase === "lobby") return null;
  if (state.settings.table !== "board") return null;
  if (passGate && state.settings.playMode !== "online") return null;
  if (verdict && state.phase !== "gameover") return null;

  const onChat = screen === "chat" && !journalOpen;
  const unread = onChat ? 0 : (state.chat ?? []).filter((m) => m.fromId !== actor && m.at > chatSeen).length;
  const go = (next: "board" | "cards" | "chat") => {
    setJournalOpen(false);
    setScreen(next);
  };
  const tab = (active: boolean) =>
    `relative h-11 flex-1 rounded-[12px] border text-sm font-semibold ${active ? "border-brass bg-raised text-paper" : "border-line bg-[#140e0b] text-muted"}`;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 flex gap-2 border-t border-line bg-[#140e0bf2] px-2 pt-1.5"
      style={{ zIndex: 100000, paddingBottom: "max(env(safe-area-inset-bottom), 6px)", minHeight: DOCK_HEIGHT }}
      aria-label="Screens"
    >
      <button type="button" className={tab(!journalOpen && screen === "board")} aria-current={!journalOpen && screen === "board" ? "page" : undefined} onClick={() => go("board")}>
        Board
      </button>
      <button type="button" className={tab(!journalOpen && screen === "cards")} aria-current={!journalOpen && screen === "cards" ? "page" : undefined} onClick={() => go("cards")}>
        Cards
      </button>
      <button type="button" className={tab(journalOpen)} aria-pressed={journalOpen} onClick={() => setJournalOpen(!journalOpen)}>
        Journal
      </button>
      <button type="button" className={tab(onChat)} aria-current={onChat ? "page" : undefined} onClick={() => go("chat")}>
        Chat
        {unread ? (
          <span className="absolute -right-0.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#ff3b30] px-1 text-[11px] font-bold leading-5 text-white">{unread > 9 ? "9+" : unread}</span>
        ) : null}
      </button>
    </nav>
  );
}
