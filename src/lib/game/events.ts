import { PHYSICAL_EVENTS, eventsForPlayers } from "./cards";
import { nearestRooms, roomById, START_HALL } from "./board";
import { currentName, currentPlayer, holdForBoard, placePlayer, roomsInPlay, turnActorId } from "./engine";
import type { CategoryId, EventKind, GameState, PiecePos, Secrets } from "./types";
import { uid } from "../utils";

function log(state: GameState, text: string): GameState {
  return {
    ...state,
    log: [...state.log.slice(-8), { id: uid("log"), text, turn: state.turnIndex }],
  };
}

function resumeAction(state: GameState): GameState {
  // On the digital board a roll still has to be walked after the power is done. Bonus Roll,
  // Speed Boost and Thief raise that number, so keep it and go to the move step.
  if (state.settings?.table === "board" && (state.moveBudget ?? 0) > 0) {
    return { ...state, phase: "move", event: null, actionsLeft: 1 };
  }
  return { ...state, phase: "action", event: null, moveBudget: 0, actionsLeft: 1 };
}

/** After a power, the turn goes on, unless that card says it ends. */
function finishPower(state: GameState): GameState {
  return resumeAction(state);
}

/**
 * A power that only needs to tell the table what happened. The card was explained
 * once already, so the result goes into a one line notice and the turn carries on.
 * Nobody is asked to confirm it a second time.
 */
function settle(state: GameState, text: string): GameState {
  return log(
    { ...resumeAction(state), notice: text, noticeSelf: null, noticeFor: null },
    text,
  );
}

/** Phones that share one screen agree together. Online, each player taps for themselves. */
function readyList(state: GameState, seen: string[], playerId: string): string[] {
  const living = state.players.filter((player) => !player.eliminated);
  if (state.settings.playMode !== "online") return living.map((player) => player.id);
  return seen.includes(playerId) ? seen : [...seen, playerId];
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
  return { state: settle(state, `${lead} ${where}`), secrets };
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
      const line = `Bonus roll. Move ${total}. No need to roll again.`;
      return { state: settle({ ...state, pace: total, moveBudget: total }, line), secrets };
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
    case "sabotage": {
      const who = currentPlayer(state);
      const others = state.players.filter((p) => p.id !== who?.id && !p.eliminated);
      if (!others.length) {
        return { state: log(finishPower(state), "There is no one to sabotage."), secrets };
      }
      return { state, secrets };
    }
    case "stealth-reveal": {
      const line = "This turn's suggestion is handled automatically — no card needs to be picked by hand.";
      return { state: settle({ ...state, autoShowTurn: true }, line), secrets };
    }
    case "rumor": {
      const who = currentPlayer(state);
      if (!who) return { state: finishPower(state), secrets };
      const solution = new Set(Object.values(secrets.solution ?? {}).filter(Boolean).map(String));
      const mine = new Set((secrets.hands[who.id] ?? []).map(String));
      const pool = state.cards.filter(
        (c) => (c.category !== "time" || state.settings.timeOfDayEnabled) && !solution.has(c.id) && !mine.has(c.id),
      );
      if (!pool.length) {
        return { state: log(finishPower(state), "There is no hint to give."), secrets };
      }
      const card = pool[Math.floor(Math.random() * pool.length)];
      return {
        state: {
          ...log(state, `${who.name} receives an anonymous hint.`),
          event: { ...ev, step: "show-private", data: { cardId: card.id, viewerId: who.id, hint: true } },
        },
        secrets,
      };
    }
    case "peek": {
      const who = currentPlayer(state);
      const others = state.players.filter((p) => p.id !== who?.id && !p.eliminated && (secrets.hands[p.id] ?? []).length);
      if (!who || !others.length) {
        return { state: log(finishPower(state), "There is no hand to peek at."), secrets };
      }
      const target = others[Math.floor(Math.random() * others.length)];
      const hand = secrets.hands[target.id] ?? [];
      const cardId = hand[Math.floor(Math.random() * hand.length)];
      return {
        state: {
          ...log(state, `${who.name} peeks at a card from ${target.name}'s hand.`),
          event: { ...ev, step: "show-private", data: { targetId: target.id, cardId, viewerId: who.id } },
        },
        secrets,
      };
    }
    case "move-anywhere":
    case "fast-track":
    case "shortcut":
    case "red-herring":
    case "pass-card":
    case "new-passage":
    case "clunk":
    case "blocked-out":
    case "come-here":
    case "that-noise":
    case "influenced":
    case "wild-card":
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
      const rooms = state.settings.enabledRoomIds?.length
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
    case "call-card":
      return { state, secrets };
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
    case "free-question":
      return {
        state: settle(
          { ...state, freeQuestion: true },
          `${currentName(state)} may ask a question even from the hall.`,
        ),
        secrets,
      };
    case "food-poisoning": {
      // Every other guest still in the game. The one who drew it keeps their own notes, otherwise
      // their notes would shut in the middle of the turn they are playing.
      const notesLock = { ...(state.notesLock ?? {}) };
      const drawer = currentPlayer(state);
      for (const p of state.players) {
        if (p.eliminated || p.id === drawer?.id) continue;
        notesLock[p.id] = (notesLock[p.id] ?? 0) + 1;
      }
      return {
        state: settle(
          { ...state, notesLock },
          "Supper sits badly. Every other guest's notes stay shut for their next turn only.",
        ),
        secrets,
      };
    }
    case "lost-in-hall": {
      const who = currentPlayer(state);
      if (!who) return { state: finishPower(state), secrets };
      const next = placePlayer(state, who.id, { kind: "hall", x: 8, y: 8 });
      const note = `On the physical board, move ${who.name}'s piece to the hall.`;
      return {
        state: holdForBoard(log(next, `${who.name} is lost and must return to the hall.`), note, "resume"),
        secrets,
      };
    }
    case "second-wind": {
      const first = state.moveBudget ?? 0;
      const a = 1 + Math.floor(Math.random() * 6);
      const b = 1 + Math.floor(Math.random() * 6);
      const total = (first || a + b) * 2;
      return {
        state: settle({ ...state, pace: total, moveBudget: total }, `Speed boost. Move ${total} this turn.`),
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
        state: settle(turned, "The order of play turns around. Play now goes the other way."),
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

  // The way out. Every power-up, at every step, can be finished with one tap, so a power that has
  // nothing left to do (nowhere to move, nobody to pick, a player who walked away) can never hold the
  // game. Whoever is playing the turn may always finish it; so may the guest the power is waiting on.
  if (choice.finish) {
    const waitingOn = [ev.data.waitingId, ev.data.targetId, ev.data.viewerId, ev.data.holderId].map((id) => String(id ?? ""));
    const involved = !isOut(state, playerId) && waitingOn.includes(playerId);
    if (!isTurnActor && !involved) return { state, secrets };
    const who = state.players.find((p) => p.id === playerId);
    return { state: settle(state, `${who?.name ?? "A guest"} finished the ${ev.title} power-up. The turn goes on.`), secrets };
  }

  if (ev.step === "reveal") {
    const living = state.players.filter((player) => !player.eliminated);
    if (!living.some((player) => player.id === playerId)) return { state, secrets };
    const seen = Array.isArray(ev.data.seen) ? (ev.data.seen as string[]).map(String) : [];
    const nextSeen = readyList(state, seen, playerId);
    const waiting = stillNeed(state, nextSeen);
    if (waiting.length) {
      if (nextSeen.length === seen.length) return { state, secrets };
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

  // Older saves may still be waiting on the physical board. Any tap lets play carry on.
  if (ev.step === "board") {
    return { state: resumeAction(state), secrets };
  }

  // Only used when a named card is in the envelope. Everyone has to see that one, because it
  // goes in their journal. Every other result is a one line notice and the turn goes on.
  if (ev.step === "ack") {
    const living = state.players.filter((player) => !player.eliminated);
    if (!living.some((player) => player.id === playerId)) return { state, secrets };
    const seen = Array.isArray(ev.data.acked) ? (ev.data.acked as string[]).map(String) : [];
    const nextSeen = readyList(state, seen, playerId);
    if (stillNeed(state, nextSeen).length) {
      if (nextSeen.length === seen.length) return { state, secrets };
      return {
        state: { ...state, event: { ...ev, data: { ...ev.data, acked: nextSeen } } },
        secrets,
      };
    }
    const text = String(ev.description ?? "");
    return { state: settle(state, text || "The card is in the envelope."), secrets };
  }

  if (ev.step === "show-all") {
    // The card is on every screen. The player showing it, or whoever is playing, moves things on.
    const holderId = String(ev.data.holderId ?? "");
    if (playerId !== holderId && !isTurnActor) return { state, secrets };
    const card = state.cards.find((c) => c.id === ev.data.cardId);
    const holder = state.players.find((p) => p.id === ev.data.holderId);
    return {
      state: settle(state, `${holder?.name ?? "A guest"} showed the ${card?.name ?? "card"} to everyone.`),
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
    return { state: settle(state, names), secrets: { ...secrets, hands } };
  }

  if (ev.kind === "peek" || ev.kind === "rumor") {
    if (ev.step === "show-private") {
      if (playerId !== ev.data.viewerId) return { state, secrets };
      if (ev.kind === "rumor" || ev.data.hint) {
        const card = state.cards.find((c) => c.id === ev.data.cardId);
        return {
          state: settle(state, `Anonymous hint: the ${card?.name ?? "card"} is not the answer.`),
          secrets,
        };
      }
      const target = state.players.find((p) => p.id === ev.data.targetId);
      return {
        state: settle(state, `${cur?.name ?? "A guest"} peeked at a card held by ${target?.name}.`),
        secrets,
      };
    }
  }

  if (ev.kind === "pass-card") {
    const picks = {
      ...((ev.data.picks as Record<string, string> | undefined) ?? {}),
    };
    if (choice.cardId) picks[playerId] = String(choice.cardId);
    // Guests who are out never pass or receive, so no card can drop out of the game.
    const needed = state.players.filter((p) => !p.eliminated && (secrets.hands[p.id] ?? []).length > 0);
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
      if (!cid || p.eliminated) continue;
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
      state: settle(state, "Each guest passed a card to the left."),
      secrets: { ...secrets, hands },
    };
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
        return { state: settle(state, "Two whispers were sent. Only the sender knows which is true."), secrets };
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
  if (ev.kind === "call-card") {
    if (ev.step === "intro" || ev.step === "pick-category") {
      const category = String(choice.category ?? "") as CategoryId;
      const valid: CategoryId[] = state.settings.timeOfDayEnabled
        ? ["suspect", "weapon", "room", "time"]
        : ["suspect", "weapon", "room"];
      if (!valid.includes(category)) return { state, secrets };
      return { state: { ...state, event: { ...ev, step: "pick-card", data: { category } } }, secrets };
    }
    if (ev.step === "pick-card") {
      const category = String(ev.data.category ?? "");
      const cardId = String(choice.cardId ?? "");
      const card = state.cards.find((c) => c.id === cardId && c.category === category);
      if (!card) return { state, secrets };
      return announceNamed(state, secrets, card, `${cur.name} calls the ${card.name}.`);
    }
    return { state, secrets };
  }
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
      state: settle(
        { ...state, hush: { cardId: card.id, byId: cur.id } },
        `${cur.name} hushed a card. The table hears which one when someone else asks for it.`,
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
      state: settle(
        { ...state, spy: { byId: cur.id, targetId, armed: false } },
        `${cur.name} is spying on someone until their next turn.`,
      ),
      secrets,
    };
  }
  if (ev.kind === "wild-card" && (ev.step === "intro" || ev.step === "pick-power")) {
    if (!isTurnActor) return { state, secrets };
    const pick = String(choice.kind ?? "");
    // Only powers this table could really draw: no hour card with hours off, no Red Herring
    // with fewer than three guests, no Hush while speaking. A pick outside this list is refused.
    const living = state.players.filter((p) => !p.eliminated).length;
    const playable = new Set(eventsForPlayers(living, { ...state.settings, enabledEvents: undefined }));
    const allowed = PHYSICAL_EVENTS.filter((k) => k !== "wild-card" && playable.has(k));
    if (!allowed.includes(pick as (typeof allowed)[number])) return { state, secrets };
    // Wild Card borrows another power's own flow wholesale: swap the kind and
    // let the normal draw-resolution logic run again as if that card had
    // just been drawn. Every other kind already knows how to handle itself.
    const opened = { ...state, event: { ...ev, kind: pick as EventKind, step: "intro", data: {} } };
    return autoResolveIfPossible(opened, secrets);
  }
  if (ev.kind === "sabotage" && (ev.step === "intro" || ev.step === "pick-player")) {
    if (!isTurnActor) return { state, secrets };
    const targetId = String(choice.targetId ?? "");
    if (!targetId || targetId === cur.id) return { state, secrets };
    const target = state.players.find((p) => p.id === targetId && !p.eliminated);
    if (!target) return { state, secrets };
    return {
      state: settle(
        { ...state, sabotage: { targetId, byId: cur.id } },
        `${cur.name} sabotages ${target.name}'s next power-up.`,
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
      state: settle({ ...state, pace: total, moveBudget: total, shortDieId: targetId }, line),
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
    // Only rooms whose cards are in this game can be joined by a passage.
    const inPlay = roomsInPlay(state);
    if (!inPlay.includes(roomA) || !inPlay.includes(roomB)) return { state, secrets };
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

  if (ev.kind === "move-anywhere" || ev.kind === "fast-track" || ev.kind === "shortcut") {
    if (!isTurnActor) return { state, secrets };
    const roomId = String(choice.roomId ?? "");
    if (!cur || !roomId) return { state, secrets };
    const enabledRoomIds = roomsInPlay(state);
    let valid = false;
    if (ev.kind === "move-anywhere") {
      valid = enabledRoomIds.includes(roomId);
    } else if (ev.kind === "fast-track") {
      // The few rooms closest to where the piece stands.
      valid = nearestRooms(cur.position, enabledRoomIds, state.passages ?? []).includes(roomId);
    } else {
      // Shortcut: either end of any secret passage already marked on the board.
      valid = enabledRoomIds.includes(roomId) && (state.passages ?? []).some((link) => link.a === roomId || link.b === roomId);
    }
    if (!enabledRoomIds.includes(roomId)) valid = false;
    const currentRoomId = cur.position.kind === "room" ? cur.position.roomId : null;
    if (!valid || roomId === currentRoomId) return { state, secrets };
    const moved = placePlayer(state, cur.id, { kind: "room", roomId });
    const verb = ev.kind === "shortcut" ? "slips through the passage into" : ev.kind === "fast-track" ? "cuts straight into" : "jumps to";
    const note = `On the physical board, move ${cur.name}'s piece into the ${label(roomId)}.`;
    return {
      state: holdForBoard(log(moved, `${cur.name} ${verb} the ${label(roomId)}.`), note, "resume"),
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
      state: settle(
        { ...state, notesLock },
        `${target?.name ?? "A guest"} cannot read their notes for their next two turns. Every mark shows as a question until then.`,
      ),
      secrets,
    };
  }

  if (ev.kind === "come-here") {
    const targetId = String(choice.targetId ?? "");
    const roomId = String(choice.roomId ?? "");
    if (!targetId || !roomId || targetId === cur.id || isOut(state, targetId)) return { state, secrets };
    if (!roomsInPlay(state).includes(roomId)) return { state, secrets };
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
    if (!roomsInPlay(state).includes(roomId)) return { state, secrets };
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
      state: settle(
        { ...state, influences },
        `${guideName} will play ${target?.name ?? "a guest"}'s next turn, without solving the case.`,
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
