import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { blockingPlayerIds } from "@/lib/game/engine";
import { turnActorId, useActorId, useGame, useMyHand } from "@/lib/game/store";
import { NPC_ID, type CardDef } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { CardFace } from "./CardFace";
import { closedBefore, rememberClosed } from "./SuggestionRecap";

/**
 * UI LAYER: everything the table needs from you while you are in the Chat tab, so you never have to leave it
 * (and the keyboard never has to close).
 *
 *  1. TOP BOX   a slim status box at the top of the message area. It says what is going on (who is asking what,
 *               who is choosing a card, who showed whom, whose turn it is). It only covers old messages.
 *  2. CENTER    when something is waiting on YOU (show a card, say yes / no, a card was shown to you, continue),
 *               one bigger card sits in the middle of the message area. Nothing else is covered.
 *
 * KEYBOARD RULE: nothing in here may take focus. Every press is swallowed on pointer-down (so the message box
 * keeps focus on an iPhone) and `act` hands focus straight back to the box after the action runs.
 */

const FACES_KEY = "gmm.faces";

function useFacesDown() {
  const [down, setDown] = useState(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(FACES_KEY) === "down";
    } catch {
      return false;
    }
  });
  const turnOver = () => {
    setDown(false);
    try {
      localStorage.setItem(FACES_KEY, "up");
    } catch {
      /* private mode: it still turns over for this visit */
    }
    window.dispatchEvent(new Event("gmm:faces-up"));
  };
  return { down, turnOver };
}

const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

function Chips({ cards }: { cards: CardDef[] }) {
  return <span className="text-paper">{cards.map((c) => c.name).join(" · ")}</span>;
}

export function ChatPrompts({ kb, act }: { kb: boolean; act: (fn: () => void) => void }) {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const hand = useMyHand();
  const setScreen = useGame((s) => s.setScreen);
  const showCard = useGame((s) => s.showCard);
  const ackCard = useGame((s) => s.ackCard);
  const reply = useGame((s) => s.reply);
  const retractReply = useGame((s) => s.retractReply);
  const done = useGame((s) => s.done);
  const { down: facesDown, turnOver } = useFacesDown();
  const [picked, setPicked] = useState<string>("");
  const [sure, setSure] = useState(false);
  const [spyClosed, setSpyClosed] = useState("");
  const [recapClosed, setRecapClosed] = useState("");

  const q = state?.phase === "question" ? state.question : undefined;
  const qId = q ? `${q.askerId}:${q.showerId ?? ""}:${q.askingId ?? ""}:${q.shownCardId ?? ""}:${q.missId ?? ""}` : "";
  // A new step of the question starts fresh: nothing stays picked, no leftover "are you sure".
  useEffect(() => {
    setPicked("");
    setSure(false);
  }, [qId]);

  if (!state || state.phase === "lobby") return null;
  const cardById = (id?: string | null) => (id ? state.cards.find((c) => c.id === id) : undefined);
  const nameOf = (id?: string | null) => (id === NPC_ID ? "The NPC" : state.players.find((p) => p.id === id)?.name ?? "Someone");

  // ---- Top box lines -------------------------------------------------------------------------------------
  const lines: { key: string; node: ReactNode; onTap?: () => void; close?: () => void }[] = [];

  const myRoll = state.settings.table === "board" && state.phase === "roll" && turnActorId(state) === actor;
  const blocking = state.phase === "event" && state.event ? blockingPlayerIds(state) : [];
  const myPower = state.settings.table === "board" && blocking.includes(actor);
  if (myRoll) {
    lines.push({
      key: "turn",
      node: <b className="text-brass">It's your turn. Tap to go to the board.</b>,
      onTap: () => setScreen("board"),
    });
  } else if (myPower) {
    lines.push({
      key: "power",
      node: <b className="text-brass">A power up needs you. Tap to open it.</b>,
      onTap: () => setScreen("board"),
    });
  } else if (blocking.length && state.event) {
    const names = blocking.map((id) => nameOf(id)).join(", ");
    lines.push({
      key: "wait",
      node: (
        <>
          <span className="text-[10px] uppercase tracking-[0.14em] text-brass">{state.event.title}</span>
          <br />
          <span className="text-paper">Waiting on {names}</span>
        </>
      ),
    });
  }

  let center: ReactNode = null;

  if (q) {
    const asker = state.players.find((p) => p.id === q.askerId);
    const guided = (state.influences ?? []).some((i) => i.victimId === q.askerId && i.controllerId === actor);
    const isAsker = actor === q.askerId || guided;
    const asked = [q.suspectId, q.roomId, q.weaponId, q.timeId].map(cardById).filter((c): c is CardDef => Boolean(c));
    const shownCard = cardById(q.shownCardId);
    const showerName = q.stealth ? "A player" : nameOf(q.showerId);
    const askerName = actor === q.askerId ? "You" : asker?.name ?? "Someone";
    const mineToShow = actor === q.showerId && !q.shownCardId && !q.missId;
    const askingMe = Boolean(q.spoken && !q.shownCardId && !q.showerId && q.askingId && actor === q.askingId);
    const lostBet = q.gambleResult === "lost" && isAsker;
    const spySees = Boolean(
      shownCard && state.spy?.byId === actor && state.spy.targetId === q.askerId && actor !== q.askerId && spyClosed !== shownCard.id,
    );
    const shownToMe = Boolean(shownCard && !q.missId && !lostBet && isAsker);

    let sub: ReactNode;
    if (q.missId) sub = isAsker ? `${nameOf(q.missId)} has none of these.` : `${nameOf(q.missId)} has none of these. Waiting on ${asker?.name ?? "the asker"}.`;
    else if (lostBet) sub = "The bet was lost.";
    else if (shownCard || q.cardShown || q.shownCardId) sub = isAsker ? `${showerName} showed you a card.` : `${showerName} showed ${asker?.name ?? "the asker"} a card privately.`;
    else if (mineToShow) sub = <b className="text-brass">You have to show a card.</b>;
    else if (askingMe) sub = <b className="text-brass">Do you hold one of these?</b>;
    else if (q.showerId) sub = `${nameOf(q.showerId)} is choosing a card to show.`;
    else if (q.closeTurn) sub = "No one showed a card.";
    else if (q.heldByAsker) sub = "The asker already holds one of these.";
    else if (q.nobodyHad) sub = "No one holds these cards.";
    else if (q.askingId) sub = `Asking ${nameOf(q.askingId)}…`;
    else sub = "Waiting for the next player.";

    lines.push({
      key: "question",
      node: (
        <>
          <span className="text-[10px] uppercase tracking-[0.14em] text-brass">{askerName === "You" ? "You ask" : `${askerName} asks`}</span>
          {asked.length ? (
            <>
              {" "}
              <Chips cards={asked} />
            </>
          ) : q.spoken ? (
            <span className="text-muted"> out loud</span>
          ) : null}
          <br />
          <span className="text-paper">{sub}</span>
        </>
      ),
    });

    // ---- Center card: only what is waiting on YOU ----
    const panelCard = (title: string, body: ReactNode) => (
      <div className="case-shell pointer-events-auto flex max-h-full w-full max-w-[22rem] flex-col gap-2 overflow-y-auto overscroll-contain rounded-[24px] px-3.5 py-3.5 text-center shadow-[0_14px_36px_rgba(0,0,0,0.6)]">
        <p className="font-display text-xl leading-tight text-paper">{title}</p>
        {body}
      </div>
    );
    const big = kb ? "h-24" : "h-40";
    const faceDownBtn = (
      <button
        type="button"
        className={cn("mx-auto grid w-24 place-items-center rounded-[12px] border border-paper/30 bg-black font-display text-4xl text-paper", big)}
        aria-label="Turn your cards over"
        onClick={() => act(turnOver)}
      >
        ?
      </button>
    );

    if (lostBet) {
      center = panelCard(
        "You lost the bet",
        <button type="button" className="chat-cta" onClick={() => act(ackCard)}>
          Continue
        </button>,
      );
    } else if (shownToMe && shownCard) {
      center = panelCard(
        `${showerName} shows you a card`,
        <>
          <p className="text-[11px] uppercase tracking-[0.16em] text-brass">Shown only to you</p>
          <div className="mx-auto flex justify-center">
            <div className={cn("w-auto", kb ? "h-28" : "h-52")} style={{ aspectRatio: "5 / 7" }}>
              <CardFace card={shownCard} fill />
            </div>
          </div>
          <button type="button" className="chat-cta" onClick={() => act(ackCard)}>
            Got it
          </button>
        </>,
      );
    } else if (spySees && shownCard) {
      center = panelCard(
        "You spied this card",
        <>
          <div className="mx-auto flex justify-center">
            <div className={cn("w-auto", kb ? "h-28" : "h-52")} style={{ aspectRatio: "5 / 7" }}>
              <CardFace card={shownCard} fill />
            </div>
          </div>
          <button type="button" className="chat-cta" onClick={() => act(() => setSpyClosed(shownCard.id))}>
            Close
          </button>
        </>,
      );
    } else if (mineToShow && !q.spoken) {
      const matches = q.matchingCardIds.map(cardById).filter((c): c is CardDef => Boolean(c));
      center = panelCard(
        "Show exactly one card",
        <>
          <p className="text-xs text-muted">Only {asker?.name ?? "the asker"} will see which one.</p>
          {facesDown ? (
            faceDownBtn
          ) : matches.length ? (
            <div className={cn("grid gap-2", matches.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-2")}>
              {matches.map((card) => (
                <div key={card.id} className={cn(big, matches.length === 1 && "w-28")}>
                  <CardFace card={card} fill onClick={() => act(() => showCard(card.id))} />
                </div>
              ))}
            </div>
          ) : q.matchingCardIds.length ? (
            q.matchingCardIds.map((id) => (
              <button key={id} type="button" className="chat-cta" onClick={() => act(() => showCard(id))}>
                Show {cardById(id)?.name ?? "this card"}
              </button>
            ))
          ) : (
            <button type="button" className="chat-cta" onClick={() => act(ackCard)}>
              I have nothing to show
            </button>
          )}
        </>,
      );
    } else if (mineToShow && q.spoken) {
      // Speak mode: choose from the whole hand, then confirm, so a stray tap never shows the wrong card.
      center = panelCard(
        "Pick a card to show",
        <>
          <p className="text-xs text-muted">Only {asker?.name ?? "the asker"} will see which one.</p>
          {facesDown ? (
            faceDownBtn
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {hand.map((card) => (
                  <div key={card.id} className={cn(kb ? "h-20" : "h-28", "rounded-[10px]", picked === card.id && "ring-2 ring-brass")}>
                    <CardFace card={card} fill onClick={() => act(() => setPicked(card.id))} />
                  </div>
                ))}
              </div>
              <button type="button" className="chat-cta" disabled={!picked} onClick={() => act(() => showCard(picked))}>
                {picked ? `Show ${cardById(picked)?.name ?? "this card"}` : "Tap a card first"}
              </button>
              {sure ? (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-paper/20 bg-black/30 p-2">
                  <button type="button" className="chat-ghost" onClick={() => act(() => setSure(false))}>
                    Keep looking
                  </button>
                  <button type="button" className="chat-cta" onClick={() => act(() => { setSure(false); retractReply(); })}>
                    I have none
                  </button>
                </div>
              ) : (
                <button type="button" className="chat-ghost" onClick={() => act(() => setSure(true))}>
                  I actually don't have a card for you
                </button>
              )}
            </>
          )}
        </>,
      );
    } else if (askingMe) {
      center = panelCard(
        `Do you have a card that ${asker?.name ?? "the asker"} asked for?`,
        <>
          {asked.length ? <p className="text-xs text-muted">{asked.map((c) => c.name).join(" · ")}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="chat-ghost" data-sfx="deny" onClick={() => act(() => reply(false))}>
              No
            </button>
            <button type="button" className="chat-cta" data-sfx="confirm" onClick={() => act(() => reply(true))}>
              Yes
            </button>
          </div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-subtle">Your hand · {hand.length}</p>
          {facesDown ? (
            faceDownBtn
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {hand.map((card) => (
                <div key={card.id} className={kb ? "h-16" : "h-24"}>
                  <CardFace card={card} fill />
                </div>
              ))}
            </div>
          )}
        </>,
      );
    } else if (q.missId && isAsker) {
      center = panelCard(
        `${nameOf(q.missId)} has none of these`,
        <>
          <p className="text-xs text-muted">Only you can continue. Everyone is waiting on you.</p>
          <button type="button" className="chat-cta" onClick={() => act(ackCard)}>
            Continue to the next player
          </button>
        </>,
      );
    } else if (q.heldByAsker && !q.missId && isAsker) {
      center = panelCard(
        "You already hold one of these",
        <button type="button" className="chat-cta" onClick={() => act(ackCard)}>
          Continue
        </button>,
      );
    } else if (q.nobodyHad && !q.missId && !q.heldByAsker && !q.closeTurn && actor === q.askerId) {
      center = panelCard(
        "No one holds these cards",
        <>
          <p className="text-xs text-muted">That is not marked in any journal. Write it down yourself.</p>
          <button type="button" className="chat-cta" onClick={() => act(ackCard)}>
            Continue
          </button>
        </>,
      );
    } else if (q.closeTurn && !q.missId && isAsker) {
      center = panelCard(
        "No one showed a card",
        <button type="button" className="chat-cta" onClick={() => act(done)}>
          End turn
        </button>,
      );
    }
  } else if (state.lastSuggestion && state.phase !== "gameover" && state.startedAt) {
    // The suggestion is over: one quiet line about it, until you close it.
    const last = state.lastSuggestion;
    const closed = recapClosed === last.id || closedBefore(last.id);
    if (!closed) {
      const mine = actor === last.askerId;
      const showerId = last.showerId === NPC_ID && !mine ? null : last.showerId;
      const asker = nameOf(last.askerId);
      const shower = showerId ? nameOf(showerId) : "";
      const result = showerId === NPC_ID
        ? "The NPC showed you a card."
        : shower
          ? mine
            ? `${shower} showed you a card.`
            : `${shower} showed ${asker} a card.`
          : state.settings?.extraDifficulty
            ? "No one showed a card, but the NPC may have shown this player a card."
            : "No one showed a card.";
      const cards = (mine || !last.spoken ? last.cardIds : []).map(cardById).filter((c): c is CardDef => Boolean(c));
      lines.push({
        key: "recap",
        node: (
          <>
            <span className="text-[10px] uppercase tracking-[0.14em] text-brass">{mine ? "You asked" : `${asker} asked`}</span>
            {cards.length ? (
              <>
                {" "}
                <Chips cards={cards} />
              </>
            ) : null}
            <br />
            <span className="text-paper">{result}</span>
          </>
        ),
        close: () => {
          rememberClosed(last.id);
          setRecapClosed(last.id);
        },
      });
    }
  }

  if (!lines.length && !center) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 p-2" onMouseDown={keepFocus} onPointerDown={keepFocus}>
      <style>{`
.chat-cta{width:100%;min-height:44px;border-radius:14px;border:1px solid color-mix(in srgb,var(--color-brass) 70%,transparent);background:var(--color-brass);color:#1c1410;font-weight:700;font-size:15px;padding:8px 12px;touch-action:manipulation}
.chat-cta:disabled{opacity:.45}
.chat-cta:active:not(:disabled){transform:scale(.98)}
.chat-ghost{width:100%;min-height:40px;border-radius:14px;border:1px solid color-mix(in srgb,var(--color-paper) 30%,transparent);background:transparent;color:var(--color-paper);font-size:14px;padding:6px 10px;touch-action:manipulation}
`}</style>
      {lines.length ? (
        <div className="pointer-events-auto flex shrink-0 flex-col gap-1 rounded-[16px] border border-brass/60 bg-[#2a1410]/95 px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.5)]" role="status" aria-live="polite">
          {lines.map((line) => (
            <div key={line.key} className="flex items-start gap-2 text-left text-[13px] leading-snug">
              {line.onTap ? (
                <button type="button" className="min-w-0 flex-1 text-left" onClick={line.onTap}>
                  {line.node}
                </button>
              ) : (
                <p className="min-w-0 flex-1">{line.node}</p>
              )}
              {line.close ? (
                <button type="button" aria-label="Dismiss" className="grid size-7 shrink-0 place-items-center rounded-full text-muted" onClick={line.close}>
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {center ? <div className="flex min-h-0 flex-1 items-center justify-center">{center}</div> : null}
    </div>
  );
}
