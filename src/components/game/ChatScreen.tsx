import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH } from "@/lib/game/engine";
import { useActorId, useGame } from "@/lib/game/store";

/**
 * The Chat tab: the one place where every message stays on screen, and the only place to write one.
 * Bubbles on the other screens come from ChatBubbles and fade away by themselves.
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

  useEffect(() => {
    markChatSeen(newest);
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.length, newest, markChatSeen]);

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    sendChat(clean);
    setText("");
  };

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col px-2 pt-[env(safe-area-inset-top)]">
      <p className="shrink-0 py-1 font-display text-2xl leading-none">Chat</p>
      <div className="case-shell flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-[20px] px-3 py-3" aria-live="polite">
        {chat.length ? (
          chat.map((m, i) => {
            const mine = m.fromId === actor;
            const sameAsPrev = i > 0 && chat[i - 1].fromId === m.fromId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && !sameAsPrev ? <span className="mb-0.5 ml-3 text-[11px] text-subtle">{m.name}</span> : null}
                <p
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-snug ${
                    mine ? "bg-[#0a84ff] text-white" : "bg-[#e9e9eb] text-[#111]"
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
        className="flex shrink-0 items-center gap-2 py-2"
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
          className="h-11 shrink-0 rounded-full bg-[#0a84ff] px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
