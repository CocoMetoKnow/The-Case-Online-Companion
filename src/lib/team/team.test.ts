import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORY_KEYS, PHASES, PREMISES, ROOM_POOL, TWISTS } from "./content.ts";
import { briefing, deduce, ending, generateCase, solvedWith, variantCount } from "./generator.ts";
import { ALL_KINDS, buildPuzzle, checkPuzzle, orderSolutionCount, pressGrid, shiftWord, solveFuse } from "./puzzles.ts";
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
  assert.ok(briefing(c).intro.length > 40 && ending(c).includes(c.solution.suspect === "" ? "?" : " killed "));
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
      const d = p.data as { cipher: string; shift: number; dir: number };
      assert.equal(shiftWord(d.cipher, -d.dir * d.shift), p.answer);
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
