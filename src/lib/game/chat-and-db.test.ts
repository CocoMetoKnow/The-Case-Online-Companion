import assert from "node:assert/strict";
import test from "node:test";
import { applyPlay } from "./actions.ts";
import { sendChat, setBoardMode } from "./engine.ts";
import type { GameState } from "./types.ts";

function table(over: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    code: "gmmCHAT",
    hostId: "ada",
    settings: { maxPlayers: 15, locked: false, table: "case", enabledRoomIds: [], playMode: "online" },
    cards: [],
    leftover: [],
    players: [
      { id: "ada", name: "Ada", color: "#fff", seat: 0, eliminated: false, isHost: true, position: { kind: "hall", x: 0, y: 0 } },
      { id: "bea", name: "Bea", color: "#000", seat: 1, eliminated: true, isHost: false, position: { kind: "hall", x: 1, y: 0 } },
    ],
    turnOrder: ["ada", "bea"],
    turnIndex: 0,
    phase: "action",
    startedAt: 1,
    log: [],
    ...over,
  } as unknown as GameState;
}

test("a seated guest can chat at any time, even when out of the case, and it never touches the turn", () => {
  const s = table();
  const next = sendChat(s, "bea", "  hello   there ");
  assert.equal(next.chat?.length, 1);
  assert.equal(next.chat?.[0].text, "hello there");
  assert.equal(next.chat?.[0].name, "Bea");
  assert.equal(next.phase, "action");
  assert.equal(next.turnIndex, 0);
});

test("empty messages and strangers are ignored, and only the last 60 are kept", () => {
  const s = table();
  assert.equal(sendChat(s, "ada", "   "), s);
  assert.equal(sendChat(s, "nobody", "hi"), s);
  let t = s;
  for (let i = 0; i < 70; i++) t = sendChat(t, "ada", `m${i}`);
  assert.equal(t.chat?.length, 60);
  assert.equal(t.chat?.[59].text, "m69");
});

test("chat goes through the shared rules pass", () => {
  const s = table();
  const out = applyPlay(s, { solution: {}, hands: {} }, "ada", "chat", { text: "anyone there?" });
  assert.equal(out.state.chat?.[0].text, "anyone there?");
});

test("only the host can flip the digital board in the lobby, and only before the game starts", () => {
  const lobby = table({ phase: "lobby", startedAt: null } as never);
  const data = { settings: { table: "board", maxPlayers: 8 }, cards: [{ id: "x" }] };
  assert.equal(setBoardMode(lobby, "bea", data), lobby);
  const on = setBoardMode(lobby, "ada", data);
  assert.equal(on.settings.table, "board");
  assert.equal(on.settings.maxPlayers, 8);
  assert.equal(on.cards.length, 1);
  assert.equal(setBoardMode(table(), "ada", data).settings.table, "case");
});

test("the board refuses a table that already has more players than it seats", () => {
  const lobby = table({ phase: "lobby", startedAt: null } as never);
  const data = { settings: { table: "board", maxPlayers: 1 }, cards: [{ id: "x" }] };
  assert.equal(setBoardMode(lobby, "ada", data), lobby);
});
