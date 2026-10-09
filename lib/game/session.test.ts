import assert from "node:assert/strict";
import test from "node:test";

// A tiny localStorage, so the session can be saved and read back the way a refresh would.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { saveTable, loadVault } = await import("./storage.ts");

function table(phase = "action") {
  return {
    version: 1,
    state: { code: "gmmABCD", phase, players: [{ id: "ada" }], cards: [], log: [] },
    secrets: { solution: {}, hands: { ada: ["chef"] }, reveals: [] },
    localPlayerId: "ada",
    viewingPlayerId: "ada",
  } as never;
}

test("a refresh gets the same seat and hand back", async () => {
  store.clear();
  saveTable(table());
  const vault = await loadVault();
  assert.equal(vault.table?.localPlayerId, "ada");
  assert.deepEqual(vault.table?.secrets.hands.ada, ["chef"]);
});

test("leaving the table forgets the session", async () => {
  store.clear();
  saveTable(table());
  saveTable(null);
  assert.equal((await loadVault()).table, null);
});

test("a finished game is not restored", async () => {
  store.clear();
  saveTable(table("gameover"));
  assert.equal((await loadVault()).table, null);
});

test("a session older than 12 hours is ignored", async () => {
  store.clear();
  saveTable(table());
  const blob = JSON.parse(store.get("gmm.session.v2")!);
  blob.at = Date.now() - 13 * 60 * 60 * 1000;
  store.set("gmm.session.v2", JSON.stringify(blob));
  assert.equal((await loadVault()).table, null);
});
