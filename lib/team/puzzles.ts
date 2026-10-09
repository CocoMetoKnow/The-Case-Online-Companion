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
};

export const ALL_KINDS: PuzzleKindId[] = ["cipher", "combo", "order", "sequence", "anagram", "fuse", "memory", "oddone"];

export interface BuildContext {
  kind: PuzzleKindId;
  level: number;
  phase: PhaseDef;
  room?: RoomDef;
  objectId?: string;
  /** A one-line label such as "Lock on the Study" for the card title. */
  label?: string;
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
  return {
    kind: ctx.kind,
    level,
    title: cap(title),
    story: ambience(rng, ctx.room, ctx.phase, ctx.objectId),
    ...base,
  };
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
  // The clock chimes `hour` times. Early on the letters were pushed forward; later the house plays tricks and pushes them back.
  const dir = level >= 3 && rng.chance(0.5) ? -1 : 1;
  const text = shiftWord(word, dir * hour);
  const where = ctx.room ? ` found in the ${ctx.room.name}` : "";
  return {
    task: `Decode the message${where}. The clock has just struck ${hour} (that is your key). ${dir === 1 ? `Every letter was pushed ${hour} places forward in the alphabet; push each one back ${hour} places.` : `Every letter was pulled ${hour} places back in the alphabet; push each one forward ${hour} places.`}`,
    lines: [text],
    data: { cipher: text, shift: hour, dir },
    answer: word,
    hints: [`The word has ${word.length} letters.`, `It starts with ${word[0]}.`, `It ends with ${word[word.length - 1]} (a word you'd find around the ${ctx.room?.name ?? "house"}).`],
  };
};

// ---------------------------------------------------------------------------------------------
// Combination lock: counts in the room, read with a rule.

const COLORS = ["red", "blue", "green", "gold", "white", "black"];

const combo: Builder = (rng, level, ctx) => {
  const noun = ctx.room ? rng.pick(ctx.room.things) : "candles";
  const len = level <= 2 ? 3 : 4;
  const colors = rng.sample(COLORS, 4);
  const counts: Record<string, number> = {};
  for (const c of colors) counts[c] = rng.int(1, 4);
  const pickColor = () => rng.pick(colors);
  const allowed = level === 1 ? ["count"] : level === 2 ? ["count", "sum", "double"] : ["count", "sum", "double", "diff"];
  const digits: number[] = [];
  const rules: string[] = [];
  const order = ["first", "second", "third", "fourth"];
  for (let i = 0; i < len; i++) {
    const kind = rng.pick(allowed);
    if (kind === "count") {
      const c = pickColor();
      digits.push(counts[c]);
      rules.push(`${order[i]} digit: how many ${c} ${noun}.`);
    } else if (kind === "sum") {
      const [x, y] = rng.sample(colors, 2);
      digits.push(counts[x] + counts[y]);
      rules.push(`${order[i]} digit: the ${x} and the ${y} ${noun} added together.`);
    } else if (kind === "double") {
      const c = pickColor();
      digits.push(counts[c] * 2);
      rules.push(`${order[i]} digit: twice the number of ${c} ${noun}.`);
    } else {
      const sorted = rng.shuffle(colors).sort((p, q) => counts[q] - counts[p]);
      let x = sorted[0];
      let y = sorted[sorted.length - 1];
      if (counts[x] === counts[y]) {
        // Everything ties; fall back to a plain count so the digit is never zero by accident.
        digits.push(counts[x]);
        rules.push(`${order[i]} digit: how many ${x} ${noun}.`);
        continue;
      }
      digits.push(counts[x] - counts[y]);
      rules.push(`${order[i]} digit: the ${x} ${noun} minus the ${y} ${noun}.`);
    }
  }
  const answer = digits.join("");
  const tally = colors.map((c) => `${counts[c]} ${c}`).join(", ");
  return {
    task: `The lock wants ${len} digits. Count what you see, then read the rule for each digit.`,
    lines: [`You count ${tally} ${noun}.`, ...rules],
    data: { length: len },
    answer,
    hints: [`The ${order[0]} digit is ${digits[0]}.`, `The first two digits are ${digits.slice(0, 2).join("")}.`, `The code is ${answer.slice(0, -1)}_ (all but the last digit).`],
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
  ["Red", "Blue", "Green", "Gold", "Violet"],
  ["Rose", "Amber", "Jade", "Ivory", "Onyx"],
  ["Fox", "Owl", "Hare", "Crow", "Wolf"],
];

const order: Builder = (rng, level, ctx) => {
  const n = level <= 2 ? 3 : level <= 4 ? 4 : 5;
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
  const answer = truth.join(",");
  const lines = stmts.map((s) => stmtText(s, n));
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
  const show = level >= 3 ? 6 : 5;
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
    if (rng.chance(0.5)) {
      const a = rng.int(1, 8), d = rng.int(1, 3), k = rng.int(1, 3);
      terms = [a];
      for (let i = 1; i <= show; i++) terms.push(terms[i - 1] + d + k * (i - 1));
      rule = `the gap grows by ${k} each step`;
    } else {
      const a = rng.int(2, 5), s = rng.int(1, 4);
      terms = [a];
      for (let i = 1; i <= show; i++) terms.push(i % 2 ? terms[i - 1] * 2 : terms[i - 1] - s);
      rule = `double, then subtract ${s}, and repeat`;
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
    items = rng.sample(PRIMES, 4).map(String);
    odd = String(rng.pick(FAKE_PRIMES));
    rule = "Four are prime.";
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

const BUILDERS: Record<PuzzleKindId, Builder> = { cipher, combo, order, sequence, anagram, fuse, memory, oddone };

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
