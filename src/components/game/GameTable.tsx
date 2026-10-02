import { occupyingRoom, roomById } from "@/lib/game/board";
import { currentPlayer, turnActorId, useActorId, useGame, useMyHand } from "@/lib/game/store";
import { movementTotal } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { MansionBoard } from "./MansionBoard";
import { DicePair } from "./Dice";
import { CardFace } from "./CardFace";
import { NotesBook } from "./NotesBook";
import { AccusationPanel, QuestionPanel, QuestionResolve } from "./QuestionPanel";
import { EventPanel } from "./EventPanel";
import { BookOpen, DoorOpen, ScrollText } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function GameTable() {
  const state = useGame((s) => s.state);
  const secrets = useGame((s) => s.secrets);
  const actor = useActorId();
  const viewing = useGame((s) => s.viewingPlayerId);
  const setViewing = useGame((s) => s.setViewing);
  const panel = useGame((s) => s.panel);
  const setPanel = useGame((s) => s.setPanel);
  const leave = useGame((s) => s.leave);
  const passGate = useGame((s) => s.passGate);
  const confirmPass = useGame((s) => s.confirmPass);
  const roll = useGame((s) => s.roll);
  const moveTo = useGame((s) => s.moveTo);
  const stay = useGame((s) => s.stay);
  const done = useGame((s) => s.done);
  const hand = useMyHand();
  const [toss, setToss] = useState(0);
  const [notesUp, setNotesUp] = useState(false);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [sureLeave, setSureLeave] = useState(false);
  if (!state) return null;
  const cur = currentPlayer(state);
  const guide = (state.influences ?? []).find((i) => i.victimId === cur?.id);
  const me = state.players.find((p) => p.id === actor);
  const isMyTurn = turnActorId(state) === actor;
  const roomId = cur ? occupyingRoom(cur.position) : null;
  const roomLabel = roomId ? roomById(roomId)?.name ?? roomId : "the hall";
  const leftover = state.leftover
    .map((id) => state.cards.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const inPerson = state.settings.playMode === "inperson";
  const canSeatSwitch = state.settings.playMode !== "online" && !state.settings.honorHands;
  const lifted = [...hand, ...leftover].find((c) => c.id === liftedId) ?? null;
  const paces = state.pace ?? (state.singleDie && state.dice ? state.dice[0] : movementTotal(state.dice));

  return (
    <div className="table-scene flex min-h-dvh flex-col">
      {passGate ? (
        <PassGate
          name={state.players.find((p) => p.id === passGate)?.name ?? "the next guest"}
          onConfirm={confirmPass}
        />
      ) : null}

      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-brass">
            {state.code} · {state.settings.playMode === "online" ? "Online" : inPerson ? "In person" : "At the table"}
          </p>
          <h1 className="font-display text-2xl leading-none">
            The Case
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {canSeatSwitch ? (
            <select
              className="h-10 rounded-[12px] border border-line bg-raised px-2 text-base sm:text-sm"
              value={viewing}
              onChange={(e) => setViewing(e.target.value)}
              aria-label="View as guest"
            >
              {state.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-muted">{me?.name}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSureLeave(true)}>
            Leave
          </Button>
        </div>
      </header>
      {sureLeave ? (
        <div className="mx-4 mb-2 rounded-[16px] border border-line bg-raised px-4 py-3">
          <p className="font-display text-2xl text-paper">Are you sure?</p>
          <p className="text-sm text-muted">Leave the game? Your cards go to the other players.</p>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={leave}>
              Yes, leave
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setSureLeave(false)}>
              Stay
            </Button>
          </div>
        </div>
      ) : null}

      {state.phase === "gameover" ? <WinBanner /> : null}

      <div className={cn("min-h-0 flex-1 overflow-auto px-2 pb-2", panel === "log" && "max-lg:hidden")}>
        <div className="mx-auto mb-2 flex max-w-[720px] items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-brass">Now moving</p>
            <p className="font-display text-2xl leading-none">
              {guide
                ? `${state.players.find((p) => p.id === guide.controllerId)?.name} guides ${cur?.name}`
                : cur?.name ?? "—"}
            </p>
            <p className="text-sm text-muted">
              {cur?.name} is in {roomLabel}
              {paces != null && state.phase === "move" ? ` · ${state.moveBudget} of ${paces} paces left` : ""}
              {guide ? (" · cannot Solve the Case") : ""}
            </p>
          </div>
        </div>
        <div className="mx-auto w-fit">
          <MansionBoard
            state={state}
            actorId={cur?.id ?? actor}
            interactive={isMyTurn && (state.phase === "move" || state.event?.kind === "move-anywhere")}
            onMove={moveTo}
          />
        </div>
      </div>

      <div className={cn("table-edge", panel === "log" && "max-lg:hidden")}>
        <nav className="mb-2 flex rounded-[16px] border border-line/60 bg-black/20 p-1 lg:hidden">
          {(
            [
              ["table", "House", DoorOpen],
              ["notes", "Notes", BookOpen],
              ["log", "Log", ScrollText],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (id === "notes") {
                  setNotesUp(true);
                  setPanel("table");
                  return;
                }
                setPanel(id);
              }}
              className={cn(
                "flex h-10 flex-1 items-center justify-center gap-1 rounded-[12px] text-sm text-paper",
                panel === id ? "bg-black/30" : "text-paper/70",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-3">
            <DicePair values={state.dice} toss={toss} single={Boolean(state.singleDie)} extra={state.extraDie} snake={!state.singleDie && state.dice?.[0] === 1 && state.dice?.[1] === 1} />
            <div className="pb-1">
              <p className="font-display text-3xl leading-none text-paper">{paces ?? "—"}</p>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#e7d7a8]">paces</p>
            </div>
          </div>
          <button type="button" className="notepad-tab" onClick={() => setNotesUp(true)}>
            <span className="notepad-band" />
            <span>Notes</span>
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {state.phase === "event" ? <EventPanel /> : null}
          {state.phase === "question" ? <QuestionResolve /> : null}

          {isMyTurn && state.phase === "roll" ? (
            <div>
              <p className="text-sm text-[#f3ead8]/80">Two dice. Double ones, or the magnifying glass, draw a house card. The glass counts as 0.</p>
              <Button
                className="mt-2"
                onClick={() => {
                  setToss((n) => n + 1);
                  roll();
                }}
              >
                Roll onto the table
              </Button>
            </div>
          ) : null}

          {isMyTurn && state.phase === "move" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-xl text-sm text-[#f3ead8]/80">
                Step one square at a time, only onto lit squares. The roll is how far you can get. A doorway or a secret passage ends the move.
              </p>
              <Button variant="outline" onClick={stay}>
                Stop here
              </Button>
            </div>
          ) : null}

          {isMyTurn && state.phase === "action" ? (
            <div className="space-y-3">
              <QuestionPanel />
              <AccusationPanel />
              {state.question?.offerAccusation && !guide ? null : (
                <Button variant="outline" onClick={done}>
                  {inPerson ? "My turn is done" : "End turn"}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <div className="hand-fan mt-4">
          {hand.map((c, i) => {
            const mid = (hand.length - 1) / 2;
            const tilt = (i - mid) * 7;
            return (
              <button
                key={c.id}
                type="button"
                className="hand-card"
                style={{ transform: `rotate(${tilt}deg) translateY(${Math.abs(i - mid) * 8}px)` }}
                onClick={() => setLiftedId(c.id)}
                aria-label={`Look at ${c.name}`}
              >
                <CardFace card={c} compact />
              </button>
            );
          })}
          {!hand.length ? <p className="text-sm text-[#f3ead8]/70">No cards in this seat.</p> : null}
        </div>

        {leftover.length ? (
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#e7d7a8]">Face up on the table</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {leftover.map((c) => (
                <button key={c.id} type="button" onClick={() => setLiftedId(c.id)} aria-label={`Look at ${c.name}`}>
                  <CardFace card={c} compact />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <details className="log-slip mt-3">
          <summary>The evening so far</summary>
          <ul className="mt-2 max-h-36 space-y-1.5 overflow-auto text-sm text-[#f3ead8]/80">
            {[...state.log].reverse().map((e) => (
              <li key={e.id}>{e.text}</li>
            ))}
          </ul>
        </details>

        {state.phase === "gameover" && secrets.solution.suspect ? (
          <div className="mt-3 rounded-[16px] bg-[#f3ead8] p-3 text-[#1a1410]">
            <h3 className="font-display text-xl">The envelope</h3>
            <p className="mt-1 text-sm">
              {state.cards.find((c) => c.id === secrets.solution.suspect)?.name} in the{" "}
              {state.cards.find((c) => c.id === secrets.solution.room)?.name} with the{" "}
              {state.cards.find((c) => c.id === secrets.solution.weapon)?.name}
              {secrets.solution.time
                ? ` at ${state.cards.find((c) => c.id === secrets.solution.time)?.name}`
                : ""}
              .
            </p>
          </div>
        ) : null}
      </div>

      {panel === "log" ? (
        <div className="flex-1 overflow-auto p-4 lg:hidden">
          <ul className="space-y-1.5 text-sm text-paper">
            {[...state.log].reverse().map((e) => (
              <li key={e.id}>{e.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {notesUp ? (
        <div className="notepad-stage" role="dialog" aria-label="Private notepad">
          <div className="notepad-sheet">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-lg text-ink">Your notepad</p>
              <Button variant="outline" size="sm" onClick={() => setNotesUp(false)}>
                Set it down
              </Button>
            </div>
            <NotesBook />
          </div>
        </div>
      ) : null}

      {lifted ? (
        <button type="button" className="card-stage" onClick={() => setLiftedId(null)} aria-label="Set the card down">
          <span className="card-pop">
            <CardFace card={lifted} />
          </span>
          <span className="mt-4 text-sm text-paper/80">Tap to set the card down</span>
        </button>
      ) : null}
    </div>
  );
}

function PassGate({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/90 p-6">
      <div className="wood-panel max-w-md rounded-[28px] p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-brass">Pass the device</p>
        <h2 className="mt-2 font-display text-3xl">Are you {name}?</h2>
        <p className="mt-2 text-sm text-muted">Hands stay private. Confirm only if this device is in front of you.</p>
        <Button className="mt-6 w-full" size="lg" onClick={onConfirm}>
          I am {name}
        </Button>
      </div>
    </div>
  );
}

function WinBanner() {
  const state = useGame((s) => s.state);
  if (!state?.winnerId) return null;
  const winner = state.players.find((p) => p.id === state.winnerId);
  return (
    <div className="border-b border-brass/40 bg-raised px-4 py-3 text-center">
      <p className="font-display text-2xl">{winner?.name} has closed the case.</p>
    </div>
  );
}
