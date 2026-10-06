import { useEffect, useRef, useState } from "react";
import { useActorId, useGame } from "@/lib/game/store";

const SHOW_MS = 7000;
const MAX_BUBBLES = 3;

type Bubble = { id: string; name: string; text: string };

/**
 * A message from someone else pops up like an iPhone bubble on whatever screen you are on, then slowly fades.
 * On the Chat tab itself nothing pops up, because the whole conversation is already there.
 */
export function ChatBubbles() {
  const code = useGame((s) => s.state?.code);
  const chat = useGame((s) => s.state?.chat);
  const actor = useActorId();
  const setScreen = useGame((s) => s.setScreen);
  const setJournalOpen = useGame((s) => s.setJournalOpen);
  const board = useGame((s) => s.state?.settings.table === "board");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const seen = useRef<{ code?: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!code) return;
    if (!seen.current || seen.current.code !== code) {
      // First look at this table: what was said before now is history, not news.
      seen.current = { code, ids: new Set((chat ?? []).map((m) => m.id)) };
      setBubbles([]);
      return;
    }
    const known = seen.current.ids;
    for (const m of chat ?? []) {
      if (known.has(m.id)) continue;
      known.add(m.id);
      if (m.fromId === actor) continue;
      const { screen, journalOpen } = useGame.getState();
      if (board && screen === "chat" && !journalOpen) continue;
      setBubbles((list) => [...list, { id: m.id, name: m.name, text: m.text }].slice(-MAX_BUBBLES));
      window.setTimeout(() => setBubbles((list) => list.filter((b) => b.id !== m.id)), SHOW_MS + 200);
    }
  }, [chat, code, actor, board]);

  if (!bubbles.length) return null;
  return (
    <div className="chat-bubbles" aria-live="polite">
      <style>{`
.chat-bubbles{position:fixed;z-index:100001;left:0;right:0;top:calc(env(safe-area-inset-top) + 8px);display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:0 12px;pointer-events:none}
.chat-bubble{pointer-events:auto;position:relative;max-width:min(82vw,320px);padding:8px 14px 9px;border-radius:20px 20px 20px 6px;background:#e9e9eb;color:#111;box-shadow:0 6px 18px rgba(0,0,0,.45);text-align:left;font-size:15px;line-height:1.25;opacity:0;animation:chat-pop ${SHOW_MS}ms ease forwards;touch-action:manipulation}
.chat-bubble b{display:block;font-size:11px;font-weight:700;color:#6b6b70;margin-bottom:1px}
.chat-bubble span{display:block;word-break:break-word;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
@keyframes chat-pop{0%{opacity:0;transform:translateY(-14px) scale(.82)}5%{opacity:1;transform:translateY(0) scale(1.04)}9%{transform:scale(1)}58%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-4px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.chat-bubble{animation-name:chat-fade}@keyframes chat-fade{0%{opacity:0}8%{opacity:1}58%{opacity:1}100%{opacity:0}}}
`}</style>
      {bubbles.map((b) => (
        <button
          key={b.id}
          type="button"
          className="chat-bubble"
          onClick={() => {
            if (!board) return;
            setJournalOpen(false);
            setScreen("chat");
          }}
        >
          <b>{b.name}</b>
          <span>{b.text}</span>
        </button>
      ))}
    </div>
  );
}
