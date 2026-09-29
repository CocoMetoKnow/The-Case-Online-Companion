import { useEffect, useRef, useState } from "react";
import { canAsk, currentPlayer, turnActorId, useActorId, useGame, useMyHand } from "@/lib/game/store";
import { movementTotal, blockingPlayerIds } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";
import { CardHand } from "./CardHand";
import { EventPanel } from "./EventPanel";
import { NotesBook } from "./NotesBook";
import { AccusationPanel, AccusationWatch, QuestionPanel, QuestionResolve } from "./QuestionPanel";
import { sfxPaper } from "@/lib/game/sfx";
import { MusicToggle } from "./MusicToggle";
import { DicePair } from "./Dice";
import type { CardDef, CategoryId, GameState, Secrets } from "@/lib/game/types";
import type { Verdict } from "@/lib/game/store";

function rollWords(state: GameState): { title: string; detail: string } | null {
  if (!state.dice) return null;
  const total = state.singleDie ? state.dice[0] : (movementTotal(state.dice) ?? 0);
  const move = state.pace ?? total;
  return { title: String(move), detail: "You can move this many." };
}

function SyncVote() {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const syncTable = useGame((s) => s.syncTable);
  const vote = state?.sync;
  if (!state || !vote || typeof vote !== "object" || !Array.isArray(vote.agreed)) return null;
  if (state.phase === "lobby" || state.phase === "gameover") return null;
  const living = state.players.filter((player) => !player.eliminated);
  const agreed = new Set(vote.agreed);
  const waiting = living.filter((player) => !agreed.has(player.id));
  const mine = agreed.has(actor);
  const starter = state.players.find((player) => player.id === vote.byId)?.name ?? "A player";
  return (
    <div className="roll-stage" style={{ zIndex: 96 }}>
      <div className="case-shell w-full max-w-sm rounded-[28px] px-5 py-6 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-brass">Sync the table</p>
        <h2 className="mt-2 font-display text-4xl leading-none text-paper">{starter} asked to sync</h2>
        <p className="mt-3 text-sm text-paper">
          This ends the current turn and starts the next player clean. Cards stay as they are. A power that lasts past this turn stays on. Notes stay.
        </p>
        <p className="mt-3 text-sm text-muted">
          {waiting.length ? `Still needed: ${waiting.map((player) => player.name).join(", ")}.` : "Everyone agreed."}
        </p>
        {mine ? (
          <p className="mt-4 text-sm text-paper">You agreed. This waits for everyone else.</p>
        ) : (
          <Button className="mt-4 w-full" size="lg" onClick={() => syncTable({ agree: true })}>
            I agree
          </Button>
        )}
        <Button className="mt-2 w-full" variant="ghost" onClick={() => syncTable({ cancel: true })}>
          Don't sync
        </Button>
      </div>
    </div>
  );
}

export function Briefcase() {
  const state = useGame((s) => s.state);
  const leave = useGame((s) => s.leave);
  const done = useGame((s) => s.done);
  const playAgain = useGame((s) => s.playAgain);
  const syncSheet = useGame((s) => s.syncSheet);
  const secrets = useGame((s) => s.secrets);
  const roll = useGame((s) => s.roll);
  const namePick = useGame((s) => s.namePick);
  const actor = useActorId();
  const localId = useGame((s) => s.localPlayerId);
  const hand = useMyHand();
  const passGate = useGame((s) => s.passGate);
  const onlinePending = useGame((s) => s.onlinePending);
  const confirmPass = useGame((s) => s.confirmPass);
  const playHere = useGame((s) => s.playHere);
  const setViewing = useGame((s) => s.setViewing);
  const viewing = useGame((s) => s.viewingPlayerId);
  const kick = useGame((s) => s.kick);
  const ackCard = useGame((s) => s.ackCard);
  const verdict = useGame((s) => s.verdict);
  const dismissVerdict = useGame((s) => s.dismissVerdict);
  const [folio, setFolio] = useState(false);
  const [lifted, setLifted] = useState<CardDef | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [accuse, setAccuse] = useState(false);
  const [movesOpen, setMovesOpen] = useState(false);
  const [sureLeave, setSureLeave] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [idleGen, setIdleGen] = useState(0);
  const [rollPrompt, setRollPrompt] = useState(false);
  const [rollNote, setRollNote] = useState("");
  const [facesDown, setFacesDown] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("gmm.faces") === "down";
  });
  const [spread, setSpread] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("gmm.spread") === "1";
  });
  const [spyClosed, setSpyClosed] = useState("");
  const [toss, setToss] = useState(0);
  const diceSig = state?.dice ? `${state.turnIndex}:${state.singleDie ? "1" : "2"}:${state.dice[0]}-${state.dice[1]}` : "";
  const offerKey = state?.question?.offerAccusation
    ? `${state.turnIndex}:${state.question.suspectId}:${state.question.roomId}:${state.question.weaponId}:${state.question.timeId ?? ""}`
    : "";
  const skippedOffer = useRef("");

  useEffect(() => {
    if (diceSig) setToss((n) => n + 1);
  }, [diceSig]);

  const shownRoll = useRef("");
  useEffect(() => {
    if (!diceSig || !state || state.phase === "roll" || state.phase === "event") return;
    if (turnActorId(state) !== actor) return;
    if (shownRoll.current === diceSig) return;
    shownRoll.current = diceSig;
    setRollNote(diceSig);
  }, [diceSig, state, actor]);

  useEffect(() => {
    syncSheet();
  }, [syncSheet, state?.code, state?.phase, state?.question?.shownCardId, state?.event?.step, state?.leftover, state?.privateShow?.at, actor]);

  useEffect(() => {
    if (state?.accusation?.at) setAccuse(false);
  }, [state?.accusation?.at]);

  useEffect(() => {
    if (!offerKey || skippedOffer.current === offerKey) return;
    setSuggest(false);
    setAccuse(true);
  }, [offerKey]);

  useEffect(() => {
    if (!state) return;
    const mine = turnActorId(state) === actor;
    if (state.phase === "question" || state.phase !== "action" || !mine) setSuggest(false);
    if (state.phase !== "action" || !mine) {
      setAccuse(false);
      setMovesOpen(false);
    }
    if (state.phase === "question" || state.phase === "event" || state.phase === "roll") setLifted(null);
  }, [state, actor]);

  useEffect(() => {
    setRollNote("");
    setRollPrompt(false);
    setNudge(false);
    setSpyClosed("");
    setLifted(null);
    setMovesOpen(false);
  }, [state?.turnIndex]);

  useEffect(() => {
    if (!state || state.settings.playMode === "online" || state.settings.honorHands || passGate) return;
    const needed = blockingPlayerIds(state)[0] || turnActorId(state);
    if (needed && needed !== viewing) setViewing(needed);
  }, [state, viewing, passGate, setViewing]);

  const guidedSeat = Boolean(
    state && (state.influences ?? []).some((item) => item.victimId === currentPlayer(state)?.id),
  );
  const idleWatch = Boolean(
    state &&
      !state.wait &&
      !onlinePending &&
      turnActorId(state) === actor &&
      state.phase === "action" &&
      (state.actionsLeft ?? 1) > 0 &&
      !folio &&
      !lifted &&
      !suggest &&
      !accuse &&
      !movesOpen &&
      !sureLeave &&
      !verdict &&
      (guidedSeat || !state.question?.offerAccusation),
  );

  useEffect(() => {
    if (!idleWatch) {
      setNudge(false);
      return;
    }
    const timer = window.setTimeout(() => setNudge(true), 45_000);
    return () => window.clearTimeout(timer);
  }, [idleWatch, idleGen, state?.turnIndex, state?.phase, state?.log.length]);

  const waitingToRoll = Boolean(
    state &&
      !state.wait &&
      !folio &&
      !lifted &&
      !sureLeave &&
      !verdict &&
      turnActorId(state) === actor &&
      (state.phase === "roll"),
  );

  useEffect(() => {
    if (!waitingToRoll) {
      setRollPrompt(false);
      return;
    }
    setRollPrompt(true);
    const timer = window.setTimeout(() => setRollPrompt(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [waitingToRoll, state?.turnIndex, state?.phase, state?.event?.kind]);

  if (!state) return null;

  const me = state.players.find((p) => p.id === actor);
  const cur = currentPlayer(state);
  const myTurn = turnActorId(state) === actor;
  const guidedSelf = (state.influences ?? []).some((item) => item.victimId === actor);
  const guide = (state.influences ?? []).find((i) => i.victimId === cur?.id);
  const influenced = Boolean(guide);
  const canRoll = !state.wait && myTurn && state.phase === "roll";
  const locked = (state.notesLock?.[actor] ?? 0) > 0;
  const passages = (state.passages ?? []).map((p) => {
    const a = state.cards.find((c) => c.id === p.a)?.name ?? p.a;
    const b = state.cards.find((c) => c.id === p.b)?.name ?? p.b;
    return `${a} ↔ ${b}`;
  });
  const leftover = state.leftover
    .map((id) => state.cards.find((c) => c.id === id))
    .filter(Boolean) as CardDef[];

  if (verdict && state.phase !== "gameover") {
    return <VerdictScene state={state} verdict={verdict} onClose={dismissVerdict} />;
  }

  if (passGate) {
    const name = state.players.find((p) => p.id === passGate)?.name ?? "the next guest";
    return (
      <main className="leather grid min-h-dvh place-items-center px-4">
        <div className="case-shell max-w-sm rounded-[28px] p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-brass">Pass the case</p>
          <h1 className="mt-2 font-display text-4xl">{name}</h1>
          <p className="mt-2 text-sm text-muted">The next hand stays shut until they open it.</p>
          <Button className="mt-6 w-full" size="lg" onClick={confirmPass}>
            I am {name}
          </Button>
          <Button className="mt-2 w-full" variant="outline" onClick={playHere}>
            Play it on this phone
          </Button>
          <Button className="mt-2 w-full" variant="ghost" onClick={() => setSureLeave(true)}>
            Leave
          </Button>
          {sureLeave ? (
            <div className="mt-4">
              <p className="font-display text-3xl text-paper">Are you sure?</p>
              <p className="mt-1 text-sm text-muted">This leaves the game.</p>
              <Button className="mt-4 w-full" onClick={() => leave()}>
                Yes, leave
              </Button>
              <Button className="mt-2 w-full" variant="outline" onClick={() => setSureLeave(false)}>
                Stay
              </Button>
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  const qShow = state.question;
  const shownCard = qShow?.shownCardId ? state.cards.find((card) => card.id === qShow.shownCardId) : undefined;
  const guidedSee = Boolean(
    qShow && (state.influences ?? []).some((item) => item.victimId === qShow.askerId && item.controllerId === actor),
  );
  const askedMe = Boolean(
    shownCard && qShow && !qShow.missId && state.phase === "question" && (qShow.askerId === actor || guidedSee),
  );
  const spySee = Boolean(
    shownCard &&
      qShow &&
      state.spy?.byId === actor &&
      state.spy.targetId === qShow.askerId &&
      actor !== qShow.askerId &&
      spyClosed !== shownCard.id,
  );
  const shownToMe =
    shownCard && (askedMe || spySee)
      ? {
          card: shownCard,
          who: state.players.find((player) => player.id === qShow?.showerId)?.name ?? "A guest",
          ack: askedMe,
        }
      : null;
  return (
    <main className="leather h-dvh overflow-hidden">
      <div className="mx-auto flex h-full max-w-lg flex-col px-2 py-1">
        <header className="flex shrink-0 items-center justify-between gap-2 pt-[env(safe-area-inset-top)]">
          <p className="min-w-0 truncate font-display text-lg leading-none">
            {me?.name ?? "Your case"}
            {state.hostId === actor ? " · Host" : ""}
            {state.settings.speakMode ? " · Speaking" : ""}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <MusicToggle />
            <button type="button" className="text-sm text-subtle" onClick={() => setSureLeave(true)}>
              Leave
            </button>
          </div>
        </header>

        {myTurn && (state.phase === "action" || state.phase === "move") ? (
          <div className="mt-1 shrink-0">
            <Button size="lg" className="w-full" onClick={() => setMovesOpen(true)}>
              Your move
            </Button>
          </div>
        ) : null}

        <section
          className={`case-shell mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-[24px] px-2 pt-2 pb-2`}
        >
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-lg leading-tight">
                {state.phase === "gameover"
                  ? "The case is closed"
                  : state.phase === "roll"
                    ? myTurn
                      ? "Roll the dice"
                      : `${cur?.name ?? "Someone"} is rolling`
                    : myTurn
                      ? "Your turn"
                      : `${cur?.name ?? "Someone"}'s turn`}
              </p>
              <p className="truncate text-[10px] uppercase tracking-[0.14em] text-brass">
                {state.turnOrder
                  .map((id) => state.players.find((p) => p.id === id)?.name ?? "")
                  .filter(Boolean)
                  .join(" → ")}
              </p>
            </div>
            <button
              type="button"
              className="journal-book journal-book-sm"
              onClick={() => {
                if (!locked) sfxPaper();
                setFolio(true);
              }}
            >
              <span>{locked ? "Shut" : "Journal"}</span>
            </button>
            <div className="flex items-end gap-1">
              <DicePair
                small
                ready={canRoll}
                values={state.dice}
                toss={toss}
                snake={Boolean(state.dice && !state.singleDie && state.dice[0] === 1 && state.dice[1] === 1)}
                single={Boolean(state.singleDie)}
                onRoll={canRoll ? roll : undefined}
              />
              <p className="pb-0.5 text-right leading-none">
                <span className="block font-display text-xl">
                  {!state.dice || state.phase === "roll" ? "—" : state.pace ?? (state.singleDie ? state.dice[0] : movementTotal(state.dice))}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-subtle">move</span>
              </p>
            </div>
          </div>

          {state.notice ? (
            <p className="shrink-0 rounded-xl border border-brass/50 bg-[#2a1410] px-3 py-2 text-sm text-paper">{state.notice}</p>
          ) : null}

          {guide && cur ? (
            <p className="shrink-0 truncate text-[11px] text-muted">
              {guide.controllerId === actor
                ? state.settings.heist
                  ? `You guide ${cur.name}. You cannot name the theft, and their cards stay theirs.`
                  : `You guide ${cur.name}. No accusation, and their cards stay theirs.`
                : `${state.players.find((p) => p.id === guide.controllerId)?.name ?? "A guest"} guides this turn.`}
            </p>
          ) : null}

          {passages.length ? (
            <p className="shrink-0 truncate text-[11px] text-muted">Passages · {passages.join(" · ")}</p>
          ) : null}

          <CardHand
            cards={hand}
            facesDown={facesDown}
            spread={spread}
            onOpen={(card) => {
              if (facesDown) {
                setFacesDown(false);
                localStorage.setItem("gmm.faces", "up");
                return;
              }
              sfxPaper();
              setLifted(card);
            }}
          />

          {leftover.length ? (
            <div className="flex shrink-0 items-center gap-2">
              <p className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-subtle">Table</p>
              <div className="flex gap-1 overflow-x-auto">
                {leftover.map((card) => (
                  <CardFace key={card.id} card={card} compact onClick={() => setLifted(card)} />
                ))}
              </div>
            </div>
          ) : null}

          {state.wait && state.phase !== "gameover" ? <CatchUp state={state} selfId={actor} onKick={kick} /> : null}
          {onlinePending ? (
            <p className="shrink-0 text-center text-xs uppercase tracking-[0.14em] text-brass">Sending your move…</p>
          ) : null}
        </section>
      </div>

      <QuestionResolve
        facesDown={facesDown}
        onReveal={() => {
          setFacesDown(false);
          localStorage.setItem("gmm.faces", "up");
        }}
      />
      <EventPanel />
      <SyncVote />

      {movesOpen && myTurn && (state.phase === "action" || state.phase === "move") ? (
        <div className="roll-stage" style={{ zIndex: 55 }}>
          <div className="case-shell w-full max-w-sm rounded-[28px] px-5 py-6">
            <p className="text-center text-xs uppercase tracking-[0.18em] text-brass">Your move</p>
            <div className="mt-4 grid gap-2">
              {(state.actionsLeft ?? 1) > 0 && canAsk(state, actor) ? (
                <Button
                  size="lg"
                  onClick={() => {
                    setMovesOpen(false);
                    setSuggest(true);
                  }}
                >
                  Suggest
                </Button>
              ) : null}
              {(state.actionsLeft ?? 1) > 0 && !influenced ? (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setMovesOpen(false);
                    setAccuse(true);
                  }}
                >
                  {state.question?.offerAccusation
                    ? "Name them to win"
                    : state.settings.heist
                      ? "Name the theft"
                      : "Final Accusation"}
                </Button>
              ) : null}
              {(state.actionsLeft ?? 1) === 0 || influenced || !state.question?.offerAccusation ? (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setMovesOpen(false);
                    done();
                  }}
                >
                  End turn
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setMovesOpen(false)}>
                Back
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {rollNote && rollNote === diceSig && state.phase !== "roll" && state.phase !== "event" && myTurn ? (
        <div className="roll-stage">
          <div className="case-shell w-full max-w-sm rounded-[28px] px-6 py-7 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-brass">Your roll</p>
            <div className="mt-4 flex justify-center">
              <DicePair
                large
                values={state.dice}
                toss={toss}
                single={Boolean(state.singleDie)}
                snake={Boolean(state.dice && !state.singleDie && state.dice[0] === 1 && state.dice[1] === 1)}
              />
            </div>
            <h2 className="mt-4 font-display text-5xl leading-none">{rollWords(state)?.title}</h2>
            <p className="mt-3 text-lg text-paper">{rollWords(state)?.detail}</p>
            <Button className="mt-6 w-full" size="lg" onClick={() => setRollNote("")}>
              Got it
            </Button>
          </div>
        </div>
      ) : null}

      {canRoll && rollPrompt ? (
        <div className="roll-stage">
          <div className="case-shell max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-[28px] px-6 py-7 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-brass">Your turn</p>
            <h2 className="mt-2 font-display text-5xl leading-none">
              {state.shortDieId === actor ? "Roll one die" : "Roll the dice"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {state.shortDieId === actor
                ? "A die was stolen. This turn you roll one die."
                : "Tap the dice or the button. Double ones, or the magnifying glass, draw a house card. The glass counts as 0."}
            </p>
            <div className="mt-5 flex justify-center">
              <DicePair large single={state.shortDieId === actor} values={null} toss={0} onRoll={roll} />
            </div>
            <Button className="mt-6 w-full" size="lg" onClick={roll}>
              {state.shortDieId === actor ? "Roll one die" : "Roll the dice"}
            </Button>
            <button type="button" className="mt-4 text-sm text-subtle" onClick={() => setRollPrompt(false)}>
              Dismiss prompt
            </button>
          </div>
        </div>
      ) : null}

      {nudge ? (
        <div className="roll-stage" style={{ zIndex: 45 }}>
          <div className="case-shell w-full max-w-sm rounded-[28px] px-6 py-7 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-brass">Still your turn</p>
            <h2 className="mt-2 font-display text-5xl leading-none">Need more time?</h2>
            <p className="mt-2 text-sm text-muted">You rolled and then the table went quiet. Keep playing, or end the turn from here.</p>
            <Button
              className="mt-6 w-full"
              size="lg"
              onClick={() => {
                setNudge(false);
                setIdleGen((n) => n + 1);
              }}
            >
              I need more time
            </Button>
            <Button
              className="mt-2 w-full"
              variant="outline"
              onClick={() => {
                setNudge(false);
                done();
              }}
            >
              End my turn
            </Button>
          </div>
        </div>
      ) : null}

      {!folio ? (
        <button
          type="button"
          className="journal-book journal-book-sm"
          style={{ position: "fixed", right: 12, bottom: 12, zIndex: 84 }}
          onClick={() => {
            if (!locked) sfxPaper();
            setFolio(true);
          }}
        >
          <span>{locked ? "Shut" : "Journal"}</span>
        </button>
      ) : null}

      {folio ? (
        <div className="folio-sheet journal-open flex flex-col">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-2xl text-paper">Journal</p>
              <Button variant="outline" size="sm" onClick={() => setFolio(false)}>
                Back in the case
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <NotesBook />
            </div>
          </div>
        </div>
      ) : null}

      {lifted ? (
        <div className="folio-sheet grid place-items-center" onClick={() => setLifted(null)}>
          <CardFace card={lifted} large />
          <span className="mt-4 text-sm text-paper">Tap to put it back</span>
          {hand.some((card) => card.id === lifted.id) ? (
            <div className="mt-4 flex w-full max-w-xs flex-col gap-2" onClick={(event) => event.stopPropagation()}>
              <Button
                onClick={() => {
                  setFacesDown(true);
                  localStorage.setItem("gmm.faces", "down");
                  setLifted(null);
                }}
              >
                Hide faces
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const next = !spread;
                  setSpread(next);
                  localStorage.setItem("gmm.spread", next ? "1" : "0");
                  setLifted(null);
                }}
              >
                {spread ? "Fan the cards" : "See all cards"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {suggest ? (
        <div className="folio-sheet flex flex-col overflow-hidden" style={{ background: "#140e0b" }}>
          <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col px-3 pb-3 pt-2">
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setSuggest(false)}>
              Close
            </Button>
            <div className="mt-1 min-h-0 flex-1">
              <QuestionPanel startOpen fit onAsked={() => setSuggest(false)} />
            </div>
          </div>
        </div>
      ) : null}

      {accuse ? (
        <div className="folio-sheet flex flex-col overflow-hidden" style={{ background: "#6d1a1a" }}>
          <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col px-3 pb-3 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                if (offerKey) skippedOffer.current = offerKey;
                setAccuse(false);
                namePick(null);
              }}
            >
              Close
            </Button>
            <div className="mt-1 min-h-0 flex-1">
              <AccusationPanel startOpen fit />
            </div>
          </div>
        </div>
      ) : null}

      {state.phase !== "gameover" ? <AccusationWatch onLeave={() => setSureLeave(true)} /> : null}

      {state.phase === "gameover" ? (
        <Victory
          state={state}
          solution={secrets.solution}
          youId={actor}
          isHost={actor === state.hostId || state.settings.playMode !== "online"}
          onAgain={playAgain}
          onEnd={() => setSureLeave(true)}
        />
      ) : null}

      {sureLeave ? (
        <div className="folio-sheet grid place-items-center px-4" style={{ background: "#140e0b" }}>
          <div className="case-shell w-full max-w-sm rounded-[28px] p-6 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-brass">Leave the game</p>
            <h2 className="mt-2 font-display text-4xl text-paper">Are you sure?</h2>
            <p className="mt-2 text-sm text-muted">
              {state.phase === "gameover"
                ? "This leaves the table."
                : "Your turn is skipped and your cards go to the other players."}
            </p>
            <Button className="mt-6 w-full" onClick={leave}>
              Yes, leave
            </Button>
            <Button className="mt-2 w-full" variant="outline" onClick={() => setSureLeave(false)}>
              Stay
            </Button>
          </div>
        </div>
      ) : null}

      {shownToMe ? (
        <div className="roll-stage" style={{ zIndex: 80 }}>
          <div className="case-shell w-full max-w-sm rounded-[28px] px-6 py-6 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-brass">Shown only to you</p>
            <h2 className="mt-2 font-display text-4xl leading-none text-paper">{shownToMe.who} shows you a card</h2>
            <div className="mt-4 flex justify-center">
              <CardFace card={shownToMe.card} large />
            </div>
            <Button
              className="mt-5 w-full"
              size="lg"
              onClick={() => {
                if (shownToMe.ack) ackCard();
                else setSpyClosed(shownToMe.card.id);
              }}
            >
              I've seen it
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const KICK_AFTER = 45_000;

function CatchUp({
  state,
  selfId,
  onKick,
}: {
  state: GameState;
  selfId: string;
  onKick: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const ids = state.wait?.ids.filter((id) => id !== selfId) ?? [];
  if (!ids.length) return null;
  const ready = now - (state.wait?.since ?? now) >= KICK_AFTER;
  const names = ids.map((id) => state.players.find((player) => player.id === id)?.name ?? "A guest");
  return (
    <div className="rounded-[16px] border border-brass bg-[#2a1410] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-brass">Game paused</p>
      <p className="mt-1 font-display text-2xl leading-tight text-paper">
        {names.join(" and ")} {names.length === 1 ? "is" : "are"} catching up
      </p>
      <p className="mt-1 text-sm text-paper">If they are still in the game, this step moves on by itself. They stay seated.</p>
      {ready ? (
        <div className="mt-3 grid gap-2">
          <p className="text-sm text-brass">They have been gone a while. Remove them only if they cannot get back.</p>
          {ids.map((id) => (
            <Button key={id} variant="outline" onClick={() => onKick(id)}>
              Remove {state.players.find((player) => player.id === id)?.name ?? "them"}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">If they cannot reconnect, you will get the choice to remove them.</p>
      )}
    </div>
  );
}

function VerdictScene({ state, verdict, onClose }: { state: GameState; verdict: Verdict; onClose: () => void }) {
  const name = state.players.find((player) => player.id === verdict.playerId)?.name ?? "A guest";
  const cards = verdict.cards;
  const right = cards?.filter((card) => card.hit) ?? [];
  const label: Record<CategoryId, string> = state.settings.heist
    ? { suspect: "Who", weapon: "Stolen", room: "Where", time: "When" }
    : { suspect: "Who", weapon: "Weapon", room: "Room", time: "Time" };
  return (
    <main className="folio-sheet verdict-fail overflow-auto">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 py-8">
        <p className="text-xs uppercase tracking-[0.28em] text-[#e7b3a8]">
          {state.settings.heist ? "The theft" : "Final accusation"}
        </p>
        <h1 className="verdict-seal mt-3 font-display text-6xl leading-none text-[#fff6f4]">{cards ? "Not the truth" : "Wrong"}</h1>
        <p className="mt-3 font-display text-3xl leading-tight text-[#ffd0c8]">
          {cards ? `You got ${right.length} of ${cards.length} right` : `${name} got it wrong.`}
        </p>
        {cards ? (
          <>
            <p className="mt-2 text-sm text-[#ffd7d2]">
              {right.length
                ? `Right: ${right
                    .map((item) => state.cards.find((card) => card.id === item.id)?.name ?? "A card")
                    .join(", ")}.`
                : "None of the cards you named were right."}
            </p>
            <p className="mt-1 text-sm text-[#e7b3a8]">The ones you missed stay hidden. The case is still open.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {cards.map((item, index) => {
                const card = state.cards.find((entry) => entry.id === item.id);
                return (
                  <div key={item.category} className="accuse-pop" style={{ animationDelay: `${index * 90}ms` }}>
                    <p className={item.hit ? "text-[10px] uppercase tracking-[0.16em] text-[#b7e7c3]" : "text-[10px] uppercase tracking-[0.16em] text-[#ffb4a8]"}>
                      {label[item.category]} · {item.hit ? "Right" : "Wrong"}
                    </p>
                    {card ? <CardFace card={card} choice /> : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="mt-4 max-w-sm text-sm text-[#ffd7d2]">The case stays open.</p>
        )}
        <Button className="mt-6" variant="paper" onClick={onClose}>
          {cards ? "Back to the table" : "Continue"}
        </Button>
      </div>
    </main>
  );
}

function Victory({
  state,
  solution,
  youId,
  isHost,
  onAgain,
  onEnd,
}: {
  state: GameState;
  solution: Secrets["solution"];
  youId: string;
  isHost: boolean;
  onAgain: () => void;
  onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);
  const winner = state.players.find((player) => player.id === state.winnerId)?.name ?? "A guest";
  const cats: CategoryId[] = ["suspect", "weapon", "room"];
  if (state.settings.timeOfDayEnabled) cats.push("time");
  const heading: Record<CategoryId, string> = state.settings.heist
    ? { suspect: "Who took it", weapon: "What was stolen", room: "Where", time: "When" }
    : { suspect: "Character", weapon: "Weapon", room: "Room", time: "Time" };
  const yours = scoreLine(state, solution, youId);
  return (
    <div className="folio-sheet verdict-win flex flex-col" style={{ background: "#140e0b" }}>
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
        <div className="verdict-seal">
          <p className="text-xs uppercase tracking-[0.28em] text-brass">The case is solved</p>
          <h1 className="mt-3 font-display text-6xl leading-none text-paper">{winner}</h1>
          <p className="mt-3 font-display text-3xl text-brass">wins</p>
          {yours ? <p className="mt-3 text-sm text-paper">{yours}</p> : null}
        </div>
      </div>
      {open ? (
        <div className="case-shell max-h-[78%] overflow-auto rounded-t-[28px] px-4 pt-4 pb-6">
          <p className="text-xs uppercase tracking-[0.16em] text-subtle">The correct answers</p>
          <ul className="mt-3 space-y-3">
            {cats.map((cat, index) => {
              const card = state.cards.find((item) => item.id === solution[cat]);
              return (
                <li key={cat} className="accuse-pop flex items-center gap-3" style={{ animationDelay: `${index * 90}ms` }}>
                  {card ? <CardFace card={card} compact /> : null}
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.14em] text-brass">{heading[cat]}</p>
                    <p className="truncate font-display text-3xl leading-tight">{card ? card.name : "Still sealed"}</p>
                    {card?.clock ? <p className="text-sm text-brass">{card.clock}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button disabled={!isHost} onClick={onAgain}>
              Play again
            </Button>
            <Button variant="outline" onClick={onEnd}>
              Leave
            </Button>
          </div>
          {!isHost ? <p className="mt-2 text-center text-xs text-muted">The host deals the next case.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function scoreLine(state: GameState, solution: Secrets["solution"], youId: string): string | null {
  const acc = state.accusation;
  if (!acc || acc.playerId !== youId) return null;
  const cats: CategoryId[] = ["suspect", "weapon", "room"];
  if (state.settings.timeOfDayEnabled) cats.push("time");
  const field = { suspect: "suspectId", room: "roomId", weapon: "weaponId", time: "timeId" } as const;
  const rows = cats.map((cat) => ({
    name: state.cards.find((card) => card.id === acc[field[cat]])?.name ?? "A card",
    hit: solution[cat] === acc[field[cat]],
  }));
  const right = rows.filter((row) => row.hit);
  if (acc.correct) return `You got all ${rows.length} right.`;
  if (!right.length) return "You got none of them right.";
  return `You got ${right.length} of ${rows.length} right: ${right.map((row) => row.name).join(", ")}.`;
}
