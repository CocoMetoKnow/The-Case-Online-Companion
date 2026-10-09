import assert from "node:assert/strict";
import test from "node:test";

// A tiny localStorage, same trick as session.test.ts. No IndexedDB here, so storage falls back to it.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { saveClueCode, saveCardSets, loadVault } = await import("./storage.ts");
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

test("the clue code is still on after a reload, until it is typed again", async () => {
  store.clear();
  assert.equal((await loadVault()).clue, false);
  saveClueCode(true);
  await wait();
  assert.equal((await loadVault()).clue, true);
  saveClueCode(false);
  await wait();
  assert.equal((await loadVault()).clue, false);
});

test("a saved deck keeps its switches", async () => {
  store.clear();
  saveCardSets([
    {
      id: "file-1",
      name: "Deck 1",
      cards: [],
      createdAt: 1,
      toggles: { timeOfDayEnabled: true, heist: true, speakMode: false, manualNotes: true, evenDeal: false, enabledEvents: ["hush"] },
    } as never,
  ]);
  await wait();
  const [deck] = (await loadVault()).sets;
  assert.deepEqual(deck.toggles, { timeOfDayEnabled: true, heist: true, speakMode: false, manualNotes: true, evenDeal: false, enabledEvents: ["hush"] });
});
