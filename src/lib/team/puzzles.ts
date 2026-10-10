/**
 * Team Mode mini-games. Each one is generated on the spot from a seeded Rng, so it depends on the room
 * you are standing in and on the hour of the night (the hour is the key to the ciphers, the dark makes
 * the fuse box and the memory test harder, and every later hour raises the difficulty).
 *
 * Every puzzle is checkable by checkPuzzle(), and the tests prove each generator always produces a
 * puzzle with exactly one right answer.
 */
import { Rng } from "./rng.ts";
import type { PhaseDef, PuzzleKindId, RoomDef } from "./content.ts";

export interface Puzzle {
  kind: PuzzleKindId;
  /** 1 (easy) to 5 (brutal). */
  level: number;
  title: string;
  /** Scene-setting line: where you are and what the hour is doing to the room. */
  story: string;
  /** What to do. */
  task: string;
  /** Extra lines of information the player needs (counts, statements, ciphertext...). */
  lines: string[];
  data: Record<string, unknown>;
  /** The canonical right answer. Never shown by the UI before the attempt is settled. */
  answer: string;
  hints: string[];
  /** Seconds on the clock. When it runs out the attempt counts as a wrong answer. Absent = take your time. */
  timeLimit?: number;
}

export const KIND_LABEL: Record<PuzzleKindId, string> = {
  cipher: "Cipher",
  combo: "Combination lock",
  order: "Arrangement",
  sequence: "Number sequence",
  anagram: "Anagram",
  fuse: "Fuse box",
  memory: "Memory test",
  oddone: "Odd one out",
  codebreaker: "Code breaker",
  grid: "Number grid",
  whichbox: "Which box?",
  dash: "Number dash",
};

export const ALL_KINDS: PuzzleKindId[] = ["cipher", "combo", "order", "sequence", "anagram", "fuse", "memory", "oddone", "codebreaker", "grid", "whichbox", "dash"];
/** The newer mini-games; the engine mixes these into the evidence puzzles so no two rooms feel the same. */
export const NEW_KINDS: PuzzleKindId[] = ["codebreaker", "grid", "whichbox", "dash"];

export interface BuildContext {
  kind: PuzzleKindId;
  level: number;
  phase: PhaseDef;
  room?: RoomDef;
  objectId?: string;
  /** A one-line label such as "Lock on the Study" for the card title. */
  label?: string;
  /** Critical tasks (sealed doors, the Night Watchman) are more often against the clock. */
  critical?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The hour changes how every room feels. This is the line that opens each puzzle. */
export function ambience(rng: Rng, room: RoomDef | undefined, phase: PhaseDef, objectId?: string): string {
  if (!room) return `${phase.clock}. ${phase.mood}`;
  const obj = room.objects.find((o) => o.id === objectId) ?? rng.pick(room.objects);
  const sense = rng.pick(room.sense);
  const dark = phase.dark ? " It is pitch dark." : "";
  return `${phase.clock}, the ${room.name}. You ${obj.verb} the ${obj.name}. You notice ${sense}. ${phase.mood}${dark}`;
}

export function buildPuzzle(rng: Rng, ctx: BuildContext): Puzzle {
  const level = clamp(ctx.level, 1, 5);
  const base = BUILDERS[ctx.kind](rng, level, ctx);
  const title = ctx.label ?? (ctx.room ? `${ctx.room.objects.find((o) => o.id === ctx.objectId)?.name ?? "Something"} in the ${ctx.room.name}` : KIND_LABEL[ctx.kind]);
  const built: Puzzle = {
    kind: ctx.kind,
    level,
    title: cap(title),
    story: ambience(rng, ctx.room, ctx.phase, ctx.objectId),
    ...base,
  };
  const secs = timeLimitFor(rng, ctx.kind, level, built, !!ctx.critical);
  if (secs) built.timeLimit = secs;
  return built;
}

/** Seconds the group gets for a puzzle, or 0 for no clock. Number dash always runs against the clock. */
const BASE_SECS: Record<PuzzleKindId, number> = {
  cipher: 90, combo: 100, order: 90, sequence: 50, anagram: 70, fuse: 130, memory: 0, oddone: 40,
  codebreaker: 110, grid: 170, whichbox: 80, dash: 0,
};
function timeLimitFor(rng: Rng, kind: PuzzleKindId, level: number, p: Puzzle, critical: boolean): number {
  if (kind === "dash") return Math.round(12 + (p.data.count as number) * 1.6);
  const base = BASE_SECS[kind];
  if (!base || level < 2) return 0;
  if (!rng.chance(0.2 + 0.08 * level + (critical ? 0.25 : 0))) return 0;
  return Math.max(25, Math.round((base * (1.5 - 0.1 * level)) / 5) * 5);
}

type Built = Pick<Puzzle, "task" | "lines" | "data" | "answer" | "hints">;
type Builder = (rng: Rng, level: number, ctx: BuildContext) => Built;

// ---------------------------------------------------------------------------------------------
// Cipher: the hour on the clock is the key.

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function shiftWord(word: string, by: number): string {
  return word
    .split("")
    .map((ch) => {
      const i = A.indexOf(ch);
      return i < 0 ? ch : A[(((i + by) % 26) + 26) % 26];
    })
    .join("");
}

const cipher: Builder = (rng, level, ctx) => {
  const pool = (ctx.room?.words ?? ["LANTERN", "SECRET", "SHADOW", "MANOR", "ALIBI"]).filter((w) => (level <= 1 ? w.length <= 5 : level <= 2 ? w.length <= 7 : true));
  const word = rng.pick(pool.length ? pool : ctx.room?.words ?? ["ALIBI"]);
  const hour = ctx.phase.hour;
  const where = ctx.room ? ` found in the ${ctx.room.name}` : "";
  const hints = [`The word has ${word.length} letters.`, `It starts with ${word[0]}.`, `It ends with ${word[word.length - 1]} (a word you'd find around the ${ctx.room?.name ?? "house"}).`];
  // Level 5: a rolling key, each letter pushed one place further than the one before.
  if (level >= 5 && rng.chance(0.55)) {
    const text = word.split("").map((ch, i) => shiftWord(ch, hour + i)).join("");
    return {
      task: `Decode the message${where}. The clock has just struck ${hour}. The FIRST letter was pushed ${hour} places forward, the SECOND ${hour + 1} places, the THIRD ${hour + 2} places, and so on, one more each time. Push each letter back by its own amount.`,
      lines: [text],
      data: { cipher: text, shift: hour, dir: 1, rolling: true },
      answer: word,
      hints,
    };
  }
  // Level 4 and up: the message was also written backwards.
  const backwards = level >= 4 && rng.chance(0.55);
  // The clock chimes `hour` times. Early on the letters were pushed forward; later the house plays tricks and pushes them back.
  const dir = level >= 3 && rng.chance(0.5) ? -1 : 1;
  const shifted = shiftWord(word, dir * hour);
  const text = backwards ? shifted.split("").reverse().join("") : shifted;
  return {
    task: `Decode the message${where}. The clock has just struck ${hour} (that is your key). ${dir === 1 ? `Every letter was pushed ${hour} places forward in the alphabet; push each one back ${hour} places.` : `Every letter was pulled ${hour} places back in the alphabet; push each one forward ${hour} places.`}${backwards ? " Careful: the whole message was also written BACKWARDS, so read it from the right." : ""}`,
    lines: [text],
    data: { cipher: text, shift: hour, dir, backwards },
    answer: word,
    hints,
  };
};

// ---------------------------------------------------------------------------------------------
// Combination lock: counts in the room, read with a rule.

const COLORS = ["red", "blue", "green", "gold", "white", "black", "purple", "orange"];

const combo: Builder = (rng, level, ctx) => {
  // More colours, more kinds of object and trickier rules the later and darker it gets.
  const nColors = level <= 1 ? 4 : level === 2 ? 5 : level === 3 ? 6 : 7;
  const maxCount = level <= 1 ? 4 : level === 2 ? 5 : 6;
  const nouns = (ctx.room ? rng.sample(ctx.room.things, level >= 3 ? 2 : 1) : ["candles", "books"].slice(0, level >= 3 ? 2 : 1));
  const len = level <= 1 ? 3 : level <= 3 ? 4 : 5;
  const colors = rng.sample(COLORS, nColors);
  const counts: Record<string, Record<string, number>> = {};
  for (const n of nouns) {
    counts[n] = {};
    for (const c of colors) counts[n][c] = rng.int(1, maxCount);
  }
  type Rule = "count" | "sum" | "double" | "diff" | "most" | "fewest" | "total" | "above" | "across";
  const allowed: Rule[] = level === 1 ? ["count"] : level === 2 ? ["count", "sum", "double"] : level === 3 ? ["count", "sum", "double", "diff", "most", "fewest"] : ["sum", "double", "diff", "most", "fewest", "total", "above", "count"];
  if (nouns.length > 1 && level >= 3) allowed.push("across", "across");
  const digits: number[] = [];
  const rules: string[] = [];
  const ord = ["first", "second", "third", "fourth", "fifth"];
  const last = (n: number) => n % 10;
  for (let i = 0; i < len; i++) {
    const noun = rng.pick(nouns);
    const cnt = counts[noun];
    const kind = rng.pick(allowed);
    const w = ord[i];
    let done = false;
    if (kind === "sum") {
      const [x, y] = rng.sample(colors, 2);
      digits.push(last(cnt[x] + cnt[y]));
      rules.push(`${w} digit: the ${x} and the ${y} ${noun} added together (if it is 10 or more, just the last digit).`);
      done = true;
    } else if (kind === "double") {
      const c = rng.pick(colors);
      digits.push(last(cnt[c] * 2));
      rules.push(`${w} digit: twice the number of ${c} ${noun} (if it is 10 or more, just the last digit).`);
      done = true;
    } else if (kind === "diff") {
      const sorted = colors.slice().sort((p, q) => cnt[q] - cnt[p]);
      const x = sorted[0], y = sorted[sorted.length - 1];
      if (cnt[x] !== cnt[y]) {
        digits.push(cnt[x] - cnt[y]);
        rules.push(`${w} digit: the colour with the MOST ${noun} minus the colour with the FEWEST ${noun}.`);
        done = true;
      }
    } else if (kind === "most") {
      digits.push(Math.max(...colors.map((c) => cnt[c])));
      rules.push(`${w} digit: the biggest group of ${noun} (the highest single count).`);
      done = true;
    } else if (kind === "fewest") {
      digits.push(Math.min(...colors.map((c) => cnt[c])));
      rules.push(`${w} digit: the smallest group of ${noun} (the lowest single count).`);
      done = true;
    } else if (kind === "total") {
      digits.push(last(colors.reduce((t, c) => t + cnt[c], 0)));
      rules.push(`${w} digit: ALL the ${noun} together (if it is 10 or more, just the last digit).`);
      done = true;
    } else if (kind === "above") {
      const k = rng.int(1, Math.max(1, maxCount - 2));
      digits.push(colors.filter((c) => cnt[c] > k).length);
      rules.push(`${w} digit: how many colours of ${noun} have MORE than ${k}.`);
      done = true;
    } else if (kind === "across") {
      const other = nouns.find((n) => n !== noun)!;
      const c = rng.pick(colors);
      digits.push(last(counts[noun][c] + counts[other][c]));
      rules.push(`${w} digit: the ${c} ${noun} plus the ${c} ${other} (if it is 10 or more, just the last digit).`);
      done = true;
    }
    if (!done) {
      const c = rng.pick(colors);
      digits.push(cnt[c]);
      rules.push(`${w} digit: how many ${c} ${noun}.`);
    }
  }
  const answer = digits.join("");
  const tally = nouns.map((n) => `${n}: ${colors.map((c) => `${counts[n][c]} ${c}`).join(", ")}`);
  return {
    task: `The lock wants ${len} digits. Count what you see, then read the rule for each digit.`,
    lines: [...tally.map((t) => `You count ${t}.`), ...rules],
    data: { length: len },
    answer,
    hints: [`The ${ord[0]} digit is ${digits[0]}.`, `The first two digits are ${digits.slice(0, 2).join("")}.`, `The code is ${answer.slice(0, -1)}_ (all but the last digit).`],
  };
};

// ---------------------------------------------------------------------------------------------
// Arrangement: put things in order from a few true statements (always exactly one order fits).

type Stmt = { t: "left" | "adj" | "end" | "notend" | "pos" | "notadj"; a: string; b?: string; k?: number };

function holds(perm: string[], s: Stmt): boolean {
  const ia = perm.indexOf(s.a);
  const ib = s.b ? perm.indexOf(s.b) : -1;
  switch (s.t) {
    case "left": return ia < ib;
    case "adj": return Math.abs(ia - ib) === 1;
    case "notadj": return Math.abs(ia - ib) !== 1;
    case "end": return ia === 0 || ia === perm.length - 1;
    case "notend": return ia !== 0 && ia !== perm.length - 1;
    case "pos": return ia === (s.k ?? 0) - 1;
  }
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

function stmtText(s: Stmt, n: number): string {
  switch (s.t) {
    case "left": return `The ${s.a} is somewhere to the left of the ${s.b}.`;
    case "adj": return `The ${s.a} and the ${s.b} sit right next to each other.`;
    case "notadj": return `The ${s.a} and the ${s.b} are not next to each other.`;
    case "end": return `The ${s.a} is at one of the two ends.`;
    case "notend": return `The ${s.a} is not at either end.`;
    case "pos": return `The ${s.a} is number ${s.k} from the left (of ${n}).`;
  }
}

const ORDER_SETS = [
  ["Red", "Blue", "Green", "Gold", "Violet", "Teal"],
  ["Rose", "Amber", "Jade", "Ivory", "Onyx", "Pearl"],
  ["Fox", "Owl", "Hare", "Crow", "Wolf", "Otter"],
];

const order: Builder = (rng, level, ctx) => {
  const n = level <= 2 ? 3 : level === 3 ? 4 : level === 4 ? 5 : 6;
  const names = rng.sample(rng.pick(ORDER_SETS), n);
  const truth = rng.shuffle(names);
  const all = permutations(names);
  const stmts: Stmt[] = [];
  let guard = 0;
  const survivors = () => all.filter((p) => stmts.every((s) => holds(p, s)));
  while (survivors().length > 1 && guard++ < 60) {
    const [a, b] = rng.sample(names, 2);
    const t = rng.pick<Stmt["t"]>(guard > 20 ? ["pos", "pos", "left"] : ["left", "left", "adj", "notadj", "end", "notend", "pos"]);
    const s: Stmt = t === "end" || t === "notend" ? { t, a } : t === "pos" ? { t, a, k: truth.indexOf(a) + 1 } : { t, a, b };
    if (!holds(truth, s)) continue;
    // Only keep statements that cut something down.
    const before = survivors().length;
    stmts.push(s);
    if (survivors().length === before) stmts.pop();
  }
  // Safety net: if the random statements left more than one order, pin down items one by one.
  for (const nm of names) {
    if (survivors().length <= 1) break;
    stmts.push({ t: "pos", a: nm, k: truth.indexOf(nm) + 1 });
  }
  const answer = truth.join(",");
  const lines = rng.shuffle(stmts).map((s) => stmtText(s, n));
  return {
    task: `Arrange the ${n} items from left to right on the ${ctx.room?.objects.find((o) => o.id === ctx.objectId)?.name ?? "shelf"}. Only one order fits every statement.`,
    lines,
    data: { items: rng.shuffle(names), stmts },
    answer,
    hints: [`The ${truth[0]} is on the far left.`, `The first two are ${truth[0]}, then ${truth[1]}.`, `The order starts ${truth.slice(0, n - 1).join(", ")}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Number sequence

const sequence: Builder = (rng, level) => {
  let terms: number[] = [];
  let rule = "";
  const show = level >= 5 ? 7 : level >= 3 ? 6 : 5;
  if (level <= 1) {
    const a = rng.int(2, 15), d = rng.int(2, 9);
    terms = Array.from({ length: show + 1 }, (_, i) => a + d * i);
    rule = `add ${d} each time`;
  } else if (level === 2) {
    if (rng.chance(0.5)) {
      const a = rng.int(1, 4), m = rng.int(2, 3);
      terms = Array.from({ length: show + 1 }, (_, i) => a * m ** i);
      rule = `multiply by ${m} each time`;
    } else {
      const a = rng.int(1, 9), p = rng.int(2, 6), q = rng.int(1, 4);
      terms = [a];
      for (let i = 1; i <= show; i++) terms.push(terms[i - 1] + (i % 2 ? p : q));
      rule = `add ${p}, then ${q}, and repeat`;
    }
  } else if (level === 3) {
    if (rng.chance(0.5)) {
      const c = rng.int(0, 5);
      terms = Array.from({ length: show + 1 }, (_, i) => (i + 1) ** 2 + c);
      rule = `square numbers${c ? ` plus ${c}` : ""}`;
    } else {
      const a = rng.int(1, 4), b = rng.int(1, 5);
      terms = [a, b];
      for (let i = 2; i <= show; i++) terms.push(terms[i - 1] + terms[i - 2]);
      rule = "each term is the sum of the two before it";
    }
  } else {
    const pick = rng.int(0, level >= 5 ? 5 : 2);
    if (pick === 0) {
      const a = rng.int(1, 8), d = rng.int(1, 3), k = rng.int(1, 3);
      terms = [a];
      for (let i = 1; i <= show; i++) terms.push(terms[i - 1] + d + k * (i - 1));
      rule = `the gap grows by ${k} each step`;
    } else if (pick === 1) {
      const a = rng.int(2, 5), s2 = rng.int(1, 4);
      terms = [a];
      for (let i = 1; i <= show; i++) terms.push(i % 2 ? terms[i - 1] * 2 : terms[i - 1] - s2);
      rule = `double, then subtract ${s2}, and repeat`;
    } else if (pick === 2) {
      const m = rng.int(2, 3), k = rng.int(1, 4), a = rng.int(1, 3);
      terms = [a];
      for (let i = 1; i <= show; i++) terms.push(terms[i - 1] * m + k);
      rule = `multiply by ${m}, then add ${k}`;
    } else if (pick === 3) {
      terms = Array.from({ length: show + 1 }, (_, i) => ((i + 1) * (i + 2)) / 2);
      rule = "triangular numbers: add 2, then 3, then 4, then 5... (the gap grows by one)";
    } else if (pick === 4) {
      const c = rng.int(0, 4);
      terms = Array.from({ length: show + 1 }, (_, i) => (i + 1) ** 3 + c);
      rule = `cube numbers${c ? ` plus ${c}` : ""}`;
    } else {
      // Two patterns woven together: every other number belongs to the same pattern.
      const a = rng.int(1, 9), b = rng.int(20, 40), d1 = rng.int(2, 5), d2 = rng.int(2, 6);
      terms = Array.from({ length: show + 1 }, (_, i) => (i % 2 === 0 ? a + d1 * (i / 2) : b - d2 * ((i - 1) / 2)));
      rule = `two patterns woven together: every other number goes up by ${d1}, the rest go down by ${d2}`;
    }
  }
  const shown = terms.slice(0, show);
  const answer = terms[show];
  const opts = new Set<number>([answer]);
  const wobble = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer * 2, answer + (answer - terms[show - 1]) + 1];
  for (const w of rng.shuffle(wobble)) if (opts.size < 4 && w > 0 && !opts.has(w)) opts.add(w);
  for (let w = answer + 3; opts.size < 4; w++) opts.add(w);
  return {
    task: "What number comes next in the sequence?",
    lines: [shown.join(",  ") + ",  ?"],
    data: { options: rng.shuffle([...opts]).map(String) },
    answer: String(answer),
    hints: ["Look at the gaps between neighbouring numbers.", `Rule: ${rule.split(" ")[0]}...`, `The rule: ${rule}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Anagram

export function scramble(rng: Rng, word: string): string {
  if (new Set(word.split("")).size < 2) return word;
  for (let i = 0; i < 20; i++) {
    const s = rng.shuffle(word.split("")).join("");
    if (s !== word) return s;
  }
  return word.split("").reverse().join("");
}

const anagram: Builder = (rng, level, ctx) => {
  const pool = (ctx.room?.words ?? ["LANTERN", "SECRET", "SHADOW", "MANOR", "ALIBI"]).filter((w) => (level <= 1 ? w.length <= 5 : level <= 2 ? w.length <= 6 : level <= 3 ? w.length <= 7 : true));
  const word = rng.pick(pool.length ? pool : ctx.room?.words ?? ["ALIBI"]);
  const mixed = scramble(rng, word);
  return {
    task: `The letters are jumbled. Put them in the right order to spell a word you would find in the ${ctx.room?.name ?? "house"}.`,
    lines: [mixed.split("").join(" ")],
    data: { letters: mixed },
    answer: word,
    hints: [`It has ${word.length} letters.`, `It starts with ${word[0]}.`, `It starts with ${word.slice(0, 2)} and ends with ${word[word.length - 1]}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Fuse box (lights-out). Always solvable: the start is made by pressing cells from the solved board.

export function pressGrid(bits: number[], n: number, cell: number): number[] {
  const out = bits.slice();
  const r = Math.floor(cell / n), c = cell % n;
  const flip = (rr: number, cc: number) => {
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out[rr * n + cc] ^= 1;
  };
  flip(r, c); flip(r - 1, c); flip(r + 1, c); flip(r, c - 1); flip(r, c + 1);
  return out;
}

/** Gaussian elimination over GF(2). Returns the cells to press (each once), or null if the board cannot be cleared. */
export function solveFuse(bits: number[], n: number): number[] | null {
  const N = n * n;
  // Row i: which presses change cell i; last column is the cell's current state.
  const m: number[][] = Array.from({ length: N }, (_, i) => {
    const row = new Array(N + 1).fill(0);
    for (let j = 0; j < N; j++) {
      const unit = new Array(N).fill(0);
      unit[j] = 1;
      row[j] = pressGrid(new Array(N).fill(0), n, j)[i];
    }
    row[N] = bits[i];
    return row;
  });
  const pivotCol: number[] = [];
  let r = 0;
  for (let c = 0; c < N && r < N; c++) {
    let p = -1;
    for (let i = r; i < N; i++) if (m[i][c]) { p = i; break; }
    if (p < 0) continue;
    [m[r], m[p]] = [m[p], m[r]];
    for (let i = 0; i < N; i++) if (i !== r && m[i][c]) for (let k = c; k <= N; k++) m[i][k] ^= m[r][k];
    pivotCol[r] = c;
    r++;
  }
  for (let i = r; i < N; i++) if (m[i][N]) return null;
  const x = new Array(N).fill(0);
  for (let i = 0; i < r; i++) x[pivotCol[i]] = m[i][N];
  return x.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
}

const fuse: Builder = (rng, level, ctx) => {
  const n = level <= 2 ? 3 : 4;
  let bits = new Array(n * n).fill(0);
  const presses = rng.int(2 + Math.floor(level / 2), 4 + level);
  const cells = rng.sample(Array.from({ length: n * n }, (_, i) => i), Math.min(presses, n * n));
  for (const c of cells) bits = pressGrid(bits, n, c);
  if (bits.every((b) => b === 0)) bits = pressGrid(bits, n, 0);
  const solution = solveFuse(bits, n) ?? cells;
  const name = (i: number) => `row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
  return {
    task: `Switch off every lit fuse. Flipping a switch also flips the ones directly above, below, left and right of it.${ctx.phase.dark ? " It is dark, so take it slowly." : ""}`,
    lines: [],
    data: { n, start: bits.join("") },
    answer: "0".repeat(n * n),
    hints: [`It can be done by flipping ${solution.length} switch${solution.length === 1 ? "" : "es"}, each only once.`, `One switch to flip: ${name(solution[0] ?? 0)}.`, `Flip these: ${solution.map(name).join("; ")}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Memory test: repeat the pattern.

const memory: Builder = (rng, level, ctx) => {
  const tiles = level <= 2 ? 4 : 6;
  const length = 3 + level + (ctx.phase.dark ? 0 : 0);
  const seq: number[] = [];
  for (let i = 0; i < length; i++) {
    let t = rng.int(0, tiles - 1);
    if (i > 0 && t === seq[i - 1] && tiles > 1) t = (t + 1) % tiles;
    seq.push(t);
  }
  return {
    task: `Watch the lights, then repeat the pattern in the same order. The pattern shows ${ctx.phase.dark ? "faintly, so look closely" : "clearly"}. You can replay it.`,
    lines: [],
    data: { tiles, sequence: seq, dim: ctx.phase.dark },
    answer: seq.join("-"),
    hints: [`The pattern has ${length} lights.`, `It starts with tile ${seq[0] + 1} then tile ${seq[1] + 1}.`, `Tiles in order: ${seq.map((s) => s + 1).join(", ")}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Odd one out

const GROUPS: Record<string, string[]> = {
  fruit: ["Apple", "Pear", "Plum", "Cherry", "Mango", "Grape"],
  tool: ["Hammer", "Saw", "Drill", "Chisel", "Wrench", "Pliers"],
  instrument: ["Violin", "Cello", "Flute", "Oboe", "Harp", "Piano"],
  metal: ["Iron", "Copper", "Silver", "Gold", "Zinc", "Tin"],
  bird: ["Raven", "Crow", "Owl", "Finch", "Wren", "Swan"],
};
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
const FAKE_PRIMES = [9, 15, 21, 27, 33, 39, 49, 51, 57, 63, 77, 87, 91, 93];

const oddone: Builder = (rng, level) => {
  let items: string[] = [];
  let odd = "";
  let rule = "";
  if (level <= 1) {
    const [ga, gb] = rng.sample(Object.keys(GROUPS), 2);
    items = rng.sample(GROUPS[ga], 4);
    odd = rng.pick(GROUPS[gb]);
    rule = `Four are ${ga}s (or kinds of ${ga}).`;
  } else if (level === 2) {
    const evens = rng.chance(0.5);
    const pickN = (par: number) => 2 * rng.int(2, 40) + par;
    const set = new Set<number>();
    while (set.size < 4) set.add(pickN(evens ? 0 : 1));
    items = [...set].map(String);
    let o = pickN(evens ? 1 : 0);
    odd = String(o);
    rule = evens ? "Four are even." : "Four are odd.";
  } else if (level === 3) {
    const k = rng.int(3, 9);
    const set = new Set<number>();
    while (set.size < 4) set.add(k * rng.int(2, 12));
    items = [...set].map(String);
    let o = k * rng.int(2, 12) + rng.int(1, k - 1);
    odd = String(o);
    rule = `Four are in the ${k} times table.`;
  } else {
    const mode = rng.int(0, level >= 5 ? 3 : 1);
    if (mode === 0) {
      items = rng.sample(PRIMES, 4).map(String);
      odd = String(rng.pick(FAKE_PRIMES));
      rule = "Four are prime.";
    } else if (mode === 1) {
      const sq = rng.sample([4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144], 4);
      items = sq.map(String);
      odd = String(rng.pick([10, 15, 20, 30, 40, 50, 60, 70, 90, 110, 130]));
      rule = "Four are square numbers (like 4, 9, 16).";
    } else if (mode === 2) {
      const pal = rng.sample([11, 22, 33, 44, 55, 66, 77, 88, 99, 101, 121, 131, 141, 151, 161, 171, 181, 191, 202, 212], 4);
      items = pal.map(String);
      odd = String(rng.pick([12, 23, 34, 45, 56, 67, 78, 89, 102, 123, 134, 145, 156, 167, 178, 189]));
      rule = "Four read the same forwards and backwards.";
    } else {
      const target = rng.pick([8, 9, 10, 11, 12]);
      const pool: number[] = [];
      for (let n = 10; n < 100; n++) if (Math.floor(n / 10) + (n % 10) === target) pool.push(n);
      items = rng.sample(pool, 4).map(String);
      const others: number[] = [];
      for (let n = 10; n < 100; n++) if (Math.floor(n / 10) + (n % 10) !== target) others.push(n);
      odd = String(rng.pick(others));
      rule = `Four have digits that add up to ${target}.`;
    }
  }
  const all = rng.shuffle([...items, odd]);
  return {
    task: "One of these does not belong with the others. Which one?",
    lines: [],
    data: { options: all },
    answer: odd,
    hints: [`Think about what the other four have in common.`, rule, `It is not ${rng.pick(items)}, nor ${items.filter((x) => x !== items[0])[0] ?? items[0]}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Code breaker: a safe with a secret code and the notes of someone who already tried a few guesses.
// Digits never repeat. The notes always leave exactly one code possible.

function permsOfDigits(len: number): string[] {
  const out: string[] = [];
  const rec = (cur: string, used: number) => {
    if (cur.length === len) return void out.push(cur);
    for (let d = 0; d < 10; d++) if (!(used & (1 << d))) rec(cur + d, used | (1 << d));
  };
  rec("", 0);
  return out;
}

function feedback(code: string, guess: string): { place: number; wrong: number } {
  let place = 0, wrong = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === code[i]) place++;
    else if (code.includes(guess[i])) wrong++;
  }
  return { place, wrong };
}

const codebreaker: Builder = (rng, level) => {
  const len = level <= 3 ? 3 : 4;
  const space = permsOfDigits(len);
  const secret = rng.pick(space);
  const guesses: { guess: string; place: number; wrong: number }[] = [];
  let alive = space;
  let guard = 0;
  while (alive.length > 1 && guard++ < 14) {
    // Of a handful of random guesses keep the one that tells the most.
    let best: string | null = null, bestLeft = Infinity;
    for (let t = 0; t < 40; t++) {
      const g = rng.pick(space);
      if (g === secret || guesses.some((x) => x.guess === g)) continue;
      const f = feedback(secret, g);
      const left = alive.filter((c) => { const h = feedback(c, g); return h.place === f.place && h.wrong === f.wrong; }).length;
      if (left < bestLeft) { best = g; bestLeft = left; }
      // On gentler levels any guess that rules something out will do, so the notes are longer and the clues plainer.
      if (level < 4 && left < alive.length) break;
    }
    if (!best) break;
    const f = feedback(secret, best);
    guesses.push({ guess: best, ...f });
    alive = alive.filter((c) => { const h = feedback(c, best!); return h.place === f.place && h.wrong === f.wrong; });
  }
  const say = (g: { guess: string; place: number; wrong: number }) =>
    `${g.guess.split("").join(" ")}  →  ${g.place} in the right place, ${g.wrong} right number${g.wrong === 1 ? "" : "s"} in the wrong place`;
  return {
    task: `A safe takes a ${len}-digit code, and no digit is used twice. Someone left notes on their earlier tries. Work out the one code that fits EVERY note.`,
    lines: guesses.map(say),
    data: { length: len, guesses },
    answer: secret,
    hints: [`The code never repeats a digit and starts with ${secret[0]}.`, `The first two digits are ${secret.slice(0, 2)}.`, `The code is ${secret.slice(0, -1)}_ (all but the last digit).`],
  };
};

// ---------------------------------------------------------------------------------------------
// Number grid: a tiny sudoku. Every row, column and 2x2 box holds 1 to 4 once. Always exactly one solution.

function sudokuSolutions(cells: number[], limit: number): number {
  const g = cells.slice();
  let count = 0;
  const ok = (i: number, v: number) => {
    const r = Math.floor(i / 4), c = i % 4;
    for (let k = 0; k < 4; k++) {
      if (g[r * 4 + k] === v || g[k * 4 + c] === v) return false;
    }
    const br = r - (r % 2), bc = c - (c % 2);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (g[(br + a) * 4 + bc + b] === v) return false;
    return true;
  };
  const rec = (i: number): void => {
    if (count >= limit) return;
    while (i < 16 && g[i]) i++;
    if (i === 16) return void count++;
    for (let v = 1; v <= 4; v++) {
      if (ok(i, v)) { g[i] = v; rec(i + 1); g[i] = 0; }
    }
  };
  rec(0);
  return count;
}

export function gridSolutionCount(p: Puzzle): number {
  return sudokuSolutions(String(p.data.start).split("").map(Number), 5);
}

const grid: Builder = (rng, level, ctx) => {
  // Fill a full board at random, then punch holes as long as one solution remains.
  let full: number[] = new Array(16).fill(0);
  const fill = (i: number): boolean => {
    if (i === 16) return true;
    for (const v of rng.shuffle([1, 2, 3, 4])) {
      const r = Math.floor(i / 4), c = i % 4;
      let good = true;
      for (let k = 0; k < 4 && good; k++) if (full[r * 4 + k] === v || full[k * 4 + c] === v) good = false;
      const br = r - (r % 2), bc = c - (c % 2);
      for (let a = 0; a < 2 && good; a++) for (let b = 0; b < 2; b++) if (full[(br + a) * 4 + bc + b] === v) good = false;
      if (good) { full[i] = v; if (fill(i + 1)) return true; full[i] = 0; }
    }
    return false;
  };
  fill(0);
  const solution = full.join("");
  const start = full.slice();
  const target = 6 + level * 1.2 + (ctx.phase.dark ? 1 : 0); // blanks wanted
  for (const i of rng.shuffle(Array.from({ length: 16 }, (_, k) => k))) {
    if (start.filter((x) => x === 0).length >= Math.round(target)) break;
    const keep = start[i];
    start[i] = 0;
    if (sudokuSolutions(start, 2) !== 1) start[i] = keep;
  }
  const blanks = start.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  const name = (i: number) => `row ${Math.floor(i / 4) + 1}, column ${(i % 4) + 1}`;
  return {
    task: "Fill the empty squares with 1, 2, 3 and 4 so that every row, every column and every 2 by 2 box holds each number exactly once. Tap a square to change its number.",
    lines: [],
    data: { start: start.join("") },
    answer: solution,
    hints: [`There are ${blanks.length} empty squares. Start with the row or column that has the most numbers filled in.`, `${name(blanks[0])} is a ${solution[blanks[0]]}.`, `${name(blanks[1] ?? blanks[0])} is a ${solution[blanks[1] ?? blanks[0]]}, and ${name(blanks[2] ?? blanks[0])} is a ${solution[blanks[2] ?? blanks[0]]}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Which box? Some guests each make a claim about which box hides the key. Exactly one claim is true.

const GUEST_NAMES = ["Ava", "Ben", "Cleo", "Dev", "Esme", "Finn", "Gus", "Hana", "Ivo", "June"];
type Claim = { t: "in" | "notin" | "either"; a: number; b?: number };
const claimTrue = (c: Claim, where: number) => (c.t === "in" ? where === c.a : c.t === "notin" ? where !== c.a : where === c.a || where === c.b);

const whichbox: Builder = (rng, level) => {
  const boxes = level <= 2 ? 3 : level <= 4 ? 4 : 5;
  const guests = Math.min(boxes, level <= 2 ? 3 : 4);
  const letters = "ABCDE".slice(0, boxes).split("");
  let claims: Claim[] = [];
  let where = 0;
  for (let tries = 0; tries < 4000; tries++) {
    where = rng.int(0, boxes - 1);
    claims = [];
    for (let i = 0; i < guests; i++) {
      const t = rng.pick<Claim["t"]>(level <= 1 ? ["in", "notin"] : ["in", "notin", "either"]);
      const a = rng.int(0, boxes - 1);
      let b = rng.int(0, boxes - 1);
      if (b === a) b = (a + 1) % boxes;
      claims.push(t === "either" ? { t, a, b } : { t, a });
    }
    const ways = Array.from({ length: boxes }, (_, w) => w).filter((w) => claims.filter((c) => claimTrue(c, w)).length === 1);
    if (ways.length === 1 && ways[0] === where) break;
    if (tries === 3999) throw new Error("whichbox: no puzzle found");
  }
  const names = rng.sample(GUEST_NAMES, guests);
  const text = (c: Claim) => (c.t === "in" ? `"The key is in box ${letters[c.a]}."` : c.t === "notin" ? `"The key is NOT in box ${letters[c.a]}."` : `"The key is in box ${letters[c.a]} or box ${letters[c.b!]}."`);
  return {
    task: `The key to the next room is in one of ${boxes} boxes. ${names.length} guests each make a claim, but EXACTLY ONE of them is telling the truth. Which box has the key?`,
    lines: claims.map((c, i) => `${names[i]} says ${text(c)}`),
    data: { options: letters, claims },
    answer: letters[where],
    hints: [`If a claim is true, every other claim must be false. Try each box in turn and count how many claims come out true.`, `The key is NOT in box ${letters[(where + 1) % boxes]}.`, `It is not in box ${letters[(where + 1) % boxes]} or box ${letters[(where + 2) % boxes]}.`],
  };
};

// ---------------------------------------------------------------------------------------------
// Number dash: tap the numbers in order, fast. A wrong tap sends you back to the start.

const dash: Builder = (rng, level) => {
  const count = 6 + level * 2;
  const down = level >= 3 && rng.chance(0.5);
  return {
    task: `Tap every number in order, ${down ? `from ${count} DOWN to 1` : `from 1 UP to ${count}`}, before the clock runs out. A wrong tap sends you back to the start.`,
    lines: [],
    data: { count, down, order: rng.shuffle(Array.from({ length: count }, (_, i) => i + 1)) },
    answer: "DONE",
    hints: [`Start by finding the ${down ? count : 1}.`, `The ${down ? count : 1} is quick to spot. Keep your eyes moving in one direction.`, "Find the next number before you tap, not after."],
  };
};

const BUILDERS: Record<PuzzleKindId, Builder> = { cipher, combo, order, sequence, anagram, fuse, memory, oddone, codebreaker, grid, whichbox, dash };

// ---------------------------------------------------------------------------------------------
// Checking

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

export function checkPuzzle(p: Puzzle, input: string): boolean {
  if (p.kind === "order") return norm(input).replace(/[^A-Z,]/g, "") === norm(p.answer).replace(/[^A-Z,]/g, "");
  if (p.kind === "fuse") return norm(input) === norm(p.answer);
  return norm(input) === norm(p.answer);
}

/** Apply a list of presses to a fuse start state: used by the UI and the bots in the tests. */
export function fuseStart(p: Puzzle): { n: number; bits: number[] } {
  const n = p.data.n as number;
  return { n, bits: String(p.data.start).split("").map(Number) };
}

/** How many orders fit every statement of an arrangement puzzle. Always 1; the tests check it. */
export function orderSolutionCount(p: Puzzle): number {
  const items = p.data.items as string[];
  const stmts = p.data.stmts as Stmt[];
  return permutations(items).filter((perm) => stmts.every((st) => holds(perm, st))).length;
}
