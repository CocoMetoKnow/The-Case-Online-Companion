/**
 * A scripted detective used by the tests (and handy for balancing): it plays a whole run through the
 * public reducer, solving puzzles with a given success rate. It is not part of the game UI.
 */
import { CATEGORY_KEYS } from "./content.ts";
import { board, currentPlayer, hiddenIn, isLocked, legal, lostClues, newGame, node, reduce, type Action, type TeamState } from "./engine.ts";
import { Rng } from "./rng.ts";

export interface BotResult {
  state: TeamState;
  steps: number;
}

function bfs(s: TeamState, from: string, goal: (id: string) => boolean): string | null {
  const seen = new Set([from]);
  const q: { id: string; first: string | null }[] = [{ id: from, first: null }];
  while (q.length) {
    const cur = q.shift()!;
    if (cur.first !== null && goal(cur.id)) return cur.first;
    for (const l of node(s, cur.id)!.links) {
      const n = node(s, l)!;
      if (seen.has(l) || isLocked(s, l) || n.kind === "zone") continue;
      seen.add(l);
      q.push({ id: l, first: cur.first ?? l });
    }
  }
  return null;
}

export function nextAction(s: TeamState, rng: Rng, skill: number): Action {
  if (s.notices.length) return { type: "ack" };
  const pd = s.pending;
  if (pd?.type === "draft") {
    const rank = (r: string) => (r === "boon" ? 0 : r === "safe" ? 1 : 2);
    const idx = pd.offers.findIndex((o) => o.icon === "🔎");
    if (idx >= 0) return { type: "draft", index: idx };
    let best = 0;
    pd.offers.forEach((o, i) => rank(o.risk) < rank(pd.offers[best].risk) && (best = i));
    return { type: "draft", index: best };
  }
  if (pd?.type === "puzzle") {
    if (rng.chance(skill)) return { type: "submit", input: pd.puzzle.answer };
    return { type: "submit", input: "WRONG" };
  }
  const p = currentPlayer(s);
  const L = legal(s);
  const d = board(s);
  if (d.solved) {
    const guess = {} as Record<(typeof CATEGORY_KEYS)[number], string>;
    for (const k of CATEGORY_KEYS) guess[k] = d.cands[k][0];
    return { type: "accuse", guess };
  }
  if (L.rescuable.length) return { type: "rescue", target: L.rescuable[0].id };
  const here = node(s, p.at)!;
  if (here.kind === "zone") {
    if (L.canRecover) return { type: "recover" };
    return { type: "move", to: L.moves[0].id };
  }
  if (L.canInvestigate && here.kind === "room" && hiddenIn(s, here.id).length) return { type: "investigate" };
  // Go where the clues are.
  const step = bfs(s, p.at, (id) => node(s, id)!.kind === "room" && hiddenIn(s, id).length > 0);
  if (step && L.moves.some((m) => m.id === step)) return { type: "move", to: step };
  // Nothing open is left: break into a sealed wing next to us.
  const lockedTarget = L.unlockable.find((n) => hiddenIn(s, n.id).length > 0);
  if (lockedTarget) return { type: "unlock", room: lockedTarget.id, useKey: s.keys > 0 };
  const lockedAny = s.game.lockedRooms.find((r) => isLocked(s, r) && hiddenIn(s, r).length);
  if (lockedAny) {
    const near = bfs(s, p.at, (id) => node(s, id)!.links.includes(lockedAny));
    if (near && L.moves.some((m) => m.id === near)) return { type: "move", to: near };
  }
  // Lost clues: go and win them back.
  if (lostClues(s).length && s.menace < 6) {
    const zone = node(s, lostClues(s)[0].id) ?? null;
    void zone;
  }
  if (L.canInvestigate) return { type: "investigate" };
  return { type: "end" };
}

export function playBot(seed: string, names: string[], skill: number, maxSteps = 4000): BotResult {
  let s = newGame(seed, names);
  const rng = new Rng(`bot/${seed}`);
  let steps = 0;
  while (s.status === "play" && steps++ < maxSteps) {
    const before = s;
    s = reduce(s, nextAction(s, rng, skill));
    if (s === before) s = reduce(s, { type: "end" });
  }
  return { state: s, steps };
}
