/**
 * Team Mode case generator and deduction solver.
 *
 * generateCase(seed) builds a whole run from one seed:
 *   - the hidden solution (culprit, scene, weapon, motive, time of death),
 *   - a storyline (12 settings x 9 twists = 108, each independent of the solution),
 *   - the mansion map (rooms, locked wings, danger zones),
 *   - the clue pool, laid out so that the logic chain always solves the case.
 *
 * The rules of the deduction (what the solver and the players both know):
 *   1. Every guest has exactly one secret motive, and no two guests share one. The culprit's secret
 *      is the motive for the crime ("link" clues reveal a guest's secret).
 *   2. The culprit was in the crime scene at the time of death. A "sighting" of a guest in some other
 *      room at that exact time clears them, once the time and scene are known.
 *   3. "exclude" clues rule items out, "oneof" clues narrow a category to a short list.
 *
 * Guarantees (checked by the tests over thousands of seeds):
 *   - all clues together leave exactly one possibility in every category,
 *   - losing any single clue still leaves the case solvable,
 *   - the locked wings hold clues the case cannot be solved without (so the critical tasks matter).
 */
import { Rng } from "./rng.ts";
import {
  CATEGORY_KEYS,
  MOTIVE_POOL,
  PREMISES,
  ROOM_POOL,
  SUSPECT_POOL,
  TIME_POOL,
  TREASURE_POOL,
  TWISTS,
  VICTIM_POOL,
  WEAPON_POOL,
  ZONE_POOL,
  type CategoryKey,
  type Item,
  type MotiveDef,
  type RoomDef,
  type TwistDef,
  type ZoneDef,
} from "./content.ts";

export type Universe = Record<CategoryKey, string[]>;
export type Cands = Record<CategoryKey, string[]>;

export type ClueKind = "exclude" | "oneof" | "sighting" | "link";

export interface Clue {
  id: string;
  kind: ClueKind;
  /** exclude: the items this rules out. oneof: the only items still possible. */
  category?: CategoryKey;
  items?: string[];
  /** sighting: this guest was in this room at this time. link: this guest's secret is this motive. */
  suspect?: string;
  room?: string;
  time?: string;
  motive?: string;
  /** The room where the clue is found, and the object in it that hides it. */
  where: string;
  object: string;
  /** What the detective reads on finding it. */
  text: string;
  /** The line kept on the deduction board. */
  short: string;
  /** Stored in a locked wing. */
  vault?: boolean;
  /** Pure texture. It rules nothing out. */
  noise?: boolean;
  /** Handed out by a witness card, not found in a room. */
  bonus?: boolean;
  /** 0 = a primary find (the primary clues alone solve the case), 1 = a cross-check that keeps one lost clue from ending it. */
  tier: 0 | 1;
}

export interface MapNode {
  id: string;
  kind: "foyer" | "room" | "zone";
  name: string;
  icon: string;
  x: number;
  y: number;
  locked: boolean;
  links: string[];
}

export interface Storyline {
  premiseId: string;
  twistId: string;
  victimIndex: number;
  treasureIndex: number;
}

export interface CaseFile {
  seed: string;
  universe: Universe;
  solution: Record<CategoryKey, string>;
  /** Every guest's secret motive (a permutation of the motives in play). */
  profile: Record<string, string>;
  story: Storyline;
  twist: TwistDef;
  map: MapNode[];
  lockedRooms: string[];
  /** The two (or fewer) items that only a locked wing can rule out. */
  vaultItems: { category: CategoryKey; item: string; room: string }[];
  clues: Clue[];
  /** Round-by-round layout. */
  roundsPerPhase: number;
  startHints: number;
  startMenace: number;
}

// ---------------------------------------------------------------------------------------------
// Lookups

const ALL_ITEMS: Record<CategoryKey, Item[]> = {
  suspect: SUSPECT_POOL,
  room: ROOM_POOL,
  weapon: WEAPON_POOL,
  motive: MOTIVE_POOL,
  time: TIME_POOL,
};

export function itemOf(category: CategoryKey, id: string): Item {
  const hit = ALL_ITEMS[category].find((i) => i.id === id);
  if (!hit) return { id, name: id, icon: "❔" };
  return hit;
}
export function nameOf(category: CategoryKey, id: string): string {
  return itemOf(category, id).name;
}
export function roomDef(id: string): RoomDef | undefined {
  return ROOM_POOL.find((r) => r.id === id);
}
export function zoneDef(id: string): ZoneDef | undefined {
  return ZONE_POOL.find((z) => z.id === id);
}
export function motiveDef(id: string): MotiveDef | undefined {
  return MOTIVE_POOL.find((m) => m.id === id);
}

/** How many different cases the generator can build. Shown on the title screen. */
export function variantCount() {
  const choose = (n: number, k: number) => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  };
  const storylines = PREMISES.length * TWISTS.length * VICTIM_POOL.length * TREASURE_POOL.length;
  const solutions =
    choose(SUSPECT_POOL.length, 6) * 6 * // which six guests, and who did it
    choose(ROOM_POOL.length, 7) * 7 * //   which seven rooms, and which one
    choose(WEAPON_POOL.length, 6) * 6 *
    choose(MOTIVE_POOL.length, 6) * 6 *
    choose(TIME_POOL.length, 5) * 5;
  return { storylines, twistedStorylines: PREMISES.length * TWISTS.length, solutions, total: storylines * solutions };
}

// ---------------------------------------------------------------------------------------------
// Solver

export interface Deduction {
  cands: Cands;
  /** `${category}:${item}` -> id of the clue that ruled it out. */
  why: Record<string, string>;
  solved: boolean;
}

export function deduce(universe: Universe, clues: readonly Clue[]): Deduction {
  const sets: Record<CategoryKey, Set<string>> = {
    suspect: new Set(universe.suspect),
    room: new Set(universe.room),
    weapon: new Set(universe.weapon),
    motive: new Set(universe.motive),
    time: new Set(universe.time),
  };
  const why: Record<string, string> = {};
  const drop = (cat: CategoryKey, item: string, clueId: string) => {
    if (sets[cat].delete(item)) {
      why[`${cat}:${item}`] = clueId;
      return true;
    }
    return false;
  };
  const only = (cat: CategoryKey, keep: string[], clueId: string) => {
    let changed = false;
    for (const i of [...sets[cat]]) if (!keep.includes(i) && drop(cat, i, clueId)) changed = true;
    return changed;
  };

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (const c of clues) {
      if (c.kind === "exclude" && c.category && c.items) {
        for (const i of c.items) if (drop(c.category, i, c.id)) changed = true;
      } else if (c.kind === "oneof" && c.category && c.items) {
        if (only(c.category, c.items, c.id)) changed = true;
      } else if (c.kind === "sighting" && c.suspect && c.room && c.time) {
        // The culprit was at the scene at the time of death. Seen elsewhere at that hour = innocent.
        if (sets.time.size === 1 && sets.time.has(c.time) && !sets.room.has(c.room)) {
          if (drop("suspect", c.suspect, c.id)) changed = true;
        }
      } else if (c.kind === "link" && c.suspect && c.motive) {
        // One secret per guest, no two alike: the guest and their secret stand or fall together.
        if (!sets.motive.has(c.motive) && drop("suspect", c.suspect, c.id)) changed = true;
        if (!sets.suspect.has(c.suspect) && drop("motive", c.motive, c.id)) changed = true;
        if (sets.suspect.size === 1 && sets.suspect.has(c.suspect) && only("motive", [c.motive], c.id)) changed = true;
        if (sets.motive.size === 1 && sets.motive.has(c.motive) && only("suspect", [c.suspect], c.id)) changed = true;
      }
    }
  }
  const cands = {} as Cands;
  for (const k of CATEGORY_KEYS) cands[k] = [...sets[k]];
  return { cands, why, solved: CATEGORY_KEYS.every((k) => cands[k].length === 1) };
}

export function solvedWith(c: CaseFile, clues: readonly Clue[]): boolean {
  const d = deduce(c.universe, clues);
  return d.solved && CATEGORY_KEYS.every((k) => d.cands[k][0] === c.solution[k]);
}

// ---------------------------------------------------------------------------------------------
// Clue wording

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function excludeText(rng: Rng, cat: CategoryKey, items: string[]): { text: string; short: string } {
  const names = items.map((i) => nameOf(cat, i));
  const L = list(names);
  const many = items.length > 1;
  const short = `Not ${names.join(" / ")}`;
  switch (cat) {
    case "time":
      return {
        short,
        text: rng.pick([
          `A torn page of the staff diary shows the treasure was safely in its case at ${L}. Nothing was taken then.`,
          `Every clock in the house chimed together at ${L}, and the treasure was still on its stand both times. It was not then.`,
          `The night porter's log is clear: the display case was checked and full at ${L}.`,
          `A guest's photograph, stamped ${L}, shows the treasure in its place. The theft came at another hour.`,
        ]),
      };
    case "room":
      return {
        short,
        text: rng.pick([
          `The dust is untouched in ${L}. Whatever happened, it did not happen there.`,
          `A maid swears nothing was out of place in ${L} all evening. No scuffs, no fingerprints.`,
          `You find ${many ? "clean, locked rooms" : "a clean, locked room"}: ${L} ${many ? "were" : "was"} shut up all night. Nothing was taken from there.`,
          `The carpets in ${L} are spotless and unmarked. The theft was somewhere else.`,
        ]),
      };
    case "weapon":
      return {
        short,
        text: rng.pick([
          `The ${L} ${many ? "are" : "is"} accounted for: tidy, dusty, and still in ${many ? "their" : "its"} place. Not the tool.`,
          `A cataloguer's note, signed that afternoon: ${L} ${many ? "were" : "was"} locked away all evening. Not the tool.`,
          `You examine ${L} under the lamp. Not a mark on ${many ? "them" : "it"}. Not the tool.`,
          `The inspector would have spotted it: whatever the thief used, it was not ${L}.`,
        ]),
      };
    case "suspect":
      return {
        short,
        text: rng.pick([
          `The guest book and two witnesses clear ${L}. ${many ? "They were" : "Not the culprit: they were"} in full view of the whole party.`,
          `${L} spent the evening with the cook, whose word can be checked. Not ${many ? "them" : "the culprit"}.`,
          `A signed statement puts ${L} on the terrace the whole hour. ${many ? "Neither is" : "Not"} the culprit.`,
          `The telephone operator confirms ${L} ${many ? "were" : "was"} on a long call from the hall. Cleared.`,
        ]),
      };
    case "motive":
      return {
        short,
        text: rng.pick([
          `The letters in the owner's desk make it plain: ${L} was never the reason.`,
          `Whatever drove this theft, a lawyer's file settles it was not ${L}.`,
          `You read the owner's diary closely. ${L} gets not one mention. It was not the motive.`,
          `A confession on the back of a menu rules out ${L} as the motive.`,
        ]),
      };
  }
}

function oneofText(rng: Rng, cat: CategoryKey, items: string[]): { text: string; short: string } {
  const L = list(items.map((i) => nameOf(cat, i)));
  const short = `Only ${items.map((i) => nameOf(cat, i)).join(" / ")}`;
  const nouns: Record<CategoryKey, string> = {
    time: "the time of the theft",
    room: "the scene of the theft",
    weapon: "the tool used",
    suspect: "the culprit",
    motive: "the motive",
  };
  return {
    short,
    text: rng.pick([
      `A confession, half hidden under the fireplace ashes, narrows ${nouns[cat]} to one of ${L}.`,
      `The family's own notes leave no doubt: ${nouns[cat]} must be among ${L}.`,
      `The inspector's pencilled marginalia points to ${L} and nowhere else for ${nouns[cat]}.`,
    ]),
  };
}

function sightingText(rng: Rng, suspect: string, room: string, time: string): { text: string; short: string } {
  const s = nameOf("suspect", suspect);
  const r = nameOf("room", room);
  const t = nameOf("time", time);
  return {
    short: `${s} was in the ${r} at ${t}`,
    text: rng.pick([
      `A footman swears he saw ${s} in the ${r} at ${t} and nowhere else.`,
      `A guest's pocket watch and a photograph both place ${s} in the ${r} at ${t}.`,
      `The nightmaid's diary: "${t}: ${s} in the ${r}, asking for tea."`,
      `Muddy prints and a signed note put ${s} in the ${r} at ${t}.`,
    ]),
  };
}

function linkText(rng: Rng, suspect: string, motive: string): { text: string; short: string } {
  const s = nameOf("suspect", suspect);
  const m = nameOf("motive", motive);
  return {
    short: `${s}'s secret is ${m}`,
    text: rng.pick([
      `A letter in ${s}'s coat makes it plain: ${s}'s secret is ${m}.`,
      `You decode a private note. Everything ${s} wanted came down to one word: ${m}.`,
      `A torn page of ${s}'s diary lays it bare. ${s} is driven by ${m}.`,
      `A servant admits, with some reluctance, that ${s}'s secret was ${m}.`,
    ]),
  };
}

// ---------------------------------------------------------------------------------------------
// Generation

function chunk(rng: Rng, items: string[], maxGroup: number): string[][] {
  const shuffled = rng.shuffle(items);
  const out: string[][] = [];
  let i = 0;
  while (i < shuffled.length) {
    const left = shuffled.length - i;
    const size = Math.min(left, rng.int(Math.min(2, maxGroup), maxGroup));
    // Never leave a lonely leftover when it can be folded into the previous group.
    out.push(shuffled.slice(i, i + size));
    i += size;
  }
  return out;
}

export interface GenerateOptions {
  /** Pin the storyline (used by tests and the "replay" screen). */
  premiseId?: string;
  twistId?: string;
}

export function generateCase(seed: string, opts: GenerateOptions = {}): CaseFile {
  const rng = new Rng(seed);

  // Storyline first, so its twist can shape the case.
  const premise = opts.premiseId ? (PREMISES.find((p) => p.id === opts.premiseId) ?? rng.pick(PREMISES)) : rng.pick(PREMISES);
  const twist = opts.twistId ? (TWISTS.find((t) => t.id === opts.twistId) ?? rng.pick(TWISTS)) : rng.pick(TWISTS);
  const victimIndex = rng.int(0, VICTIM_POOL.length - 1);
  const treasureIndex = rng.int(0, TREASURE_POOL.length - 1);
  const story: Storyline = { premiseId: premise.id, twistId: twist.id, victimIndex, treasureIndex };

  // The cast of the night.
  const universe: Universe = {
    suspect: rng.sample(SUSPECT_POOL, 6).map((i) => i.id),
    room: rng.sample(ROOM_POOL, 7).map((i) => i.id),
    weapon: rng.sample(WEAPON_POOL, 6).map((i) => i.id),
    motive: rng.sample(MOTIVE_POOL, 6).map((i) => i.id),
    time: rng.sample(TIME_POOL, 5)
      .map((i) => i.id)
      .sort((a, b) => TIME_POOL.findIndex((t) => t.id === a) - TIME_POOL.findIndex((t) => t.id === b)),
  };
  const solution = {
    suspect: rng.pick(universe.suspect),
    room: rng.pick(universe.room),
    weapon: rng.pick(universe.weapon),
    motive: rng.pick(universe.motive),
    time: rng.pick(universe.time),
  } as Record<CategoryKey, string>;

  // Secrets: a permutation with the culprit holding the real motive.
  const profile: Record<string, string> = {};
  profile[solution.suspect] = solution.motive;
  const otherSuspects = universe.suspect.filter((s) => s !== solution.suspect);
  const otherMotives = rng.shuffle(universe.motive.filter((m) => m !== solution.motive));
  otherSuspects.forEach((s, i) => (profile[s] = otherMotives[i]));

  // Alibi table: where each guest was at each hour. Only the culprit was at the scene at the time of death.
  const alibi: Record<string, Record<string, string>> = {};
  for (const s of universe.suspect) {
    alibi[s] = {};
    for (const t of universe.time) {
      if (t === solution.time) {
        alibi[s][t] = s === solution.suspect ? solution.room : rng.pick(universe.room.filter((r) => r !== solution.room));
      } else {
        alibi[s][t] = rng.pick(universe.room);
      }
    }
  }

  // Which rooms are sealed (the critical tasks open them).
  const lockedCount = twist.mods.lockedCount ?? 2;
  const lockedRooms = rng.sample(universe.room, lockedCount);
  const openRooms = universe.room.filter((r) => !lockedRooms.includes(r));

  // Vault items: one wrong item per sealed wing that only that wing can rule out.
  const vaultCats = rng.shuffle<CategoryKey>(["time", "room", "weapon"]).slice(0, lockedCount);
  const vaultItems: CaseFile["vaultItems"] = [];
  vaultCats.forEach((cat, i) => {
    const wrong = universe[cat].filter((x) => x !== solution[cat]);
    vaultItems.push({ category: cat, item: rng.pick(wrong), room: lockedRooms[i] });
  });

  const clues: Clue[] = [];
  let n = 0;
  const add = (c: Omit<Clue, "id" | "where" | "object"> & { where?: string }) => {
    clues.push({ ...c, id: `c${++n}`, where: c.where ?? "", object: "" });
  };
  const keep = (cat: CategoryKey) => vaultItems.filter((v) => v.category === cat).map((v) => v.item);
  const wrongOf = (cat: CategoryKey) => universe[cat].filter((x) => x !== solution[cat] && !keep(cat).includes(x));

  // Tier 0 is the first thing each room gives up, and on its own it solves the case.
  // Tier 1 is the cross-check: a second, independent way to rule out everything, so one lost clue never ends the case.

  // Sealed-wing clues: two dedicated clues per vault item (one of each tier), kept in the wing itself.
  for (const v of vaultItems) {
    for (let k = 0; k < 2; k++) {
      const t = excludeText(rng, v.category, [v.item]);
      add({ kind: "exclude", category: v.category, items: [v.item], where: v.room, vault: true, tier: k as 0 | 1, ...t });
    }
  }

  // Time, scene and weapon: two independent passes over the wrong items.
  for (const cat of ["time", "room", "weapon"] as CategoryKey[]) {
    for (let pass = 0; pass < 2; pass++) {
      for (const g of chunk(rng, wrongOf(cat), 3)) add({ kind: "exclude", category: cat, items: g, tier: pass as 0 | 1, ...excludeText(rng, cat, g) });
    }
  }

  // One or two "big finds": a short list that includes the truth.
  const bigCats = rng.sample<CategoryKey>(["time", "room", "weapon"], rng.int(1, 2));
  for (const cat of bigCats) {
    // A short list must keep the sealed wing's item on it, or it would clear that item without opening the wing.
    const size = rng.int(2, 3);
    const kept = keep(cat);
    const decoys = universe[cat].filter((x) => x !== solution[cat] && !kept.includes(x));
    const set = rng.shuffle([solution[cat], ...kept, ...rng.sample(decoys, Math.max(0, size - 1 - kept.length))]);
    add({ kind: "oneof", category: cat, items: set, tier: 1, ...oneofText(rng, cat, set) });
  }

  // Suspects. Tier 0: a couple of plain alibis, sightings that need the hour and the scene worked out first,
  // and every guest's secret (which rules the motives out once the guest is cleared).
  const wrongSuspects = rng.shuffle(universe.suspect.filter((s) => s !== solution.suspect));
  const direct = wrongSuspects.slice(0, 2);
  const sighted = wrongSuspects.slice(2);
  for (const s of direct) add({ kind: "exclude", category: "suspect", items: [s], tier: 0, ...excludeText(rng, "suspect", [s]) });
  for (const s of sighted) {
    const room = alibi[s][solution.time];
    add({ kind: "sighting", suspect: s, room, time: solution.time, tier: 0, ...sightingText(rng, s, room, solution.time) });
  }
  for (const s of wrongSuspects) add({ kind: "link", suspect: s, motive: profile[s], tier: 0, ...linkText(rng, s, profile[s]) });
  // Tier 1: plain alibis for everyone, and direct word on the motives.
  for (const g of chunk(rng, wrongSuspects, 3)) add({ kind: "exclude", category: "suspect", items: g, tier: 1, ...excludeText(rng, "suspect", g) });
  for (const g of chunk(rng, universe.motive.filter((m) => m !== solution.motive), 3)) add({ kind: "exclude", category: "motive", items: g, tier: 1, ...excludeText(rng, "motive", g) });

  // Texture: sightings at other hours. They rule nothing out, and they cost an attempt like any other clue.
  const noiseCount = rng.int(1, 3);
  for (let i = 0; i < noiseCount; i++) {
    const s = rng.pick(universe.suspect);
    const t = rng.pick(universe.time.filter((x) => x !== solution.time));
    const room = alibi[s][t];
    add({ kind: "sighting", suspect: s, room, time: t, noise: true, tier: 1, ...sightingText(rng, s, room, t) });
  }

  // Where everything is found. Vault clues are already in their wing. The rest are dealt round-robin over the
  // open rooms, primary clues first, so every room's first finds are the useful ones.
  const loose = clues.filter((c) => !c.where);
  const dealt = [...rng.shuffle(loose.filter((c) => c.tier === 0)), ...rng.shuffle(loose.filter((c) => c.tier === 1))];
  const roomOrder = rng.shuffle(openRooms);
  dealt.forEach((c, i) => (c.where = roomOrder[i % roomOrder.length]));
  for (const c of clues) {
    const def = roomDef(c.where);
    const objs = def ? def.objects : [];
    c.object = objs.length ? objs[rng.int(0, objs.length - 1)].id : "";
  }
  // Within a room, primary clues come out first.
  clues.sort((a, b) => a.tier - b.tier || Number(a.id.slice(1)) - Number(b.id.slice(1)));

  const map = buildMap(rng, universe.room, lockedRooms);
  // Zones: pick two distinct ones.
  const zoneIds = rng.sample(ZONE_POOL, 2).map((z) => z.id);
  attachZones(rng, map, zoneIds, openRooms);

  return {
    seed,
    universe,
    solution,
    profile,
    story,
    twist,
    map,
    lockedRooms,
    vaultItems,
    clues,
    roundsPerPhase: twist.mods.roundsPerPhase ?? 3,
    startHints: twist.mods.startHints ?? 3,
    startMenace: twist.mods.startMenace ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Map

function link(a: MapNode, b: MapNode) {
  if (a.id === b.id) return;
  if (!a.links.includes(b.id)) a.links.push(b.id);
  if (!b.links.includes(a.id)) b.links.push(a.id);
}

function buildMap(rng: Rng, roomIds: string[], lockedRooms: string[]): MapNode[] {
  const foyer: MapNode = { id: "foyer", kind: "foyer", name: "Grand Foyer", icon: "🏛️", x: 50, y: 50, locked: false, links: [] };
  const nodes: MapNode[] = [foyer];
  const open = roomIds.filter((r) => !lockedRooms.includes(r));
  for (const id of roomIds) {
    const def = roomDef(id)!;
    nodes.push({ id, kind: "room", name: def.name, icon: def.icon, x: 0, y: 0, locked: lockedRooms.includes(id), links: [] });
  }
  const by = (id: string) => nodes.find((n) => n.id === id)!;

  // A ring through the open rooms, with the foyer reaching three of them: always connected without any locked room.
  const ring = rng.shuffle(open);
  ring.forEach((id, i) => link(by(id), by(ring[(i + 1) % ring.length])));
  for (const id of rng.sample(ring, Math.min(3, ring.length))) link(foyer, by(id));
  // A chord or two so the map is not a plain circle.
  if (ring.length >= 4) link(by(ring[0]), by(ring[2]));
  // Each sealed wing is reachable from two open rooms.
  for (const id of lockedRooms) {
    for (const o of rng.sample(ring, Math.min(2, ring.length))) link(by(id), by(o));
  }

  // Layout: foyer in the middle, open rooms on an inner ring, sealed wings further out.
  ring.forEach((id, i) => {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    const n = by(id);
    n.x = 50 + Math.cos(a) * 22;
    n.y = 50 + Math.sin(a) * 22;
  });
  lockedRooms.forEach((id, i) => {
    const neighbours = by(id).links.map(by).filter((n) => n.kind === "room" && !n.locked);
    const a = neighbours.length ? Math.atan2(avg(neighbours.map((n) => n.y)) - 50, avg(neighbours.map((n) => n.x)) - 50) : (i / lockedRooms.length) * Math.PI * 2;
    const n = by(id);
    n.x = 50 + Math.cos(a) * 41;
    n.y = 50 + Math.sin(a) * 41;
  });
  return nodes;
}

function avg(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
}

function attachZones(rng: Rng, map: MapNode[], zoneIds: string[], openRooms: string[]) {
  const by = (id: string) => map.find((n) => n.id === id)!;
  const rooms = rng.shuffle(openRooms);
  zoneIds.forEach((zid, i) => {
    const def = zoneDef(zid)!;
    const a = by(rooms[i % rooms.length]);
    const b = by(rooms[(i + 1 + Math.floor(rooms.length / 2)) % rooms.length]);
    const z: MapNode = { id: zid, kind: "zone", name: def.name, icon: def.icon, x: 0, y: 0, locked: false, links: [] };
    link(z, a);
    if (b.id !== a.id) link(z, b);
    // Place it just beyond its first neighbour, pushed away from the centre.
    const ang = Math.atan2(a.y - 50, a.x - 50) + (i === 0 ? 0.55 : -0.55);
    z.x = 50 + Math.cos(ang) * 46;
    z.y = 50 + Math.sin(ang) * 46;
    z.x = Math.min(94, Math.max(6, z.x));
    z.y = Math.min(94, Math.max(6, z.y));
    map.push(z);
  });
}

export function neighbours(c: CaseFile, nodeId: string): MapNode[] {
  const n = c.map.find((m) => m.id === nodeId);
  if (!n) return [];
  return n.links.map((id) => c.map.find((m) => m.id === id)!).filter(Boolean);
}

/** The opening briefing shown on the case file. */
export function briefing(c: CaseFile): { title: string; intro: string; teaser: string; owner: string; treasure: string } {
  const premise = PREMISES.find((p) => p.id === c.story.premiseId)!;
  const owner = VICTIM_POOL[c.story.victimIndex];
  const treasure = TREASURE_POOL[c.story.treasureIndex];
  return {
    title: premise.title,
    intro: premise.intro.replace("{owner}", owner.name).replace("{role}", owner.role).replace("{treasure}", treasure),
    teaser: c.twist.teaser,
    owner: owner.name,
    treasure,
  };
}

/** The full reveal, told after the case ends. */
export function ending(c: CaseFile): string {
  const premise = PREMISES.find((p) => p.id === c.story.premiseId)!;
  const owner = VICTIM_POOL[c.story.victimIndex];
  const treasure = TREASURE_POOL[c.story.treasureIndex];
  const m = motiveDef(c.solution.motive)!;
  return (
    `${nameOf("suspect", c.solution.suspect)} took ${treasure} from ${owner.name} at ${nameOf("time", c.solution.time)} in the ${nameOf("room", c.solution.room)}, ` +
    `using the ${nameOf("weapon", c.solution.weapon).toLowerCase()}, because ${m.line}. ` +
    `${c.twist.reveal} ${premise.epilogue}`
  );
}
