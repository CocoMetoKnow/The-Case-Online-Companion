import { useEffect } from "react";
import { BookOpen, LayoutGrid, MessageCircle, Layers } from "lucide-react";
import { useActorId, useGame } from "@/lib/game/store";

/**
 * UI LAYER (layout only). The navigation bar of the digital board: Board, Cards, Journal and Chat. It is mounted once in
 * AppShell, outside every screen, and sits above every prompt, card, banner, the chat and the journal itself (--z-dock in
 * styles.css), so a player can always get to the journal, their cards, the board or the chat, whatever else is open.
 *
 * Priority: the Journal is the biggest tab and the Chat the second biggest (then Board and Cards). On an iPhone or iPad it is
 * a slim bar that sits right on the bottom edge, so there is no empty strip between it and the screen above. On a PC, and
 * on a phone turned on its side, it is a slim rail down the left edge with Journal first and Chat second. While it is on screen
 * it switches `data-dock` on <html>, which tells every popup, sheet and screen (through --dock-space and --dock-rail) how
 * much room to leave for it, so the bar can never hide a button underneath itself.
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

  const show = Boolean(
    state &&
      view === "play" &&
      state.startedAt &&
      state.phase !== "lobby" &&
      state.settings.table === "board" &&
      !(passGate && state.settings.playMode !== "online") &&
      !(verdict && state.phase !== "gameover"),
  );

  // Tell the rest of the UI the bar is there (and take it back the moment it is gone).
  useEffect(() => {
    if (!show) return;
    const root = document.documentElement;
    root.setAttribute("data-dock", "on");
    return () => root.removeAttribute("data-dock");
  }, [show]);

  if (!state || !show) return null;

  const onChat = screen === "chat" && !journalOpen;
  const unread = onChat ? 0 : (state.chat ?? []).filter((m) => m.fromId !== actor && m.at > chatSeen).length;
  const go = (next: "board" | "cards" | "chat") => {
    setJournalOpen(false);
    setScreen(next);
  };
  const onBoard = !journalOpen && screen === "board";
  const onCards = !journalOpen && screen === "cards";
  const tab = (active: boolean, extra = "") => `game-dock-tab${extra ? ` ${extra}` : ""}${active ? " on" : ""}`;

  return (
    <nav className="game-dock" aria-label="Screens">
      <button type="button" className={tab(onBoard, "rail-board")} aria-current={onBoard ? "page" : undefined} onClick={() => go("board")}>
        <LayoutGrid className="game-dock-icon" aria-hidden />
        <span>Board</span>
      </button>
      <button type="button" className={tab(onCards, "rail-cards")} aria-current={onCards ? "page" : undefined} onClick={() => go("cards")}>
        <Layers className="game-dock-icon" aria-hidden />
        <span>Cards</span>
      </button>
      <button type="button" className={tab(journalOpen, "big")} aria-pressed={journalOpen} onClick={() => setJournalOpen(!journalOpen)}>
        <BookOpen className="game-dock-icon" aria-hidden />
        <span>Journal</span>
      </button>
      <button type="button" className={tab(onChat, "second")} aria-current={onChat ? "page" : undefined} onClick={() => go("chat")}>
        <MessageCircle className="game-dock-icon" aria-hidden />
        <span>Chat</span>
        {unread ? <span className="game-dock-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
    </nav>
  );
}
