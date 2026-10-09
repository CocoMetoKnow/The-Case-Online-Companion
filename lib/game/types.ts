export const SAVE_VERSION = 1;

export type CategoryId = "suspect" | "room" | "weapon" | "time";

/** Extra Difficulty: the id of the NPC who holds a hand but never takes a turn. */
export const NPC_ID = "npc";

export type PlayMode = "hotseat" | "online" | "inperson";

export type Phase =
  | "lobby"
  | "roll"
  | "event"
  | "move"
  | "action"
  | "question"
  | "gameover";

export type PiecePos =
  | { kind: "hall"; x: number; y: number }
  | { kind: "room"; roomId: string };

export interface CardDef {
  id: string;
  category: CategoryId;
  name: string;
  blurb: string;
  icon: string;
  imageDataUrl?: string;
  /** Clock time printed on a time-of-day card, such as "1:00". */
  clock?: string;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  seat: number;
  eliminated: boolean;
  isHost: boolean;
  position: PiecePos;
  /** Suspect card id picked with "Pick Your Character". That card's art is this player's profile picture. */
  avatar?: string;
}

export interface QuestionState {
  askerId: string;
  suspectId: string;
  roomId: string;
  weaponId: string;
  timeId?: string;
  announcedRoomId: string | null;
  cursor: number;
  responderIds: string[];
  skips: string[];
  /** Player who just had nothing to show. The table must see this before play continues. */
  missId?: string | null;
  showerId: string | null;
  matchingCardIds: string[];
  shownCardId: string | null;
  shownToAsker: boolean;
  /** True once a card has been shown. The card itself stays private. */
  cardShown?: boolean;
  resolved: boolean;
  nobodyHad: boolean;
  /** Nobody holds the asked cards, so the asker may name them and win. */
  offerAccusation?: boolean;
  /** The search found nothing and this turn should end. Not an accusation. */
  closeTurn?: boolean;
  /** The asker already holds one of the cards they asked for. The table was still checked. */
  heldByAsker?: boolean;
  /** This asked card is ignored for showing. Everyone already heard its name. */
  silencedId?: string | null;
  /** Stealth Auto-Reveal in speak mode: the card was sent without anyone being asked, and nobody but the sender knows who sent it. */
  stealth?: boolean;
  /** Speak mode. The cards were said out loud, so the game only asks each player in order. */
  spoken?: boolean;
  /** Speak mode. The player who is being asked "do you have a card?" right now. */
  askingId?: string | null;
  /** Gambler: the kind of card the asker bet they would be shown. Hidden from the table until the bet is settled. */
  gamble?: { category: CategoryId | "" } | null;
  /** Gambler: the bet was called off because the asker named a card they hold, or chose not to gamble. */
  gambleOff?: boolean;
  /** Gambler: settled once a card is shown. A lost bet means the asker does not get to see the card. */
  gambleResult?: "won" | "lost" | null;
  /** Extra Difficulty: the NPC is the one showing. Only the asker is ever told. */
  npcShown?: boolean;
}

export type EventKind =
  | "extra-roll"
  | "move-anywhere"
  | "peek"
  | "pass-card"
  | "rumor"
  | "free-question"
  | "red-herring"
  | "second-wind"
  | "lost-in-hall"
  | "new-passage"
  | "clunk"
  | "food-poisoning"
  | "blocked-out"
  | "come-here"
  | "that-noise"
  | "influenced"
  | "wrong-turn"
  | "call-card"
  | "name-suspect"
  | "name-weapon"
  | "name-room"
  | "name-time"
  | "fast-track"
  | "shortcut"
  | "stealth-reveal"
  | "sabotage"
  | "sabotage-block"
  | "wild-card"
  | "trade-places"
  | "hush"
  | "swap-card"
  | "send-home"
  | "thief"
  | "spy"
  | "about-face"
  | "gambler";

export interface ChatMessage {
  id: string;
  fromId: string;
  name: string;
  text: string;
  at: number;
}

export interface EventState {
  deckId: string;
  kind: EventKind;
  title: string;
  description: string;
  step: string;
  data: Record<string, unknown>;
}

export interface Passage {
  a: string;
  b: string;
  /** Digital board: a hidden room the passage runs through. It is a room card in the game that is not drawn on the house. */
  via?: string;
}

export interface Influence {
  victimId: string;
  controllerId: string;
}

export interface LogEntry {
  id: string;
  text: string;
  turn: number;
}

export interface GameSettings {
  maxPlayers: number;
  locked: boolean;
  timeOfDayEnabled: boolean;
  wrongAccusationEliminates: boolean;
  honorHands: boolean;
  playMode: PlayMode;
  /** "board" walks the digital house. Missing or "case" is the phone case, up to 15. */
  table?: "case" | "board";
  /**
   * Digital board: the two secret passages the host set. Each joins two of the ten rooms and may run through a
   * hidden room card. An empty pair is left to the game (Study to Kitchen, Lounge to Conservatory).
   */
  boardPassages?: Passage[];
  /** Digital board: put a hidden room on every secret passage that the host left without one. On unless set to false. */
  hiddenRooms?: boolean;
  /** Digital board: a guest may not suggest in the same room twice in a row. They must go to a different room first. */
  noRepeatRoom?: boolean;
  /** Deal each category round-robin so hands stay as even as they can. */
  evenDeal?: boolean;
  /** The case is a theft. Weapon cards are the valuables that were taken. */
  heist?: boolean;
  /** After the opening deal, do not mark the journal automatically. */
  manualNotes?: boolean;
  /** Turns run as normal, but the suggestion is said out loud. The game asks each player in order if they hold a card. */
  speakMode?: boolean;
  /** Extra Difficulty: an NPC holds a hand, never takes a turn, and shows you a card last, in private. */
  extraDifficulty?: boolean;
  /** Easter egg: guests wear their original Clue names. Switched by typing "clue" in the lobby. */
  classicNames?: boolean;
  /** Power-ups that can be drawn. Missing means every power is on. */
  enabledEvents?: EventKind[];
  cardSetId: string;
  enabledRoomIds: string[];
}

export interface GameState {
  version: number;
  code: string;
  hostId: string;
  settings: GameSettings;
  cards: CardDef[];
  leftover: string[];
  players: Player[];
  turnOrder: string[];
  turnIndex: number;
  phase: Phase;
  dice: [number, number] | null;
  moveBudget: number;
  /** Movement after a power adds to the roll. Missing means use the dice. */
  pace?: number | null;
  /** This player rolls one die on their next turn. */
  shortDieId?: string | null;
  /** The current roll was a single die. */
  singleDie?: boolean;
  /** Thief: the third die stolen this turn. Shown beside the two dice and already counted in the move. */
  extraDie?: number | null;
  /** Gambler: this player bet on the kind of card their next suggestion will be shown. */
  gambler?: { playerId: string; category: CategoryId | "" } | null;
  /** Someone is spying. Only that player can see who. */
  spy?: { byId: string; targetId: string; armed: boolean } | null;
  /** After a roll, one action remains unless a snake-eyes card grants another. */
  actionsLeft?: number;
  freeQuestion: boolean;
  /** Gambler: a won bet gives this player a bonus suggestion that can name any room, and their piece moves into it. */
  bonusRoom?: { playerId: string } | null;
  whisperMode: boolean;
  question: QuestionState | null;
  event: EventState | null;
  /** One line about the last suggestion. Replaced, never stored as a list. */
  notice?: string | null;
  /** Same note, with the asker's own card names. Only that phone receives it. */
  noticeSelf?: string | null;
  noticeFor?: string | null;
  log: LogEntry[];
  winnerId: string | null;
  startedAt: number | null;
  eventDeck: EventKind[];
  eventDiscard: EventKind[];
  accusation: {
    playerId: string;
    suspectId: string;
    roomId: string;
    weaponId: string;
    timeId?: string;
    correct: boolean;
    /** Unique stamp so a wrong guess can be shown once, even after the log is trimmed. */
    at?: number;
  } | null;
  passages: Passage[];
  /** Digital board: the blue circle square each guest started on, so "send everyone home" puts them back on their own. */
  spawns?: Record<string, { x: number; y: number }>;
  skipIds: string[];
  notesLock: Record<string, number>;
  /** Speed Boost: this player's rolls are tripled. `turns` counts the turns left, this one included. */
  speedBoost?: { playerId: string; turns: number } | null;
  influences: Influence[];
  /** A card kept quiet until someone else asks for it. */
  hush?: { cardId: string; byId: string } | null;
  /** Sabotage: the next power-up this player would draw is cancelled instead. */
  sabotage?: { targetId: string; byId: string } | null;
  /**
   * A suggestion came back with nobody holding any of the named cards, and
   * the asker doesn't hold them either. Rather than marking the answer the
   * instant that happens, the table waits one full turn cycle before the
   * asker's own journal confirms it — turnIndex records when it was queued,
   * so the client can tell once a later turn has actually begun.
   */
  pendingAnswer?: { ids: string[]; askerId: string; turnIndex: number } | null;
  /** Stealth Auto-Reveal / Distraction: this turn's suggestion auto-picks a card to show, no manual choice. */
  autoShowTurn?: boolean;
  /** Set while the table is voting to clear a stuck turn. Removed once it finishes or is cancelled. */
  sync?: { byId: string; agreed: string[] } | null;
  /** The in-game chat, newest last. Kept short: only the last messages are held. */
  chat?: ChatMessage[];
  /** Set while a phone has gone quiet. Play waits so they can catch up. */
  wait?: { ids: string[]; since: number } | null;
  /** Cards chosen so far while this player is making their Solve the Case attempt. */
  naming?: NamingState | null;
  /** Cards picked so far while a player is choosing a suggestion. Only phones with Extra Visuals on show it. */
  suggesting?: NamingState | null;
  /** The most recent suggestion and who showed a card for it. Stays until each player closes it. */
  lastSuggestion?: LastSuggestion | null;
  /** Digital board, "no repeat room" rule: the room each guest last made a suggestion in. Cleared when they enter a different room. */
  suggestedIn?: Record<string, string>;
  /** A card just shown in speak mode. Blank card id means this phone must not see it. */
  privateShow?: { fromId: string; toId: string; cardId: string; at: number } | null;
}

/**
 * The last suggestion that was made, kept after the question screen is gone so every player can
 * read what was asked and who (if anyone) showed a card. Each phone closes it on its own.
 */
export interface LastSuggestion {
  /** Unique per suggestion, so a closed recap stays closed. */
  id: string;
  askerId: string;
  /** The cards that were named. Empty on other phones in speak mode, because it was said out loud. */
  cardIds: string[];
  /** The player who showed a card, or null when no one did. Never the card itself. */
  showerId: string | null;
  spoken?: boolean;
  /**
   * The same cards, kept for the Extra Visuals background only. Unlike cardIds this is not blanked on other phones in
   * speak mode: the suggestion was said out loud, so the table already knows it, and a phone with Extra Visuals on can still dress its screen.
   */
  look?: { suspectId: string; roomId: string; weaponId: string; timeId?: string };
}

export interface NamingState {
  playerId: string;
  suspectId?: string;
  roomId?: string;
  weaponId?: string;
  timeId?: string;
}

export interface Secrets {
  solution: Partial<Record<CategoryId, string>>;
  hands: Record<string, string[]>;
  reveals?: Array<{ fromId: string; toId: string; cardId: string }>;
  /** Last good hands this round. Card ids only, cleared when the next round is dealt. */
  roundHands?: Record<string, string[]>;
  roundLeftover?: string[];
  /** The three (or four) answers exactly as they were sealed when the cards were dealt. Nothing may ever change these. */
  envelope?: Partial<Record<CategoryId, string>>;
}

export type SheetMark = "blank" | "check" | "x" | "maybe" | "answer";

export interface NotesMark {
  cardId: string;
  column: string;
  mark: SheetMark;
}

export interface PlayerNotes {
  marks: Record<string, Record<string, SheetMark | "x">>;
  shown: Array<{ fromId: string; cardId: string; turn: number }>;
  /** The one card you were just shown. Replaced when the next card is shown. */
  lastShown?: { cardId: string; fromId: string } | null;
  /** Extra Difficulty: cards the NPC showed you. They keep their own symbol in the journal for the rest of the game. */
  npcShown?: string[];
  freeText: string;
}

/** The on/off switches a saved deck remembers, so loading it puts every one back the way it was. */
export interface DeckToggles {
  timeOfDayEnabled: boolean;
  heist: boolean;
  speakMode: boolean;
  manualNotes: boolean;
  evenDeal: boolean;
  /** Missing on decks saved by an older build. */
  extraDifficulty?: boolean;
  /** Power-ups left on. Missing means every power is on. */
  enabledEvents?: EventKind[];
}

export interface CardSet {
  id: string;
  name: string;
  cards: CardDef[];
  createdAt: number;
  timeOfDayEnabled?: boolean;
  /** Which time-of-day cards were on when saved. Missing on older saves, which use their card list. */
  timeCardIds?: string[];
  /** Missing on decks saved by an older build. Those keep the switches as they are. */
  toggles?: DeckToggles;
}

export const PLAYER_COLORS = [
  "#c45c5c",
  "#5b8a7a",
  "#c4a574",
  "#6a7f9a",
  "#b56b4a",
  "#8a9a6a",
  "#7a5a8a",
  "#4a6a7a",
  "#d4a017",
  "#3d7a6a",
  "#a33b4a",
  "#4f6d8a",
  "#8c6a3a",
  "#5c6b3a",
  "#6a4a5a",
] as const;

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  suspect: "Suspects",
  room: "Rooms",
  weapon: "Weapons",
  time: "Times of day",
};
