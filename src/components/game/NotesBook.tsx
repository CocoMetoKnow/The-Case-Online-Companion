import { cardsByCategory } from "@/lib/game/cards";
import { haptic } from "@/lib/game/haptics";
import { sfxPaper } from "@/lib/game/sfx";
import { useGame, useMyNotes } from "@/lib/game/store";
import type { CardDef, CategoryId, GameState, PlayerNotes, SheetMark } from "@/lib/game/types";
import { CATEGORY_LABEL } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { ProfileBadge } from "./PlayerBadge";

const CYCLE: Record<"card" | "guest", SheetMark[]> = {
  card: ["blank", "check", "x", "maybe", "answer"],
  guest: ["blank", "check", "x", "maybe"],
};

function asMark(mark: string | undefined): SheetMark {
  if (mark === "check" || mark === "x" || mark === "maybe" || mark === "answer") return mark;
  return "blank";
}
type Leaf = "sheet" | "notes";

export function NotesBook() {
  const state = useGame((s) => s.state);
  const viewing = useGame((s) => s.viewingPlayerId);
  const markNote = useGame((s) => s.markNote);
  const setFreeText = useGame((s) => s.setFreeText);
  const notes = useMyNotes();
  const mine = useGame((s) => s.localPlayerId);
  const [leaf, setLeaf] = useState<Leaf>("sheet");
  if (!state) return null;
  // Whose journal this is: your own seat online, the guest holding the phone at a shared table.
  const ownerSeat = state.players.find((p) => p.id === (state.settings.playMode === "online" ? mine : viewing));
  const locked = state.notesLock?.[viewing] ?? 0;
  if (locked > 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="shrink-0 px-2 pt-2 text-sm text-[#5c4a38]">
          Notes are shut for {locked} of your {locked === 1 ? "turn" : "turns"}. Every mark is a question until then. Your real marks are still saved.
        </p>
        <Sheet state={state} notes={notes} onMark={markNote} ownerId={mine} owner={ownerSeat} frozen />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {leaf === "notes" ? (
        <div className="flex h-full min-h-0 w-full">
          <button type="button" className="journal-edge journal-edge-back" onClick={() => setLeaf("sheet")}>
            The sheet
          </button>
          <div className="journal-pad">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-3xl leading-none">My notes</p>
              <button type="button" className="journal-back" onClick={() => setLeaf("sheet")}>
                Back to the sheet
              </button>
            </div>
            <p className="mt-1 text-sm text-[#8a7560]">Only on this phone.</p>
            <textarea
              className="mt-3 min-h-0 flex-1"
              placeholder="Write it here…"
              aria-label="Personal notes"
              value={notes.freeText}
              onChange={(e) => setFreeText(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <>
          <Sheet state={state} notes={notes} onMark={markNote} ownerId={mine} owner={ownerSeat} />
          <button
            type="button"
            className="journal-edge"
            aria-label="Personal notes"
            onClick={() => {
              sfxPaper();
              setLeaf("notes");
            }}
          >
            My notes
          </button>
        </>
      )}
    </div>
  );
}

function Sheet({
  state,
  notes,
  onMark,
  ownerId,
  owner,
  frozen = false,
}: {
  state: GameState;
  notes: PlayerNotes;
  ownerId: string;
  owner?: GameState["players"][number];
  onMark: (cardId: string, column: string, mark: PlayerNotes["marks"][string][string]) => void;
  frozen?: boolean;
}) {
  const players = state.players.filter((player) => player.id !== ownerId);
  const cats: CategoryId[] = state.settings.timeOfDayEnabled
    ? ["suspect", "weapon", "room", "time"]
    : ["suspect", "weapon", "room"];
  return (
    <Notebook>
      <header className="mb-3 border-b border-[#1a2744]/20 pb-2">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[#8a3b3b]">Private</p>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-3xl leading-none text-[#1c2430]">Journal</h2>
          {owner ? <ProfileBadge player={owner} cards={state.cards} size="lg" /> : null}
        </div>
        {notes.lastShown ? (
          <div className="mt-2 rounded-xl border border-[#1c2430]/15 bg-[#fffaf1] px-3 py-2">
            <h3 className="font-display text-xl text-[#1c2430]">Last card shown to you</h3>
            <p className="mt-1 text-sm text-[#1c2430]">
              {state.cards.find((c) => c.id === notes.lastShown?.cardId)?.name ?? "A card"} from{" "}
              {state.players.find((p) => p.id === notes.lastShown?.fromId)?.name ?? "the table"}.
            </p>
            <p className="mt-1 text-xs text-[#5c4a38]">This goes away when you hide the card. The mark on your sheet stays.</p>
          </div>
        ) : null}
        <p className="mt-1 text-sm text-[#5c4a38]">
          A green check or a red X means that card is out. One O in each group is the one you think it is. ? is not sure. If every other card in a group is out, the last one is circled for you.
        </p>
      </header>
      <div className="overflow-x-auto pb-2">
        <table className="w-max min-w-full border-collapse text-left text-sm text-[#1c2430]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#f6f1e6] py-1 pr-2 text-left font-display text-base font-normal">Card</th>
              <th className="px-1 py-1 text-center font-display text-sm font-normal">Env</th>
              {players.map((p) => (
                <th key={p.id} className="px-1 py-1 text-center">
                  <ProfileBadge player={p} cards={state.cards} size="md" className="mx-auto" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cats.map((cat) => (
              <Fragment key={cat}>
                <tr>
                  <td colSpan={players.length + 2} className="pt-3 pb-1 font-display text-xl text-[#1c2430]">
                    {state.settings.heist
                      ? cat === "suspect"
                        ? "Who took it"
                        : cat === "weapon"
                          ? "What was stolen"
                          : cat === "room"
                            ? "Where"
                            : "When"
                      : cat === "suspect"
                        ? "Characters"
                        : CATEGORY_LABEL[cat]}
                  </td>
                </tr>
                {cardsByCategory(state.cards, cat).map((card) => (
                  <tr key={card.id}>
                    <td className="sticky left-0 max-w-48 truncate bg-[#f6f1e6] py-1 pr-2">{card.name}</td>
                    <Mark
                      card={card}
                      column="envelope"
                      mark={frozen ? "maybe" : asMark(notes.marks[card.id]?.envelope)}
                      onMark={onMark}
                      frozen={frozen}
                    />
                    {players.map((p) => (
                      <Mark
                        key={p.id}
                        card={card}
                        column={p.id}
                        mark={frozen ? "maybe" : asMark(notes.marks[card.id]?.[p.id])}
                        onMark={onMark}
                        frozen={frozen}
                      />
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <TableSync />
      <JournalLeave />
    </Notebook>
  );
}

function JournalLeave() {
  const leave = useGame((s) => s.leave);
  const [sure, setSure] = useState(false);
  if (!sure) {
    return (
      <div className="mt-10 border-t border-[#1a2744]/15 pt-4">
        <button type="button" className="text-sm text-[#8a3b3b] underline" onClick={() => setSure(true)}>
          Leave game
        </button>
      </div>
    );
  }
  return (
    <div className="mt-10 rounded-xl border border-[#8a3b3b]/30 bg-[#fffaf1] p-3">
      <p className="font-display text-2xl leading-none text-[#1c2430]">Are you sure?</p>
      <p className="mt-2 text-sm text-[#5c4a38]">This leaves the game. Your cards go to the other players.</p>
      <button type="button" className="mt-3 w-full rounded-full bg-[#1c2430] px-3 py-2 text-sm text-[#f6f1e6]" onClick={() => leave()}>
        Yes, leave
      </button>
      <button type="button" className="mt-2 w-full text-sm text-[#8a7560]" onClick={() => setSure(false)}>
        Stay
      </button>
    </div>
  );
}

function TableSync() {
  const state = useGame((s) => s.state);
  const syncTable = useGame((s) => s.syncTable);
  const [sure, setSure] = useState(false);
  if (!state || state.phase === "lobby" || state.phase === "gameover") return null;
  if (!sure) {
    return (
      <div className="mt-8 border-t border-[#1a2744]/15 pt-3">
        <button type="button" className="text-xs text-[#8a7560] underline" onClick={() => setSure(true)}>
          The table is stuck
        </button>
      </div>
    );
  }
  return (
    <div className="mt-8 rounded-xl border border-[#1a2744]/20 bg-[#fffaf1] p-3">
      <p className="font-display text-2xl leading-none text-[#1c2430]">Sync every phone?</p>
      <p className="mt-2 text-sm text-[#5c4a38]">
        Everyone still playing has to agree. The current turn ends, and the next player starts fresh. Cards stay. A power that lasts past the turn stays on. Notes stay.
      </p>
      <button
        type="button"
        className="mt-3 w-full rounded-full bg-[#1c2430] px-3 py-2 text-sm text-[#f6f1e6]"
        onClick={() => {
          syncTable({ agree: true });
          setSure(false);
        }}
      >
        Ask the table
      </button>
      <button type="button" className="mt-2 w-full text-sm text-[#8a7560]" onClick={() => setSure(false)}>
        Never mind
      </button>
    </div>
  );
}

function Notebook({ children }: { children: ReactNode }) {
  return (
    <div className="notebook relative h-full min-w-0 flex-1">
      <div className="notebook-spiral" aria-hidden="true" />
      <div className="notebook-page">{children}</div>
    </div>
  );
}

const CHOICES: Array<{ id: SheetMark; label: string; name: string }> = [
  { id: "check", label: "✓", name: "Checked out" },
  { id: "x", label: "✕", name: "Ruled out" },
  { id: "maybe", label: "?", name: "Not sure" },
  { id: "answer", label: "O", name: "This is the one" },
];

function Mark({
  card,
  column,
  mark,
  onMark,
  frozen = false,
}: {
  card: CardDef;
  column: string;
  mark: SheetMark;
  onMark: (cardId: string, column: string, mark: SheetMark) => void;
  frozen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const ignoreUntil = useRef(0);

  function clearTimer() {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <td className="px-1 py-1 text-center">
      <button
        type="button"
        aria-label={`${card.name} mark`}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (frozen) return;
          held.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          clearTimer();
          const el = e.currentTarget;
          timer.current = window.setTimeout(() => {
            held.current = true;
            const r = el.getBoundingClientRect();
            setPos({ x: r.left + r.width / 2, y: r.top });
            ignoreUntil.current = performance.now() + 400;
            haptic("mark");
            setOpen(true);
          }, 420);
        }}
        onPointerMove={(e) => {
          if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clearTimer();
        }}
        onPointerUp={clearTimer}
        onPointerCancel={clearTimer}
        onClick={() => {
          if (frozen || held.current) return;
          haptic("mark");
          const order = CYCLE[column === "envelope" ? "card" : "guest"];
          const at = Math.max(0, order.indexOf(mark));
          onMark(card.id, column, order[(at + 1) % order.length]);
        }}
        className={cn(
          "notebook-mark",
          mark === "check" && "text-[#178a45]",
          mark === "x" && "font-bold text-[#b42318]",
          mark === "maybe" && "text-[#8a6230]",
          mark === "answer" && "font-bold text-[#8a5a12]",
        )}
      >
        {mark === "check" ? "✓" : mark === "x" ? "✕" : mark === "maybe" ? "?" : mark === "answer" ? "O" : ""}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50"
          onPointerDown={() => {
            if (performance.now() < ignoreUntil.current) return;
            setOpen(false);
          }}
        >
          <div
            className="absolute flex gap-1 rounded-full border border-[#c4b396] bg-[#f6f1e6] p-1 shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
            style={{
              left: pos.x,
              top: Math.max(8, pos.y - 52),
              transform: "translateX(-50%)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(column === "envelope" ? CHOICES : CHOICES.filter((choice) => choice.id !== "answer")).map((choice) => (
              <button
                key={choice.id}
                type="button"
                aria-label={choice.name}
                className={cn(
                  "grid size-9 place-items-center rounded-full font-display text-xl leading-none",
                  choice.id === "check" && "text-[#178a45]",
                  choice.id === "x" && "font-bold text-[#b42318]",
                  choice.id === "maybe" && "text-[#8a6230]",
                  choice.id === "answer" && "font-bold text-[#8a5a12]",
                  mark === choice.id && "bg-[#1c2430]/10",
                )}
                onClick={() => {
                  haptic("mark");
                  onMark(card.id, column, mark === choice.id ? "blank" : choice.id);
                  setOpen(false);
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </td>
  );
}
