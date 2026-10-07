import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { CHAT_MAX_LENGTH } from "@/lib/game/engine";
import { useActorId, useGame } from "@/lib/game/store";

/**
 * The Chat tab: the one place where every message stays on screen, and the only place to write one.
 * Bubbles on the other screens come from ChatBubbles and fade away by themselves.
 *
 * UI LAYER: the chat is its own full-screen layer (.chat-layer, z-index --z-chat): above every popup, card and prompt,
 * and under only the journal and the Board / Cards / Journal / Chat bar. When the keyboard opens it shrinks to the
 * visible part of the screen, so the message box is never hidden behind the keyboard on an iPhone.
 */
export function ChatScreen() {
  const state = useGame((s) => s.state);
  const sendChat = useGame((s) => s.sendChat);
  const markChatSeen = useGame((s) => s.markChatSeen);
  const actor = useActorId();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const chat = state?.chat ?? [];
  const newest = chat.length ? chat[chat.length - 1].at : 0;
  const guests = state?.players.length ?? 0;

  // Keyboard: follow the part of the screen that is really visible.
  const [vv, setVv] = useState<{ h: number; open: boolean } | null>(null);
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.visualViewport : null;
    if (!v) return;
    const read = () => {
      const open = window.innerHeight - v.height > 120;
      setVv(open ? { h: v.height, open } : null);
      if (open) window.scrollTo(0, 0);
    };
    read();
    v.addEventListener("resize", read);
    v.addEventListener("scroll", read);
    return () => {
      v.removeEventListener("resize", read);
      v.removeEventListener("scroll", read);
    };
  }, []);

  useEffect(() => {
    markChatSeen(newest);
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.length, newest, markChatSeen, vv?.h]);

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    sendChat(clean);
    setText("");
  };

  return (
    <div
      className="chat-layer leather"
      role="region"
      aria-label="Chat"
      style={vv ? { bottom: "auto", height: vv.h, paddingBottom: 6 } : undefined}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <div className="flex shrink-0 items-end justify-between gap-2 px-1 pb-1.5 pt-2">
          <p className="font-display text-2xl leading-none">Chat</p>
          <p className="text-xs text-subtle">{guests ? `${guests} at the table` : ""}</p>
        </div>
        <div className="case-shell flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-[20px] px-3 py-3" aria-live="polite">
          {chat.length ? (
            chat.map((m, i) => {
              const mine = m.fromId === actor;
              const sameAsPrev = i > 0 && chat[i - 1].fromId === m.fromId;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"} ${sameAsPrev ? "" : "mt-1.5"}`}>
                  {!mine && !sameAsPrev ? <span className="mb-0.5 ml-3 text-[11px] text-subtle">{m.name}</span> : null}
                  <p
                    className={`max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-snug shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${
                      mine ? "rounded-br-[6px] bg-[#0a84ff] text-white" : "rounded-bl-[6px] bg-[#e9e9eb] text-[#111]"
                    }`}
                  >
                    {m.text}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="m-auto text-center text-sm text-muted">No messages yet. Say something to the table.</p>
          )}
          <div ref={end} />
        </div>
        <form
          className="flex shrink-0 items-center gap-2 pb-1 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={CHAT_MAX_LENGTH}
            placeholder="Message the table"
            aria-label="Message the table"
            enterKeyHint="send"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-raised px-4 text-base text-paper outline-none placeholder:text-subtle focus:border-brass"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send message"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[#0a84ff] text-white transition-opacity active:scale-95 disabled:opacity-40"
          >
            <ArrowUp className="size-5" strokeWidth={2.6} />
          </button>
        </form>
      </div>
    </div>
  );
}
