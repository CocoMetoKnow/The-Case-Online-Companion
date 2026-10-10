import assert from "node:assert/strict";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TEAM_ROOMS_PATH = join(tmpdir(), `team-room-test-${process.pid}.json`);
const { handleTeamRoom } = await import("./room.server.ts");

const url = "http://x/api/team";
const post = async (body: Record<string, unknown>) => {
  const res = await handleTeamRoom(new Request(url, { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, data: (await res.json()) as any };
};
const get = async (room: string, peer: string, rev: number, snap = false) => {
  const q = new URLSearchParams({ room, peer, rev: String(rev) });
  if (snap) q.set("snap", "1");
  const res = await handleTeamRoom(new Request(`${url}?${q}`));
  return { status: res.status, data: (await res.json()) as any };
};

test("a guest cannot find a room that was never opened", async () => {
  const r = await post({ op: "join", room: "tmNOPE1", peer: "g1", name: "Sam" });
  assert.equal(r.status, 404);
  assert.match(r.data.error, /No table/);
  assert.equal((await get("tmNOPE1", "g1", 0)).status, 404);
});

test("host opens a room, guests join by code, the server runs the whole game", async () => {
  const room = "tmABCD2";
  const c = await post({ op: "create", room, peer: "h", name: "Hana", seed: "SEED1" });
  assert.equal(c.status, 200);
  assert.equal(c.data.roster.length, 1);
  assert.equal(c.data.state, null);

  // A different phone cannot take over an open code.
  assert.equal((await post({ op: "create", room, peer: "x", name: "Mallory" })).status, 409);
  // The host re-opening after a refresh just gets the table back.
  assert.equal((await post({ op: "create", room, peer: "h", name: "Hana" })).status, 200);

  const j = await post({ op: "join", room, peer: "g1", name: "Gus" });
  assert.equal(j.status, 200);
  assert.deepEqual(j.data.roster.map((r: any) => r.name), ["Hana", "Gus"]);

  // The long poll is released the moment someone joins.
  const rev = j.data.rev;
  const waiting = get(room, "h", rev);
  await post({ op: "join", room, peer: "g2", name: "Gus" });
  const seen = await waiting;
  assert.equal(seen.data.roster.length, 3);
  assert.equal(seen.data.roster[2].name, "Gus 2", "same names are told apart");
  // Nothing new: same rev comes back as a short "same" reply after the wait is cut short by a snap.
  assert.equal((await get(room, "g1", 0, true)).data.roster.length, 3);

  // Only the host can start.
  assert.equal((await post({ op: "start", room, peer: "g1" })).status, 403);
  const s = await post({ op: "start", room, peer: "h" });
  assert.equal(s.status, 200);
  assert.equal(s.data.state.status, "play");
  assert.equal(s.data.seats.length, 3);
  // Nobody is sent the answer.
  assert.deepEqual(s.data.state.game.solution, {});
  assert.equal(s.data.state.rng, 0);
  assert.ok(!JSON.stringify(s.data).includes('"hidden"') || s.data.state.game.clues.every((cl: any) => cl.text === "" || s.data.state.clueStatus[cl.id] !== "hidden"));

  // A latecomer cannot sit down once it has started.
  const late = await post({ op: "join", room, peer: "g9", name: "Late" });
  assert.equal(late.status, 409);
  assert.equal(late.data.full, true);
  // But a seated guest who refreshes gets straight back in.
  assert.equal((await post({ op: "join", room, peer: "g1", name: "Gus" })).status, 200);

  // Only the detective whose turn it is can act.
  const turn = s.data.state.turn;
  const seats: string[] = s.data.seats;
  const notMe = seats.find((_, i) => i !== turn)!;
  const me = seats[turn];
  const before = s.data.state.ap;
  const bad = await post({ op: "act", room, peer: notMe, n: 1, action: { type: "end" } });
  assert.equal(bad.data.state.turn, turn, "a seat out of turn is ignored");
  const ok = await post({ op: "act", room, peer: me, n: Date.now(), action: { type: "end" } });
  assert.notEqual(ok.data.state.turn, turn, "ending the turn passes it on");
  assert.ok(before > 0);
  // A repeated message is applied once.
  const n = Date.now() + 10;
  const next = ok.data.seats[ok.data.state.turn];
  const a1 = await post({ op: "act", room, peer: next, n, action: { type: "end" } });
  const a2 = await post({ op: "act", room, peer: next, n, action: { type: "end" } });
  assert.equal(a1.data.rev, a2.data.rev);
});

test("leaving: a guest leaves the lobby, the host closes the room", async () => {
  const room = "tmLEAV3";
  await post({ op: "create", room, peer: "h", name: "Hana" });
  await post({ op: "join", room, peer: "g", name: "Gus" });
  const l = await post({ op: "leave", room, peer: "g" });
  assert.equal(l.status, 200);
  assert.equal((await get(room, "h", 0, true)).data.roster.length, 1);
  await post({ op: "leave", room, peer: "h" });
  assert.equal((await get(room, "h", 0, true)).status, 404);
});

test("the host needs two detectives, and can go back to the lobby after the case", async () => {
  const room = "tmAGAI4";
  await post({ op: "create", room, peer: "h", name: "Hana" });
  assert.equal((await post({ op: "start", room, peer: "h" })).status, 400);
  await post({ op: "join", room, peer: "g", name: "Gus" });
  await post({ op: "start", room, peer: "h" });
  assert.equal((await post({ op: "again", room, peer: "g" })).status, 403);
  const a = await post({ op: "again", room, peer: "h", seed: "AGAIN1" });
  assert.equal(a.data.state, null);
  assert.equal(a.data.seed, "AGAIN1");
  assert.equal(a.data.roster.length, 2);
});
