import { create } from "zustand";
import { applyPlay } from "@/lib/game/actions";
import { CLASSIC_CARDS, DEFAULT_CARDS, UNDERGROUND_ROOMS, applyClassicNames, MIN_CATEGORY_CARDS, answerCards, asHeist, capCharacters, retireBorrowedNames, sliceSet, takeDeck, upgradeTimeCards } from "@/lib/game/cards";
import {
  accusationHits,
  addPlayer,
  setAvatar as applyAvatar,
  setClassicNames as applyClassicNamesToTable,
  canAsk,
  createLobby,
  currentPlayer,
  dealAndStart,
  dropPlayer,
  removePlayer,
  roomCode,
  turnActorId,
  blockingPlayerIds,
  rememberRound,
} from "@/lib/game/engine";
import { autoResolveIfPossible } from "@/lib/game/events";
import { sfxCard, sfxFail, sfxPaper, sfxPencil, sfxPower, sfxReceive, sfxSnake, sfxTurn, unlockAudio } from "@/lib/game/sfx";
import {
  emptyNotes,
  loadVault,
  notesKey,
  flushSession,
  saveAllNotes,
  saveCardArt,
  saveCardSets,
  saveClueCode,
  savePlayerName,
  saveTable,
} from "@/lib/game/storage";
import type { CardDef, CardSet, CategoryId, DeckToggles, GameSettings, GameState, PiecePos, PlayerNotes, Secrets, SheetMark } from "@/lib/game/types";
import { NPC_ID, SAVE_VERSION } from "@/lib/game/types";
import { BOARD_MAX_PLAYERS, MAP_ROOM_IDS, hiddenRoomsOf, isLegalPos, layoutFor, resolvePassages } from "@/lib/game/board";
import { uid } from "@/lib/utils";

export { canAsk, currentPlayer, turnActorId };
export type { GameState };

export type OnlineIntent = { kind: string; payload?: Record<string, unknown> };
export type Verdict = {
  playerId: string;
  cards?: Array<{ category: CategoryId; id: string; hit: boolean }>;
};

type View = "landing" | "setup" | "lobby" | "play";

export interface SetupDraft {
  name: string;
  settings: GameSettings;
  counts: Record<CategoryId, number>;
  setId: string;
  deck: CardDef[];
}

interface GameStore {
  view: View;
  localPlayerId: string;
  viewingPlayerId: string;
  passGate: string | null;
  verdict: Verdict | null;
  verdictSeen: string;
  verdictHold: string | null;
  state: GameState | null;
  secrets: Secrets;
  notes: Record<string, PlayerNotes>;
  setup: SetupDraft;
  cardSets: CardSet[];
  joinCode: string;
  joinError: string | null;
  onlinePending: boolean;
  booted: boolean;
  panel: "table" | "notes" | "log";
  setView: (view: View) => void;
  setSetup: (patch: Partial<SetupDraft>) => void;
  patchSettings: (patch: Partial<GameSettings>) => void;
  setCounts: (counts: Record<CategoryId, number>) => void;
  setDeck: (deck: CardDef[]) => void;
  updateDeckCard: (id: string, patch: Partial<CardDef>) => void;
  addDeckCard: (category: CategoryId) => void;
  removeDeckCard: (id: string) => void;
  loadPreset: (preset: "classic" | "harrington" | "take") => void;
  loadFile: (id: string) => void;
  /** Writes the deck on screen (cards, switches, time-of-day cards, name) into the active saved file. Nothing is written until this runs. */
  saveFile: (name?: string) => void;
  renameFile: (id: string, name: string) => void;
  clearFile: (id: string) => void;
  snakeEyes: () => void;
  setJoinCode: (joinCode: string) => void;
  joinOnline: () => void;
  setPanel: (panel: "table" | "notes" | "log") => void;
  hostTable: () => void;
  quickEvening: () => void;
  addLocalGuest: (name: string) => void;
  lockLobby: (locked: boolean) => void;
  startGame: () => void;
  playAgain: () => void;
  roll: () => void;
  moveTo: (pos: PiecePos) => void;
  stay: () => void;
  ask: (pick?: { suspectId: string; roomId: string; weaponId: string; timeId?: string }) => void;
  showCard: (cardId: string) => void;
  reply: (has: boolean) => void;
  /** Speak Mode: after tapping Yes, admit there is no card to show; the next player in line is asked. */
  retractReply: () => void;
  ackCard: () => void;
  accuse: (pick: { suspectId: string; roomId: string; weaponId: string; timeId?: string }) => void;
  dismissVerdict: () => void;
  namePick: (pick: { suspectId?: string; roomId?: string; weaponId?: string; timeId?: string } | null) => void;
  /** Live preview of a suggestion being picked, for phones with Extra Visuals on. */
  suggestPick: (pick: { suspectId?: string; roomId?: string; weaponId?: string; timeId?: string } | null) => void;
  done: () => void;
  syncTable: (choice: { agree?: boolean; cancel?: boolean }) => void;
  eventChoice: (choice: Record<string, unknown>) => void;
  markNote: (cardId: string, column: string, mark: PlayerNotes["marks"][string][string]) => void;
  /** Several marks on one card in one go (one pencil sound, one save). */
  markNotes: (cardId: string, marks: Record<string, PlayerNotes["marks"][string][string]>) => void;
  setFreeText: (text: string) => void;
  saveSet: (set: CardSet) => void;
  deleteSet: (id: string) => void;
  leave: (reason?: unknown) => void;
  /** The detective journal. Lives in the store so one persistent button (JournalLayer) can open it from any screen. */
  journalOpen: boolean;
  setJournalOpen: (open: boolean) => void;
  /** Digital board: which of the two game screens is showing. The journal opens over either one. */
  screen: "board" | "cards";
  setScreen: (screen: "board" | "cards") => void;
  /** "Pick Your Character". Sets a seat's profile picture to a suspect card's art. */
  setAvatar: (playerId: string, cardId: string) => void;
  /** The "clue" easter egg: show the original Clue names to everyone at the table. */
  setClassicNames: (on: boolean) => void;
  /** Cards just handed to this phone because a player left the table. Shown once, until the player taps "Got it". */
  cardsReceived: { fromNames: string[]; cardIds: string[]; at: number } | null;
  dismissReceived: () => void;
  hydrate: () => void;
  syncSheet: () => void;
  applyRemote: (state: GameState, hand?: string[], solution?: Secrets["solution"], reveals?: Secrets["reveals"], hits?: Record<string, boolean> | null) => void;
  setLocalId: (id: string) => void;
  setViewing: (id: string) => void;
  kick: (playerId: string) => void;
  confirmPass: () => void;
  playHere: () => void;
}

let onlineSend: ((intent: OnlineIntent) => void) | null = null;
let onlineLeave: (() => void) | null = null;
let bootedOnce = false;
let queuedIntent: OnlineIntent | null = null;
let queuedTurn = -1;

export function bindOnlineSend(send: ((intent: OnlineIntent) => void) | null) {
  onlineSend = send;
  if (!send) {
    queuedIntent = null;
    queuedTurn = -1;
  }
}
export function bindOnlineLeave(leave: (() => void) | null) {
  onlineLeave = leave;
}
export function releaseOnline() {
  if (useGame.getState().onlinePending) useGame.setState({ onlinePending: false });
  const next = queuedIntent;
  const turn = queuedTurn;
  queuedIntent = null;
  queuedTurn = -1;
  if (!next || !onlineSend) return;
  const live = useGame.getState().state;
  if (next.kind === "done" && live && (live.turnIndex !== turn || turnActorId(live) !== useGame.getState().localPlayerId)) return;
  useGame.setState({ onlinePending: true });
  onlineSend(next);
}

function sendOnline(get: () => { state: GameState | null }, intent: OnlineIntent): boolean {
  const { state } = get();
  if (!state || state.settings.playMode !== "online") return false;
  if (!onlineSend) return false;
  if (intent.kind === "name" || intent.kind === "suggesting" || intent.kind === "avatar" || intent.kind === "classic") {
    onlineSend(intent);
    return true;
  }
  if (useGame.getState().onlinePending) {
    queuedIntent = intent;
    queuedTurn = state.turnIndex;
    return true;
  }
  useGame.setState({ onlinePending: true });
  onlineSend(intent);
  return true;
}

/**
 * The digital board is one fixed house with ten rooms, so those ten room cards are always in the deck, and no other
 * room card is, except the hidden rooms the host put on a secret passage. A card the host already had keeps its own
 * name and picture; a missing one comes from the standard cards.
 */
function boardDeck(cards: CardDef[], settings?: GameSettings): CardDef[] {
  const pool = [...DEFAULT_CARDS, ...CLASSIC_CARDS, ...UNDERGROUND_ROOMS].filter((c) => c.category === "room");
  const want = [...MAP_ROOM_IDS, ...hiddenRoomsOf(settings ?? null).slice(0, 2)];
  const have = new Map(cards.filter((c) => c.category === "room").map((c) => [c.id, c]));
  const rooms = want
    .map((id) => have.get(id) ?? pool.find((c) => c.id === id))
    .filter((c): c is CardDef => Boolean(c));
  return [...cards.filter((c) => c.category !== "room"), ...rooms];
}

/** Fill in whatever the host left to the game: the secret passages. */
function boardSetup(settings: GameSettings, rooms: string[]): Partial<GameSettings> {
  if (settings.table !== "board") return {};
  return {
    boardPassages: resolvePassages(rooms, settings.boardPassages),
  };
}

const defaultSettings = (): GameSettings => ({
  maxPlayers: 15,
  locked: false,
  timeOfDayEnabled: false,
  wrongAccusationEliminates: true,
  honorHands: false,
  playMode: "online",
  table: "case",
  cardSetId: "classic",
  enabledRoomIds: CLASSIC_CARDS.filter((c) => c.category === "room").map((c) => c.id),
  evenDeal: false,
  heist: false,
  manualNotes: false,
  speakMode: false,
  extraDifficulty: false,
  classicNames: false,
});

function activeCategories(time: boolean): CategoryId[] {
  return time ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
}

function deckReady(cards: CardDef[], time: boolean, seats: number) {
  const cats = activeCategories(time);
  if (!cats.every((cat) => cards.filter((card) => card.category === cat).length >= MIN_CATEGORY_CARDS)) return false;
  const total = cards.filter((card) => cats.includes(card.category)).length;
  return total >= Math.max(2, seats) + answerCards(time);
}

function chosenSeats(settings: GameSettings, cards: CardDef[]) {
  const hard = settings.table === "board" ? BOARD_MAX_PLAYERS : 15;
  const cats = activeCategories(settings.timeOfDayEnabled);
  const total = cards.filter((card) => cats.includes(card.category)).length;
  const room = Math.max(2, Math.min(hard, total - answerCards(settings.timeOfDayEnabled)));
  return Math.max(2, Math.min(room, settings.maxPlayers || 2));
}

function activeCards(setup: SetupDraft): CardDef[] {
  const deck = setup.deck?.length ? setup.deck : sliceSet(DEFAULT_CARDS, setup.counts, setup.settings.timeOfDayEnabled);
  return capCharacters(deck.filter((c) => setup.settings.timeOfDayEnabled || c.category !== "time"));
}

function withDeck(setup: SetupDraft, deck: CardDef[]): SetupDraft {
  const capped = capCharacters(deck);
  const counts: Record<CategoryId, number> = { suspect: 0, room: 0, weapon: 0, time: 0 };
  for (const card of capped) counts[card.category] += 1;
  return {
    ...setup,
    deck: capped,
    counts,
    settings: {
      ...setup.settings,
      enabledRoomIds: capped.filter((c) => c.category === "room").map((c) => c.id),
    },
  };
}

function blankCard(category: CategoryId, n: number): CardDef {
  const icon = category === "suspect" ? "UserRound" : category === "room" ? "Castle" : category === "weapon" ? "Flame" : "Clock";
  return { id: uid(category), category, name: `Untitled ${n}`, blurb: "", icon };
}

function cleanStoredName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || /^detective$/i.test(trimmed)) return "";
  return trimmed.slice(0, 24);
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let persistNow: (() => void) | null = null;

function persist(get: () => GameStore) {
  if (!get().state) {
    persistNow = null;
    saveTable(null);
    return;
  }
  window.clearTimeout(persistTimer);
  persistNow = () => {
    persistNow = null;
    const live = get();
    if (!live.state) return;
    saveCardArt(live.state.cards);
    const online = live.state.settings.playMode === "online";
    const hands = online
      ? { [live.localPlayerId]: live.secrets.hands[live.localPlayerId] ?? [] }
      : live.secrets.hands;
    saveTable({
      version: SAVE_VERSION,
      state: {
        ...live.state,
        cards: live.state.cards.map(({ imageDataUrl: _image, ...card }) => card),
        eventDeck: [],
        eventDiscard: [],
        log: live.state.log.slice(-4),
      },
      secrets: { solution: online ? {} : live.secrets.solution, hands, reveals: [] },
      localPlayerId: live.localPlayerId,
      viewingPlayerId: live.viewingPlayerId,
    });
  };
  persistTimer = window.setTimeout(() => persistNow?.(), 250) as unknown as ReturnType<typeof setTimeout>;
}

/**
 * Save the session right now. Called as the page goes away (refresh, tab switch, phone locking),
 * so the last move is never lost to the short save delay.
 */
export function flushPersist() {
  if (persistNow) {
    window.clearTimeout(persistTimer);
    persistNow();
  }
  flushSession();
}

function persistNotes(notes: Record<string, PlayerNotes>) {
  saveAllNotes(notes);
}

function pickToggles(settings: GameSettings): DeckToggles {
  return {
    timeOfDayEnabled: Boolean(settings.timeOfDayEnabled),
    heist: Boolean(settings.heist),
    speakMode: Boolean(settings.speakMode),
    manualNotes: Boolean(settings.manualNotes),
    evenDeal: Boolean(settings.evenDeal),
    extraDifficulty: Boolean(settings.extraDifficulty),
    enabledEvents: settings.enabledEvents ? [...settings.enabledEvents] : undefined,
  };
}

/** Put a saved deck's switches back. Every one is set, so nothing from the last deck leaks through. */
function withToggles(settings: GameSettings, toggles: DeckToggles): GameSettings {
  return {
    ...settings,
    timeOfDayEnabled: Boolean(toggles.timeOfDayEnabled),
    heist: Boolean(toggles.heist),
    speakMode: Boolean(toggles.speakMode),
    manualNotes: Boolean(toggles.manualNotes),
    evenDeal: Boolean(toggles.evenDeal),
    extraDifficulty: Boolean(toggles.extraDifficulty),
    enabledEvents: toggles.enabledEvents ? [...toggles.enabledEvents] : undefined,
  };
}

function rememberFile(get: () => GameStore, set: (partial: Partial<GameStore>) => void, name?: string) {
  const setup = get().setup;
  if (!setup.setId.startsWith("file-")) return;
  const prev = get().cardSets.find((s) => s.id === setup.setId);
  const cardSet: CardSet = {
    id: setup.setId,
    name: (name ?? prev?.name)?.trim().slice(0, 24) || `Deck ${setup.setId.slice(-1)}`,
    cards: setup.deck.map((c) => ({ ...c })),
    createdAt: prev?.createdAt || Date.now(),
    timeOfDayEnabled: setup.settings.timeOfDayEnabled,
    // Which of the ten hours are on is saved by name too, so the choice comes back exactly as it was.
    timeCardIds: setup.deck.filter((c) => c.category === "time").map((c) => c.id),
    toggles: pickToggles(setup.settings),
  };
  const sets = [...get().cardSets.filter((s) => s.id !== cardSet.id), cardSet];
  saveCardSets(sets);
  set({ cardSets: sets });
}

/** The saved deck's cards with its chosen time-of-day cards put back (older saves just use their own card list). */
function cardsWithSavedTimes(saved: CardSet): CardDef[] {
  const cards = saved.cards.map((c) => ({ ...c }));
  if (!saved.timeCardIds) return cards;
  const keep = new Set(saved.timeCardIds);
  const times = DEFAULT_CARDS.filter((c) => c.category === "time" && keep.has(c.id)).map(
    (c) => saved.cards.find((item) => item.id === c.id) ?? { ...c },
  );
  return [...cards.filter((c) => c.category !== "time"), ...times.map((c) => ({ ...c }))];
}

function seatToPlay(state: GameState, localId: string): string {
  const needed = blockingPlayerIds(state);
  if (needed.length) return needed[0];
  return turnActorId(state) ?? localId;
}

function maybePass(state: GameState, localId: string, honor: boolean): { viewing: string; gate: string | null } {
  if (state.settings.playMode === "online") return { viewing: localId, gate: null };
  const who = seatToPlay(state, localId);
  if (!honor) return { viewing: who, gate: null };
  if (who === localId) return { viewing: localId, gate: null };
  return { viewing: localId, gate: who };
}

function sheetOwner(state: GameState, localId: string, viewingId: string) {
  return state.settings.playMode === "online" ? localId : viewingId;
}

function autoMark(notes: Record<string, PlayerNotes>, state: GameState, secrets: Secrets, playerId: string) {
  if (!playerId) return notes;
  const key = notesKey(state.code, playerId);
  const mine = notes[key] ?? emptyNotes();
  let marks = mine.marks;
  let shown = mine.shown;
  let lastShown = mine.lastShown ?? null;
  let changed = false;
  const stamp = (id: string, fromId?: string) => {
    const cell = { ...(marks[id] ?? {}) };
    let touched = false;
    if (!cell.envelope || cell.envelope === "blank") {
      cell.envelope = "check";
      touched = true;
    }
    if (fromId && (!cell[fromId] || cell[fromId] === "blank")) {
      cell[fromId] = "check";
      touched = true;
    }
    if (!touched) return;
    marks = { ...marks, [id]: cell };
    changed = true;
  };
  for (const id of secrets.hands[playerId] ?? []) stamp(id);
  for (const id of state.leftover ?? []) stamp(String(id));
  const q = state.question;
  const ev = state.event;
  const evCard = ev?.data?.cardId ? String(ev.data.cardId) : "";
  let seenId = "";
  let seenFrom = "";
  if (q?.shownCardId && q.askerId === playerId && q.gambleResult !== "lost") {
    // A lost Gambler bet means the card is never seen, so nothing is marked in the journal.
    seenId = q.shownCardId;
    seenFrom = q.showerId && q.showerId !== NPC_ID ? q.showerId : "";
  } else if (q?.shownCardId && state.spy?.byId === playerId && state.spy.targetId === q.askerId) {
    seenId = q.shownCardId;
    seenFrom = q.showerId || "";
  } else if (evCard && ev?.step === "show-private" && playerId === String(ev.data.viewerId ?? "")) {
    seenId = evCard;
    seenFrom = String(ev.data.targetId ?? "");
  } else if (evCard && ev?.step === "show-all" && playerId !== String(ev.data.holderId ?? "")) {
    seenId = evCard;
    seenFrom = String(ev.data.holderId ?? "");
  }
  const markSolution = (id: string) => {
    if (!state.cards.some((card) => card.id === id)) return;
    const cell = { ...(marks[id] ?? {}) };
    if (cell.envelope === "answer") return;
    cell.envelope = "answer";
    marks = { ...marks, [id]: cell };
    changed = true;
  };
  if (!state.settings.manualNotes) {
    if (seenId) stamp(seenId, seenFrom || undefined);
    if (ev?.data?.nobody && evCard) markSolution(evCard);
  }
  const asked = [q?.suspectId, q?.roomId, q?.weaponId, q?.timeId].filter(Boolean).map(String);
  const holding = new Set((secrets.hands[playerId] ?? []).map(String));
  const table = new Set((state.leftover ?? []).map(String));
  const solved = q?.askerId === playerId && ((q.closeTurn && q.nobodyHad) || (q.offerAccusation && q.nobodyHad));
  if (solved) {
    for (const id of asked) if (!holding.has(id) && !table.has(id)) markSolution(id);
  }
  // A suggestion came back with nobody holding any of the named cards, and
  // the asker didn't either. Rather than mark it the instant that happens,
  // the asker's own journal waits until a later turn cycle has actually
  // begun before confirming it — never their own hand's cards, even then.
  const pending = state.pendingAnswer;
  if (pending && pending.askerId === playerId && state.turnIndex !== pending.turnIndex) {
    for (const id of pending.ids) if (!holding.has(id)) markSolution(id);
  }
  if (seenId && (lastShown?.cardId !== seenId || lastShown?.fromId !== seenFrom)) {
    lastShown = { cardId: seenId, fromId: seenFrom };
    changed = true;
  }
  if (shown.length) {
    shown = [];
    changed = true;
  }
  if (!changed) return notes;
  return { ...notes, [key]: { ...mine, marks, shown, lastShown } };
}

function forgetShownCard(notes: Record<string, PlayerNotes>, state: GameState, playerId: string) {
  if (!playerId) return notes;
  const key = notesKey(state.code, playerId);
  const mine = notes[key];
  if (!mine?.lastShown && !(mine?.shown?.length)) return notes;
  return { ...notes, [key]: { ...mine, lastShown: null, shown: [] } };
}

function sheetsToMark(state: GameState, localId: string, viewingId: string) {
  const ids = new Set<string>();
  if (localId) ids.add(localId);
  const asker = state.question?.askerId;
  if (asker && state.question?.nobodyHad && (state.question.offerAccusation || state.question.closeTurn)) ids.add(asker);
  const owner = sheetOwner(state, localId, viewingId);
  if (owner) ids.add(owner);
  // One shared device: the asker's journal learns the answer even though the next guest is now looking.
  if (state.pendingAnswer && state.settings.playMode !== "online") ids.add(state.pendingAnswer.askerId);
  return [...ids];
}

function applySheets(
  notes: Record<string, PlayerNotes>,
  state: GameState,
  secrets: Secrets,
  ids: string[],
) {
  let next = notes;
  for (const id of ids) next = autoMark(next, state, secrets, id);
  return next;
}

function thisGameNotes(notes: Record<string, PlayerNotes>, code: string) {
  const prefix = `${code}:`;
  let extra = false;
  for (const key of Object.keys(notes)) {
    if (!key.startsWith(prefix)) extra = true;
  }
  if (!extra) return notes;
  const next: Record<string, PlayerNotes> = {};
  for (const [key, value] of Object.entries(notes)) if (key.startsWith(prefix)) next[key] = value;
  return next;
}

function freshSheet(notes: Record<string, PlayerNotes>, code: string) {
  const next = { ...notes };
  for (const key of Object.keys(next)) if (key.startsWith(`${code}:`)) delete next[key];
  return next;
}

function accusationKey(state: GameState) {
  const acc = state.accusation;
  if (!acc) return "";
  return `${acc.playerId}:${acc.suspectId}:${acc.roomId}:${acc.weaponId}:${acc.timeId ?? ""}:${acc.at ?? ""}`;
}

function openVerdict(get: () => GameStore, state: GameState, hits: Record<string, boolean> | null | undefined, localId: string) {
  const prev = get();
  if (state.phase === "gameover" || !hits) return { verdict: state.phase === "gameover" ? null : prev.verdict, verdictSeen: prev.verdictSeen, verdictHold: prev.verdictHold };
  const acc = state.accusation;
  if (!acc || acc.correct || acc.playerId !== localId) return { verdict: prev.verdict, verdictSeen: prev.verdictSeen, verdictHold: prev.verdictHold };
  const key = accusationKey(state);
  if (prev.verdictSeen === key) return { verdict: null, verdictSeen: key, verdictHold: null };
  const cats = activeCategories(state.settings.timeOfDayEnabled);
  const field = { suspect: "suspectId", room: "roomId", weapon: "weaponId", time: "timeId" } as const;
  const cards = cats.map((cat) => ({ category: cat, id: String(acc[field[cat]] ?? ""), hit: Boolean(hits[cat]) }));
  return { verdict: { playerId: localId, cards } as Verdict, verdictSeen: prev.verdictSeen, verdictHold: key };
}

function cueLocal(prev: GameState, next: GameState) {
  if (next.phase === "roll" && (prev.phase !== "roll" || prev.turnIndex !== next.turnIndex)) sfxTurn();
  // The dice clack is played by Briefcase at the exact moment the dice animation starts.
  if (next.phase === "event" && prev.phase !== "event") {
    sfxSnake();
    sfxPower();
  }
  // When the case is closed by a guess, the win or fail sound plays with the "Case closed" / "Wrong" stamp in the
  // Solve the Case reveal, so it never gives the result away early. A game over with no guess behind it plays here.
  if (next.phase === "gameover" && prev.phase !== "gameover" && !next.accusation) {
    sfxFail();
  }
}

function actorId(state: GameState, localId: string, viewingId: string) {
  return state.settings.playMode === "online" ? localId : viewingId;
}

/**
 * Someone left and their hand was dealt out: which of the cards now in this player's hand came from that?
 * Only counts when a player actually left the table in the same update, so a power-up that moves a card never triggers it.
 */
function receivedFromLeaver(
  prev: GameState | null | undefined,
  next: GameState,
  before: string[],
  after: string[],
): { fromNames: string[]; cardIds: string[]; at: number } | null {
  if (!prev?.startedAt || !next.startedAt || next.phase === "lobby") return null;
  const gone = prev.players.filter((player) => !next.players.some((other) => other.id === player.id));
  if (!gone.length) return null;
  const had = new Set(before);
  const gained = after.filter((id) => !had.has(id));
  if (!gained.length) return null;
  return { fromNames: gone.map((player) => player.name), cardIds: gained, at: Date.now() };
}

function commitLocal(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
  prev: GameState,
  next: { state: GameState; secrets: Secrets },
) {
  if (next.state === prev && next.secrets === get().secrets) return;
  cueLocal(prev, next.state);
  const { localPlayerId } = get();
  const seatOn = (s: GameState) => s.turnOrder[Math.max(0, s.turnIndex) % Math.max(1, s.turnOrder.length)];
  // About Face renumbers the seats but the same guest is still on turn, so that is not a new turn.
  const passed = seatOn(prev) !== seatOn(next.state) || prev.startedAt !== next.state.startedAt;
  const state = passed && (next.state.log?.length ?? 0) > 1 ? { ...next.state, log: next.state.log.slice(-1) } : next.state;
  const secrets = passed ? rememberRound(state, next.secrets) : next.secrets;
  const pass = maybePass(state, localPlayerId, Boolean(state.settings.honorHands));
  const hits = accusationHits(state, secrets, localPlayerId);
  const opened = openVerdict(get, state, hits, localPlayerId);
  let notes = applySheets(get().notes, state, secrets, sheetsToMark(state, localPlayerId, get().viewingPlayerId));
  if (prev.question?.shownCardId && !state.question?.shownCardId) {
    notes = forgetShownCard(notes, state, prev.question.askerId);
  }
  if (notes !== get().notes) persistNotes(notes);
  // One shared phone would show every seat's new cards to the whole table, so only phones with their own hand get this.
  const received =
    state.settings.playMode === "hotseat"
      ? null
      : receivedFromLeaver(prev, state, get().secrets.hands[localPlayerId] ?? [], secrets.hands[localPlayerId] ?? []);
  set({
    state,
    secrets,
    notes,
    viewingPlayerId: pass.viewing,
    passGate: pass.gate,
    ...opened,
    ...(received ? { cardsReceived: received } : {}),
  });
  persist(get);
}

function play(get: () => GameStore, set: (partial: Partial<GameStore>) => void, kind: string, payload?: Record<string, unknown>) {
  if (sendOnline(get, { kind, payload })) return;
  const { state, secrets, localPlayerId, viewingPlayerId } = get();
  if (!state) return;
  const from = actorId(state, localPlayerId, viewingPlayerId);
  const next = applyPlay(state, secrets, from, kind, payload);
  const resolved = kind === "snake" || kind === "roll" || kind === "event" ? autoResolveIfPossible(next.state, next.secrets) : next;
  commitLocal(get, set, state, resolved);
}

function tableCards(setup: SetupDraft) {
  const board = setup.settings.table === "board";
  let cards = board ? boardDeck(activeCards(setup), setup.settings) : activeCards(setup);
  if (setup.settings.heist) cards = asHeist(cards);
  if (setup.settings.classicNames) cards = applyClassicNames(cards, true);
  return cards;
}

function freshenSets(sets: CardSet[]) {
  return sets.map((set) => ({ ...set, cards: capCharacters(upgradeTimeCards(set.cards)) }));
}

export const useGame = create<GameStore>((set, get) => ({
  view: "landing",
  localPlayerId: "",
  viewingPlayerId: "",
  passGate: null,
  verdict: null,
  verdictSeen: "",
  verdictHold: null,
  state: null,
  secrets: { solution: {}, hands: {} },
  notes: {},
  cardSets: [],
  setup: {
    name: "",
    settings: defaultSettings(),
    counts: { suspect: 6, room: 9, weapon: 6, time: 10 },
    setId: "classic",
    deck: CLASSIC_CARDS.map((c) => ({ ...c })),
  },
  joinCode: "",
  joinError: null,
  onlinePending: false,
  booted: false,
  panel: "table",
  cardsReceived: null,
  dismissReceived: () => set({ cardsReceived: null }),

  setView: (view) => set({ view }),
  setSetup: (patch) => set({ setup: { ...get().setup, ...patch } }),
  patchSettings: (patch) => {
    if ("classicNames" in patch) saveClueCode(Boolean(patch.classicNames));
    set({ setup: { ...get().setup, settings: { ...get().setup.settings, ...patch } } });
  },
  setCounts: (counts) => {
    const rooms = activeCards({ ...get().setup, counts }).filter((c) => c.category === "room").map((c) => c.id);
    set({ setup: { ...get().setup, counts, settings: { ...get().setup.settings, enabledRoomIds: rooms } } });
  },
  setDeck: (deck) => {
    set({ setup: withDeck(get().setup, deck) });
  },
  updateDeckCard: (id, patch) => {
    const deck = get().setup.deck.map((c) => (c.id === id ? { ...c, ...patch } : c));
    set({ setup: withDeck(get().setup, deck) });
  },
  addDeckCard: (category) => {
    const deck = get().setup.deck;
    const n = deck.filter((c) => c.category === category).length + 1;
    set({ setup: withDeck(get().setup, [...deck, blankCard(category, n)]) });
  },
  removeDeckCard: (id) => {
    const deck = get().setup.deck;
    const card = deck.find((c) => c.id === id);
    if (!card) return;
    const same = deck.filter((c) => c.category === card.category);
    if (same.length <= MIN_CATEGORY_CARDS) return;
    set({ setup: withDeck(get().setup, deck.filter((c) => c.id !== id)) });
  },
  loadPreset: (preset) => {
    const base = get().setup;
    const fileId = base.setId.startsWith("file-") ? base.setId : null;
    if (preset === "harrington") {
      set({
        setup: withDeck(
          { ...base, setId: fileId ?? "default", settings: { ...base.settings, timeOfDayEnabled: true, heist: false, cardSetId: fileId ?? "default" } },
          DEFAULT_CARDS.map((c) => ({ ...c })),
        ),
      });
      return;
    }
    if (preset === "take") {
      set({
        setup: withDeck(
          { ...base, setId: fileId ?? "take", settings: { ...base.settings, timeOfDayEnabled: false, heist: true, cardSetId: fileId ?? "take" } },
          takeDeck(),
        ),
      });
      return;
    }
    set({
      setup: withDeck(
        { ...base, setId: fileId ?? "classic", settings: { ...base.settings, timeOfDayEnabled: false, heist: false, cardSetId: fileId ?? "classic" } },
        CLASSIC_CARDS.map((c) => ({ ...c })),
      ),
    });
  },
  loadFile: (id) => {
    const existing = get().cardSets.find((s) => s.id === id);
    if (!existing) {
      const setup = get().setup;
      const cardSet: CardSet = {
        id,
        name: `Deck ${id.slice(-1)}`,
        cards: setup.deck.map((c) => ({ ...c })),
        createdAt: Date.now(),
        timeOfDayEnabled: setup.settings.timeOfDayEnabled,
        timeCardIds: setup.deck.filter((c) => c.category === "time").map((c) => c.id),
        toggles: pickToggles(setup.settings),
      };
      const sets = [...get().cardSets.filter((s) => s.id !== id), cardSet];
      saveCardSets(sets);
      set({ cardSets: sets, setup: { ...setup, setId: id, settings: { ...setup.settings, cardSetId: id } } });
      return;
    }
    const time = existing.timeOfDayEnabled ?? existing.cards.some((c) => c.category === "time");
    const current = get().setup.settings;
    const restored = existing.toggles ? withToggles(current, existing.toggles) : { ...current, timeOfDayEnabled: time };
    set({
      setup: withDeck(
        { ...get().setup, setId: id, settings: { ...restored, cardSetId: id } },
        cardsWithSavedTimes(existing),
      ),
    });
  },
  saveFile: (name) => rememberFile(get, set, name),
  renameFile: (id, name) => {
    const prev = get().cardSets.find((s) => s.id === id);
    if (!prev) return;
    const cardSet = { ...prev, name: name.slice(0, 24) };
    const sets = get().cardSets.map((s) => (s.id === id ? cardSet : s));
    saveCardSets(sets);
    set({ cardSets: sets });
  },
  clearFile: (id) => {
    const sets = get().cardSets.filter((s) => s.id !== id);
    saveCardSets(sets);
    const setup = get().setup;
    set({
      cardSets: sets,
      setup: setup.setId === id ? { ...setup, setId: "classic", settings: { ...setup.settings, cardSetId: "classic" } } : setup,
    });
  },
  snakeEyes: () => play(get, set, "snake"),
  setJoinCode: (joinCode) => set({ joinCode, joinError: null }),
  joinOnline: () => {
    unlockAudio();
    const raw = get().joinCode.trim();
    const code = roomCode(raw);
    if (!code) {
      set({ joinError: "Enter the code from the host." });
      return;
    }
    const id = uid("p");
    const typed = cleanStoredName(get().setup.name);
    const name = typed || "Guest";
    if (typed) savePlayerName(typed);
    set({
      localPlayerId: id,
      viewingPlayerId: id,
      view: "lobby",
      state: null,
      secrets: { solution: {}, hands: {} },
      joinCode: code,
      joinError: null,
      setup: { ...get().setup, name: typed, settings: { ...get().setup.settings, playMode: "online" } },
    });
  },
  setPanel: (panel) => set({ panel }),
  journalOpen: false,
  setJournalOpen: (journalOpen) => set({ journalOpen }),
  screen: "board",
  setScreen: (screen) => set({ screen }),
  setAvatar: (playerId, cardId) => {
    const { state, localPlayerId } = get();
    if (!state) return;
    if (sendOnline(get, { kind: "avatar", payload: { playerId, cardId } })) return;
    const next = applyAvatar(state, localPlayerId, playerId, cardId);
    if (next === state) return;
    set({ state: next });
    persist(get);
  },
  setClassicNames: (on) => {
    // The code is remembered on this device, so the next table starts with it the same way.
    saveClueCode(on);
    set({ setup: { ...get().setup, settings: { ...get().setup.settings, classicNames: on } } });
    const { state, localPlayerId } = get();
    if (!state) return;
    if (sendOnline(get, { kind: "classic", payload: { on } })) return;
    const next = applyClassicNamesToTable(state, localPlayerId, on);
    if (next === state) return;
    set({ state: next });
    persist(get);
  },
  hostTable: () => {
    unlockAudio();
    const { setup } = get();
    const typed = cleanStoredName(setup.name);
    const name = typed || "Host";
    if (typed) savePlayerName(typed);
    const cards = tableCards(setup);
    const hard = setup.settings.table === "board" ? BOARD_MAX_PLAYERS : 15;
    const cap = Math.max(2, Math.min(hard, setup.settings.maxPlayers || 2));
    if (!deckReady(cards, setup.settings.timeOfDayEnabled, 2)) return;
    const rooms = cards.filter((c) => c.category === "room").map((c) => c.id);
    const board = setup.settings.table === "board";
    const settings: GameSettings = {
      ...setup.settings,
      enabledRoomIds: rooms,
      cardSetId: setup.setId,
      maxPlayers: cap,
      table: board ? "board" : "case",
    };
    Object.assign(settings, boardSetup(settings, rooms));
    const { state, secrets } = createLobby(name, settings, cards);
    set({
      state,
      secrets,
      localPlayerId: state.hostId,
      viewingPlayerId: state.hostId,
      passGate: null,
      view: "lobby",
      joinCode: "",
      joinError: null,
      setup: { ...setup, name: typed },
    });
    persist(get);
  },
  quickEvening: () => {
    unlockAudio();
    const { setup } = get();
    const typed = cleanStoredName(setup.name);
    const name = typed || "You";
    if (typed) savePlayerName(typed);
    const cards = tableCards(setup);
    const seats = chosenSeats({ ...setup.settings, table: "case", playMode: "hotseat" }, cards);
    if (!deckReady(cards, setup.settings.timeOfDayEnabled, Math.min(seats, 3))) return;
    const board = setup.settings.table === "board";
    const rooms = cards.filter((c) => c.category === "room").map((c) => c.id);
    const settings: GameSettings = {
      ...setup.settings,
      playMode: "hotseat",
      honorHands: false,
      enabledRoomIds: rooms,
      maxPlayers: Math.min(seats, 3),
      table: board ? "board" : "case",
    };
    Object.assign(settings, boardSetup(settings, rooms));
    let { state, secrets } = createLobby(name, settings, cards);
    state = addPlayer(state, "Lady Violet");
    state = addPlayer(state, "Dr. Bunny");
    const dealt = dealAndStart(state, secrets);
    if (!dealt.state.startedAt) return;
    const cur = currentPlayer(dealt.state);
    const notes = autoMark(freshSheet(get().notes, dealt.state.code), dealt.state, dealt.secrets, dealt.state.hostId);
    persistNotes(notes);
    sfxReceive();
    set({
      state: dealt.state,
      secrets: dealt.secrets,
      notes,
      localPlayerId: dealt.state.hostId,
      viewingPlayerId: cur?.id ?? dealt.state.hostId,
      passGate: null,
      view: "play",
      panel: "table",
    });
    persist(get);
  },
  addLocalGuest: (name) => {
    const { state } = get();
    if (!state || state.startedAt) return;
    set({ state: addPlayer(state, name) });
    persist(get);
  },
  lockLobby: (locked) => {
    const { state } = get();
    if (!state) return;
    set({ state: { ...state, settings: { ...state.settings, locked } } });
    persist(get);
  },
  startGame: () => {
    const { state, secrets } = get();
    if (!state || state.hostId !== get().localPlayerId) return;
    if (state.players.length < 2) return;
    if (state.settings.playMode === "online") {
      if (!sendOnline(get, { kind: "deal" })) set({ joinError: "Still connecting. Deal again in a moment." });
      return;
    }
    const dealt = dealAndStart(state, secrets);
    if (!dealt.state.startedAt) return;
    const notes = autoMark(freshSheet(get().notes, dealt.state.code), dealt.state, dealt.secrets, get().localPlayerId);
    persistNotes(notes);
    sfxReceive();
    sfxTurn();
    const pass = maybePass(dealt.state, get().localPlayerId, Boolean(dealt.state.settings.honorHands));
    set({ state: dealt.state, secrets: dealt.secrets, notes, viewingPlayerId: pass.viewing, passGate: pass.gate, view: "play" });
    persist(get);
  },
  playAgain: () => {
    const { state } = get();
    if (!state || state.phase !== "gameover") return;
    if (state.settings.playMode === "online") {
      if (!sendOnline(get, { kind: "again" })) set({ joinError: "Still connecting. Try again in a moment." });
      return;
    }
    const fresh: GameState = {
      ...state,
      phase: "lobby",
      startedAt: null,
      winnerId: null,
      accusation: null,
      question: null,
      event: null,
      dice: null,
      players: state.players.map((player) => ({ ...player, eliminated: false })),
    };
    const dealt = dealAndStart(fresh, { solution: {}, hands: {} });
    if (!dealt.state.startedAt) return;
    const notes = autoMark(freshSheet(get().notes, dealt.state.code), dealt.state, dealt.secrets, get().localPlayerId);
    persistNotes(notes);
    set({ state: dealt.state, secrets: dealt.secrets, notes, verdict: null, verdictSeen: "", view: "play" });
    persist(get);
  },
  roll: () => play(get, set, "roll"),
  moveTo: (pos) => play(get, set, "move", pos as unknown as Record<string, unknown>),
  stay: () => play(get, set, "stay"),
  ask: (pick) => play(get, set, "ask", pick ?? {}),
  showCard: (cardId) => {
    sfxCard();
    play(get, set, "show", { cardId });
  },
  reply: (has) => play(get, set, "reply", { has }),
  retractReply: () => play(get, set, "reply", { has: false, retract: true }),
  ackCard: () => play(get, set, "ack", { missId: get().state?.question?.missId ?? "" }),
  accuse: (pick) => play(get, set, "accuse", pick),
  dismissVerdict: () => set({ verdict: null, verdictSeen: get().verdictHold || get().verdictSeen, verdictHold: null }),
  namePick: (pick) => play(get, set, "name", pick ? pick : { clear: true }),
  suggestPick: (pick) => play(get, set, "suggesting", pick ? pick : { clear: true }),
  done: () => play(get, set, "done"),
  syncTable: (choice) => play(get, set, "sync", choice),
  eventChoice: (choice) => play(get, set, "event", choice),
  markNote: (cardId, column, mark) => {
    const { notes, state, viewingPlayerId, localPlayerId } = get();
    if (!state) return;
    const key = notesKey(state.code, sheetOwner(state, localPlayerId, viewingPlayerId));
    const mine = notes[key] ?? emptyNotes();
    const next = {
      ...notes,
      [key]: { ...mine, marks: { ...mine.marks, [cardId]: { ...(mine.marks[cardId] ?? {}), [column]: mark as SheetMark } } },
    };
    sfxPencil();
    persistNotes(next);
    set({ notes: next });
  },
  markNotes: (cardId, marks) => {
    const { notes, state, viewingPlayerId, localPlayerId } = get();
    if (!state) return;
    const key = notesKey(state.code, sheetOwner(state, localPlayerId, viewingPlayerId));
    const mine = notes[key] ?? emptyNotes();
    const next = {
      ...notes,
      [key]: { ...mine, marks: { ...mine.marks, [cardId]: { ...(mine.marks[cardId] ?? {}), ...(marks as Record<string, SheetMark>) } } },
    };
    sfxPencil();
    persistNotes(next);
    set({ notes: next });
  },
  setFreeText: (text) => {
    const { notes, state, viewingPlayerId, localPlayerId } = get();
    if (!state) return;
    const key = notesKey(state.code, sheetOwner(state, localPlayerId, viewingPlayerId));
    const mine = notes[key] ?? emptyNotes();
    const next = { ...notes, [key]: { ...mine, freeText: text } };
    persistNotes(next);
    set({ notes: next });
  },
  saveSet: (cardSet) => {
    const sets = [...get().cardSets.filter((s) => s.id !== cardSet.id), cardSet];
    saveCardSets(sets);
    set({ cardSets: sets, setup: { ...get().setup, setId: cardSet.id } });
  },
  deleteSet: (id) => {
    const sets = get().cardSets.filter((s) => s.id !== id);
    saveCardSets(sets);
    set({
      cardSets: sets,
      setup: { ...get().setup, setId: get().setup.setId === id ? "classic" : get().setup.setId },
    });
  },
  leave: (reason) => {
    const note = typeof reason === "string" ? reason : null;
    onlineLeave?.();
    onlineLeave = null;
    queuedIntent = null;
    queuedTurn = -1;
    window.clearTimeout(persistTimer);
    persistNow = null;
    saveTable(null);
    set({
      view: "landing",
      state: null,
      secrets: { solution: {}, hands: {} },
      passGate: null,
      panel: "table",
      joinCode: "",
      joinError: note,
      onlinePending: false,
      verdict: null,
      verdictSeen: "",
      verdictHold: null,
      cardsReceived: null,
    });
  },
  hydrate: () => {
    if (bootedOnce || get().booted) return;
    bootedOnce = true;
    void (async () => {
      try {
        const vault = await loadVault();
        const sets = freshenSets(vault.sets);
        const stored = vault.name;
        const name = cleanStoredName(stored);
        if (name !== stored.trim()) savePlayerName(name);
        const notes = vault.notes;
        const current = get().setup;
        const deck = capCharacters(upgradeTimeCards(current.deck));
        const setup = {
          ...current,
          deck,
          name: name || cleanStoredName(current.name),
          settings: { ...current.settings, maxPlayers: current.settings.table === "board" ? BOARD_MAX_PLAYERS : 15, classicNames: vault.clue },
          ...(deck !== current.deck
            ? {
                counts: deck.reduce(
                  (counts, card) => {
                    counts[card.category] += 1;
                    return counts;
                  },
                  { suspect: 0, room: 0, weapon: 0, time: 0 } as Record<CategoryId, number>,
                ),
              }
            : {}),
        };
        if (get().state) {
          set({ booted: true, cardSets: sets, notes, setup });
          return;
        }
        const saved = vault.table;
        if (saved?.state) {
          const paint = (cards: typeof saved.state.cards) =>
            cards.map((card) => (vault.art[card.id] ? { ...card, imageDataUrl: vault.art[card.id] } : card));
          set({
            booted: true,
            cardSets: sets,
            notes,
            setup,
            state: {
              ...saved.state,
              passages: saved.state.passages ?? [],
              skipIds: saved.state.skipIds ?? [],
              notesLock: saved.state.notesLock ?? {},
              influences: saved.state.influences ?? [],
              cards: paint(applyClassicNames(retireBorrowedNames(saved.state.cards.map((card) => {
                if (card.id === "mr-fairwind") return { ...card, name: "Morgan Drake" };
                if (card.category !== "time") return card;
                const base = DEFAULT_CARDS.find((item) => item.id === card.id);
                return base ? { ...card, name: base.name, clock: base.clock, blurb: base.blurb } : card;
              })), Boolean(saved.state.settings?.classicNames))),
              players: saved.state.players.map((p, i) => {
                const house = layoutFor(saved.state.settings);
                const seated = isLegalPos(p.position, house) ? p : { ...p, position: { kind: "hall" as const, ...house.starts[i % house.starts.length] } };
                if (seated.id === saved.localPlayerId && /^detective$/i.test(seated.name.trim())) return { ...seated, name: "Host" };
                return seated;
              }),
            },
            secrets: saved.secrets,
            localPlayerId: saved.localPlayerId,
            viewingPlayerId: saved.viewingPlayerId,
            view: saved.state.phase === "lobby" ? "lobby" : "play",
          });
          return;
        }
        set({ booted: true, cardSets: sets, notes, setup });
      } finally {
        if (!get().booted) set({ booted: true });
      }
    })();
  },
  syncSheet: () => {
    const { notes, state, secrets, localPlayerId, viewingPlayerId } = get();
    if (!state) return;
    const next = applySheets(notes, state, secrets, sheetsToMark(state, localPlayerId, viewingPlayerId));
    if (next === notes) return;
    persistNotes(next);
    set({ notes: next });
  },
  applyRemote: (state, hand, solution, _reveals, hits) => {
    const { secrets, localPlayerId, setup, notes, state: prev } = get();
    const newMatch = Boolean(state.startedAt && prev?.startedAt && state.startedAt !== prev.startedAt);
    const hands = { ...secrets.hands };
    const previous = secrets.hands[localPlayerId] ?? [];
    if (Array.isArray(hand) && localPlayerId) {
      hands[localPlayerId] = hand.length === 0 && previous.length > 0 && !newMatch ? previous : hand;
    }
    const secretsNext: Secrets = {
      ...secrets,
      hands,
      solution: solution ?? (newMatch ? {} : secrets.solution),
      reveals: [],
    };
    let notesNext = newMatch || (prev?.phase === "gameover" && state.phase !== "gameover") ? freshSheet(notes, state.code) : thisGameNotes(notes, state.code);
    notesNext = applySheets(notesNext, state, secretsNext, sheetsToMark(state, localPlayerId, get().viewingPlayerId));
    if (prev?.question?.shownCardId && !state.question?.shownCardId) notesNext = forgetShownCard(notesNext, state, prev.question.askerId);
    if (localPlayerId && prev && state.turnIndex !== prev.turnIndex) {
      const key = notesKey(state.code, localPlayerId);
      const sheet = notesNext[key];
      if (sheet?.shown?.length) notesNext = { ...notesNext, [key]: { ...sheet, shown: [] } };
    }
    secretsNext.reveals = [];
    const received = receivedFromLeaver(prev, state, previous, hands[localPlayerId] ?? []);
    if (notesNext !== notes) persistNotes(notesNext);
    const opened = newMatch
      ? { verdict: null, verdictSeen: "", verdictHold: null }
      : openVerdict(get, state, hits, localPlayerId);
    const deckSame =
      setup.deck.length === state.cards.length && setup.deck.every((card, index) => card.id === state.cards[index]?.id);
    const settings = state.settings?.playMode ? { ...setup.settings, ...state.settings } : setup.settings;
    set({
      state,
      notes: notesNext,
      secrets: secretsNext,
      ...opened,
      ...(received ? { cardsReceived: received } : {}),
      setup: deckSame && setup.settings === settings ? setup : {
        ...setup,
        deck: deckSame ? setup.deck : state.cards.map(({ imageDataUrl: _image, ...card }) => card),
        settings,
      },
      joinError: state.startedAt ? null : get().joinError,
    });
    persist(get);
  },
  setLocalId: (id) => set({ localPlayerId: id, viewingPlayerId: id }),
  setViewing: (id) => set({ viewingPlayerId: id, passGate: null }),
  kick: (playerId) => {
    if (sendOnline(get, { kind: "kick", payload: { playerId } })) return;
    const { state, secrets } = get();
    if (!state || playerId === get().localPlayerId) return;
    if (state.startedAt) {
      const next = dropPlayer(state, secrets, playerId);
      commitLocal(get, set, state, next);
      return;
    }
    set({ state: removePlayer(state, playerId) });
    persist(get);
  },
  confirmPass: () => {
    const gate = get().passGate;
    if (!gate) return;
    set({ viewingPlayerId: gate, passGate: null });
  },
  playHere: () => {
    const { state, passGate, localPlayerId } = get();
    if (!state) return;
    const viewing = passGate || seatToPlay(state, localPlayerId);
    set({
      passGate: null,
      viewingPlayerId: viewing,
      state: { ...state, settings: { ...state.settings, honorHands: false } },
    });
  },
}));

export function useActorId() {
  return useGame((s) => (s.state?.settings.playMode === "online" ? s.localPlayerId : s.viewingPlayerId));
}

const HAND_ORDER: Record<CategoryId, number> = { suspect: 0, weapon: 1, room: 2, time: 3 };

export function useMyHand(): CardDef[] {
  const state = useGame((s) => s.state);
  const secrets = useGame((s) => s.secrets);
  const actor = useActorId();
  if (!state || !actor) return [];
  const ids = secrets.hands[actor] ?? [];
  return (ids.map((id) => state.cards.find((card) => card.id === id)).filter(Boolean) as CardDef[]).sort(
    (a, b) => HAND_ORDER[a.category] - HAND_ORDER[b.category] || a.name.localeCompare(b.name),
  );
}

export function useMyNotes(): PlayerNotes {
  const state = useGame((s) => s.state);
  const notes = useGame((s) => s.notes);
  const localId = useGame((s) => s.localPlayerId);
  const viewing = useGame((s) => s.viewingPlayerId);
  if (!state) return emptyNotes();
  return notes[notesKey(state.code, sheetOwner(state, localId, viewing))] ?? emptyNotes();
}
