import { Castle, Diamond, Layers, Moon, Sword, UserRound } from "lucide-react";
import { cardsByCategory } from "@/lib/game/cards";
import { characterColor } from "@/lib/game/character-colors";
import { haptic } from "@/lib/game/haptics";
import { sfxPaper } from "@/lib/game/sfx";
import { useSimpleJournal } from "@/lib/game/simple-journal";
import { useGame, useMyHand, useMyNotes } from "@/lib/game/store";
import type { CardDef, CategoryId, GameState, PlayerNotes, SheetMark } from "@/lib/game/types";
import { CATEGORY_LABEL } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ProfileBadge } from "./PlayerBadge";

function asMark(mark: string | undefined): SheetMark {
  if (mark === "check" || mark === "x" || mark === "maybe" || mark === "answer") return mark;
  return "blank";
}
type Leaf = "sheet" | "notes";

/** The same category symbols the cards use (person, room, weapon, time; a jewel in heist mode). */
const CATEGORY_ICON = { suspect: UserRound, room: Castle, weapon: Sword, time: Moon } as const;

export function NotesBook() {
  const state = useGame((s) => s.state);
  const viewing = useGame((s) => s.viewingPlayerId);
  const markNote = useGame((s) => s.markNote);
  const markNotes = useGame((s) => s.markNotes);
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
        <Sheet state={state} notes={notes} onMark={markNote} onMarks={markNotes} ownerId={mine} owner={ownerSeat} frozen />
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
          <Sheet state={state} notes={notes} onMark={markNote} onMarks={markNotes} ownerId={mine} owner={ownerSeat} />
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
  onMarks,
  ownerId,
  owner,
  frozen = false,
}: {
  state: GameState;
  notes: PlayerNotes;
  ownerId: string;
  owner?: GameState["players"][number];
  onMark: (cardId: string, column: string, mark: PlayerNotes["marks"][string][string]) => void;
  onMarks: (cardId: string, marks: Record<string, PlayerNotes["marks"][string][string]>) => void;
  frozen?: boolean;
}) {
  const players = state.players.filter((player) => player.id !== ownerId);
  const simple = useSimpleJournal();
  const myHandIds = new Set(useMyHand().map((c) => c.id));
  // Cards left face up on the table after the deal. Nobody holds them, so simple journaling shows them with their own symbol.
  const tableIds = new Set((state.leftover ?? []).map(String));
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
          {simple
            ? "Tap a square, pick a player, then choose a check if they have the card or an X if they do not. A check also marks everyone else with an X."
            : "Tap a square to pick a mark, or pick a player's logo and then a check (they have the card, everyone else gets an X) or an X (just that player). A green check or a red X means that card is out. One O in each group is the one you think it is. ? is not sure. If every other card in a group is out, the last one is circled for you."}
        </p>
      </header>
      <div className="overflow-x-auto pb-2">
        <table className="w-max min-w-full border-collapse text-left text-sm text-[#1c2430]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#f6f1e6] py-1 pr-2 text-left font-display text-base font-normal">Card</th>
              {simple ? <th className="px-1 py-1 text-center font-display text-sm font-normal">Shown by</th> : null}
              {simple ? null : <th className="px-1 py-1 text-center font-display text-sm font-normal">Env</th>}
              {(simple ? [] : players).map((p) => (
                <th
                  key={p.id}
                  className="px-1 py-1 text-center"
                  style={columnStyle(characterColor(p.avatar))}
                  data-coded={p.avatar ? "true" : undefined}
                >
                  <ProfileBadge player={p} cards={state.cards} size="md" className="mx-auto" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cats.map((cat, catIndex) => (
              <Fragment key={cat}>
                {/* A clear break between groups: a gap, a heavy double rule, and a shaded heading band. */}
                {catIndex > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={simple ? 2 : players.length + 2} className="h-4 p-0" />
                  </tr>
                ) : null}
                <tr>
                  <td
                    colSpan={simple ? 2 : players.length + 2}
                    className="border-y-[3px] border-double border-[#1c2430]/70 bg-[#e6d9bb] px-2 py-1.5 font-display text-xl text-[#1c2430]"
                  >
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
                {cardsByCategory(state.cards, cat).map((card) => {
                  // A card in your own hand needs no marks: you know where it is.
                  if (!frozen && myHandIds.has(card.id)) {
                    return (
                      <tr key={card.id} className="border-b border-[#1c2430]/10">
                        <td className="sticky left-0 max-w-48 truncate bg-[#f6f1e6] py-1 pr-2">
                          {(() => {
                            const Icon = state.settings.heist && card.category === "weapon" ? Diamond : CATEGORY_ICON[card.category];
                            return <Icon className="mr-1.5 inline-block size-4 align-[-3px] text-[#8a5a12]" aria-hidden />;
                          })()}
                          {card.name}
                        </td>
                        <td colSpan={simple ? 1 : players.length + 1} className="px-1 py-1 text-center text-sm italic text-[#5c4a38]">
                          This Evidence belongs to You
                        </td>
                      </tr>
                    );
                  }
                  if (simple && !frozen && tableIds.has(card.id)) {
                    return (
                      <tr key={card.id} className="border-b border-[#1c2430]/10">
                        <td className="sticky left-0 max-w-48 truncate bg-[#f6f1e6] py-1 pr-2">{card.name}</td>
                        <td className="px-1 py-1 text-center">
                          <span
                            className="inline-flex items-center justify-center gap-1 text-xs italic text-[#5c4a38]"
                            aria-label={`${card.name} is on the table`}
                            title="On the table"
                          >
                            <Layers className="size-5 text-[#8a5a12]" aria-hidden />
                            On the table
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  return (
                  <tr key={card.id} className="border-b border-[#1c2430]/10">
                    <td className="sticky left-0 max-w-48 truncate bg-[#f6f1e6] py-1 pr-2">{card.name}</td>
                    {simple ? (
                      <SimpleMark
                        card={card}
                        players={players}
                        row={notes.marks[card.id]}
                        cards={state.cards}
                        onMarks={onMarks}
                        frozen={frozen}
                      />
                    ) : (
                      <>
                        <Mark
                          card={card}
                          column="envelope"
                          mark={frozen ? "maybe" : asMark(notes.marks[card.id]?.envelope)}
                          onMark={onMark}
                          onMarks={onMarks}
                          frozen={frozen}
                          players={players}
                          row={notes.marks[card.id]}
                          cards={state.cards}
                        />
                        {players.map((p) => (
                          <Mark
                            key={p.id}
                            tint={characterColor(p.avatar)}
                            card={card}
                            column={p.id}
                            mark={frozen ? "maybe" : asMark(notes.marks[card.id]?.[p.id])}
                            onMark={onMark}
                            onMarks={onMarks}
                            frozen={frozen}
                            players={players}
                            row={notes.marks[card.id]}
                            cards={state.cards}
                          />
                        ))}
                      </>
                    )}
                  </tr>
                  );
                })}
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

/** The tinted strip behind one guest's whole column, in the color of the character they picked. */
function columnStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    backgroundColor: `${color}2e`,
    boxShadow: `inset 2px 0 0 ${color}, inset -2px 0 0 ${color}`,
  };
}

type Row = Record<string, SheetMark | "x"> | undefined;
type OnMark = (cardId: string, column: string, mark: SheetMark) => void;
type OnMarks = (cardId: string, marks: Record<string, SheetMark>) => void;
type Anchor = { x: number; top: number; bottom: number };
type Seat = GameState["players"][number];

function anchorOf(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
}

/**
 * A check on one player makes that player the only holder: every other player (including a player who was checked
 * before) is marked with an X, and the envelope (the main column, not attached to a player) gets a check mark, not an X,
 * because the card is in someone's hand. An X marks only that player.
 */
function holderMarks(players: Seat[], pick: Seat, kind: "check" | "x"): Record<string, SheetMark> {
  if (kind === "x") return { [pick.id]: "x" };
  const out: Record<string, SheetMark> = { [pick.id]: "check", envelope: "check" };
  for (const p of players) if (p.id !== pick.id) out[p.id] = "x";
  return out;
}

/** The little menu that opens beside a square. It stays on screen and closes when you tap anywhere else. */
function MarkMenu({ anchor, onClose, children }: { anchor: Anchor; onClose: () => void; children: ReactNode }) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const width = Math.min(280, vw - 16);
  const left = Math.min(Math.max(anchor.x - width / 2, 8), vw - width - 8);
  const above = anchor.top > 190;
  return (
    <div className="fixed inset-0 z-50" onPointerDown={onClose}>
      <div
        className="absolute grid gap-2 rounded-2xl border border-[#c4b396] bg-[#f6f1e6] p-2 shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
        style={{
          left,
          width,
          ...(above ? { top: anchor.top - 8, transform: "translateY(-100%)" } : { top: anchor.bottom + 8 }),
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** One player's logo as a button: ringed green when marked as having the card, red when marked as not. */
function LogoChoice({
  player,
  cards,
  mark,
  onPick,
}: {
  player: Seat;
  cards: CardDef[];
  mark: SheetMark | undefined;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${player.name}${mark === "check" ? ", has it" : mark === "x" ? ", does not have it" : ""}`}
      title={player.name}
      className={cn(
        "relative grid place-items-center rounded-full p-0.5",
        mark === "check" && "bg-[#178a45]/15 ring-2 ring-[#178a45]",
        mark === "x" && "bg-[#b42318]/10 ring-2 ring-[#b42318]/70",
      )}
      onClick={onPick}
    >
      <ProfileBadge player={player} cards={cards} size="md" />
      {mark === "check" ? <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-[#178a45] text-[10px] leading-none text-white">✓</span> : null}
      {mark === "x" ? <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-[#b42318] text-[10px] leading-none text-white">✕</span> : null}
    </button>
  );
}

/** Step two: with a player picked, it has to be a check or an X. */
function HolderStep({
  player,
  cards,
  cardName,
  current,
  onCheck,
  onX,
  onClear,
  onBack,
}: {
  player: Seat;
  cards: CardDef[];
  cardName: string;
  current: SheetMark | undefined;
  onCheck: () => void;
  onX: () => void;
  onClear: () => void;
  onBack: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-center gap-2">
        <ProfileBadge player={player} cards={cards} size="md" />
        <p className="font-display text-lg leading-tight text-[#1c2430]">{player.name}</p>
      </div>
      <p className="text-center text-xs text-[#5c4a38]">Do they have {cardName}?</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-label={`${player.name} has it`}
          className={cn("grid place-items-center rounded-xl border-2 border-[#178a45]/60 py-2 text-[#178a45]", current === "check" && "bg-[#178a45]/15")}
          onClick={onCheck}
        >
          <span className="font-display text-2xl leading-none">✓</span>
          <span className="text-xs">Has it</span>
        </button>
        <button
          type="button"
          aria-label={`${player.name} does not have it`}
          className={cn("grid place-items-center rounded-xl border-2 border-[#b42318]/60 py-2 text-[#b42318]", current === "x" && "bg-[#b42318]/10")}
          onClick={onX}
        >
          <span className="font-display text-2xl font-bold leading-none">✕</span>
          <span className="text-xs">Does not</span>
        </button>
      </div>
      <p className="text-center text-[11px] text-[#8a7560]">A check marks everyone else with an X. An X marks only {player.name}.</p>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-[#8a7560] underline" onClick={onBack}>
          Back
        </button>
        {current === "check" || current === "x" ? (
          <button type="button" className="text-[#8a3b3b] underline" onClick={onClear}>
            Clear {player.name}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Mark({
  card,
  column,
  mark,
  onMark,
  onMarks,
  tint,
  players,
  row,
  cards,
  frozen = false,
}: {
  tint?: string;
  card: CardDef;
  column: string;
  mark: SheetMark;
  onMark: OnMark;
  onMarks: OnMarks;
  players: Seat[];
  row: Row;
  cards: CardDef[];
  frozen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Seat | null>(null);
  const [anchor, setAnchor] = useState<Anchor>({ x: 0, top: 0, bottom: 0 });
  const choices = column === "envelope" ? CHOICES : CHOICES.filter((choice) => choice.id !== "answer");
  const close = () => {
    setOpen(false);
    setWho(null);
  };

  return (
    <td className="px-1 py-1 text-center" style={columnStyle(tint)}>
      <button
        type="button"
        aria-label={`${card.name} mark`}
        style={tint ? { borderColor: tint, borderWidth: 2 } : undefined}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (frozen) return;
          haptic("mark");
          setAnchor(anchorOf(e.currentTarget));
          setWho(null);
          setOpen(true);
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
        <MarkMenu anchor={anchor} onClose={close}>
          {who ? (
            <HolderStep
              player={who}
              cards={cards}
              cardName={card.name}
              current={asMark(row?.[who.id])}
              onBack={() => setWho(null)}
              onCheck={() => {
                haptic("mark");
                onMarks(card.id, holderMarks(players, who, "check"));
                close();
              }}
              onX={() => {
                haptic("mark");
                onMarks(card.id, holderMarks(players, who, "x"));
                close();
              }}
              onClear={() => {
                onMark(card.id, who.id, "blank");
                close();
              }}
            />
          ) : (
            <>
              <div className="flex justify-center gap-1">
                {choices.map((choice) => (
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
                      const columnPlayer = players.find((p) => p.id === column);
                      if (columnPlayer && choice.id === "check" && mark !== "check") {
                        // Checking a player: they become the only holder, the earlier holder is marked X and the envelope gets a check.
                        onMarks(card.id, holderMarks(players, columnPlayer, "check"));
                      } else {
                        onMark(card.id, column, mark === choice.id ? "blank" : choice.id);
                      }
                      close();
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              {players.length ? (
                <div className="border-t border-[#1c2430]/15 pt-2">
                  <p className="mb-1 text-center text-[10px] uppercase tracking-[0.2em] text-[#8a7560]">Who has it</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {players.map((p) => (
                      <LogoChoice key={p.id} player={p} cards={cards} mark={asMark(row?.[p.id])} onPick={() => setWho(p)} />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </MarkMenu>
      ) : null}
    </td>
  );
}

/** Simple journaling: one square for the card. Pick a player, then a check (they have it) or an X (they do not). */
function SimpleMark({
  card,
  players,
  row,
  cards,
  onMarks,
  frozen = false,
}: {
  card: CardDef;
  players: Seat[];
  row: Row;
  cards: CardDef[];
  onMarks: OnMarks;
  frozen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Seat | null>(null);
  const [anchor, setAnchor] = useState<Anchor>({ x: 0, top: 0, bottom: 0 });
  const holders = players.filter((p) => row?.[p.id] === "check");
  const ruledOut = players.filter((p) => row?.[p.id] === "x");
  const holder = holders[0];
  const envelope = asMark(row?.envelope);
  const close = () => {
    setOpen(false);
    setWho(null);
  };
  return (
    <td className="px-1 py-1 text-center">
      <button
        type="button"
        aria-label={`${card.name}, who has it`}
        className="notebook-mark !h-9 !w-9"
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (frozen) return;
          haptic("mark");
          setAnchor(anchorOf(e.currentTarget));
          setWho(null);
          setOpen(true);
        }}
      >
        {frozen ? (
          <span className="text-[#8a6230]">?</span>
        ) : holder ? (
          <span className="relative inline-flex">
            <ProfileBadge player={holder} cards={cards} size="sm" />
            <span className="absolute -bottom-1.5 -right-2 grid size-4 place-items-center rounded-full bg-[#178a45] text-[10px] leading-none text-white">✓</span>
            {holders.length > 1 ? (
              <span className="absolute -right-2 -top-2 rounded-full bg-[#1c2430] px-1 text-[10px] leading-4 text-[#f6f1e6]">+{holders.length - 1}</span>
            ) : null}
          </span>
        ) : envelope === "answer" ? (
          <span className="font-display text-xl font-bold leading-none text-[#8a5a12]">O</span>
        ) : envelope === "maybe" ? (
          <span className="font-display text-xl leading-none text-[#8a6230]">?</span>
        ) : ruledOut.length ? (
          <span className="text-sm font-bold text-[#b42318]">✕{ruledOut.length}</span>
        ) : null}
      </button>
      {open ? (
        <MarkMenu anchor={anchor} onClose={close}>
          {who ? (
            <HolderStep
              player={who}
              cards={cards}
              cardName={card.name}
              current={asMark(row?.[who.id])}
              onBack={() => setWho(null)}
              onCheck={() => {
                haptic("mark");
                onMarks(card.id, holderMarks(players, who, "check"));
                close();
              }}
              onX={() => {
                haptic("mark");
                onMarks(card.id, holderMarks(players, who, "x"));
                close();
              }}
              onClear={() => {
                onMarks(card.id, { [who.id]: "blank" });
                close();
              }}
            />
          ) : (
            <>
              <div className="flex justify-center gap-1">
                {CHOICES.filter((choice) => choice.id === "maybe" || choice.id === "answer").map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    aria-label={choice.name}
                    title={choice.name}
                    className={cn(
                      "grid h-9 min-w-16 place-items-center rounded-full px-3 font-display text-xl leading-none",
                      choice.id === "maybe" && "text-[#8a6230]",
                      choice.id === "answer" && "font-bold text-[#8a5a12]",
                      envelope === choice.id ? "bg-[#1c2430]/15" : "bg-[#1c2430]/5",
                    )}
                    onClick={() => {
                      haptic("mark");
                      onMarks(card.id, { envelope: envelope === choice.id ? "blank" : choice.id });
                      close();
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[#8a7560]">Who has {card.name}?</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {players.map((p) => (
                  <LogoChoice key={p.id} player={p} cards={cards} mark={asMark(row?.[p.id])} onPick={() => setWho(p)} />
                ))}
              </div>
              {holders.length || ruledOut.length || envelope !== "blank" ? (
                <button
                  type="button"
                  className="text-center text-sm text-[#8a3b3b] underline"
                  onClick={() => {
                    onMarks(card.id, { envelope: "blank", ...Object.fromEntries(players.map((p) => [p.id, "blank" as SheetMark])) });
                    close();
                  }}
                >
                  Clear everyone
                </button>
              ) : null}
            </>
          )}
        </MarkMenu>
      ) : null}
    </td>
  );
}
