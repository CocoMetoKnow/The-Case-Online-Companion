/**
 * Team Mode engine: a pure reducer. reduce(state, action) returns the next state and never touches the
 * screen, the clock or localStorage, so a whole run can be played (and tested) without any UI.
 *
 * One turn = 2 action points. Actions: move, investigate (draft a card), unlock a sealed wing,
 * recover lost evidence in a danger zone, rescue a trapped teammate, or accuse. The night advances one
 * round at a time; the hour changes the puzzles, and every failure costs something.
 *
 * THE RULES OF PERIL
 *   - A wrong final accusation, a failed critical task (a sealed wing, or the Stalker) or the menace
 *     track reaching 10 is an immediate Game Over. So is dawn arriving, or every detective trapped.
 *   - Failing an evidence puzzle traps that detective and permanently loses one clue (it falls into a
 *     danger zone). Trapped detectives can be rescued by a teammate standing with them. A rescue that
 *     goes wrong traps the rescuer too.
 *   - Lost clues can be won back by entering a danger zone and passing a hard recovery puzzle, where
 *     failure traps you there, loses yet another clue and spikes the menace.
 */
import {
  CATEGORY_KEYS,
  PHASES,
  ROLES,
  ROOM_POOL,
  type CategoryKey,
  type PhaseDef,
  type PuzzleKindId,
} from "./content.ts";
import { deduce, ending, generateCase, nameOf, roomDef, type CaseFile, type Clue, type Deduction, type MapNode } from "./generator.ts";
import { ALL_KINDS, buildPuzzle, checkPuzzle, KIND_LABEL, type Puzzle } from "./puzzles.ts";
import { Rng, hashSeed } from "./rng.ts";

export const MAX_MENACE = 10;
export const AP_PER_TURN = 2;
export const TRAP_ROUNDS = 3;
export const SAVE_VERSION = 1;

export type DeckId = "evidence" | "environment" | "intel";
export type CardType =
  | "evidence"
  | "hazard"
  | "ambush"
  | "boon-hint"
  | "boon-lantern"
  | "boon-key"
  | "boon-ap"
  | "menace"
  | "witness"
  | "whisper"
  | "lull";

export interface Card {
  id: number;
  deck: DeckId;
  type: CardType;
}

export interface Player {
  id: number;
  name: string;
  role: string;
  at: string;
  /** Rounds left in the trap. 0 = free. */
  trapped: number;
}

export type ClueStatus = "hidden" | "held" | "lost";

export type PuzzleSource =
  | { kind: "evidence"; clueId: string }
  | { kind: "hazard" }
  | { kind: "ambush" }
  | { kind: "stalker" }
  | { kind: "lock"; room: string }
  | { kind: "rescue"; target: number }
  | { kind: "recover"; zone: string };

export interface Offer {
  deck: DeckId;
  cardId: number;
  title: string;
  blurb: string;
  risk: "safe" | "risky" | "boon";
  icon: string;
}

export type Pending =
  | { type: "draft"; offers: Offer[] }
  | {
      type: "puzzle";
      puzzle: Puzzle;
      source: PuzzleSource;
      critical: boolean;
      shown: number;
      free: number;
      /** Who is facing it. */
      who: number;
    };

export interface Notice {
  tone: "good" | "bad" | "info" | "critical" | "turn";
  title: string;
  lines: string[];
  /** A clue to show in full, as a card. */
  clueId?: string;
}

export type EndReason = "accusation" | "lock" | "stalker" | "menace" | "dawn" | "trapped" | "victory";

export interface Ending {
  kind: "win" | "lose";
  reason: EndReason;
  title: string;
  lines: string[];
  reveal: string;
}

export interface TeamState {
  v: number;
  seed: string;
  rng: number;
  game: CaseFile;
  status: "play" | "won" | "lost";
  round: number;
  turn: number;
  ap: number;
  freeMove: boolean;
  lit: boolean;
  /** The round (if any) in which a card has blacked out the house. */
  darkRound: number;
  menace: number;
  hints: number;
  lantern: number;
  keys: number;
  players: Player[];
  clueStatus: Record<string, ClueStatus>;
  /** Clue ids the team holds, in the order they were found. */
  held: string[];
  lostIn: Record<string, string>;
  bonus: Clue[];
  unlocked: string[];
  decks: Record<DeckId, Card[]>;
  nextCard: number;
  stalkerDue: boolean;
  stalkersFaced: number;
  pending: Pending | null;
  notices: Notice[];
  log: string[];
  ending: Ending | null;
  stats: { found: number; lost: number; recovered: number; rescues: number; hintsUsed: number; trapped: number };
}

export type Action =
  | { type: "move"; to: string }
  | { type: "investigate" }
  | { type: "draft"; index: number }
  | { type: "unlock"; room: string; useKey?: boolean }
  | { type: "recover" }
  | { type: "rescue"; target: number }
  | { type: "hint" }
  | { type: "lantern" }
  | { type: "submit"; input: string }
  | { type: "retreat" }
  | { type: "end" }
  | { type: "accuse"; guess: Record<CategoryKey, string> }
  | { type: "ack" };

// ---------------------------------------------------------------------------------------------
// Selectors

export const phaseIndex = (s: Pick<TeamState, "round" | "game">) =>
  Math.min(PHASES.length - 1, Math.floor((s.round - 1) / s.game.roundsPerPhase));
export const phaseOf = (s: Pick<TeamState, "round" | "game">): PhaseDef => PHASES[phaseIndex(s)];
export const totalRounds = (s: Pick<TeamState, "game">) => PHASES.length * s.game.roundsPerPhase;
export const currentPlayer = (s: TeamState) => s.players[s.turn];
export const node = (s: TeamState, id: string): MapNode | undefined => s.game.map.find((n) => n.id === id);
export const isLocked = (s: TeamState, id: string) => {
  const n = node(s, id);
  return !!n && n.locked && !s.unlocked.includes(id);
};
export const isDark = (s: TeamState) => phaseIndex(s) >= (s.game.twist.mods.darkFrom ?? 3) || s.darkRound === s.round;
export const roleOf = (p: Player) => ROLES.find((r) => r.id === p.role);
export const clueById = (s: TeamState, id: string): Clue | undefined => s.game.clues.find((c) => c.id === id) ?? s.bonus.find((c) => c.id === id);
export const heldClues = (s: TeamState): Clue[] => s.held.map((id) => clueById(s, id)).filter((c): c is Clue => !!c);
export const clueNumber = (s: TeamState, id: string) => s.held.indexOf(id) + 1;
export const board = (s: TeamState): Deduction => deduce(s.game.universe, heldClues(s));
export const hiddenIn = (s: TeamState, roomId: string): Clue[] => s.game.clues.filter((c) => c.where === roomId && s.clueStatus[c.id] === "hidden");
export const lostInZone = (s: TeamState, zoneId: string): Clue[] =>
  Object.keys(s.lostIn)
    .filter((id) => s.lostIn[id] === zoneId && s.clueStatus[id] === "lost")
    .map((id) => clueById(s, id))
    .filter((c): c is Clue => !!c);
export const lostClues = (s: TeamState): Clue[] => Object.keys(s.clueStatus).filter((id) => s.clueStatus[id] === "lost").map((id) => clueById(s, id)).filter((c): c is Clue => !!c);

export function puzzleLevel(s: TeamState, base: number): number {
  const phase = phaseOf(s);
  const dark = isDark(s) && !s.lit;
  const lvl = base + phase.levelBonus + (dark ? 1 + (s.game.twist.mods.darkBonus ?? 0) : 0) + (s.menace >= 6 ? 1 : 0);
  return Math.max(1, Math.min(5, lvl));
}

export interface Legal {
  canAct: boolean;
  moves: MapNode[];
  unlockable: MapNode[];
  canInvestigate: boolean;
  canRecover: boolean;
  rescuable: Player[];
  canAccuse: boolean;
  canLantern: boolean;
  canEnd: boolean;
}

export function legal(s: TeamState): Legal {
  const none: Legal = { canAct: false, moves: [], unlockable: [], canInvestigate: false, canRecover: false, rescuable: [], canAccuse: false, canLantern: false, canEnd: false };
  if (s.status !== "play" || s.pending || s.notices.length) return none;
  const p = currentPlayer(s);
  if (!p || p.trapped > 0) return none;
  const here = node(s, p.at)!;
  const around = here.links.map((id) => node(s, id)!).filter(Boolean);
  const hasAp = s.ap > 0;
  const freeMove = s.freeMove;
  const moves = hasAp || freeMove ? around.filter((n) => !isLocked(s, n.id)) : [];
  const unlockable = hasAp ? around.filter((n) => isLocked(s, n.id)) : [];
  const canInvestigate = hasAp && here.kind !== "zone";
  const canRecover = hasAp && here.kind === "zone" && lostInZone(s, here.id).length > 0;
  const rescuable = hasAp ? s.players.filter((o) => o.id !== p.id && o.trapped > 0 && o.at === p.at) : [];
  return {
    canAct: true,
    moves,
    unlockable,
    canInvestigate,
    canRecover,
    rescuable,
    canAccuse: true,
    canLantern: s.lantern > 0 && isDark(s) && !s.lit,
    canEnd: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Setup

const rngOf = (s: TeamState) => new Rng(s.rng);

function makeDeck(rng: Rng, s: { nextCard: number; game: CaseFile }, deck: DeckId): Card[] {
  const boon = s.game.twist.mods.boonWeight ?? 1;
  let types: CardType[] = [];
  const rep = (t: CardType, n: number) => types.push(...Array(Math.max(0, Math.round(n))).fill(t));
  if (deck === "evidence") rep("evidence", 24);
  else if (deck === "environment") {
    rep("hazard", 7);
    rep("ambush", 2);
    rep("menace", 4);
    rep("boon-hint", 3 * boon);
    rep("boon-lantern", 3 * boon);
    rep("boon-key", 1 * boon);
    rep("boon-ap", 3 * boon);
  } else {
    rep("witness", 5);
    rep("whisper", 4);
    rep("lull", 3);
  }
  types = rng.shuffle(types);
  return types.map((type) => ({ id: s.nextCard++, deck, type }));
}

/** The night is longer for small teams, because there are fewer hands to spend the actions. */
export function nightLength(base: number, players: number): number {
  return base + Math.max(0, 4 - players);
}

export function newGame(seed: string, names: string[]): TeamState {
  const raw = generateCase(seed);
  const game: CaseFile = { ...raw, roundsPerPhase: nightLength(raw.roundsPerPhase, names.length) };
  const rng = new Rng(hashSeed(`${seed}/play`));
  const roles = rng.shuffle(ROLES);
  const players: Player[] = names.map((name, i) => ({ id: i, name: name.trim() || `Detective ${i + 1}`, role: roles[i % roles.length].id, at: "foyer", trapped: 0 }));
  const clueStatus: Record<string, ClueStatus> = {};
  for (const c of game.clues) clueStatus[c.id] = "hidden";
  const base = { nextCard: 1, game };
  const decks = {
    evidence: makeDeck(rng, base, "evidence"),
    environment: makeDeck(rng, base, "environment"),
    intel: makeDeck(rng, base, "intel"),
  };
  const s: TeamState = {
    v: SAVE_VERSION,
    seed,
    rng: rng.state,
    game,
    status: "play",
    round: 1,
    turn: 0,
    ap: AP_PER_TURN,
    freeMove: players[0].role === "scout",
    lit: false,
    darkRound: 0,
    menace: game.startMenace,
    hints: game.startHints,
    lantern: 1,
    keys: 0,
    players,
    clueStatus,
    held: [],
    lostIn: {},
    bonus: [],
    unlocked: [],
    decks,
    nextCard: base.nextCard,
    stalkerDue: false,
    stalkersFaced: 0,
    pending: null,
    notices: [],
    log: [`The case begins at ${PHASES[0].clock}.`],
    ending: null,
    stats: { found: 0, lost: 0, recovered: 0, rescues: 0, hintsUsed: 0, trapped: 0 },
  };
  return s;
}

// ---------------------------------------------------------------------------------------------
// Internals

function clone(s: TeamState): TeamState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p })),
    clueStatus: { ...s.clueStatus },
    held: [...s.held],
    lostIn: { ...s.lostIn },
    bonus: [...s.bonus],
    unlocked: [...s.unlocked],
    decks: { evidence: [...s.decks.evidence], environment: [...s.decks.environment], intel: [...s.decks.intel] },
    notices: [...s.notices],
    log: [...s.log],
    stats: { ...s.stats },
  };
}

const note = (s: TeamState, n: Notice) => void s.notices.push(n);
const say = (s: TeamState, text: string) => void (s.log.push(text), s.log.length > 80 && s.log.shift());

function lose(s: TeamState, reason: EndReason, title: string, lines: string[]) {
  s.status = "lost";
  s.pending = null;
  s.notices = [];
  s.ending = { kind: "lose", reason, title, lines, reveal: ending(s.game) };
  say(s, `GAME OVER: ${title}`);
}

function checkLoss(s: TeamState) {
  if (s.status !== "play") return;
  if (s.menace >= MAX_MENACE) {
    lose(s, "menace", "The killer finds you", ["The menace reached its peak. Footsteps in every corridor, and then the lights go out for good.", "Game Over: You Lose."]);
  } else if (s.players.every((p) => p.trapped > 0)) {
    lose(s, "trapped", "No one left to save you", ["Every detective is trapped, and there is no one left to free anyone.", "Game Over: You Lose."]);
  }
}

function drawCard(s: TeamState, deck: DeckId, rng: Rng): Card {
  if (s.decks[deck].length < 2) s.decks[deck].push(...makeDeck(rng, s, deck));
  return s.decks[deck].shift()!;
}

function peek(s: TeamState, deck: DeckId, rng: Rng): Card {
  if (s.decks[deck].length < 2) s.decks[deck].push(...makeDeck(rng, s, deck));
  return s.decks[deck][0];
}

const HAZARDS = [
  { t: "Floorboards give way", d: "The floor of the {room} sags under the weight of the night." },
  { t: "A door slams shut", d: "Something in the {room} wants you to stay. The latch will not turn." },
  { t: "The lamps gutter", d: "The {room} gutters into shadow and something moves in it." },
  { t: "A shelf comes down", d: "Old wood groans in the {room}, and the whole wall leans." },
  { t: "The air turns thin", d: "The {room} fills with a sour cold, and the windows frost over." },
  { t: "The house shifts", d: "Pipes bang and the {room} tilts underfoot. You are being herded." },
];

function level(s: TeamState, base: number) {
  return puzzleLevel(s, base);
}

function mkPuzzle(s: TeamState, rng: Rng, kind: PuzzleKindId, base: number, roomId?: string, objectId?: string, label?: string): Puzzle {
  const phase = { ...phaseOf(s), dark: isDark(s) && !s.lit };
  return buildPuzzle(rng, { kind, level: level(s, base), phase, room: roomId ? roomDef(roomId) : undefined, objectId, label });
}

function freeHintsFor(s: TeamState, who: number, kind: PuzzleKindId, critical: boolean): number {
  const p = s.players[who];
  const here = s.players.filter((o) => o.id !== p.id && o.trapped === 0 && o.at === p.at);
  let free = Math.min(2, here.length);
  if (critical) {
    free += 1;
    if (s.players.some((o) => o.role === "locksmith" && o.trapped === 0 && o.at === p.at)) free += 2;
  }
  if (p.role === "cryptographer" && (kind === "cipher" || kind === "anagram")) free += 1;
  return free;
}

function startPuzzle(s: TeamState, who: number, puzzle: Puzzle, source: PuzzleSource, critical: boolean) {
  s.pending = { type: "puzzle", puzzle, source, critical, shown: 0, free: freeHintsFor(s, who, puzzle.kind, critical), who };
}

const NON_TIMED: PuzzleKindId[] = ALL_KINDS.filter((k) => k !== "memory");

/** Pick the failure kit for a failed task. Returns the lines to show the table. */
function failure(s: TeamState, who: number, rng: Rng, o: { trap: boolean; lose: number; menace: number; where: string; zone?: boolean }): string[] {
  const lines: string[] = [];
  const p = s.players[who];
  if (o.trap) {
    p.trapped = TRAP_ROUNDS;
    s.stats.trapped++;
    // Being trapped ends your turn on the spot.
    if (who === s.turn) {
      s.ap = 0;
      s.freeMove = false;
    }
    lines.push(`${p.name} is TRAPPED in the ${nodeName(s, p.at)}. A teammate can come and rescue them. If no one does, they break free in ${TRAP_ROUNDS} rounds, loudly.`);
  }
  for (let i = 0; i < o.lose; i++) lines.push(...loseEvidence(s, rng));
  if (o.menace) {
    const extra = o.zone ? (s.game.twist.mods.zonePenalty ?? 0) : 0;
    s.menace = Math.min(MAX_MENACE, s.menace + o.menace + extra);
    lines.push(`The menace rises to ${s.menace} of ${MAX_MENACE}.`);
  }
  return lines;
}

function nodeName(s: TeamState, id: string) {
  return node(s, id)?.name ?? id;
}

function loseEvidence(s: TeamState, rng: Rng): string[] {
  if (!s.held.length) return ["The team had no evidence to lose, but your nerve takes the hit."];
  const id = rng.pick(s.held);
  const c = clueById(s, id)!;
  const zones = s.game.map.filter((n) => n.kind === "zone");
  const zone = rng.pick(zones);
  const num = clueNumber(s, id);
  s.held = s.held.filter((h) => h !== id);
  s.clueStatus[id] = "lost";
  s.lostIn[id] = zone.id;
  s.stats.lost++;
  return [`EVIDENCE LOST: Clue #${num} (${c.short}) is gone. It fell into ${zone.name}. Someone brave could win it back.`];
}

function foundClue(s: TeamState, c: Clue): void {
  s.clueStatus[c.id] = "held";
  s.held.push(c.id);
  s.stats.found++;
}

function setTurn(s: TeamState) {
  const p = s.players[s.turn];
  s.ap = AP_PER_TURN;
  s.lit = false;
  s.freeMove = p.role === "scout";
}

function endRound(s: TeamState) {
  s.round += 1;
  const rpp = s.game.roundsPerPhase;
  const before = Math.min(PHASES.length - 1, Math.floor((s.round - 2) / rpp));
  for (const p of s.players) {
    if (p.trapped > 0) {
      p.trapped -= 1;
      if (p.trapped === 0) {
        s.menace = Math.min(MAX_MENACE, s.menace + 1);
        note(s, { tone: "bad", title: `${p.name} breaks free`, lines: [`${p.name} forced their way out of the ${nodeName(s, p.at)}. The noise carried through the house. Menace +1.`] });
      }
    }
  }
  if (s.round > totalRounds(s)) {
    lose(s, "dawn", "Dawn", ["The sun comes up and the culprit walks free through the front door. You ran out of night.", "Game Over: You Lose."]);
    return;
  }
  const after = phaseIndex(s);
  if (after !== before) {
    const ph = PHASES[after];
    const extra = s.game.twist.mods.menacePerPhase ?? 0;
    const lines = [ph.mood];
    if (extra) {
      s.menace = Math.min(MAX_MENACE, s.menace + extra);
      lines.push(`The night is turning against you. Menace +${extra}.`);
    }
    if (after >= 2 && s.stalkersFaced < 3) {
      s.stalkerDue = true;
      lines.push("A CRITICAL EVENT is coming: the Stalker is in the house. The next detective to take a turn must face it. Failing means Game Over.");
    }
    note(s, { tone: after >= 2 ? "critical" : "info", title: `${ph.clock}: ${ph.title}`, lines });
  }
}

/** Move play to the next free detective, running the round clock as the order wraps. */
function advanceTurn(s: TeamState) {
  if (s.status !== "play") return;
  let guard = 0;
  do {
    s.turn = (s.turn + 1) % s.players.length;
    if (s.turn === 0) endRound(s);
    if (s.status !== "play") return;
    guard++;
  } while (s.players[s.turn].trapped > 0 && guard < s.players.length * 2 + 2);
  checkLoss(s);
  if (s.status !== "play") return;
  setTurn(s);
  const p = s.players[s.turn];
  note(s, { tone: "turn", title: `${p.name}'s turn`, lines: [`${roleTitle(p)} · ${nodeName(s, p.at)} · ${phaseOf(s).clock}`] });
  // The Stalker: a critical task thrown at whoever is up first once the night turns deadly.
  if (s.stalkerDue) {
    s.stalkerDue = false;
    s.stalkersFaced += 1;
    const rng = rngOf(s);
    const kind = rng.pick(NON_TIMED);
    const puzzle = mkPuzzle(s, rng, kind, 2, roomDef(p.at) ? p.at : undefined, undefined, "The Stalker");
    s.rng = rng.state;
    note(s, { tone: "critical", title: "THE STALKER", lines: [`A figure steps out of the dark right in front of ${p.name}. This is a CRITICAL TASK: fail it and the case is over.`, "Teammates in the same room give free hints. Locksmiths help even more."] });
    startPuzzle(s, p.id, puzzle, { kind: "stalker" }, true);
  }
}

function roleTitle(p: Player) {
  return ROLES.find((r) => r.id === p.role)?.title ?? p.role;
}

// ---------------------------------------------------------------------------------------------
// Offers (the draft)

function describeOffer(s: TeamState, card: Card, rng: Rng, roomId: string): Offer {
  const room = roomDef(roomId);
  switch (card.type) {
    case "evidence": {
      const clue = hiddenIn(s, roomId)[0];
      const obj = room?.objects.find((o) => o.id === clue?.object);
      const kind = obj?.kind ?? "combo";
      return { deck: card.deck, cardId: card.id, title: `Search the ${obj?.name ?? "room"}`, blurb: `A ${KIND_LABEL[kind].toLowerCase()} guards a clue. Solve it to add the clue to the case. Fail and you are trapped and a clue is lost.`, risk: "risky", icon: "🔎" };
    }
    case "hazard": {
      const h = rng.pick(HAZARDS);
      return { deck: card.deck, cardId: card.id, title: h.t, blurb: `${h.d.replace("{room}", room?.name ?? nodeName(s, roomId))} A hazard puzzle: pass to keep your footing, fail and you are trapped.`, risk: "risky", icon: "⚠️" };
    }
    case "ambush":
      return { deck: card.deck, cardId: card.id, title: "Ambush", blurb: "Someone grabs your sleeve in the dark. A quick puzzle: fail and you are trapped.", risk: "risky", icon: "🗡️" };
    case "menace":
      return { deck: card.deck, cardId: card.id, title: "Footsteps overhead", blurb: "The house knows you are here. The menace rises.", risk: "risky", icon: "👣" };
    case "boon-hint":
      return { deck: card.deck, cardId: card.id, title: "A friendly note", blurb: "A scrap of paper tucked in a sleeve. +1 hint token.", risk: "boon", icon: "💡" };
    case "boon-lantern":
      return { deck: card.deck, cardId: card.id, title: "A spare lantern", blurb: "It will push the dark back for one turn. +1 lantern.", risk: "boon", icon: "🏮" };
    case "boon-key":
      return { deck: card.deck, cardId: card.id, title: "A skeleton key", blurb: "Opens one sealed wing without a puzzle. +1 key.", risk: "boon", icon: "🗝️" };
    case "boon-ap":
      return { deck: card.deck, cardId: card.id, title: "A second wind", blurb: "A hidden stair puts you ahead. +1 action this turn.", risk: "boon", icon: "⚡" };
    case "witness":
      return { deck: card.deck, cardId: card.id, title: "A nervous witness", blurb: "They will tell you one thing the culprit is NOT, but they talk too loudly. A free clue, menace +1.", risk: "safe", icon: "🗣️" };
    case "whisper":
      return { deck: card.deck, cardId: card.id, title: "A whispered tip", blurb: "A servant slips you what help they can. +1 hint token.", risk: "boon", icon: "🤫" };
    case "lull":
      return { deck: card.deck, cardId: card.id, title: "A quiet moment", blurb: "The house goes still. The menace falls by 1.", risk: "boon", icon: "🕊️" };
  }
}

function resolveCard(s: TeamState, card: Card, who: number, rng: Rng, roomId: string) {
  const p = s.players[who];
  switch (card.type) {
    case "evidence": {
      const clue = hiddenIn(s, roomId)[0];
      if (!clue) {
        note(s, { tone: "info", title: "Nothing left here", lines: ["You have searched this room from top to bottom."] });
        return;
      }
      const room = roomDef(roomId);
      const obj = room?.objects.find((o) => o.id === clue.object);
      const puzzle = mkPuzzle(s, rng, obj?.kind ?? "combo", 1, roomId, clue.object);
      startPuzzle(s, who, puzzle, { kind: "evidence", clueId: clue.id }, false);
      return;
    }
    case "hazard": {
      const kind = rng.pick(NON_TIMED.concat(["memory"]));
      startPuzzle(s, who, mkPuzzle(s, rng, kind, 1, roomDef(roomId) ? roomId : undefined, undefined, "Hazard"), { kind: "hazard" }, false);
      return;
    }
    case "ambush":
      startPuzzle(s, who, mkPuzzle(s, rng, rng.pick(NON_TIMED), 1, roomDef(roomId) ? roomId : undefined, undefined, "Ambush"), { kind: "ambush" }, false);
      return;
    case "menace":
      s.menace = Math.min(MAX_MENACE, s.menace + 1);
      note(s, { tone: "bad", title: "Footsteps overhead", lines: [`The house knows you are here. Menace rises to ${s.menace}.`] });
      return;
    case "boon-hint":
    case "whisper":
      s.hints += 1;
      note(s, { tone: "good", title: card.type === "whisper" ? "A whispered tip" : "A friendly note", lines: [`The team gains a hint token (${s.hints} now).`] });
      return;
    case "boon-lantern":
      s.lantern += 1;
      note(s, { tone: "good", title: "A spare lantern", lines: [`The team now has ${s.lantern} lantern${s.lantern === 1 ? "" : "s"}. Light one before a puzzle to push the dark back for the turn.`] });
      return;
    case "boon-key":
      s.keys += 1;
      note(s, { tone: "good", title: "A skeleton key", lines: ["It opens any sealed wing without a puzzle. A critical task you do not have to risk."] });
      return;
    case "boon-ap":
      s.ap += 1;
      note(s, { tone: "good", title: "A second wind", lines: [`${p.name} has one extra action this turn.`] });
      return;
    case "lull":
      s.menace = Math.max(0, s.menace - 1);
      note(s, { tone: "good", title: "A quiet moment", lines: [`The house goes still. Menace falls to ${s.menace}.`] });
      return;
    case "witness": {
      const c = witnessClue(s, rng);
      s.menace = Math.min(MAX_MENACE, s.menace + 1);
      if (!c) {
        note(s, { tone: "info", title: "A nervous witness", lines: ["They have nothing new to say, but they say it loudly. Menace +1."] });
        return;
      }
      foundClue(s, c);
      note(s, { tone: "good", title: "A nervous witness", lines: [c.text, `Added as Clue #${clueNumber(s, c.id)}. They spoke too loudly: menace +1.`], clueId: c.id });
      return;
    }
  }
}

/** A bonus clue: rule out one wrong item still on the board. Never touches the sealed wings' items. */
function witnessClue(s: TeamState, rng: Rng): Clue | null {
  const d = board(s);
  const vault = new Set(s.game.vaultItems.map((v) => `${v.category}:${v.item}`));
  const options: { cat: CategoryKey; item: string }[] = [];
  for (const cat of CATEGORY_KEYS) {
    if (cat === "suspect" || cat === "motive") {
      // Only rule out suspects and motives directly when this does not give the secret away too cheaply.
    }
    for (const item of d.cands[cat]) {
      if (item === s.game.solution[cat]) continue;
      if (vault.has(`${cat}:${item}`)) continue;
      options.push({ cat, item });
    }
  }
  if (!options.length) return null;
  const o = rng.pick(options);
  const id = `b${s.bonus.length + 1}`;
  const name = nameOf(o.cat, o.item);
  const text: Record<CategoryKey, string> = {
    time: `"I saw the victim fine at ${name}," the witness insists, wringing their hands.`,
    room: `"Nothing happened in the ${name}. I was there the whole time," the witness blurts.`,
    weapon: `"The ${name.toLowerCase()}? Never left its case," the witness swears.`,
    suspect: `"${name}? They were with me all night," the witness says, too quickly.`,
    motive: `"It wasn't ${name.toLowerCase()}. I would know," the witness mutters.`,
  };
  const clue: Clue = {
    id,
    kind: "exclude",
    category: o.cat,
    items: [o.item],
    where: "witness",
    object: "",
    text: text[o.cat],
    short: `Not ${name}`,
    bonus: true,
    tier: 1,
  };
  s.bonus.push(clue);
  s.clueStatus[id] = "hidden";
  return clue;
}

// ---------------------------------------------------------------------------------------------
// Puzzle resolution

function succeed(s: TeamState, rng: Rng) {
  const pd = s.pending as Extract<Pending, { type: "puzzle" }>;
  const p = s.players[pd.who];
  s.pending = null;
  switch (pd.source.kind) {
    case "evidence": {
      const c = clueById(s, pd.source.clueId)!;
      foundClue(s, c);
      const lines = [c.text, `Added to the case as Clue #${clueNumber(s, c.id)}.`];
      note(s, { tone: "good", title: "Evidence found", lines, clueId: c.id });
      say(s, `${p.name} found clue #${clueNumber(s, c.id)}.`);
      return;
    }
    case "hazard":
      note(s, { tone: "good", title: "You keep your footing", lines: ["You get through it. The house lets you go this time."] });
      return;
    case "ambush":
      note(s, { tone: "good", title: "You break free", lines: ["You shove past in the dark. Your pulse is hammering, but you are fine."] });
      return;
    case "stalker": {
      s.menace = Math.max(0, s.menace - 2);
      s.hints += 1;
      note(s, { tone: "good", title: "The Stalker falls back", lines: [`${p.name} faces it down and the figure melts into the dark. Menace -2 (now ${s.menace}), +1 hint token.`] });
      say(s, `${p.name} survived the Stalker.`);
      return;
    }
    case "lock": {
      s.unlocked.push(pd.source.room);
      const n = nodeName(s, pd.source.room);
      note(s, { tone: "good", title: `${n} unlocked`, lines: [`The lock gives. The ${n} is open, and what is inside has been waiting a long time.`] });
      say(s, `${p.name} opened the ${n}.`);
      return;
    }
    case "rescue": {
      const t = s.players[pd.source.target];
      t.trapped = 0;
      s.stats.rescues++;
      note(s, { tone: "good", title: `${t.name} is free`, lines: [`${p.name} gets ${t.name} out. Together again.`] });
      say(s, `${p.name} rescued ${t.name}.`);
      return;
    }
    case "recover": {
      const zone = pd.source.zone;
      const take = p.role === "archivist" ? 2 : 1;
      const back = lostInZone(s, zone).slice(0, take);
      for (const c of back) {
        s.clueStatus[c.id] = "held";
        delete s.lostIn[c.id];
        s.held.push(c.id);
        s.stats.recovered++;
      }
      note(s, { tone: "good", title: "Evidence recovered", lines: back.map((c) => `Clue back in your hands: ${c.short}`).concat(["Now get out of there."]), clueId: back[0]?.id });
      say(s, `${p.name} recovered ${back.length} clue${back.length === 1 ? "" : "s"}.`);
      return;
    }
  }
}

function fail(s: TeamState, rng: Rng) {
  const pd = s.pending as Extract<Pending, { type: "puzzle" }>;
  const p = s.players[pd.who];
  s.pending = null;
  switch (pd.source.kind) {
    case "lock":
      lose(s, "lock", "The alarm sounds", [`${p.name} got the lock wrong. A bell rings through the whole house, and the culprit knows exactly where you are. The doors lock, and then the lights.`, "Game Over: You Lose."]);
      return;
    case "stalker":
      lose(s, "stalker", "The Stalker catches you", [`${p.name} freezes. The figure in the dark does not.`, "Game Over: You Lose."]);
      return;
    case "evidence": {
      const lines = failure(s, pd.who, rng, { trap: true, lose: 1, menace: 1, where: p.at });
      note(s, { tone: "bad", title: "You got it wrong", lines });
      return;
    }
    case "hazard":
    case "ambush": {
      const lines = failure(s, pd.who, rng, { trap: true, lose: 0, menace: 1, where: p.at });
      note(s, { tone: "bad", title: pd.source.kind === "hazard" ? "The house wins this one" : "Caught", lines });
      return;
    }
    case "rescue": {
      if (p.role === "medic") {
        s.menace = Math.min(MAX_MENACE, s.menace + 1);
        note(s, { tone: "bad", title: "The rescue slips", lines: [`${p.name}'s training keeps them out of the trap, but it did not work and the noise carries. Menace +1.`] });
      } else {
        const lines = failure(s, pd.who, rng, { trap: true, lose: 0, menace: 1, where: p.at });
        note(s, { tone: "bad", title: "The rescue goes wrong", lines: [`${p.name} gets caught too.`, ...lines] });
      }
      return;
    }
    case "recover": {
      const lines = failure(s, pd.who, rng, { trap: true, lose: 1, menace: 2, where: p.at, zone: true });
      note(s, { tone: "bad", title: "The zone punishes you", lines });
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The reducer

export function reduce(prev: TeamState, a: Action): TeamState {
  if (prev.status !== "play") return prev;
  const s = clone(prev);
  const rng = rngOf(s);
  const p = currentPlayer(s);

  // Notices must be read first.
  if (a.type === "ack") {
    s.notices.shift();
    return settle(s, rng);
  }
  if (s.notices.length) return prev;

  if (s.pending?.type === "puzzle") {
    const pd = s.pending;
    switch (a.type) {
      case "hint": {
        if (pd.shown >= pd.puzzle.hints.length) return prev;
        if (pd.free > 0) pd.free -= 1;
        else if (s.hints > 0) {
          s.hints -= 1;
          s.stats.hintsUsed++;
        } else return prev;
        pd.shown += 1;
        return settle(s, rng);
      }
      case "submit": {
        const ok = checkPuzzle(pd.puzzle, a.input);
        if (ok) succeed(s, rng);
        else fail(s, rng);
        checkLoss(s);
        return settle(s, rng);
      }
      case "retreat": {
        // A critical event cannot be walked away from; everything else can, at a price.
        if (pd.source.kind === "stalker") return prev;
        s.pending = null;
        s.menace = Math.min(MAX_MENACE, s.menace + 1);
        note(s, { tone: "info", title: "You back away", lines: [`You leave it for now. The house notices: menace ${s.menace}. The action is spent.`] });
        checkLoss(s);
        return settle(s, rng);
      }
      default:
        return prev;
    }
  }

  if (!p || p.trapped > 0) return prev;
  const L = legal(s);
  const here = node(s, p.at)!;

  switch (a.type) {
    case "move": {
      if (!L.moves.some((n) => n.id === a.to)) return prev;
      if (s.freeMove) s.freeMove = false;
      else s.ap -= 1;
      p.at = a.to;
      say(s, `${p.name} moved to the ${nodeName(s, a.to)}.`);
      const dest = node(s, a.to)!;
      if (dest.kind === "zone") note(s, { tone: "critical", title: dest.name, lines: ["A DANGER ZONE. Lost evidence is hidden here, but failing in here costs dearly: you are trapped, another clue is lost and the menace spikes."] });
      return settle(s, rng);
    }
    case "lantern": {
      if (!L.canLantern) return prev;
      s.lantern -= 1;
      s.lit = true;
      say(s, `${p.name} lit a lantern.`);
      note(s, { tone: "good", title: "The dark pushes back", lines: ["The lantern holds until the end of this turn. Puzzles are easier to read."] });
      return settle(s, rng);
    }
    case "investigate": {
      if (!L.canInvestigate) return prev;
      s.ap -= 1;
      const eligible: DeckId[] = ["environment", "intel"];
      if (here.kind === "room" && !isLocked(s, here.id) && hiddenIn(s, here.id).length) eligible.push("evidence");
      const count = Math.min(eligible.length, p.role === "inspector" ? 3 : 2);
      const decks = rng.sample(eligible, count);
      const offers = decks.map((d) => describeOffer(s, peek(s, d, rng), rng, here.id));
      s.pending = { type: "draft", offers };
      say(s, `${p.name} investigates the ${here.name}.`);
      return settle(s, rng);
    }
    case "draft": {
      if (s.pending?.type !== "draft") return prev;
      const offer = s.pending.offers[a.index];
      if (!offer) return prev;
      const chosen = s.decks[offer.deck].shift()!;
      // The cards you passed on go to the bottom of their decks.
      for (const o of s.pending.offers) {
        if (o !== offer) {
          const top = s.decks[o.deck].shift();
          if (top) s.decks[o.deck].push(top);
        }
      }
      s.pending = null;
      resolveCard(s, chosen, p.id, rng, here.id);
      checkLoss(s);
      return settle(s, rng);
    }
    case "unlock": {
      if (!L.unlockable.some((n) => n.id === a.room)) return prev;
      s.ap -= 1;
      if (a.useKey && s.keys > 0) {
        s.keys -= 1;
        s.unlocked.push(a.room);
        note(s, { tone: "good", title: `${nodeName(s, a.room)} unlocked`, lines: ["The skeleton key turns without a sound."] });
        say(s, `${p.name} used a key on the ${nodeName(s, a.room)}.`);
        return settle(s, rng);
      }
      const kind = rng.pick(NON_TIMED);
      const puzzle = mkPuzzle(s, rng, kind, 2, a.room, undefined, `Lock on the ${nodeName(s, a.room)}`);
      startPuzzle(s, p.id, puzzle, { kind: "lock", room: a.room }, true);
      return settle(s, rng);
    }
    case "recover": {
      if (!L.canRecover) return prev;
      s.ap -= 1;
      const base = p.role === "archivist" ? 2 : 3;
      const puzzle = mkPuzzle(s, rng, rng.pick(ALL_KINDS), base, undefined, undefined, `Recovery in ${here.name}`);
      startPuzzle(s, p.id, puzzle, { kind: "recover", zone: here.id }, false);
      return settle(s, rng);
    }
    case "rescue": {
      if (!L.rescuable.some((o) => o.id === a.target)) return prev;
      s.ap -= 1;
      const puzzle = mkPuzzle(s, rng, rng.pick(NON_TIMED), 1 + (here.kind === "zone" ? 1 : 0), undefined, undefined, `Rescue ${s.players[a.target].name}`);
      startPuzzle(s, p.id, puzzle, { kind: "rescue", target: a.target }, false);
      return settle(s, rng);
    }
    case "end": {
      if (!L.canEnd) return prev;
      s.ap = 0;
      s.freeMove = false;
      return settle(s, rng);
    }
    case "accuse": {
      if (!L.canAccuse) return prev;
      const ok = CATEGORY_KEYS.every((k) => a.guess[k] === s.game.solution[k]);
      s.rng = rng.state;
      if (ok) {
        s.status = "won";
        s.pending = null;
        s.notices = [];
        s.ending = {
          kind: "win",
          reason: "victory",
          title: "Case closed",
          lines: [`${p.name} lays out the case, and the room falls silent. Every detail fits.`],
          reveal: ending(s.game),
        };
        say(s, "The case is solved.");
      } else {
        const right = CATEGORY_KEYS.filter((k) => a.guess[k] === s.game.solution[k]).length;
        lose(s, "accusation", "Wrong accusation", [`${p.name} names the wrong answer. The real culprit smiles, and the doors close. (${right} of 5 were right.)`, "Game Over: You Lose."]);
      }
      return s;
    }
    default:
      return prev;
  }
}

/** After every action: save the rng, run the end-of-turn logic when nothing is waiting. */
function settle(s: TeamState, rng: Rng): TeamState {
  s.rng = rng.state;
  checkLoss(s);
  if (s.status === "play" && s.ap <= 0 && !s.pending && s.notices.length === 0) {
    s.freeMove = false;
    advanceTurn(s);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Save / load

export function serialize(s: TeamState): string {
  return JSON.stringify(s);
}

export function deserialize(text: string | null): TeamState | null {
  if (!text) return null;
  try {
    const s = JSON.parse(text) as TeamState;
    if (!s || s.v !== SAVE_VERSION || !s.game || !Array.isArray(s.players)) return null;
    return s;
  } catch {
    return null;
  }
}
