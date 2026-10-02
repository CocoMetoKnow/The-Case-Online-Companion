import { cardsByCategory } from "@/lib/game/cards";
import { sfxSolveStart } from "@/lib/game/sfx";
import { canAsk, currentPlayer, turnActorId, useActorId, useGame, useMyHand, useMyNotes } from "@/lib/game/store";
import type { CardDef, CategoryId, GameState, PlayerNotes, SheetMark } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";
import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function QuestionPanel({ startOpen = false, fit = false, onAsked }: { startOpen?: boolean; fit?: boolean; onAsked?: () => void }) {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const ask = useGame((s) => s.ask);
  const hand = useMyHand();
  const [open, setOpen] = useState(startOpen);
  if (!state) return null;
  if (!canAsk(state, actor)) return null;
  // Speak mode picks cards the same way as every other mode. The table is still asked out loud, one player at
  // a time, exactly as before. The picks stay on this phone as a reminder of what to say.
  const speak = Boolean(state.settings.speakMode);
  const steps: CategoryId[] = state.whisperMode
    ? ["room", "suspect", "weapon"]
    : state.settings.timeOfDayEnabled
      ? ["room", "suspect", "weapon", "time"]
      : ["room", "suspect", "weapon"];

  return (
    <PickFlow
      open={open}
      onOpen={() => setOpen(true)}
      tone="plain"
      title="Make a suggestion"
      note={
        speak
          ? "Pick your cards, then say them out loud. Each player is asked in order."
          : "Ask the table. Someone may have to show you a card."
      }
      closedLabel="Make a suggestion"
      steps={steps}
      suggesting
      handIds={hand.map((c) => c.id)}
      confirmTitle={speak ? "Say this out loud" : "Your suggestion"}
      doneLabel={speak ? "(Suggestion)" : "Ask the table"}
      fit={fit}
      onDone={(pick) => {
        if (!pick.suspect || !pick.weapon || !pick.room) return;
        ask({
          suspectId: pick.suspect,
          roomId: pick.room,
          weaponId: pick.weapon,
          timeId: pick.time,
        });
        onAsked?.();
      }}
    />
  );
}

/** Gambler: one line for the whole table. The kind of card that was bet on is never named here. */
function GambleLine({ q, askerName, mine }: { q: NonNullable<GameState["question"]>; askerName: string; mine: boolean }) {
  let text = "";
  if (q.gambleOff) text = `${mine ? "You have" : `${askerName} has`} chosen not to gamble.`;
  else if (q.gambleResult === "won") text = `${mine ? "You" : askerName} won the gamble.`;
  else if (q.gambleResult === "lost") text = `${mine ? "You" : askerName} lost the gamble.`;
  else if (q.gamble) text = `${mine ? "You are" : `${askerName} is`} gambling on this suggestion.`;
  if (!text) return null;
  return <p className="mt-2 text-sm font-medium text-brass">{text}</p>;
}

/** Gambler: the asker called the wrong kind of card. A card was shown, but they never see which. */
function LostBet({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mt-3 rounded-[16px] border-2 border-brass bg-[#2a1410] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-brass">The Gambler</p>
      <p className="mt-1 font-display text-3xl leading-tight text-paper">You lost the gamble</p>
      <p className="mt-2 text-base text-paper">A card was shown, but you don't get to see it. Your turn is over.</p>
      <Button className="mt-3 w-full" data-sfx="deny" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}

export function QuestionResolve({ facesDown = false, onReveal }: { facesDown?: boolean; onReveal?: () => void }) {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const showCard = useGame((s) => s.showCard);
  const ackCard = useGame((s) => s.ackCard);
  const done = useGame((s) => s.done);

  // When it becomes your turn to show a card, the cards you can show take the big top spot and the
  // requested cards shrink into the lower group. The requested group slides to its new place
  // (FLIP, transform only) so the swap reads as one movement instead of a jump.
  const qNow = state?.question;
  const handUp = Boolean(
    state && qNow && !qNow.spoken && !qNow.missId && !qNow.shownCardId && state.phase === "question" && actor === qNow.showerId,
  );
  const requestedRef = useRef<HTMLElement>(null);
  const lastTop = useRef<number | null>(null);
  const lastHandUp = useRef(handUp);
  useLayoutEffect(() => {
    const el = requestedRef.current;
    if (!el) {
      lastTop.current = null;
      return;
    }
    const top = el.getBoundingClientRect().top;
    const prev = lastTop.current;
    const flipped = lastHandUp.current !== handUp;
    lastTop.current = top;
    lastHandUp.current = handUp;
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (flipped && prev !== null && Math.abs(prev - top) > 1 && !calm && typeof el.animate === "function") {
      el.animate(
        [{ transform: `translate3d(0, ${prev - top}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
  });

  if (!state?.question || state.phase !== "question") return null;
  const q = state.question;
  const asked = [q.suspectId, q.roomId, q.weaponId, q.timeId]
    .filter(Boolean)
    .map((id) => state.cards.find((c) => c.id === id))
    .filter(Boolean) as CardDef[];
  const asker = state.players.find((p) => p.id === q.askerId);
  const shower = state.players.find((p) => p.id === q.showerId);
  const guided = (state.influences ?? []).some((i) => i.victimId === q.askerId && i.controllerId === actor);
  const mineToShow = actor === q.showerId && !q.shownCardId;
  const matches = q.matchingCardIds
    .map((id) => state.cards.find((c) => c.id === id))
    .filter(Boolean) as CardDef[];

  if (q.spoken) {
    return <SpokenResolve onReveal={onReveal} facesDown={facesDown} />;
  }

  return (
    <div className="roll-stage" style={{ zIndex: 60 }}>
      <div className="case-shell flex max-h-[92dvh] w-full max-w-sm flex-col overflow-y-auto rounded-[28px] px-4 py-5 text-center">
        <section
          ref={requestedRef}
          className={cn("swap-group rounded-[20px]", handUp ? "order-2 mt-3 border border-paper/15 bg-black/20 px-3 py-3" : "order-1")}
          data-size={handUp ? "small" : "large"}
        >
          <p className="text-xs uppercase tracking-[0.16em] text-brass">Suggestion</p>
          <h3 className={cn("font-display leading-none text-paper", handUp ? "mt-1 text-xl" : "mt-1 text-3xl")}>{asker?.name ?? "Someone"} asks</h3>
          <GambleLine q={q} askerName={asker?.name ?? "The asker"} mine={actor === q.askerId} />
          <div key={handUp ? "s" : "l"} className={cn("swap-in mt-3 grid gap-2", handUp ? "grid-cols-4" : "grid-cols-2")}>
            {asked.map((card) => (
              <div key={card.id} className={handUp ? "h-20" : "h-36"}>
                <CardFace card={card} fill />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {q.responderIds.map((id) => {
              const player = state.players.find((item) => item.id === id);
              if (!player) return null;
              const skipped = q.skips.includes(id);
              return (
                <span
                  key={id}
                  className={cn("relative inline-flex items-center rounded-full text-[#f6f1e6]", handUp ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm")}
                  style={{ background: player.color }}
                >
                  {player.name}
                  {skipped ? (
                    <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-[#7a1f2b] text-xs font-bold text-white" aria-label="None of these">
                      ✕
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
          {q.silencedId ? (
            <p className="mt-3 text-sm text-paper">
              {state.cards.find((c) => c.id === q.silencedId)?.name ?? "That card"} is silenced. No one shows it this time.
            </p>
          ) : null}
        </section>

        {handUp ? (
          <section className="swap-group swap-in order-1 rounded-[20px] border border-brass/50 bg-[#2a1410] px-3 py-4" data-size="large">
            <p className="font-display text-2xl leading-none text-paper">Show exactly one card</p>
            <p className="mt-1 text-sm text-muted">
              {facesDown
                ? "Faces are hidden on this phone. Turn them over before you choose."
                : `Only ${asker?.name ?? "the asker"} will see which one.`}
            </p>
            {facesDown ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  className="grid h-36 w-24 place-items-center rounded-[12px] border border-paper/30 bg-black font-display text-4xl text-paper"
                  aria-label="You have a card to show"
                  onClick={onReveal}
                >
                  ?
                </button>
              </div>
            ) : matches.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {matches.map((card) => (
                  <div key={card.id} className="h-36">
                    <CardFace card={card} fill onClick={() => showCard(card.id)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {q.matchingCardIds.length ? (
                  q.matchingCardIds.map((id) => (
                    <Button key={id} className="w-full" onClick={() => showCard(id)}>
                      Show {state.cards.find((card) => card.id === id)?.name ?? "this card"}
                    </Button>
                  ))
                ) : (
                  <Button className="w-full" onClick={ackCard}>
                    I have nothing to show
                  </Button>
                )}
              </div>
            )}
          </section>
        ) : null}

        <div className="order-3">
      {q.missId && (actor === q.askerId || guided) ? (
        <div className="mt-3 rounded-[16px] border-2 border-brass bg-[#2a1410] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-brass">Nothing to show</p>
          <p className="mt-1 font-display text-3xl leading-tight text-paper">
            {state.players.find((p) => p.id === q.missId)?.name ?? "This player"} has none of these
          </p>
          <p className="mt-2 text-base text-paper">Only you can continue. The other phones are waiting on you.</p>
          <Button className="mt-3 w-full" onClick={ackCard}>
            Continue to the next player
          </Button>
        </div>
      ) : null}

      {q.missId && actor !== q.askerId && !guided ? (
        <p className="mt-3 text-sm text-paper">
          Waiting for {asker?.name ?? "the asker"} to continue. This step is not on your phone.
        </p>
      ) : null}

      {q.heldByAsker && !q.missId ? (
        <>
          <p className="mt-3 font-display text-2xl text-paper">
            {actor === q.askerId ? "You already hold one of these." : `${asker?.name ?? "The asker"} already holds one of these.`}
          </p>
          <p className="mt-1 text-sm text-paper">The table still looked. No one else had them, so this is not the answer.</p>
          {actor === q.askerId || guided ? (
            <Button className="mt-3 w-full" onClick={ackCard}>
              Continue
            </Button>
          ) : (
            <p className="mt-2 text-sm text-muted">Waiting for {asker?.name ?? "the asker"} to continue.</p>
          )}
        </>
      ) : null}

      {q.nobodyHad && !q.missId && !q.heldByAsker && !q.closeTurn ? (
        <>
          <p className="mt-3 font-display text-2xl text-paper">No one holds these cards.</p>
          <p className="mt-1 text-sm text-muted">That is not marked in any journal. Write it down yourself.</p>
          {actor === q.askerId ? (
            <Button className="mt-3 w-full" onClick={ackCard}>
              Continue
            </Button>
          ) : (
            <p className="mt-2 text-sm text-muted">Waiting for {asker?.name ?? "the asker"} to continue.</p>
          )}
        </>
      ) : null}

      {q.closeTurn && !q.missId ? (
        <>
          <p className="mt-3 font-display text-2xl text-paper">No one showed a card.</p>
          {actor === q.askerId || guided ? (
            <Button className="mt-3 w-full" onClick={done}>
              End turn
            </Button>
          ) : (
            <p className="mt-2 text-sm text-muted">Waiting for {asker?.name ?? "the asker"} to end the turn.</p>
          )}
        </>
      ) : null}

      {!q.missId && q.gambleResult === "lost" && (actor === q.askerId || guided) ? <LostBet onContinue={ackCard} /> : null}

      {!q.missId && q.shownCardId && q.gambleResult !== "lost" && (actor === q.askerId || guided) ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.16em] text-brass">Shown only to you</p>
          <div className="mt-2 flex justify-center">
            {state.cards.find((c) => c.id === q.shownCardId) ? (
              <CardFace card={state.cards.find((c) => c.id === q.shownCardId)!} />
            ) : null}
          </div>
          <Button className="mt-3 w-full" onClick={ackCard}>
            Hide the card
          </Button>
        </div>
      ) : null}

      {!q.missId && q.shownCardId && state.spy?.byId === actor && state.spy.targetId === q.askerId && actor !== q.askerId ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.16em] text-brass">You spied this</p>
          <div className="mt-2 flex justify-center">
            {state.cards.find((c) => c.id === q.shownCardId) ? (
              <CardFace card={state.cards.find((c) => c.id === q.shownCardId)!} />
            ) : null}
          </div>
        </div>
      ) : null}

      {!q.missId && !q.nobodyHad && !q.closeTurn && !q.heldByAsker && !mineToShow && !(q.gambleResult === "lost" && (actor === q.askerId || guided)) && !(q.shownCardId && (actor === q.askerId || guided || (state.spy?.byId === actor && state.spy.targetId === q.askerId))) ? (
        <p className="mt-3 text-sm text-muted">
          {q.cardShown
            ? `A card was shown privately to ${asker?.name ?? "the asker"}.`
            : shower
              ? `${shower.name} is next in order and must show one card.`
              : "Waiting for the next player in order."}
        </p>
      ) : null}
        </div>
      </div>
    </div>
  );
}

/** Speak mode. The table heard the suggestion. The game only asks each player, in order, if they hold a card. */
function SpokenResolve({ facesDown, onReveal }: { facesDown: boolean; onReveal?: () => void }) {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const hand = useMyHand();
  const reply = useGame((s) => s.reply);
  const retractReply = useGame((s) => s.retractReply);
  const [confirmNoCard, setConfirmNoCard] = useState(false);
  // Speak mode: the cards the asker picked come up on their own screen to say out loud, then shrink to a reminder strip.
  const [sayOpen, setSayOpen] = useState(true);
  const showCard = useGame((s) => s.showCard);
  const ackCard = useGame((s) => s.ackCard);
  // A card tapped in this panel opens bigger on top of it. When you are choosing which card to show, the
  // enlarged card carries its own "Show this card" button, so nothing is hidden below the fold.
  // Inside the Yes / No prompt the same sheet is view-only, and the prompt itself never closes.
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const q = state?.question;
  if (!state || !q) return null;
  const asker = state.players.find((p) => p.id === q.askerId);
  const asking = state.players.find((p) => p.id === q.askingId);
  const shower = state.players.find((p) => p.id === q.showerId);
  const guided = (state.influences ?? []).some((i) => i.victimId === q.askerId && i.controllerId === actor);
  const isAsker = actor === q.askerId || guided;
  const shownCard = q.shownCardId ? state.cards.find((c) => c.id === q.shownCardId) : undefined;
  const askingMe = Boolean(!q.shownCardId && !q.showerId && q.askingId && actor === q.askingId);

  const said = [q.roomId, q.suspectId, q.weaponId, q.timeId]
    .filter(Boolean)
    .map((id) => state.cards.find((c) => c.id === id))
    .filter((c): c is CardDef => Boolean(c));
  const lostBet = q.gambleResult === "lost" && isAsker;

  let body: ReactNode;
  if (lostBet) {
    body = <LostBet onContinue={ackCard} />;
  } else if (shownCard && isAsker) {
    // The card itself opens in its own full screen sheet on top of this one.
    body = <p className="mt-2 text-sm text-paper">A card is being shown to you.</p>;
  } else if (q.shownCardId) {
    body = (
      <p className="mt-2 text-sm text-paper">
        {shower?.name ?? "A player"} showed a card privately to {asker?.name ?? "the asker"}.
      </p>
    );
  } else if (q.showerId && actor === q.showerId) {
    body = facesDown ? (
      <button
        type="button"
        className="mx-auto mt-3 grid h-24 w-16 place-items-center rounded-[10px] border border-paper/30 bg-black font-display text-3xl text-paper"
        aria-label="Turn your cards over"
        onClick={onReveal}
      >
        ?
      </button>
    ) : (
      <>
        <p className="mt-1 font-display text-2xl text-paper">Pick a card to show</p>
        <p className="text-sm text-muted">Only {asker?.name ?? "the asker"} will see which one.</p>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-brass">Tap a card to look closer</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {hand.map((card) => (
            <div key={card.id}>
              <CardFace card={card} choice onClick={() => setZoom(card)} />
            </div>
          ))}
        </div>
        {confirmNoCard ? (
          <div className="mt-4 rounded-xl border border-paper/20 bg-black/30 p-3">
            <p className="font-display text-xl text-paper">Are you sure?</p>
            <p className="mt-1 text-sm text-muted">The next player in line will be asked instead.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" data-sfx="deny" onClick={() => setConfirmNoCard(false)}>
                No
              </Button>
              <Button data-sfx="confirm" onClick={() => { setConfirmNoCard(false); retractReply(); }}>
                Yes
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="mt-4 w-full text-paper" data-sfx="select" onClick={() => setConfirmNoCard(true)}>
            I actually don't have a card for you
          </Button>
        )}
      </>
    );
  } else if (q.showerId) {
    body = (
      <p className="mt-2 text-sm text-paper">
        {shower?.name ?? "A player"} is choosing a card to show {asker?.name ?? "the asker"}.
      </p>
    );
  } else if (askingMe) {
    // "Do you have a card?" The prompt is docked at the bottom and stays until Yes or No is tapped.
    // The player's whole hand is shown inside it, so nothing has to be checked behind the prompt.
    body = (
      <>
        <div className="sticky top-0 z-10 bg-[#241610] pb-3">
          <p className="font-display text-2xl leading-tight text-paper">
            Do you have a card that {asker?.name ?? "the asker"} asked for?
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="lg" variant="outline" data-sfx="deny" onClick={() => reply(false)}>
              No
            </Button>
            <Button size="lg" data-sfx="confirm" onClick={() => reply(true)}>
              Yes
            </Button>
          </div>
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-subtle">
          Your hand · {hand.length}
          {facesDown ? " · tap to turn over" : " · tap a card to enlarge"}
        </p>
        {hand.length ? (
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {hand.map((card) =>
              facesDown ? (
                <button
                  key={card.id}
                  type="button"
                  data-sfx="select"
                  className="grid h-32 w-full place-items-center rounded-[12px] border border-paper/30 bg-black font-display text-3xl text-paper"
                  aria-label="Turn your cards over"
                  onClick={onReveal}
                >
                  ?
                </button>
              ) : (
                <button
                  key={card.id}
                  type="button"
                  data-sfx="select"
                  className="relative h-32 w-full"
                  aria-label={`Enlarge ${card.name}`}
                  onClick={() => setZoom(card)}
                >
                  <CardFace card={card} fill />
                </button>
              ),
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">You are not holding any cards.</p>
        )}
      </>
    );
  } else {
    body = (
      <p className="mt-2 text-sm text-paper">
        {asking ? `Asking ${asking.name}…` : "Waiting for the next player."}
      </p>
    );
  }

  return (
    <>
    <div
      className="roll-stage"
      style={
        askingMe
          ? { zIndex: 60, background: "#140e0b73", placeItems: "end center", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }
          : { zIndex: 60 }
      }
    >
      <div
        className={cn(
          "case-shell flex w-full max-w-sm flex-col overflow-y-auto rounded-[28px] px-4 py-5 text-center",
          askingMe ? "max-h-[88dvh]" : "max-h-[92dvh]",
        )}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-brass">Suggestion</p>
        <h3 className="mt-1 font-display text-3xl leading-none text-paper">{asker?.name ?? "Someone"} spoke</h3>
        <GambleLine q={q} askerName={asker?.name ?? "The asker"} mine={actor === q.askerId} />
        {actor === q.askerId && said.length ? (
          sayOpen ? (
            <div className="mt-3 rounded-[16px] border-2 border-brass bg-[#2a1410] px-3 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-brass">Say this out loud</p>
              <div className={cn("mt-2 grid gap-2", said.length > 3 ? "grid-cols-4" : "grid-cols-3")}>
                {said.map((card) => (
                  <div key={card.id} className="h-28">
                    <CardFace card={card} fill />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-paper">{said.map((card) => card.name).join(" · ")}</p>
              <Button size="sm" className="mt-3 w-full" data-sfx="confirm" onClick={() => setSayOpen(false)}>
                Got it
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-3 w-full rounded-[12px] border border-paper/20 bg-black/20 px-2 py-2 text-left"
              data-sfx="select"
              onClick={() => setSayOpen(true)}
              aria-label="Show the cards you said again"
            >
              <span className="block text-[10px] uppercase tracking-[0.16em] text-brass">You said · tap to enlarge</span>
              <span className="mt-1 block text-sm text-paper">{said.map((card) => card.name).join(" · ")}</span>
            </button>
          )
        ) : null}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {q.responderIds.map((id) => {
            const player = state.players.find((item) => item.id === id);
            if (!player) return null;
            const skipped = q.skips.includes(id);
            const active = id === q.askingId || id === q.showerId;
            return (
              <span
                key={id}
                className={`relative inline-flex items-center rounded-full px-3 py-1 text-sm text-[#f6f1e6] ${active ? "ring-2 ring-brass" : ""}`}
                style={{ background: player.color, opacity: skipped ? 0.55 : 1 }}
              >
                {player.name}
                {skipped ? (
                  <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-[#7a1f2b] text-xs font-bold text-white" aria-label="Has nothing to show">
                    ✕
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
        {body}
      </div>
    </div>
    {zoom ? (
      <CardZoomSheet
        card={zoom}
        onClose={() => setZoom(null)}
        onShow={
          q.showerId && actor === q.showerId && !q.shownCardId
            ? () => {
                showCard(zoom.id);
                setZoom(null);
              }
            : undefined
        }
      />
    ) : null}
    </>
  );
}

/**
 * One card, enlarged over everything. With onShow it is the "choose this card" step: the card zooms in
 * and the Show this card button sits right under it. Without onShow it only looks closer.
 */
function CardZoomSheet({ card, onClose, onShow }: { card: CardDef; onClose: () => void; onShow?: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 grid place-items-center overflow-y-auto bg-black/80 p-4"
      style={{ zIndex: 70, paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-label={card.name}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="card-zoom flex flex-col items-center gap-4">
        <CardFace card={card} large />
        {onShow ? (
          <>
            <Button size="lg" className="w-64" data-sfx="confirm" onClick={onShow}>
              Show this card
            </Button>
            <Button variant="ghost" className="text-paper" onClick={onClose}>
              Back
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="text-paper" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

export function AccusationPanel({ startOpen = false, fit = false }: { startOpen?: boolean; fit?: boolean }) {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const accuse = useGame((s) => s.accuse);
  const namePick = useGame((s) => s.namePick);
  const notes = useMyNotes();
  const offeredNow = Boolean(state?.question?.offerAccusation);
  const [open, setOpen] = useState(startOpen || offeredNow);
  if (!state) return null;
  const cur = currentPlayer(state);
  if (cur?.id !== actor && turnActorId(state) !== actor) return null;
  if ((state.influences ?? []).some((i) => i.victimId === cur?.id)) return null;
  if (state.phase !== "action") return null;
  const steps: CategoryId[] = state.settings.timeOfDayEnabled
    ? ["suspect", "weapon", "room", "time"]
    : ["suspect", "weapon", "room"];
  const circled: Partial<Record<CategoryId, string>> = {};
  for (const card of state.cards) {
    if (notes.marks[card.id]?.envelope === "answer") circled[card.category] = card.id;
  }
  const q = state.question;
  const offered =
    q?.offerAccusation
      ? {
          suspect: q.suspectId,
          weapon: q.weaponId,
          room: q.roomId,
          ...(q.timeId ? { time: q.timeId } : {}),
        }
      : null;
  const initialPick = { ...circled, ...(offered ?? {}) };
  const forced = Boolean(offered && steps.every((step) => initialPick[step]));

  return (
    <PickFlow
      open={open}
      onOpen={() => setOpen(true)}
      tone="final"
      title={"Solve the Case"}
      note={
        forced
          ? "Nobody holds these cards. They are filled in. Name them to win."
          : state.settings.heist
            ? "Cards you marked in the journal stay labeled. Name who took it, where, and what was stolen. If you are right, you win."
            : "Cards you marked in the journal stay labeled. Name the whole solution. If you are right, you win."
      }
      closedLabel={forced ? "Name them to win" : "Solve the Case"}
      steps={steps}
      circled={circled}
      initialPick={initialPick}
      startAtConfirm={forced}
      confirmTitle={forced ? "Nobody else has these" : "Are you sure?"}
      doneLabel={"Solve the Case"}
      fit={fit}
      onPick={(chosen) => {
        namePick({
          suspectId: chosen.suspect,
          roomId: chosen.room,
          weaponId: chosen.weapon,
          timeId: chosen.time,
        });
      }}
      onDone={(pick) => {
        if (!pick.suspect || !pick.room || !pick.weapon) return;
        accuse({
          suspectId: pick.suspect,
          roomId: pick.room,
          weaponId: pick.weapon,
          timeId: pick.time,
        });
      }}
    />
  );
}

const ASK: Record<CategoryId, string> = {
  suspect: "Who?",
  weapon: "Which weapon?",
  room: "Which room?",
  time: "What time of day?",
};

const SLOT: Record<CategoryId, string> = {
  suspect: "Who",
  weapon: "Weapon",
  room: "Room",
  time: "Time",
};

function askLine(cat: CategoryId, heist?: boolean, suggesting?: boolean) {
  if (suggesting && cat === "room") return "What room are you in?";
  if (!heist) return ASK[cat];
  if (cat === "suspect") return "Who took it?";
  if (cat === "weapon") return "What was stolen?";
  if (cat === "room") return "Where was it taken?";
  return "When?";
}

function slotLine(cat: CategoryId, heist?: boolean) {
  if (!heist) return SLOT[cat];
  if (cat === "suspect") return "Who took it";
  if (cat === "weapon") return "Stolen";
  if (cat === "room") return "Where";
  return "When";
}

export function AccusationWatch({ onLeave }: { onLeave?: () => void }) {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  if (!state?.naming || state.phase === "gameover" || state.phase === "lobby") return null;
  if (turnActorId(state) === actor) return null;
  const naming = state.naming;
  const who = state.players.find((player) => player.id === naming.playerId)?.name ?? "Someone";
  const steps: CategoryId[] = state.settings.timeOfDayEnabled
    ? ["suspect", "weapon", "room", "time"]
    : ["suspect", "weapon", "room"];
  const pick: Partial<Record<CategoryId, string>> = {
    suspect: naming.suspectId,
    weapon: naming.weaponId,
    room: naming.roomId,
    time: naming.timeId,
  };
  return (
    <div className="folio-sheet overflow-auto" style={{ background: "#6d1a1a" }}>
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.22em] text-[#ffe7a3]">
            {"Solve the Case"}
          </p>
          {onLeave ? (
            <button type="button" className="text-sm text-[#ffd7d2]" onClick={onLeave}>
              Leave
            </button>
          ) : null}
        </div>
        <h2 className="mt-2 font-display text-5xl leading-none text-[#fff6f4]">{who}</h2>
        <p className="mt-2 text-sm text-[#ffd7d2]">is naming the solution. Each card pops in, and a change replaces that card.</p>
        <FinalSlots steps={steps} pick={pick} cards={state.cards} />
      </div>
    </div>
  );
}

function FinalSlots({
  steps,
  pick,
  cards,
  statusOf,
  sheetOf,
  noteOf,
  onSlot,
}: {
  steps: CategoryId[];
  pick: Partial<Record<CategoryId, string>>;
  cards: CardDef[];
  statusOf?: (id: string) => "yours" | "shown" | "unseen" | "answer" | undefined;
  sheetOf?: (id: string) => SheetMark;
  noteOf?: (id: string) => string;
  onSlot?: (index: number) => void;
}) {
  const heist = useGame((s) => s.state?.settings.heist);
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {steps.map((cat, index) => {
        const card = cards.find((item) => item.id === pick[cat]);
        return (
          <div key={cat}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#ffd0c8]">{slotLine(cat, heist)}</p>
            {card ? (
              <div key={`${cat}-${card.id}`} className="accuse-pop mt-1">
                <CardFace
                  card={card}
                  choice
                  selected
                  badge={sheetOf ? undefined : statusOf?.(card.id)}
                  sheetMark={sheetOf?.(card.id)}
                  onClick={onSlot ? () => onSlot(index) : undefined}
                />
                {noteOf ? <p className="mt-1 text-[11px] leading-snug text-[#ffe7a8]">{noteOf(card.id)}</p> : null}
              </div>
            ) : (
              <div className="mt-1 grid aspect-[2/3] w-full place-items-center rounded-[14px] border border-dashed border-white/35 bg-black/20">
                <span className="font-display text-3xl text-white/35">—</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function asMark(mark: string | undefined): SheetMark {
  if (mark === "check" || mark === "x" || mark === "maybe" || mark === "answer") return mark;
  return "blank";
}

function journalLine(state: GameState, notes: PlayerNotes, cardId: string, handIds: string[], shownIds: Set<string>): string {
  const mark = asMark(notes.marks[cardId]?.envelope);
  const markWord =
    mark === "check"
      ? "You checked this out"
      : mark === "x"
        ? "You put an X here"
        : mark === "maybe"
          ? "You marked this ?"
          : mark === "answer"
            ? "You marked this as the one"
            : "No journal mark";
  const held = handIds.includes(cardId) ? "In your hand" : shownIds.has(cardId) ? "Shown to you" : "Not seen yet";
  const guests = state.players
    .map((player) => {
      const guest = asMark(notes.marks[cardId]?.[player.id]);
      if (guest === "blank") return "";
      const symbol = guest === "check" ? "✓" : guest === "x" ? "✕" : "?";
      return `${player.name} ${symbol}`;
    })
    .filter(Boolean);
  return [markWord, held, guests.length ? guests.join(", ") : ""].filter(Boolean).join(" · ");
}

function PickFlow({
  open,
  onOpen,
  tone,
  title,
  note,
  closedLabel,
  steps,
  suggesting = false,
  handIds = [],
  circled = {},
  initialPick = {},
  startAtConfirm = false,
  confirmTitle,
  doneLabel,
  fit = false,
  onPick,
  onDone,
}: {
  open: boolean;
  onOpen: () => void;
  tone: "plain" | "final";
  title: string;
  note: string;
  closedLabel: string;
  steps: CategoryId[];
  suggesting?: boolean;
  handIds?: string[];
  circled?: Partial<Record<CategoryId, string>>;
  initialPick?: Partial<Record<CategoryId, string>>;
  startAtConfirm?: boolean;
  confirmTitle: string;
  doneLabel: string;
  fit?: boolean;
  onPick?: (pick: Partial<Record<CategoryId, string>>) => void;
  onDone: (pick: Partial<Record<CategoryId, string>>) => void;
}) {
  const state = useGame((s) => s.state);
  const notes = useMyNotes();
  const actorId = useActorId();
  const [step, setStep] = useState(() => (startAtConfirm ? steps.length : 0));
  const [pick, setPick] = useState<Partial<Record<CategoryId, string>>>(() => ({ ...initialPick }));
  const sentOpen = useRef("");
  const seed = steps.map((id) => initialPick[id] ?? "").join("|");
  useEffect(() => {
    if (!open) {
      sentOpen.current = "";
      return;
    }
    if (!onPick || sentOpen.current === "sent") return;
    sentOpen.current = "sent";
    onPick({ ...initialPick });
  }, [open, seed, onPick, initialPick]);
  if (!state) return null;
  const fog = (state.notesLock?.[actorId] ?? 0) > 0;
  const final = tone === "final";
  const shownIds = new Set(notes.shown.map((item) => item.cardId));
  for (const [id, cell] of Object.entries(notes.marks)) {
    if (cell?.envelope === "check") shownIds.add(id);
  }
  const reviewing = step >= steps.length;
  const current = steps[Math.min(step, steps.length - 1)];
  const chosen = steps
    .map((id) => state.cards.find((c) => c.id === pick[id]))
    .filter((card): card is CardDef => Boolean(card));
  const statusOf = (id: string): "yours" | "shown" | "unseen" | "answer" | undefined => {
    if (final) return Object.values(circled).includes(id) ? "answer" : undefined;
    if (handIds.includes(id)) return "yours";
    if (shownIds.has(id)) return "shown";
    return "unseen";
  };
  const sheetOf = (id: string): SheetMark => (fog ? "maybe" : asMark(notes.marks[id]?.envelope));
  const noteOf = (id: string) =>
    fog ? "Every mark is a question until your notes open." : journalLine(state, notes, id, handIds, shownIds);
  const options = cardsByCategory(state.cards, current);
  const cols = options.length <= 4 ? 2 : options.length <= 9 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(options.length / cols));
  const choose = (cardId: string) => {
    // Solve the Case: the category cue plays on every card tapped inside a category, not on the
    // final button. (It is the old "Solve the Case" sting, moved here.)
    if (final) sfxSolveStart();
    const next = { ...pick, [current]: cardId };
    setPick(next);
    setStep(step + 1);
    onPick?.(next);
  };

  if (fit && open) {
    const confirmCols = Math.min(Math.max(chosen.length, 1), 2);
    const confirmRows = Math.max(1, Math.ceil(chosen.length / confirmCols));
    return (
      <div className={final ? "flex h-full min-h-0 flex-col text-[#fff6f4]" : "flex h-full min-h-0 flex-col"}>
        {reviewing ? (
          <>
            <p className="shrink-0 font-display text-3xl leading-none">{confirmTitle}</p>
            <div className="mt-2 flex shrink-0 gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setStep(steps.length - 1)}>
                Back
              </Button>
              <Button variant={final ? "paper" : "default"} size="sm" className="flex-1" onClick={() => onDone(pick)}>
                {doneLabel}
              </Button>
            </div>
            <div
              className="mt-2 grid min-h-0 flex-1 gap-2"
              style={{
                gridTemplateColumns: `repeat(${confirmCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${confirmRows}, minmax(0, 1fr))`,
              }}
            >
              {steps.map((cat, index) => {
                const card = state.cards.find((item) => item.id === pick[cat]);
                if (!card) return null;
                return (
                  <div key={cat} className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1">
                      <CardFace
                        card={card}
                        fill
                        selected
                        badge={fog || final ? undefined : statusOf(card.id)}
                        sheetMark={fog || final ? sheetOf(card.id) : undefined}
                        onClick={() => setStep(index)}
                      />
                    </div>
                    {final ? (
                      <p className="mt-1 line-clamp-2 shrink-0 text-[10px] leading-tight text-[#ffe7a8]">{noteOf(card.id)}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="shrink-0">
              <p className="font-display text-3xl leading-none">{askLine(current, state.settings.heist, suggesting)}</p>
              {suggesting && current === "room" ? (
                <p className="mt-1 text-sm text-[#5c4a38]">That room card has to be in this question.</p>
              ) : null}
              <p className={final ? "truncate text-[11px] uppercase tracking-[0.14em] text-[#ffd0c8]" : "truncate text-[11px] uppercase tracking-[0.14em] text-brass"}>
                {step + 1} of {steps.length}
                {chosen.length ? ` · ${chosen.map((card) => card.name).join(" · ")}` : ""}
              </p>
              <p className={final ? "truncate text-[11px] text-[#ffe7a8]" : "truncate text-[11px] text-muted"}>
                {final ? "✓ checked out · ✕ ruled out · ? not sure · ★ the one you marked" : "◆ in your hand · ✓ shown to you · ○ not seen yet"}
              </p>
            </div>
            <div
              className="mt-2 grid min-h-0 flex-1 gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {options.map((card) => (
                <div key={card.id} className="h-full min-h-0">
                  <CardFace
                    card={card}
                    fill
                    badge={fog || final ? undefined : statusOf(card.id)}
                    sheetMark={fog || final ? sheetOf(card.id) : undefined}
                    selected={pick[current] ? pick[current] === card.id : circled[current] === card.id}
                    onClick={() => choose(card.id)}
                  />
                </div>
              ))}
            </div>
            {step > 0 || (final && circled[current]) ? (
              <div className="mt-2 flex shrink-0 gap-2">
                {step > 0 ? (
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                ) : null}
                {final && circled[current] ? (
                  <Button
                    size="sm"
                    variant="paper"
                    className="flex-1"
                    onClick={() => {
                      const id = circled[current];
                      if (id) choose(id);
                    }}
                  >
                    Use the marked card
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={final ? "rounded-[20px] border border-[#ffd0d0]/30 bg-[#8d2a2a] p-4 text-[#fff6f4]" : "wood-panel rounded-[20px] p-4"}>
      <p className={final ? "text-xs uppercase tracking-[0.2em] text-[#ffe7a3]" : "hidden"}>
        {"Solve the Case"}
      </p>
      <h3 className={final ? "font-display text-4xl leading-none" : "font-display text-xl"}>{title}</h3>
      <p className={final ? "mt-2 text-sm text-[#ffd7d2]" : "text-sm text-muted"}>{note}</p>
      {final ? (
        <p className="mt-2 text-xs leading-snug text-[#ffe7a8]">
          ✓ checked out · ✕ ruled out · ? not sure · a star is the one you marked. Under each card: your hand, a card shown to you, and any guest marks.
        </p>
      ) : null}
      {!open ? (
        <Button
          variant="outline"
          className="mt-3 w-full"
          data-sfx={final ? "drama" : "tap"}
          onClick={() => {
            const next = { ...circled, ...initialPick };
            setPick(next);
            setStep(startAtConfirm ? steps.length : 0);
            onOpen();
            onPick?.(next);
          }}
        >
          {closedLabel}
        </Button>
      ) : reviewing ? (
        <div className="mt-3">
          <p className={final ? "text-xs uppercase tracking-[0.16em] text-[#ffd0c8]" : "text-xs uppercase tracking-[0.16em] text-brass"}>
            {final ? "Solve the Case" : "Suggestion"}
          </p>
          <p className="font-display text-4xl leading-none">{confirmTitle}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(steps.length - 1)}>
              Back
            </Button>
            <Button variant={final ? "paper" : "default"} className="flex-1" onClick={() => onDone(pick)}>
              {doneLabel}
            </Button>
          </div>
          {final ? (
            <FinalSlots steps={steps} pick={pick} cards={state.cards} sheetOf={sheetOf} noteOf={noteOf} onSlot={setStep} />
          ) : (
            <div className="mt-3 grid gap-2">
              {chosen.map((card) => (
                <CardFace key={card.id} card={card} choice badge={fog ? undefined : statusOf(card.id)} sheetMark={fog ? "maybe" : undefined} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className={final ? "text-xs uppercase tracking-[0.16em] text-[#ffd0c8]" : "text-xs uppercase tracking-[0.16em] text-brass"}>
            {step + 1} of {steps.length}
          </p>
          <p className="font-display text-2xl leading-tight">{askLine(current, state.settings.heist, suggesting)}</p>
          {suggesting && current === "room" ? (
            <p className="mt-1 text-sm text-muted">That room card has to be in this question.</p>
          ) : null}
          {final && circled[current] && !fog ? (
            <p className="mt-1 text-sm text-[#ffe7a8]">
              You marked {state.cards.find((card) => card.id === circled[current])?.name} as the one. It is starred below.
            </p>
          ) : null}
          {final ? (
            <FinalSlots steps={steps} pick={pick} cards={state.cards} sheetOf={sheetOf} noteOf={noteOf} onSlot={setStep} />
          ) : chosen.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {chosen.map((card, i) => (
                <CardFace key={card.id} card={card} compact selected badge={fog ? undefined : statusOf(card.id)} sheetMark={fog ? "maybe" : undefined} onClick={() => setStep(i)} />
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {cardsByCategory(state.cards, current).map((card) => (
              <div key={card.id} className="min-w-0">
                <CardFace
                  card={card}
                  choice
                  badge={fog || final ? undefined : statusOf(card.id)}
                  sheetMark={fog || final ? sheetOf(card.id) : undefined}
                  selected={pick[current] ? pick[current] === card.id : circled[current] === card.id}
                  onClick={() => {
                    const next = { ...pick, [current]: card.id };
                    setPick(next);
                    setStep(step + 1);
                    onPick?.(next);
                  }}
                />
                {final ? <p className="mt-1 text-[11px] leading-snug text-[#ffe7a8]">{noteOf(card.id)}</p> : null}
              </div>
            ))}
          </div>
          {!final ? (
            <p className="mt-2 text-xs text-muted">◆ in your hand · ✓ shown to you · ○ not seen yet</p>
          ) : circled[current] ? (
            <Button
              className="mt-3 w-full"
              variant="paper"
              onClick={() => {
                const id = circled[current];
                if (!id) return;
                const next = { ...pick, [current]: id };
                setPick(next);
                setStep(step + 1);
                onPick?.(next);
              }}
            >
              Use the circled card
            </Button>
          ) : null}
          {step > 0 ? (
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
