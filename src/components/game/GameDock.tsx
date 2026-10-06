import { useEffect, useState, type CSSProperties } from "react";
import { BookOpen, LayoutGrid, MessageCircle, Layers, X } from "lucide-react";
import { useActorId, useGame } from "@/lib/game/store";

/**
 * UI LAYER (layout only). The navigation menu of the digital board: Board, Cards, Journal and Chat. It is mounted once in
 * AppShell, outside every screen, and sits above every prompt, card, banner and the journal itself (--z-dock in
 * styles.css), so a player can always get to the journal, their cards, the board or the chat, whatever else is open.
 *
 * On an iPhone or iPad it is one round journal button that fans the options out in a half circle; on a PC it is a slim rail down the left edge. While it
 * is on screen it switches `data-dock` on <html>, which tells every popup, sheet and screen (through --dock-space and
 * --dock-rail) how much room to leave for it, so the bar can never hide a button underneath itself.
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
  const [fan, setFan] = useState(false);

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

  useEffect(() => {
    if (!show) setFan(false);
  }, [show]);

  if (!state || !show) return null;

  const onChat = screen === "chat" && !journalOpen;
  const unread = onChat ? 0 : (state.chat ?? []).filter((m) => m.fromId !== actor && m.at > chatSeen).length;
  const go = (next: "board" | "cards" | "chat") => {
    setFan(false);
    setJournalOpen(false);
    setScreen(next);
  };
  const tab = (active: boolean, big = false) => `game-dock-tab${active ? " on" : ""}${big ? " big" : ""}`;
  // Half circle above the button: Board, Cards, Journal, Chat from left to right.
  const spot = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    const radius = 108;
    return { "--dx": `${Math.round(Math.cos(r) * radius)}px`, "--dy": `${-Math.round(Math.sin(r) * radius)}px` } as CSSProperties;
  };

  return (
    <nav className={`game-dock${fan ? " open" : ""}`} aria-label="Screens">
      <button type="button" className="dock-scrim" tabIndex={-1} aria-label="Close menu" data-sfx="none" onClick={() => setFan(false)} />
      <div className="dock-items">
        <button type="button" style={spot(152)} className={tab(!journalOpen && screen === "board")} aria-current={!journalOpen && screen === "board" ? "page" : undefined} onClick={() => go("board")}>
          <LayoutGrid className="game-dock-icon" aria-hidden />
          <span>Board</span>
        </button>
        <button type="button" style={spot(112)} className={tab(!journalOpen && screen === "cards")} aria-current={!journalOpen && screen === "cards" ? "page" : undefined} onClick={() => go("cards")}>
          <Layers className="game-dock-icon" aria-hidden />
          <span>Cards</span>
        </button>
        <button
          type="button"
          style={spot(70)}
          className={tab(journalOpen, true)}
          aria-pressed={journalOpen}
          onClick={() => {
            setFan(false);
            setJournalOpen(!journalOpen);
          }}
        >
          <BookOpen className="game-dock-icon" aria-hidden />
          <span>Journal</span>
        </button>
        <button type="button" style={spot(28)} className={tab(onChat)} aria-current={onChat ? "page" : undefined} onClick={() => go("chat")}>
          <MessageCircle className="game-dock-icon" aria-hidden />
          <span>Chat</span>
          {unread ? <span className="game-dock-badge">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
      </div>
      <button
        type="button"
        className={`dock-main${journalOpen ? " on" : ""}`}
        aria-expanded={fan}
        aria-label={journalOpen ? "Close the journal" : fan ? "Close menu" : "Open menu: journal, cards, chat, board"}
        onClick={() => {
          // With the journal open this is a one-tap way back; otherwise it opens or folds the menu.
          if (journalOpen) {
            setJournalOpen(false);
            setFan(false);
            return;
          }
          setFan((v) => !v);
        }}
      >
        {journalOpen ? <X aria-hidden /> : <BookOpen aria-hidden />}
        {!fan && !journalOpen && unread ? <span className="game-dock-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
    </nav>
  );
}
