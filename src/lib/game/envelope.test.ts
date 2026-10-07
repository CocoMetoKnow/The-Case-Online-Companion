import assert from "node:assert/strict";
import test from "node:test";
import { addPlayer, createLobby, dealAndStart, dropPlayer, ensureObjective } from "./engine.ts";
import type { CardDef, GameState, Secrets } from "./types.ts";

const cards: CardDef[] = [
  ...["lord", "chef", "maid", "nurse", "pilot", "monk"].map((id) => ({ id, category: "suspect", name: id, blurb: "", icon: "User" })),
  ...["study", "hall", "attic", "cellar", "lounge", "pantry"].map((id) => ({ id, category: "room", name: id, blurb: "", icon: "Castle" })),
  ...["knife", "rope", "vase", "pipe", "axe", "poison"].map((id) => ({ id, category: "weapon", name: id, blurb: "", icon: "Sword" })),
] as CardDef[];

function table(players = 5, over: Record<string, unknown> = {}) {
  const settings = {
    maxPlayers: 8,
    locked: false,
    timeOfDayEnabled: false,
    wrongAccusationEliminates: true,
    honorHands: false,
    playMode: "online",
    cardSetId: "classic",
    enabledRoomIds: ["study", "hall", "attic", "cellar", "lounge", "pantry"],
    ...over,
  } as GameState["settings"];
  let lobby = createLobby("Ada", settings, cards, "gmmTEST").state;
  for (let i = 1; i < players; i++) lobby = addPlayer(lobby, `P${i}`, `p${i}`);
  return dealAndStart({ ...lobby, startedAt: 1 } as GameState, { solution: {}, hands: {} });
}

function everyCardOnce(state: GameState, secrets: Secrets) {
  const answers = new Set(Object.values(secrets.solution).map(String));
  const seen = new Map<string, number>();
  for (const pile of Object.values(secrets.hands)) for (const id of pile) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const id of state.leftover ?? []) seen.set(String(id), (seen.get(String(id)) ?? 0) + 1);
  for (const card of cards) {
    if (answers.has(card.id)) assert.equal(seen.get(card.id) ?? 0, 0, `${card.id} is an answer and must be in no hand`);
    else assert.equal(seen.get(card.id), 1, `${card.id} must be held exactly once`);
  }
}

test("the answers are sealed at the deal", () => {
  const { state, secrets } = table();
  assert.ok(secrets.envelope);
  assert.deepEqual(secrets.envelope, secrets.solution);
  everyCardOnce(state, secrets);
});

test("a player leaving never changes the answers, and every other card is still held exactly once", () => {
  for (let run = 0; run < 40; run++) {
    const dealt = table(5, run % 2 ? { extraDifficulty: true } : {});
    let { state, secrets } = dealt;
    const sealed = { ...secrets.envelope };
    for (const leaver of ["p3", "p1"]) {
      const next = dropPlayer(state, secrets, leaver);
      state = next.state;
      secrets = next.secrets;
      assert.deepEqual(secrets.solution, sealed);
      everyCardOnce(state, secrets);
    }
  }
});

test("even a damaged solution is put back from the sealed envelope, and a stray answer card leaves the hand", () => {
  const { state, secrets } = table(4);
  const sealed = { ...secrets.envelope } as Record<string, string>;
  const hands = { ...secrets.hands, p1: [...secrets.hands.p1, sealed.room] };
  const damaged: Secrets = { ...secrets, hands, solution: { suspect: "monk", room: "pantry", weapon: "poison" } };
  const fixed = ensureObjective(state, damaged);
  assert.deepEqual(fixed.secrets.solution, sealed);
  assert.ok(!fixed.secrets.hands.p1.includes(sealed.room));
});

test("cards that went missing are dealt back instead of looking like nobody holds them", () => {
  const { state, secrets } = table(4);
  const lost = secrets.hands.p2;
  assert.ok(lost.length > 0);
  const broken: Secrets = { ...secrets, hands: { ...secrets.hands, p2: [] } };
  const fixed = ensureObjective(state, broken);
  everyCardOnce(fixed.state, fixed.secrets);
  assert.deepEqual(fixed.secrets.solution, secrets.envelope);
});

test("a suggestion in progress is not reported as 'nobody has it' when the leaver's card lands on someone already passed", () => {
  for (let run = 0; run < 40; run++) {
    const dealt = table(4);
    let { state, secrets } = dealt;
    const ada = state.hostId;
    // p1 is asked first and has nothing; p2 (the leaver) is next and holds the only copy of the named weapon.
    const sealed = secrets.envelope as Record<string, string>;
    const weapon = cards.find((c) => c.category === "weapon" && c.id !== sealed.weapon)!.id;
    const strip = (id: string) => (secrets.hands[id] ?? []).filter((c) => c !== weapon);
    secrets = { ...secrets, hands: { ...secrets.hands, [ada]: strip(ada), p1: strip("p1"), p3: strip("p3"), p2: [...strip("p2"), weapon] } };
    const asked = { suspectId: sealed.suspect, roomId: sealed.room, weaponId: weapon };
    const nothing = (id: string) => (secrets.hands[id] ?? []).filter((c) => ![asked.suspectId, asked.roomId].includes(c));
    secrets = { ...secrets, hands: { ...secrets.hands, [ada]: nothing(ada), p1: nothing("p1"), p3: nothing("p3") } };
    state = {
      ...state,
      phase: "question",
      question: {
        askerId: ada, ...asked, announcedRoomId: null, cursor: 2, responderIds: ["p1", "p2", "p3"], skips: ["p1"],
        missId: null, showerId: "p2", matchingCardIds: [weapon], shownCardId: null, shownToAsker: false, resolved: false,
        nobodyHad: false,
      } as never,
    };
    const out = dropPlayer(state, secrets, "p2");
    const holder = Object.entries(out.secrets.hands).find(([, pile]) => pile.includes(weapon))?.[0];
    assert.ok(holder, "the card is still held by someone");
    if (holder !== ada && out.state.phase === "question") {
      assert.ok(!out.state.question?.nobodyHad, "someone holds a named card, so it must not be reported as nobody");
      assert.equal(out.state.question?.showerId, holder);
    }
  }
});
