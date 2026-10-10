import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORY_KEYS, PHASES, PREMISES, ROOM_POOL, TWISTS } from "./content.ts";
import { briefing, deduce, ending, generateCase, solvedWith, variantCount } from "./generator.ts";
import { ALL_KINDS, NEW_KINDS, gridSolutionCount, buildPuzzle, checkPuzzle, orderSolutionCount, pressGrid, shiftWord, solveFuse } from "./puzzles.ts";
import {
  MAX_MENACE,
  TRAP_ROUNDS,
  board,
  deserialize,
  hiddenIn,
  legal,
  lostInZone,
  newGame,
  phaseOf,
  reduce,
  serialize,
  totalRounds,
  type TeamState,
} from "./engine.ts";
import { playBot } from "./bot.ts";
import { Rng } from "./rng.ts";
import * as content from "./content.ts";
import { readFileSync } from "node:fs";

const NAMES = ["Ann", "Ben", "Cy", "Di"];

// ---------------------------------------------------------------------------------------------
// The case generator

test("every generated case is solvable, robust to one lost clue, and needs its sealed wings", () => {
  for (let i = 0; i < 600; i++) {
    const c = generateCase(`solve-${i}`);
    assert.ok(solvedWith(c, c.clues), `case ${i} not solvable`);
    assert.ok(solvedWith(c, c.clues.filter((x) => x.tier === 0)), `case ${i}: primary clues do not solve it`);
    for (const x of c.clues) assert.ok(solvedWith(c, c.clues.filter((y) => y !== x)), `case ${i}: losing ${x.id} breaks it`);
    for (const room of c.lockedRooms) assert.ok(!solvedWith(c, c.clues.filter((y) => y.where !== room)), `case ${i}: ${room} is optional`);
    // The deduction never contradicts the truth, whatever subset of clues has been found.
    const rng = new Rng(i);
    const some = rng.sample(c.clues, rng.int(0, c.clues.length));
    const d = deduce(c.universe, some);
    for (const k of CATEGORY_KEYS) assert.ok(d.cands[k].includes(c.solution[k]), `case ${i}: truth eliminated in ${k}`);
  }
});

test("the map is connected without opening any sealed wing, and each wing has two doors", () => {
  for (let i = 0; i < 300; i++) {
    const c = generateCase(`map-${i}`);
    const open = c.map.filter((n) => !n.locked);
    const seen = new Set(["foyer"]);
    const q = ["foyer"];
    while (q.length) {
      const id = q.pop()!;
      for (const l of c.map.find((n) => n.id === id)!.links) {
        const n = c.map.find((m) => m.id === l)!;
        if (!n.locked && !seen.has(l)) (seen.add(l), q.push(l));
      }
    }
    assert.equal(seen.size, open.length);
    for (const r of c.lockedRooms) assert.ok(c.map.find((n) => n.id === r)!.links.length >= 2);
    assert.equal(c.map.filter((n) => n.kind === "zone").length, 2);
    assert.equal(c.map.filter((n) => n.locked).length, c.twist.mods.lockedCount ?? 2);
  }
});

test("the same seed always builds the same case, different seeds build different ones", () => {
  assert.deepEqual(generateCase("amber-1"), generateCase("amber-1"));
  const sols = new Set<string>();
  for (let i = 0; i < 400; i++) sols.add(JSON.stringify(generateCase(`v-${i}`).solution));
  assert.ok(sols.size > 390, `only ${sols.size} distinct solutions in 400 runs`);
});

test("at least 99 storylines: every setting meets every twist", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 4000; i++) {
    const c = generateCase(`story-${i}`);
    seen.add(`${c.story.premiseId}/${c.story.twistId}`);
  }
  assert.equal(PREMISES.length * TWISTS.length, 108);
  assert.ok(seen.size >= 99, `only ${seen.size} storylines seen`);
  assert.ok(variantCount().twistedStorylines >= 99);
  const c = generateCase("story-0");
  assert.ok(briefing(c).intro.length > 40 && ending(c).includes(" took "));
});

// ---------------------------------------------------------------------------------------------
// Puzzles

test("every puzzle has exactly one right answer, at every level, hour and room", () => {
  const rng = new Rng("puzzles");
  for (let i = 0; i < 3000; i++) {
    const kind = ALL_KINDS[i % ALL_KINDS.length];
    const room = ROOM_POOL[i % ROOM_POOL.length];
    const p = buildPuzzle(rng, { kind, level: 1 + (i % 5), phase: PHASES[i % PHASES.length], room, objectId: room.objects[i % 3].id });
    assert.ok(checkPuzzle(p, p.answer), `${kind} rejects its own answer`);
    assert.ok(!checkPuzzle(p, "NOPE"), `${kind} accepts nonsense`);
    assert.equal(p.hints.length, 3);
    if (kind === "order") assert.equal(orderSolutionCount(p), 1);
    if (kind === "cipher") {
      const d = p.data as { cipher: string; shift: number; dir: number; backwards?: boolean; rolling?: boolean };
      const plain = d.rolling
        ? d.cipher.split("").map((c, k) => shiftWord(c, -(d.shift + k))).join("")
        : shiftWord(d.backwards ? d.cipher.split("").reverse().join("") : d.cipher, -d.dir * d.shift);
      assert.equal(plain, p.answer);
      assert.equal(d.shift, PHASES[i % PHASES.length].hour, "the cipher key is the hour of the night");
    }
    if (kind === "sequence") {
      const o = p.data.options as string[];
      assert.equal(new Set(o).size, 4);
      assert.ok(o.includes(p.answer));
    }
    if (kind === "fuse") {
      const d = p.data as { n: number; start: string };
      let g = d.start.split("").map(Number);
      const sol = solveFuse(g, d.n);
      assert.ok(sol);
      for (const c of sol!) g = pressGrid(g, d.n, c);
      assert.ok(g.every((b) => b === 0));
    }
  }
});

test("puzzles depend on the room and the hour", () => {
  const lib = ROOM_POOL.find((r) => r.id === "library")!;
  const cel = ROOM_POOL.find((r) => r.id === "cellar")!;
  const a = buildPuzzle(new Rng(1), { kind: "anagram", level: 3, phase: PHASES[0], room: lib });
  const b = buildPuzzle(new Rng(1), { kind: "anagram", level: 3, phase: PHASES[0], room: cel });
  assert.ok(lib.words.includes(a.answer) && cel.words.includes(b.answer));
  assert.ok(a.story.includes("Library") && b.story.includes("Wine Cellar"));
  const early = buildPuzzle(new Rng(2), { kind: "cipher", level: 1, phase: PHASES[1], room: lib });
  const late = buildPuzzle(new Rng(2), { kind: "cipher", level: 1, phase: PHASES[4], room: lib });
  assert.notEqual(early.story, late.story);
  assert.notEqual((early.data as { shift: number }).shift, (late.data as { shift: number }).shift);
});

// ---------------------------------------------------------------------------------------------
// The rules of peril

function fresh(n = 3, seed = "peril-1"): TeamState {
  return newGame(seed, NAMES.slice(0, n));
}
const wrongFor = (s: TeamState) => {
  const g = {} as Record<(typeof CATEGORY_KEYS)[number], string>;
  for (const k of CATEGORY_KEYS) g[k] = s.game.solution[k];
  const k = CATEGORY_KEYS[0];
  g[k] = s.game.universe[k].find((x) => x !== s.game.solution[k])!;
  return g;
};
const truth = (s: TeamState) => ({ ...s.game.solution });
/** Skip any waiting notices. */
function clear(s: TeamState): TeamState {
  while (s.notices.length && s.status === "play") s = reduce(s, { type: "ack" });
  return s;
}
function withEvidencePuzzle(s: TeamState, roomId = s.game.map.find((n) => n.kind === "room" && !n.locked)!.id): TeamState {
  const clue = hiddenIn(s, roomId)[0];
  const puzzle = buildPuzzle(new Rng(3), { kind: "combo", level: 1, phase: PHASES[0] });
  const next = { ...s, players: s.players.map((p, i) => (i === s.turn ? { ...p, at: roomId } : p)), pending: { type: "puzzle" as const, puzzle, source: { kind: "evidence" as const, clueId: clue.id }, critical: false, shown: 0, free: 0, who: s.turn } };
  return next;
}

test("a wrong final accusation is an immediate Game Over, a right one wins", () => {
  const s = clear(fresh());
  const lost = reduce(s, { type: "accuse", guess: wrongFor(s) });
  assert.equal(lost.status, "lost");
  assert.equal(lost.ending?.reason, "accusation");
  assert.ok(lost.ending!.lines.join(" ").includes("Game Over: You Lose"));
  const won = reduce(s, { type: "accuse", guess: truth(s) });
  assert.equal(won.status, "won");
  // Nothing more can happen after the end.
  assert.equal(reduce(lost, { type: "end" }), lost);
});

test("failing an evidence puzzle traps the detective and permanently loses a clue into a danger zone", () => {
  let s = clear(fresh());
  const first = hiddenIn(s, s.game.map.find((n) => n.kind === "room" && !n.locked)!.id)[0];
  // Give the team one clue to lose.
  s.held = [first.id];
  s.clueStatus[first.id] = "held";
  s = withEvidencePuzzle({ ...s });
  const who = s.turn;
  const f = clear(reduce(s, { type: "submit", input: "WRONG" }));
  assert.ok(f.players[who].trapped === TRAP_ROUNDS || f.players[who].trapped === TRAP_ROUNDS - 1, "trapped");
  assert.equal(f.held.length, 0, "evidence lost");
  assert.equal(f.clueStatus[first.id], "lost");
  assert.ok(f.game.map.find((n) => n.id === f.lostIn[first.id])?.kind === "zone");
  assert.equal(f.menace, s.menace + 1);
  assert.ok(f.turn !== who, "the trapped detective's turn is over");
});

test("a trapped detective is skipped, and breaks free after the trap runs out at a price", () => {
  let s = clear(fresh(2));
  const a = s.turn;
  s = withEvidencePuzzle({ ...s });
  s = clear(reduce(s, { type: "submit", input: "WRONG" }));
  const m0 = s.menace;
  assert.equal(s.players[a].trapped > 0, true);
  // Everyone else just ends their turn until the trap runs out.
  let guard = 0;
  while (s.players[a].trapped > 0 && s.status === "play" && guard++ < 40) {
    s = clear(s);
    if (s.pending) break;
    s = clear(reduce(s, { type: "end" }));
  }
  assert.equal(s.players[a].trapped, 0);
  assert.ok(s.menace >= m0 + 1, "breaking free makes noise");
});

test("a teammate can rescue a trapped detective, and a failed rescue traps the rescuer too (except the Medic)", () => {
  let s = clear(fresh(3));
  const [p0, p1] = [s.players[0], s.players[1]];
  void p0;
  // Detective 1 is trapped in the Foyer; it is detective 0's turn, standing there too.
  s.players = s.players.map((p, i) => (i === 1 ? { ...p, trapped: 3 } : p));
  s.players[0].role = "inspector";
  assert.equal(legal(s).rescuable.length, 1);
  const r = reduce(s, { type: "rescue", target: p1.id });
  assert.equal(r.pending?.type, "puzzle");
  const ok = clear(reduce(r, { type: "submit", input: (r.pending as { puzzle: { answer: string } }).puzzle.answer }));
  assert.equal(ok.players[1].trapped, 0);
  assert.equal(ok.stats.rescues, 1);
  const bad = clear(reduce(r, { type: "submit", input: "WRONG" }));
  assert.ok(bad.players[0].trapped > 0, "rescuer caught");
  // The Medic's rescue cannot backfire.
  const s2 = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, role: "medic" } : p)) };
  const r2 = reduce(s2, { type: "rescue", target: p1.id });
  const bad2 = clear(reduce(r2, { type: "submit", input: "WRONG" }));
  assert.equal(bad2.players[0].trapped, 0);
});

test("a failed critical lock is Game Over; a skeleton key skips the risk", () => {
  let s = clear(fresh(3, "lock-case"));
  const locked = s.game.lockedRooms[0];
  const door = s.game.map.find((n) => n.id === locked)!.links.find((l) => s.game.map.find((m) => m.id === l)!.kind === "room")!;
  s.players = s.players.map((p, i) => (i === s.turn ? { ...p, at: door } : p));
  assert.ok(legal(s).unlockable.some((n) => n.id === locked));
  const u = reduce(s, { type: "unlock", room: locked });
  assert.equal(u.pending?.type, "puzzle");
  assert.equal((u.pending as { critical: boolean }).critical, true);
  const dead = reduce(u, { type: "submit", input: "WRONG" });
  assert.equal(dead.status, "lost");
  assert.equal(dead.ending?.reason, "lock");
  const keyed = { ...s, keys: 1 };
  const k = clear(reduce(keyed, { type: "unlock", room: locked, useKey: true }));
  assert.ok(k.unlocked.includes(locked));
  assert.equal(k.keys, 0);
  // And the right answer opens it.
  const good = clear(reduce(u, { type: "submit", input: (u.pending as { puzzle: { answer: string } }).puzzle.answer }));
  assert.ok(good.unlocked.includes(locked));
});

test("lost evidence can be recovered from a danger zone, and failing there is punished harder", () => {
  let s = clear(fresh(3, "zone-case"));
  const zone = s.game.map.find((n) => n.kind === "zone")!;
  const clue = s.game.clues[0];
  s.clueStatus[clue.id] = "lost";
  s.lostIn[clue.id] = zone.id;
  s.players = s.players.map((p, i) => (i === s.turn ? { ...p, at: zone.id } : p));
  assert.equal(legal(s).canRecover, true);
  assert.equal(legal(s).canInvestigate, false, "you cannot idly search a danger zone");
  const r = reduce(s, { type: "recover" });
  assert.equal(r.pending?.type, "puzzle");
  const level = (r.pending as { puzzle: { level: number } }).puzzle.level;
  assert.ok(level >= 3, "recovery is hard");
  const ok = clear(reduce(r, { type: "submit", input: (r.pending as { puzzle: { answer: string } }).puzzle.answer }));
  assert.ok(ok.held.includes(clue.id));
  assert.equal(lostInZone(ok, zone.id).length, 0);
  // Failure: trapped in the zone, another clue lost, menace spikes by at least 2.
  const other = s.game.clues[1];
  const held = { ...r, held: [other.id], clueStatus: { ...r.clueStatus, [other.id]: "held" as const } };
  const bad = clear(reduce(held, { type: "submit", input: "WRONG" }));
  assert.ok(bad.menace >= s.menace + 2);
  assert.equal(bad.clueStatus[other.id], "lost");
  assert.ok(bad.players[s.turn].trapped > 0);
  assert.equal(bad.players[s.turn].at, zone.id);
});

test("the menace track reaching the top ends the game", () => {
  const s = clear(fresh());
  const near = { ...s, menace: MAX_MENACE - 1, held: [], pending: withEvidencePuzzle(s).pending };
  const dead = reduce(near, { type: "submit", input: "WRONG" });
  assert.equal(dead.status, "lost");
  assert.equal(dead.ending?.reason, "menace");
});

test("if every detective is trapped the game is over", () => {
  let s = clear(fresh(2));
  s.players = s.players.map((p, i) => (i === 1 ? { ...p, trapped: 3 } : p));
  s = withEvidencePuzzle({ ...s });
  const dead = reduce(s, { type: "submit", input: "WRONG" });
  assert.equal(dead.status, "lost");
  assert.equal(dead.ending?.reason, "trapped");
});

test("the night moves on, the Stalker arrives as a critical task, and dawn ends the game", () => {
  let s = clear(fresh(2, "night-case"));
  assert.equal(phaseOf(s).id, "midnight");
  let sawStalker = false;
  let guard = 0;
  while (s.status === "play" && guard++ < 400) {
    s = clear(s);
    if (s.pending?.type === "puzzle" && s.pending.source.kind === "stalker") {
      sawStalker = true;
      assert.equal(s.pending.critical, true);
      assert.ok(s.pending.free >= 1, "criticals come with a free hint");
      // Survive it, then keep passing.
      s = reduce(s, { type: "submit", input: s.pending.puzzle.answer });
      continue;
    }
    if (s.pending) {
      s = reduce(s, { type: "retreat" });
      continue;
    }
    s = reduce(s, { type: "end" });
  }
  assert.ok(sawStalker, "the Stalker appeared");
  assert.equal(s.status, "lost");
  assert.ok(["dawn", "menace"].includes(s.ending!.reason), `ended by ${s.ending!.reason}`);
  assert.ok(s.round <= totalRounds(s) + 1);
});

test("the Stalker cannot be walked away from, and failing it is Game Over", () => {
  let s = clear(fresh(3, "stalk"));
  s.stalkerDue = true;
  s = reduce(s, { type: "end" });
  s = reduce(clear(s), { type: "end" });
  // Force the stalker onto the next player directly.
  let t = clear(fresh(3, "stalk"));
  t.stalkerDue = true;
  t.ap = 0;
  t = reduce({ ...t, notices: [{ tone: "info", title: "x", lines: [] }] }, { type: "ack" });
  assert.equal(t.pending?.type, "puzzle");
  assert.equal((t.pending as { source: { kind: string } }).source.kind, "stalker");
  const c = clear(t);
  assert.equal(reduce(c, { type: "retreat" }), c, "no retreat");
  const dead = reduce(c, { type: "submit", input: "WRONG" });
  assert.equal(dead.status, "lost");
  assert.equal(dead.ending?.reason, "stalker");
});

test("hints cost tokens, teammates in the room give free ones", () => {
  let s = clear(fresh(3));
  const room = s.game.map.find((n) => n.kind === "room" && !n.locked)!.id;
  s.players = s.players.map((p) => ({ ...p, at: room, role: "scout" }));
  s = withEvidencePuzzle({ ...s }, room);
  (s.pending as { free: number }).free = 2;
  const h0 = s.hints;
  let h = reduce(s, { type: "hint" });
  h = reduce(h, { type: "hint" });
  assert.equal(h.hints, h0, "two free hints from teammates");
  h = reduce(h, { type: "hint" });
  assert.equal(h.hints, h0 - 1);
  assert.equal((h.pending as { shown: number }).shown, 3);
  assert.equal(reduce(h, { type: "hint" }), h, "no more hints than the puzzle has");
});

test("a witness card gives a true clue and never undoes a sealed wing", () => {
  for (let i = 0; i < 60; i++) {
    let s = clear(newGame(`wit-${i}`, NAMES.slice(0, 3)));
    // Take the witness card off the intel deck and into play.
    const idx = s.decks.intel.findIndex((c) => c.type === "witness");
    const card = s.decks.intel.splice(idx, 1)[0];
    s.decks.intel.unshift(card);
    s.decks.environment = s.decks.environment.filter((c) => c.type !== "hazard" && c.type !== "ambush");
    s = reduce(s, { type: "investigate" });
    if (s.pending?.type !== "draft") continue;
    const k = s.pending.offers.findIndex((o) => o.deck === "intel");
    if (k < 0) continue;
    const m0 = s.menace;
    s = clear(reduce(s, { type: "draft", index: k }));
    assert.equal(s.bonus.length, 1);
    const c = s.bonus[0];
    assert.ok(!c.items!.includes(s.game.solution[c.category!]), "the witness never lies");
    assert.ok(!s.game.vaultItems.some((v) => v.category === c.category && v.item === c.items![0]));
    assert.ok(s.menace >= m0 + 1 || s.status !== "play");
  }
});

test("save and load keep the whole run, and replaying the same actions gives the same game", () => {
  const a = playBot("det-1", NAMES.slice(0, 3), 0.9, 200);
  const b = playBot("det-1", NAMES.slice(0, 3), 0.9, 200);
  assert.equal(serialize(a.state), serialize(b.state));
  const round = deserialize(serialize(a.state));
  assert.deepEqual(round, JSON.parse(serialize(a.state)));
  assert.equal(deserialize("{nope"), null);
  assert.equal(deserialize(null), null);
});

test("a deduction board built only from found clues never lies", () => {
  const r = playBot("board-1", NAMES.slice(0, 4), 0.95, 120);
  const d = board(r.state);
  for (const k of CATEGORY_KEYS) assert.ok(d.cands[k].includes(r.state.game.solution[k]));
});

test("a careful team wins: scripted detectives with perfect puzzle skill solve almost every case, in every team size", () => {
  for (const n of [2, 3, 4, 6]) {
    let wins = 0;
    const runs = 40;
    for (let i = 0; i < runs; i++) {
      const r = playBot(`win-${n}-${i}`, ["A", "B", "C", "D", "E", "F"].slice(0, n), 1);
      assert.notEqual(r.state.status, "play", "the run always ends");
      if (r.state.status === "won") wins++;
    }
    assert.ok(wins / runs >= 0.9, `${n} players: only ${wins}/${runs} won`);
  }
});

test("and the danger is real: sloppy play usually loses", () => {
  let wins = 0;
  const runs = 40;
  const reasons = new Set<string>();
  for (let i = 0; i < runs; i++) {
    const r = playBot(`sloppy-${i}`, NAMES.slice(0, 3), 0.7);
    if (r.state.status === "won") wins++;
    else reasons.add(r.state.ending!.reason);
  }
  assert.ok(wins / runs < 0.4, `sloppy teams won ${wins}/${runs}`);
  assert.ok(reasons.size >= 2, `losses came from ${[...reasons].join(", ")}`);
});

// ---------------------------------------------------------------------------------------------
// Family friendly

const BANNED = /\b(kill\w*|murder\w*|dead|death|dies|died|dying|blood\w*|gun|guns|revolver|dagger|knife|knives|poison\w*|stab\w*|corpse|body|bodies|coffin|crypt|victim\w*|stalk\w*|weapon\w*|shoot\w*|shot|gore|bomb\w*|hang\w*|strangl\w*|suffocat\w*|drown\w*|burn\w*|burning|haunt\w*|ghost\w*|demon\w*|damn\w*|hell|crap|sex\w*|drunk\w*|cleaver|menace|ambush|attack\w*|fatal|lethal|torture|scream\w*)\b/i;

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

test("everything the game can say is family friendly", () => {
  const texts: string[] = [];
  // 1. Every content pool.
  for (const v of Object.values(content)) if (typeof v !== "function") texts.push(...strings(v));
  // 2. Every generated clue, briefing and ending.
  for (let i = 0; i < 400; i++) {
    const c = generateCase(`kind-${i}`);
    for (const cl of c.clues) texts.push(cl.text, cl.short);
    const b = briefing(c);
    texts.push(b.intro, b.title, b.teaser, ending(c));
    for (const n of c.map) texts.push(n.name);
  }
  // 3. Everything the engine says while real runs are played, wins and losses alike.
  for (let i = 0; i < 120; i++) {
    const skill = [1, 0.85, 0.6][i % 3];
    const r = playBot(`kind-run-${i}`, NAMES.slice(0, 2 + (i % 3)), skill);
    texts.push(...r.state.log);
    if (r.state.ending) texts.push(r.state.ending.title, ...r.state.ending.lines, r.state.ending.reveal);
  }
  // Every notice and card the engine can show, by replaying runs and reading each one as it appears.
  for (let i = 0; i < 60; i++) {
    let s = newGame(`kind-notice-${i}`, NAMES.slice(0, 3));
    const rng = new Rng(i);
    for (let step = 0; step < 600 && s.status === "play"; step++) {
      for (const n of s.notices) texts.push(n.title, ...n.lines);
      if (s.pending?.type === "draft") for (const o of s.pending.offers) texts.push(o.title, o.blurb);
      if (s.pending?.type === "puzzle") texts.push(s.pending.puzzle.title, s.pending.puzzle.story, s.pending.puzzle.task, ...s.pending.puzzle.lines, ...s.pending.puzzle.hints);
      const a = s.notices.length ? { type: "ack" as const } : s.pending?.type === "draft" ? { type: "draft" as const, index: rng.int(0, s.pending.offers.length - 1) } : s.pending?.type === "puzzle" ? { type: "submit" as const, input: rng.chance(0.6) ? s.pending.puzzle.answer : "x" } : legal(s).moves.length && rng.chance(0.4) ? { type: "move" as const, to: rng.pick(legal(s).moves).id } : legal(s).canInvestigate ? { type: "investigate" as const } : { type: "end" as const };
      const next = reduce(s, a);
      s = next === s ? reduce(s, { type: "end" }) : next;
    }
    if (s.ending) texts.push(s.ending.title, ...s.ending.lines);
  }
  // 4. The words written straight into the screens.
  for (const f of ["../../components/team/TeamMode.tsx", "../../components/team/puzzle-widgets.tsx", "../../components/team/TeamOnline.tsx"]) {
    texts.push(readFileSync(new URL(f, import.meta.url), "utf8").replace(/\b(menace|stalker|danger|ambush)\b[A-Za-z_]*/g, ""));
  }
  const hits = new Set<string>();
  for (const t of texts) {
    if (/^[a-z0-9-]+$/.test(t)) continue; // internal ids are never shown
    const m = t.match(BANNED);
    if (m) hits.add(`${m[0]} <- ${t.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + 40)}`);
  }
  assert.deepEqual([...hits], []);
});

// ---------------------------------------------------------------------------------------------
// Online play

import { MAX_SEATS, applyIntent, joinLobby, mayAct, newRoomCode, normalizeCode, redact, roomId, type HostTable } from "./online.ts";
import { nextAction } from "./bot.ts";
import { clueById } from "./engine.ts";

test("a guest's copy of the table never contains the answer, the unfound clues or the decks", () => {
  for (let i = 0; i < 40; i++) {
    const r = playBot(`redact-${i}`, NAMES.slice(0, 3), 0.9, 60 + i);
    const s = r.state;
    const g = redact(s);
    assert.deepEqual(g.game.solution, {});
    assert.deepEqual(g.game.profile, {});
    assert.equal(g.decks.environment.length + g.decks.intel.length + g.decks.evidence.length, 0);
    if (g.pending?.type === "puzzle") {
      assert.equal(g.pending.puzzle.answer, "");
      assert.ok(g.pending.puzzle.hints.every((h, k) => (k < g.pending!.shown ? true : h === "")), "unrevealed hints are blank");
    }
    for (const c of g.game.clues) if (s.clueStatus[c.id] === "hidden") assert.equal(c.text + c.short, "");
    // And it is enough to play: the same rooms, clues, deduction board and legal moves as the host sees.
    assert.deepEqual(board(g), board(s));
    assert.deepEqual(legal(g), legal(s));
    for (const n of g.game.map) assert.deepEqual(hiddenIn(g, n.id).map((c) => c.id), hiddenIn(s, n.id).map((c) => c.id));
    for (const id of s.held) assert.equal(clueById(g, id)?.text, clueById(s, id)?.text);
    assert.ok(!JSON.stringify(g).includes(JSON.stringify(s.game.solution)), "no solution on the wire");
    assert.ok(JSON.stringify(g).length < 60_000, `redacted table is ${JSON.stringify(g).length} bytes`);
  }
});

test("only the detective whose turn it is can act, but the host can always step in", () => {
  const s = clear(newGame("online-1", NAMES.slice(0, 3)));
  const seats = ["host", "p2", "p3"];
  assert.equal(s.turn, 0);
  assert.equal(mayAct(s, seats, "host", "host", { type: "end" }), true);
  assert.equal(mayAct(s, seats, "p2", "host", { type: "end" }), false);
  assert.equal(mayAct(s, seats, "stranger", "host", { type: "end" }), false);
  const t: HostTable = { state: s, seats, hostPid: "host", seen: {} };
  // p2 tries to end someone else's turn: ignored.
  assert.equal(applyIntent(t, { t: "tm:act", pid: "p2", n: 1, action: { type: "end" } }).changed, false);
  // The host acts for seat 0, and p2 is next.
  const r = applyIntent(t, { t: "tm:act", pid: "host", n: 1, action: { type: "end" } });
  assert.equal(r.changed, true);
  const after = { ...r.table, state: clear(r.table.state) };
  assert.equal(after.state.turn, 1);
  assert.equal(applyIntent(after, { t: "tm:act", pid: "p2", n: 1, action: { type: "end" } }).changed, true);
  // The same message twice is applied once; junk is ignored.
  assert.equal(applyIntent(r.table, { t: "tm:act", pid: "host", n: 1, action: { type: "end" } }).changed, false);
  assert.equal(applyIntent(after, { t: "tm:act", pid: "p2", n: 5, action: { type: "bogus" } as never }).changed, false);
  assert.equal(applyIntent(after, { t: "tm:act", pid: "p2", n: 6, action: { type: "set", s: null } as never }).changed, false);
});

test("a whole online game: guests send intents to the host, who sends back redacted tables, and the team wins", () => {
  const seats = ["h", "a", "b", "c"];
  let table: HostTable = { state: newGame("online-win", ["H", "A", "B", "C"]), seats, hostPid: "h", seen: {} };
  const counters: Record<string, number> = {};
  const views: Record<string, TeamState> = {};
  const rng = new Rng("online-bot");
  let steps = 0;
  const publish = () => seats.forEach((p) => (views[p] = p === "h" ? table.state : redact(table.state)));
  publish();
  while (table.state.status === "play" && steps++ < 4000) {
    // Whoever's turn it is looks at THEIR copy of the table and decides, exactly like a phone would.
    const turnPid = seats[table.state.turn];
    const view = views[turnPid];
    let action;
    if (view.notices.length) action = { type: "ack" as const };
    else if (view.pending?.type === "puzzle") action = { type: "submit" as const, input: table.state.pending!.type === "puzzle" ? (table.state.pending as { puzzle: { answer: string } }).puzzle.answer : "" };
    else action = nextAction(view, rng, 1);
    const n = (counters[turnPid] = (counters[turnPid] ?? 0) + 1);
    // An impostor tries the same move first and gets nowhere.
    const impostor = seats.find((p) => p !== turnPid && p !== "h")!;
    assert.equal(applyIntent(table, { t: "tm:act", pid: impostor, n: 999 + steps, action }).changed, false);
    const res = applyIntent(table, { t: "tm:act", pid: turnPid, n, action });
    table = res.table;
    if (res.changed) publish();
  }
  assert.equal(table.state.status, "won", `${table.state.status} ${table.state.ending?.reason} steps ${steps} round ${table.state.round}`);
  assert.ok(!views["a"].game.solution.suspect);
});

test("room codes are easy to read out, and the lobby keeps names apart", () => {
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = newRoomCode();
    assert.match(c, /^[A-HJ-NP-Z2-9]{5}$/);
    codes.add(c);
  }
  assert.ok(codes.size > 190);
  assert.equal(normalizeCode(" tm-ab c23 "), "ABC23");
  assert.equal(roomId("abc23"), "tmABC23");
  let r = joinLobby([], "p1", "Sam");
  r = joinLobby(r, "p2", "Sam");
  assert.deepEqual(r.map((x) => x.name), ["Sam", "Sam 2"]);
  assert.equal(joinLobby(r, "p1", "Samuel")[0].name, "Samuel");
  for (let i = 0; i < 10; i++) r = joinLobby(r, `x${i}`, `P${i}`);
  assert.equal(r.length, MAX_SEATS);
});


// ---------------------------------------------------------------------------------------------
// Harder puzzles, the clock and the newer mini-games

test("the new mini-games always have exactly one right answer", () => {
  const fb = (code: string, g: string) => {
    let place = 0, wrong = 0;
    for (let i = 0; i < g.length; i++) (g[i] === code[i] ? place++ : code.includes(g[i]) && wrong++);
    return `${place}/${wrong}`;
  };
  for (let i = 0; i < 400; i++) {
    const level = 1 + (i % 5);
    const phase = PHASES[i % PHASES.length];
    const room = ROOM_POOL[i % ROOM_POOL.length];
    const rng = new Rng(9000 + i);
    const cb = buildPuzzle(rng, { kind: "codebreaker", level, phase, room });
    const len = cb.answer.length;
    const guesses = cb.data.guesses as { guess: string; place: number; wrong: number }[];
    assert.ok(guesses.length >= 2, "code breaker needs notes");
    let alive = 0;
    const rec = (cur: string) => {
      if (cur.length === len) {
        if (guesses.every((g) => fb(cur, g.guess) === `${g.place}/${g.wrong}`)) alive++;
        return;
      }
      for (let d = 0; d < 10; d++) if (!cur.includes(String(d))) rec(cur + d);
    };
    rec("");
    assert.equal(alive, 1, `code breaker ${i} has ${alive} fits`);
    assert.ok(guesses.every((g) => g.guess !== cb.answer), "notes never contain the answer");

    const gr = buildPuzzle(rng, { kind: "grid", level, phase, room });
    assert.equal(gridSolutionCount(gr), 1);
    assert.ok(String(gr.data.start).includes("0"), "grid has blanks");

    const wb = buildPuzzle(rng, { kind: "whichbox", level, phase, room });
    const claims = wb.data.claims as { t: string; a: number; b?: number }[];
    const letters = wb.data.options as string[];
    const truths = letters.map((_, w) => claims.filter((c) => (c.t === "in" ? w === c.a : c.t === "notin" ? w !== c.a : w === c.a || w === c.b)).length);
    assert.equal(truths.filter((t) => t === 1).length, 1);
    assert.equal(letters[truths.indexOf(1)], wb.answer);

    const d = buildPuzzle(rng, { kind: "dash", level, phase, room });
    assert.ok(d.timeLimit && d.timeLimit >= 20, "dash is always timed");
    assert.ok(checkPuzzle(d, "DONE") && !checkPuzzle(d, "TIME-UP"));
  }
  assert.equal(NEW_KINDS.length, 4);
});

test("some puzzles run against the clock, harder ones more often, and memory never does", () => {
  let timed = 0, easyTimed = 0, n = 0;
  for (let i = 0; i < 600; i++) {
    const kind = ALL_KINDS[i % ALL_KINDS.length];
    const level = 1 + (i % 5);
    const p = buildPuzzle(new Rng(i), { kind, level, phase: PHASES[i % PHASES.length], room: ROOM_POOL[0], critical: i % 7 === 0 });
    if (kind === "memory") assert.equal(p.timeLimit, undefined);
    if (level === 1 && kind !== "dash") easyTimed += p.timeLimit ? 1 : 0;
    if (p.timeLimit) timed++;
    n++;
  }
  assert.equal(easyTimed, 0, "level 1 puzzles are never rushed");
  assert.ok(timed > n * 0.2 && timed < n * 0.7, `timed share ${timed / n}`);
});

test("combination locks cover many colours and rules, so a lucky guess is hopeless", () => {
  const rule = (p: ReturnType<typeof buildPuzzle>) => p.lines.filter((l) => l.includes("digit:")).length;
  const hard = buildPuzzle(new Rng(5), { kind: "combo", level: 5, phase: PHASES[2], room: ROOM_POOL[0] });
  assert.equal(String(hard.answer).length, 5);
  assert.equal(rule(hard), 5);
  const tally = hard.lines[0].split(",").length;
  assert.ok(tally >= 7, "seven colours to count at the top level");
  const easy = buildPuzzle(new Rng(5), { kind: "combo", level: 1, phase: PHASES[0], room: ROOM_POOL[0] });
  assert.equal(String(easy.answer).length, 3);
});

test("level 4 and 5 ciphers can be backwards or use a rolling key, and still decode", () => {
  let backwards = 0, rolling = 0;
  for (let i = 0; i < 200; i++) {
    const lvl = 4 + (i % 2);
    const p = buildPuzzle(new Rng(i), { kind: "cipher", level: lvl, phase: PHASES[1 + (i % 4)], room: ROOM_POOL[i % ROOM_POOL.length] });
    const d = p.data as { cipher: string; shift: number; dir: number; backwards?: boolean; rolling?: boolean };
    let plain: string;
    if (d.rolling) { rolling++; plain = d.cipher.split("").map((c, k) => shiftWord(c, -(d.shift + k))).join(""); }
    else {
      const t = d.backwards ? d.cipher.split("").reverse().join("") : d.cipher;
      if (d.backwards) backwards++;
      plain = shiftWord(t, -d.dir * d.shift);
    }
    assert.equal(plain, p.answer);
  }
  assert.ok(backwards > 10 && rolling > 10);
});
