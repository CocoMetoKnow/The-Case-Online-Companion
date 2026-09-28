import { roomById, START_HALL } from "./board";
import { currentName, currentPlayer, holdForBoard, placePlayer, turnActorId } from "./engine";
import type { CategoryId, EventKind, GameState, PiecePos, Secrets } from "./types";
import { uid } from "../utils";

function log(state: GameState, text: string): GameState {
  return {
    ...state,
    log: [...state.log.slice(-8), { id: uid("log"), text, turn: state.turnIndex }],
  };
}

function resumeAction(state: GameState): GameState {
  return { ...state, phase: "action", event: null, moveBudget: 0, actionsLeft: 1 };
}

/** After a power, the turn goes on, unless that card says it ends. */
function finishPower(state: GameState): GameState {
  return resumeAction(state);
}

const NAMED: Partial<Record<EventKind, CategoryId>> = {
  "name-suspect": "suspect",
  "name-weapon": "weapon",
  "name-room": "room",
  "name-time": "time",
};

function findHolder(state: GameState, secrets: Secrets, cardId: string) {
  const want = String(cardId);
  for (const player of state.players ?? []) {
    const pile = secrets.hands?.[player.id];
    if (!Array.isArray(pile)) continue;
    if (pile.some((id) => String(id) === want)) return player;
  }
  return null;
}

function faceUp(state: GameState, cardId: string) {
  return (state.leftover ?? []).some((id) => String(id) === String(cardId));
}

function announceNamed(
  state: GameState,
  secrets: Secrets,
  card: { id: string; name: string },
  lead: string,
) {
  const ev = state.event;
  if (!ev) return { state, secrets };
  const answers = new Set(Object.values(secrets.solution ?? {}).filter(Boolean).map((id) => String(id)));
  if (answers.has(String(card.id))) {
    return {
      state: log(
        {
          ...state,
          event: {
            ...ev,
            step: "ack",
            description: `${lead} No one has the ${card.name}.`,
            data: { ...ev.data, ackThen: "resume", cardId: card.id, nobody: true },
          },
        },
        `${lead} No one has it.`,
      ),
      secrets,
    };
  }
  const holder = findHolder(state, secrets, card.id);
  if (holder) {
    return {
      state: log(
        {
          ...state,
          event: {
            ...ev,
            step: "show-all",
            description: `${holder.name} has the ${card.name} and must show it to everyone.`,
            data: { holderId: holder.id, cardId: card.id },
          },
        },
        `${lead} ${holder.name} must show it to everyone.`,
      ),
      secrets,
    };
  }
  const where = faceUp(state, card.id) ? `${card.name} is already face up on the table.` : `${card.name} stays out.`;
  return {
    state: log(
      {
        ...state,
        event: {
          ...ev,
          step: "ack",
          description: `${lead} ${where}`,
          data: { ...ev.data, ackThen: "resume", cardId: card.id },
        },
      },
      `${lead} ${where}`,
    ),
    secrets,
  };
}

export function autoResolveIfPossible(state: GameState, secrets: Secrets): { state: GameState; secrets: Secrets } {
  const ev = state.event;
  if (!ev || ev.step !== "intro") return { state, secrets };
  switch (ev.kind) {
    case "extra-roll": {
      const first = state.moveBudget ?? 0;
      const a = 1 + Math.floor(Math.random() * 6);
      const b = 1 + Math.floor(Math.random() * 6);
      const added = a + b;
      const total = first + added;
      const line = `Bonus Roll. Move ${total}.`;
      return {
        state: log(
          {
            ...state,
            pace: total,
            moveBudget: total,
            event: {
              ...ev,
              step: "ack",
              description: `Move ${total}. You do not roll again.`,
              data: { ackThen: "resume", total },
            },
          },
          line,
        ),
        secrets,
      };
    }
    case "thief": {
      const who = currentPlayer(state);
      const others = state.players.filter((p) => p.id !== who?.id && !p.eliminated);
      if (!others.length) {
        return { state: log(finishPower(state), "There is no one to steal a die from."), secrets };
      }
      return { state, secrets };
    }
    case "spy": {
      const who = currentPlayer(state);
      const others = state.players.filter((p) => p.id !== who?.id && !p.eliminated);
      if (!others.length) {
        return { state: log(finishPower(state), "There is no one to spy on."), secrets };
      }
      return { state, secrets };
    }
    case "move-anywhere":
    case "peek":
    case "rumor":
    case "red-herring":
    case "pass-card":
    case "new-passage":
    case "clunk":
    case "blocked-out":
    case "come-here":
    case "that-noise":
    case "influenced":
    case "name-suspect":
    case "name-weapon":
    case "name-room":
    case "name-time":
    case "trade-places":
    case "swap-card":
    case "hush":
      return { state, secrets };
    case "wrong-turn": {
      const pool = state.players.filter((p) => !p.eliminated);
      const rooms = state.settings.enabledRoomIds.length
        ? state.settings.enabledRoomIds
        : state.cards.filter((c) => c.category === "room").map((c) => c.id);
      if (!pool.length || !rooms.length) {
        return { state: log(finishPower(state), "No one could be moved."), secrets };
      }
      const target = pool[Math.floor(Math.random() * pool.length)];
      const roomId = rooms[Math.floor(Math.random() * rooms.length)];
      const moved = placePlayer(state, target.id, { kind: "room", roomId });
      const roomName = roomById(roomId)?.name ?? state.cards.find((c) => c.id === roomId)?.name ?? roomId;
      const note = `On the physical board, move ${target.name}'s piece into the ${roomName}.`;
      return {
        state: holdForBoard(
          log(moved, `The house drops ${target.name} into the ${roomName}.`),
          note,
          "resume",
        ),
        secrets,
      };
    }
    case "call-card": {
      const pool = state.cards.filter((c) => c.category !== "time" || state.settings.timeOfDayEnabled);
      if (!pool.length) return { state: finishPower(state), secrets };
      const card = pool[Math.floor(Math.random() * pool.length)];
      return announceNamed(state, secrets, card, `The house calls the ${card.name}.`);
    }
    case "send-home": {
      const who = currentPlayer(state);
      if (!who) return { state: finishPower(state), secrets };
      let next = state;
      const names: string[] = [];
      for (const player of state.players) {
        if (player.id === who.id || player.eliminated) continue;
        const spot = START_HALL[player.seat % START_HALL.length];
        next = placePlayer(next, player.id, { kind: "hall", x: spot.x, y: spot.y });
        names.push(player.name);
      }
      const note = names.length
        ? `On the physical board, move ${names.join(", ")} back to their start squares. Leave ${who.name} where they stand.`
        : `${who.name} is the only one left to move.`;
      return {
        state: holdForBoard(log(next, note), note, "resume"),
        secrets,
      };
    }
    case "forced-reveal": {
      const pool = state.players.filter((p) => (secrets.hands[p.id] ?? []).length > 0);
      if (!pool.length) {
        return { state: log(finishPower(state), "No one has a card to reveal."), secrets };
      }
      const target = pool[Math.floor(Math.random() * pool.length)];
      return {
        state: log(
          {
            ...state,
            event: { ...ev, step: "choose-card", data: { targetId: target.id } },
          },
          `${target.name} is caught in the light and must show a card.`,
        ),
        secrets,
      };
    }
    case "random-reveal": {
      const cur = currentPlayer(state);
      const pool = state.players.filter(
        (p) => p.id !== cur?.id && (secrets.hands[p.id] ?? []).length > 0,
      );
      if (!pool.length || !cur) {
        return { state: log(finishPower(state), "No card could be shown."), secrets };
      }
      const target = pool[Math.floor(Math.random() * pool.length)];
      const hand = secrets.hands[target.id] ?? [];
      const cardId = hand[Math.floor(Math.random() * hand.length)];
      return {
        state: {
          ...log(state, `${target.name} lets a card slip — only ${cur.name} may look.`),
          event: {
            ...ev,
            step: "show-private",
            data: { targetId: target.id, cardId, viewerId: cur.id },
          },
        },
        secrets,
      };
    }
    case "free-question":
      return {
        state: log(
          {
            ...state,
            freeQuestion: true,
            event: {
              ...ev,
              step: "ack",
              description: `${currentName(state)} may ask a question even from the hall.`,
              data: { ...ev.data, ackThen: "resume" },
            },
          },
          `${currentName(state)} may ask a question even from the hall.`,
        ),
        secrets,
      };
    case "whisper":
      return {
        state: log(
          {
            ...state,
            whisperMode: true,
            event: {
              ...ev,
              step: "ack",
              description: `${currentName(state)} names the room they are in, plus only two other cards.`,
              data: { ...ev.data, ackThen: "resume" },
            },
          },
          `${currentName(state)} names the room they are in, plus only two other cards.`,
        ),
        secrets,
      };
    case "food-poisoning": {
      const notesLock = { ...(state.notesLock ?? {}) };
      for (const p of state.players) notesLock[p.id] = (notesLock[p.id] ?? 0) + 2;
      return {
        state: log(
          {
            ...state,
            notesLock,
            event: { ...ev, step: "ack", data: { ...ev.data, ackThen: "end" } },
          },
          "Supper sits badly. Notes stay shut on each phone for that player's next two turns.",
        ),
        secrets,
      };
    }
    case "second-wind":
      return {
        state: log(
          {
            ...state,
            event: {
              ...ev,
              step: "ack",
              description: `${currentName(state)} finds the servants’ stair and may still choose one action.`,
              data: { ...ev.data, ackThen: "resume" },
            },
          },
          `${currentName(state)} finds the servants’ stair. You may still choose one action.`,
        ),
        secrets,
      };
    case "lost-in-hall": {
      const cur = currentPlayer(state);
      if (!cur) return { state: finishPower(state), secrets };
      const next = placePlayer(state, cur.id, { kind: "hall", x: 8, y: 8 });
      const note = `On the physical board, move ${cur.name}'s piece to the hall.`;
      return {
        state: holdForBoard(log(next, `${cur.name} is lost and must return to the hall.`), note, "resume"),
        secrets,
      };
    }
    case "about-face": {
      const cur = currentPlayer(state);
      const order = [...state.turnOrder].reverse();
      const at = cur ? order.indexOf(cur.id) : -1;
      const turned = {
        ...state,
        turnOrder: order,
        turnIndex: at >= 0 ? at : state.turnIndex,
      };
      return {
        state: log(
          {
            ...turned,
            event: {
              ...ev,
              step: "ack",
              description: "Play now goes the other way around the table.",
              data: { ackThen: "resume" },
            },
          },
          "The order of play turns around.",
        ),
        secrets,
      };
    }
    default:
      return { state: finishPower(state), secrets };
  }
}

/** A guest who is out of the game cannot be picked by a power. */
function isOut(state: GameState, id: string) {
  const player = state.players.find((p) => p.id === id);
  return !player || Boolean(player.eliminated);
}

function stillNeed(state: GameState, seen: string[]) {
  const have = new Set(seen);
  return state.players.filter((player) => !player.eliminated && !have.has(player.id));
}

export function resolveEventChoice(
  state: GameState,
  secrets: Secrets,
  playerId: string,
  choice: Record<string, unknown>,
): { state: GameState; secrets: Secrets } {
  const ev = state.event;
  if (!ev) return { state, secrets };
  const cur = currentPlayer(state);
  const actorTurn = turnActorId(state);
  const isTurnActor = actorTurn === playerId;

  if (ev.step === "reveal") {
    const seen = Array.isArray(ev.data.seen) ? (ev.data.seen as string[]).map(String) : [];
    if (seen.includes(playerId)) return { state, secrets };
    const nextSeen = [...seen, playerId];
    const waiting = stillNeed(state, nextSeen);
    if (waiting.length) {
      return {
        state: {
          ...state,
          event: {
            ...ev,
            data: { ...ev.data, seen: nextSeen, lockedKind: ev.data.lockedKind ?? ev.kind },
          },
        },
        secrets,
      };
    }
    const locked = String(ev.data.lockedKind ?? ev.kind);
    const opened = {
      ...state,
      event: { ...ev, kind: locked as EventKind, step: "intro", data: { lockedKind: locked } },
    };
    return autoResolveIfPossible(opened, secrets);
  }

  if (ev.step === "board") {
    if (choice.boardDone !== true) return { state, secrets };
    let who = String(choice.asPlayerId ?? playerId);
    if (state.settings.playMode === "online") who = playerId;
    const alive = state.players.filter((p) => !p.eliminated);
    if (!alive.some((p) => p.id === who)) return { state, secrets };
    const seen = Array.isArray(ev.data.boardSeen) ? (ev.data.boardSeen as string[]) : [];
    if (seen.includes(who)) return { state, secrets };
    const nextSeen = [...seen, who];
    const needed = Math.min(2, alive.length);
    if (nextSeen.length < needed) {
      return {
        state: {
          ...state,
          event: { ...ev, data: { ...ev.data, boardSeen: nextSeen } },
        },
        secrets,
      };
    }
    const done = log(state, "Two players confirmed the physical board.");
    if (ev.data.boardThen === "resume") return { state: resumeAction(done), secrets };
    return { state: finishPower(done), secrets };
  }

  if (ev.step === "ack") {
    const seen = Array.isArray(ev.data.acked) ? (ev.data.acked as string[]).map(String) : [];
    if (seen.includes(playerId)) return { state, secrets };
    const nextSeen = [...seen, playerId];
    if (stillNeed(state, nextSeen).length) {
      return {
        state: { ...state, event: { ...ev, data: { ...ev.data, acked: nextSeen } } },
        secrets,
      };
    }
    if (ev.data.ackThen === "resume") return { state: resumeAction({ ...state, event: { ...ev, data: { ...ev.data, acked: nextSeen } } }), secrets };
    return { state: finishPower({ ...state, event: { ...ev, data: { ...ev.data, acked: nextSeen } } }), secrets };
  }

  if (ev.kind === "forced-reveal" && ev.step === "choose-card") {
    const targetId = String(ev.data.targetId ?? "");
    if (playerId !== targetId) return { state, secrets };
    const cardId = String(choice.cardId ?? "");
    const hand = secrets.hands[targetId] ?? [];
    if (!hand.includes(cardId)) return { state, secrets };
    const target = state.players.find((p) => p.id === targetId);
    const card = state.cards.find((c) => c.id === cardId);
    return {
      state: log(
        {
          ...state,
          event: {
            ...ev,
            step: "show-all",
            description: `${target?.name ?? "A guest"} shows the ${card?.name ?? "card"} to everyone.`,
            data: { holderId: targetId, cardId },
          },
        },
        `${target?.name ?? "A guest"} reveals ${card?.name ?? "a card"} to the table.`,
      ),
      secrets,
    };
  }

  if (ev.step === "show-all") {
    const seen = Array.isArray(ev.data.seen) ? (ev.data.seen as string[]).map(String) : [];
    if (seen.includes(playerId)) return { state, secrets };
    const nextSeen = [...seen, playerId];
    if (stillNeed(state, nextSeen).length) {
      return {
        state: {
          ...state,
          event: { ...ev, data: { ...ev.data, seen: nextSeen } },
        },
        secrets,
      };
    }
    const card = state.cards.find((c) => c.id === ev.data.cardId);
    const holder = state.players.find((p) => p.id === ev.data.holderId);
    return {
      state: log(
        finishPower({ ...state, event: null }),
        `${holder?.name ?? "A guest"} shows the ${card?.name ?? "card"} to everyone.`,
      ),
      secrets,
    };
  }

  if (ev.kind === "swap-card" && ev.step === "pick-take") {
    const targetId = String(ev.data.targetId ?? "");
    if (playerId !== targetId) return { state, secrets };
    const takeId = String(choice.cardId ?? "");
    const giveId = String(ev.data.giveId ?? "");
    const giverId = String(ev.data.giverId ?? cur?.id ?? "");
    if (!(secrets.hands[targetId] ?? []).includes(takeId)) return { state, secrets };
    if (!(secrets.hands[giverId] ?? []).includes(giveId)) return { state, secrets };
    const hands = { ...secrets.hands };
    hands[giverId] = (hands[giverId] ?? []).filter((id) => id !== giveId);
    hands[targetId] = (hands[targetId] ?? []).filter((id) => id !== takeId);
    hands[giverId] = [...(hands[giverId] ?? []), takeId];
    hands[targetId] = [...(hands[targetId] ?? []), giveId];
    const giver = state.players.find((p) => p.id === giverId);
    const target = state.players.find((p) => p.id === targetId);
    const names = `${giver?.name ?? "A guest"} and ${target?.name ?? "a guest"} swapped a card.`;
    return {
      state: log(
        {
          ...state,
          event: {
            ...ev,
            step: "ack",
            description: `${names} Everyone look.`,
            data: { ackThen: "resume" },
          },
        },
        names,
      ),
      secrets: { ...secrets, hands },
    };
  }

  if (ev.kind === "random-reveal" && ev.step === "show-private") {
    if (playerId !== ev.data.viewerId) return { state, secrets };
    return { state: finishPower({ ...state, event: null }), secrets };
  }

  if (ev.kind === "peek") {
    if (ev.step === "intro" || ev.step === "pick-player") {
      if (!isTurnActor) return { state, secrets };
      const targetId = String(choice.targetId ?? "");
      const hand = secrets.hands[targetId] ?? [];
      if (!hand.length || targetId === playerId || isOut(state, targetId)) return { state, secrets };
      return {
        state: { ...state, event: { ...ev, step: "pick-card", data: { targetId, count: hand.length } } },
        secrets,
      };
    }
    if (ev.step === "pick-card") {
      if (!isTurnActor) return { state, secrets };
      const targetId = String(ev.data.targetId ?? "");
      const index = Number(choice.index ?? -1);
      const hand = secrets.hands[targetId] ?? [];
      const cardId = hand[index];
      if (!cardId) return { state, secrets };
      return {
        state: {
          ...state,
          event: { ...ev, step: "show-private", data: { targetId, cardId, viewerId: playerId } },
        },
        secrets,
      };
    }
    if (ev.step === "show-private") {
      if (playerId !== ev.data.viewerId) return { state, secrets };
      const target = state.players.find((p) => p.id === ev.data.targetId);
      return {
        state: log(
          finishPower({ ...state, event: null }),
          `${cur?.name ?? "A guest"} peeked at a card held by ${target?.name}.`,
        ),
        secrets,
      };
    }
  }

  if (ev.kind === "pass-card") {
    const picks = {
      ...((ev.data.picks as Record<string, string> | undefined) ?? {}),
    };
    if (choice.cardId) picks[playerId] = String(choice.cardId);
    const needed = state.players.filter((p) => (secrets.hands[p.id] ?? []).length > 0);
    const missing = needed.filter((p) => !picks[p.id] || !secrets.hands[p.id]?.includes(picks[p.id]));
    if (missing.length) {
      return {
        state: {
          ...state,
          event: { ...ev, step: "collect", data: { picks, waitingId: missing[0].id } },
        },
        secrets,
      };
    }
    const hands = { ...secrets.hands };
    const passed: Record<string, string> = {};
    for (const p of state.players) {
      const cid = picks[p.id];
      if (!cid) continue;
      hands[p.id] = (hands[p.id] ?? []).filter((id) => id !== cid);
      passed[p.id] = cid;
    }
    // Pass to the left among guests still in. An eliminated seat must never
    // receive a card, or that card drops out of the game.
    const seated = state.turnOrder.filter((id) => !isOut(state, id));
    const n = seated.length;
    for (let i = 0; i < n; i++) {
      const from = seated[i];
      const to = seated[(i + 1) % n];
      const cid = passed[from];
      if (cid) hands[to] = [...(hands[to] ?? []), cid];
    }
    return {
      state: log(finishPower({ ...state, event: null }), "Each guest passes a card to the left."),
      secrets: { ...secrets, hands },
    };
  }

  if (ev.kind === "rumor") {
    if (ev.step === "intro" || ev.step === "pick-player") {
      if (!isTurnActor) return { state, secrets };
      const targetId = String(choice.targetId ?? "");
      if (!targetId || targetId === playerId || isOut(state, targetId)) return { state, secrets };
      return {
        state: { ...state, event: { ...ev, step: "tell", data: { targetId } } },
        secrets,
      };
    }
    if (ev.step === "tell") {
      const targetId = String(ev.data.targetId ?? "");
      if (playerId !== targetId) return { state, secrets };
      const rumor = String(choice.rumor ?? "").slice(0, 180);
      const target = state.players.find((p) => p.id === targetId);
      if (!rumor) {
        return {
          state: log(finishPower(state), `${target?.name ?? "A guest"} has no rumor to share.`),
          secrets,
        };
      }
      return {
        state: {
          ...state,
          event: { ...ev, step: "show-rumor", data: { targetId, rumor, viewerId: cur?.id } },
        },
        secrets,
      };
    }
    if (ev.step === "show-rumor") {
      if (playerId !== ev.data.viewerId) return { state, secrets };
      const target = state.players.find((p) => p.id === ev.data.targetId);
      return {
        state: log(
          finishPower({ ...state, event: null }),
          `${target?.name ?? "A guest"} shares a rumor with ${cur?.name}.`,
        ),
        secrets,
      };
    }
  }

  if (ev.kind === "red-herring") {
    const senderId = String(ev.data.senderId ?? cur?.id ?? "");
    if (ev.step === "deliver") {
      const truthId = String(ev.data.truthId ?? "");
      const lieId = String(ev.data.lieId ?? "");
      const heard = Array.isArray(ev.data.heard) ? (ev.data.heard as string[]) : [];
      if ((playerId === truthId || playerId === lieId) && !heard.includes(playerId)) {
        const nextHeard = [...heard, playerId];
        const waitingId = !nextHeard.includes(truthId) ? truthId : !nextHeard.includes(lieId) ? lieId : senderId;
        return {
          state: {
            ...state,
            event: { ...ev, data: { ...ev.data, heard: nextHeard, waitingId } },
          },
          secrets,
        };
      }
      const both = heard.includes(truthId) && heard.includes(lieId);
      if ((playerId === senderId || isTurnActor) && both) {
        return { state: finishPower(state), secrets };
      }
      return { state, secrets };
    }
    if (!isTurnActor || !cur) return { state, secrets };
    if (ev.step === "intro" || ev.step === "pick-card") {
      const cardId = String(choice.cardId ?? "");
      if (!cardId || !state.cards.some((c) => c.id === cardId)) return { state, secrets };
      const card = state.cards.find((c) => c.id === cardId);
      return {
        state: {
          ...state,
          event: {
            ...ev,
            step: "pick-truth",
            description: `This whisper will tell the truth about whether you have the ${card?.name ?? "card"}. Send it to one player.`,
            data: { cardId, senderId: cur.id },
          },
        },
        secrets,
      };
    }
    if (ev.step === "pick-truth") {
      const truthId = String(choice.targetId ?? "");
      if (!truthId || truthId === cur.id || isOut(state, truthId)) return { state, secrets };
      const others = state.players.filter((p) => p.id !== cur.id && p.id !== truthId && !p.eliminated);
      if (!others.length) return { state, secrets };
      return {
        state: {
          ...state,
          event: {
            ...ev,
            step: "pick-lie",
            description:
              "Now pick a different player. They will hear the opposite. Neither of them will know which whisper is true.",
            data: { ...ev.data, senderId: cur.id, truthId },
          },
        },
        secrets,
      };
    }
    if (ev.step === "pick-lie") {
      const lieId = String(choice.targetId ?? "");
      const truthId = String(ev.data.truthId ?? "");
      const cardId = String(ev.data.cardId ?? "");
      if (!lieId || lieId === cur.id || lieId === truthId || isOut(state, lieId)) return { state, secrets };
      const has = (secrets.hands[cur.id] ?? []).includes(cardId);
      const card = state.cards.find((c) => c.id === cardId);
      const name = card?.name ?? "This card";
      const truthText = has ? `${cur.name} has the ${name}.` : `${cur.name} does not have the ${name}.`;
      const lieText = has ? `${cur.name} does not have the ${name}.` : `${cur.name} has the ${name}.`;
      return {
        state: log(
          {
            ...state,
            event: {
              ...ev,
              step: "deliver",
              description: "Two whispers have been sent.",
              data: {
                senderId: cur.id,
                cardId,
                truthId,
                lieId,
                truthText,
                lieText,
                heard: [],
                waitingId: truthId,
              },
            },
          },
          `${cur.name} sends two whispers. Only they know which is true.`,
        ),
        secrets,
      };
    }
    return { state, secrets };
  }

  if (!isTurnActor || !cur) return { state, secrets };
  const named = NAMED[ev.kind];
  if (named && (ev.step === "intro" || ev.step === "pick-card")) {
    const cardId = String(choice.cardId ?? "");
    const card = state.cards.find((c) => c.id === cardId && c.category === named);
    if (!card) return { state, secrets };
    return announceNamed(state, secrets, card, `${cur.name} names the ${card.name}.`);
  }
  if (ev.kind === "hush" && (ev.step === "intro" || ev.step === "pick-card")) {
    const cardId = String(choice.cardId ?? "");
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return { state, secrets };
    if (card.category === "time" && !state.settings.timeOfDayEnabled) return { state, secrets };
    return {
      state: log(
        {
          ...state,
          hush: { cardId: card.id, byId: cur.id },
          event: {
            ...ev,
            step: "ack",
            description: "A card has been hushed. The table will be told which one when someone else asks for it.",
            data: { ackThen: "resume", cardId: card.id, byId: cur.id, secret: true },
          },
        },
        `${cur.name} hushes a card.`,
      ),
      secrets,
    };
  }
  if (ev.kind === "spy" && (ev.step === "intro" || ev.step === "pick-player")) {
    const targetId = String(choice.targetId ?? "");
    if (!targetId || targetId === cur.id) return { state, secrets };
    const target = state.players.find((p) => p.id === targetId && !p.eliminated);
    if (!target) return { state, secrets };
    return {
      state: log(
        {
          ...state,
          spy: { byId: cur.id, targetId, armed: false },
          event: {
            ...ev,
            step: "ack",
            description: `${cur.name} is spying on someone until their next turn.`,
            data: { ackThen: "resume", byId: cur.id, spyTarget: targetId },
          },
        },
        `${cur.name} is spying on someone.`,
      ),
      secrets,
    };
  }
  if (ev.kind === "thief" && (ev.step === "intro" || ev.step === "pick-player")) {
    const targetId = String(choice.targetId ?? "");
    if (!targetId || targetId === cur.id) return { state, secrets };
    const target = state.players.find((p) => p.id === targetId && !p.eliminated);
    if (!target) return { state, secrets };
    const extra = 1 + Math.floor(Math.random() * 6);
    const first = state.pace ?? state.moveBudget ?? 0;
    const total = first + extra;
    const line = `${cur.name} steals a die from ${target.name}. The extra die is ${extra}. Move ${total}. ${target.name} rolls one die next turn.`;
    return {
      state: log(
        {
          ...state,
          pace: total,
          moveBudget: total,
          shortDieId: targetId,
          event: {
            ...ev,
            step: "ack",
            description: `You steal one die from ${target.name}. Your extra die is ${extra}, so this turn moves ${total}. ${target.name} rolls one die on their next turn only.`,
            data: { ackThen: "resume" },
          },
        },
        line,
      ),
      secrets,
    };
  }
  if (ev.kind === "trade-places" && (ev.step === "intro" || ev.step === "pick-player")) {
    const targetId = String(choice.targetId ?? "");
    if (!targetId || targetId === cur.id) return { state, secrets };
    const other = state.players.find((p) => p.id === targetId && !p.eliminated);
    if (!other) return { state, secrets };
    const mine = cur.position;
    const theirs = other.position;
    const players = state.players.map((p) => {
      if (p.id === cur.id) return { ...p, position: theirs };
      if (p.id === other.id) return { ...p, position: mine };
      return p;
    });
    const note = `On the physical board, swap ${cur.name} and ${other.name}.`;
    return {
      state: holdForBoard(log({ ...state, players }, `${cur.name} and ${other.name} trade places.`), note, "resume"),
      secrets,
    };
  }
  if (ev.kind === "swap-card" && (ev.step === "intro" || ev.step === "pick-player")) {
    const targetId = String(choice.targetId ?? "");
    if (!targetId || targetId === cur.id || isOut(state, targetId)) return { state, secrets };
    const mine = secrets.hands[cur.id] ?? [];
    const theirs = secrets.hands[targetId] ?? [];
    if (!mine.length || !theirs.length) {
      return { state: log(finishPower(state), "There is no card to swap."), secrets };
    }
    return {
      state: { ...state, event: { ...ev, step: "pick-give", data: { targetId, giverId: cur.id } } },
      secrets,
    };
  }
  if (ev.kind === "swap-card" && ev.step === "pick-give") {
    const targetId = String(ev.data.targetId ?? "");
    const cardId = String(choice.cardId ?? "");
    if (!(secrets.hands[cur.id] ?? []).includes(cardId)) return { state, secrets };
    const target = state.players.find((p) => p.id === targetId);
    return {
      state: {
        ...state,
        event: {
          ...ev,
          step: "pick-take",
          description: `${target?.name ?? "The other guest"} picks a card to give back.`,
          data: { targetId, giverId: cur.id, giveId: cardId },
        },
      },
      secrets,
    };
  }
  const label = (id: string) => roomById(id)?.name ?? state.cards.find((c) => c.id === id)?.name ?? id;

  if (ev.kind === "new-passage") {
    const roomA = String(choice.roomA ?? "");
    const roomB = String(choice.roomB ?? "");
    if (!roomA || !roomB || roomA === roomB) return { state, secrets };
    const passages = [...(state.passages ?? []), { a: roomA, b: roomB }];
    const note = `On the physical board, mark a secret passage between the ${label(roomA)} and the ${label(roomB)}. It costs one step.`;
    return {
      state: holdForBoard(
        log({ ...state, passages }, note),
        note,
        "resume",
      ),
      secrets,
    };
  }

  if (ev.kind === "clunk") {
    const targetId = String(choice.targetId ?? "");
    if (!targetId || targetId === cur.id || isOut(state, targetId)) return { state, secrets };
    const target = state.players.find((p) => p.id === targetId);
    const skipIds = [...(state.skipIds ?? []), targetId];
    const note = `On the physical board, leave ${target?.name ?? "that guest"}'s piece where it stands. They skip their next turn.`;
    return {
      state: holdForBoard(log({ ...state, skipIds }, note), note, "resume"),
      secrets,
    };
  }

  if (ev.kind === "blocked-out") {
    const targetId = String(choice.targetId ?? "");
    if (!targetId || isOut(state, targetId)) return { state, secrets };
    const notesLock = { ...(state.notesLock ?? {}) };
    const extra = targetId === cur?.id ? 1 : 0;
    notesLock[targetId] = (notesLock[targetId] ?? 0) + 2 + extra;
    const target = state.players.find((p) => p.id === targetId);
    return {
      state: log(
        finishPower({ ...state, notesLock, event: null }),
        `${target?.name ?? "A guest"} cannot read their notes for their next two turns. Every mark shows as a question until then. Your turn goes on.`,
      ),
      secrets,
    };
  }

  if (ev.kind === "come-here") {
    const targetId = String(choice.targetId ?? "");
    const roomId = String(choice.roomId ?? "");
    if (!targetId || !roomId || targetId === cur.id || isOut(state, targetId)) return { state, secrets };
    const enabled = roomId === "foyer" || state.settings.enabledRoomIds.includes(roomId);
    if (!enabled) return { state, secrets };
    const moved = placePlayer(state, targetId, { kind: "room", roomId });
    const target = state.players.find((p) => p.id === targetId);
    const note = `On the physical board, move ${target?.name ?? "a guest"}'s piece into the ${label(roomId)}.`;
    return {
      state: holdForBoard(log(moved, note), note, "resume"),
      secrets,
    };
  }

  if (ev.kind === "that-noise") {
    const roomId = String(choice.roomId ?? "");
    if (!roomId) return { state, secrets };
    const enabled = roomId === "foyer" || state.settings.enabledRoomIds.includes(roomId);
    if (!enabled) return { state, secrets };
    let next = state;
    for (const p of state.players) next = placePlayer(next, p.id, { kind: "room", roomId });
    const note = `On the physical board, move every piece into the ${label(roomId)}.`;
    return {
      state: holdForBoard(log(next, note), note, "resume"),
      secrets,
    };
  }

  if (ev.kind === "influenced") {
    const targetId = String(choice.targetId ?? "");
    if (!targetId || targetId === cur.id || isOut(state, targetId)) return { state, secrets };
    const influences = [
      ...(state.influences ?? []).filter((i) => i.victimId !== targetId),
      { victimId: targetId, controllerId: actorTurn ?? cur.id },
    ];
    const target = state.players.find((p) => p.id === targetId);
    const guideName = state.players.find((p) => p.id === (actorTurn ?? cur.id))?.name ?? cur.name;
    return {
      state: log(
        finishPower({ ...state, influences, event: null }),
        `${guideName} will play ${target?.name ?? "a guest"}'s next turn, without ${state.settings.heist ? "naming the theft" : "an accusation"}.`,
      ),
      secrets,
    };
  }

  return { state, secrets };
}

export function otherPlayers(state: GameState, exceptId: string) {
  return state.players.filter((p) => p.id !== exceptId);
}

export type { EventKind, PiecePos };
