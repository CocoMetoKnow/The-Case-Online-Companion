import {
  ackShownCard,
  acknowledgeMiss,
  answerSpoken,
  applyMove,
  beginQuestion,
  chooseShownCard,
  chooseSpokenCard,
  declareSnakeEyes,
  endTurn,
  makeAccusation,
  rememberReveal,
  releaseQuestion,
  rollDice,
  setAvatar,
  setClassicNames,
  setNaming,
  skipMove,
  turnActorId,
  voteSync,
} from "./engine";
import { resolveEventChoice } from "./events";
import type { GameState, LastSuggestion, PiecePos, Secrets } from "./types";

export type PlayKind = "roll" | "move" | "stay" | "ask" | "show" | "reply" | "ack" | "accuse" | "done" | "event" | "snake" | "name" | "sync" | "avatar" | "classic";

/**
 * One shared rules pass. The room runs this so every phone sees the same result.
 * After every play it also keeps `lastSuggestion` current, so when the question screen
 * is gone each player can still read what was asked and who showed a card.
 */
export function applyPlay(
  state: GameState,
  secrets: Secrets,
  from: string,
  kind: string,
  payload?: unknown,
): { state: GameState; secrets: Secrets } {
  const result = applyPlayCore(state, secrets, from, kind, payload);
  const tracked = trackSuggestion(state, result.state, kind, payload);
  return tracked === result.state ? result : { state: tracked, secrets: result.secrets };
}

function trackSuggestion(before: GameState, after: GameState, kind: string, payload: unknown): GameState {
  const q = after.question;
  if (!q || !q.askerId) {
    // A suggestion that nobody could answer can end the turn in the very same step, so no question
    // ever reaches the screen. Record it straight from what was asked.
    if (kind === "ask" && after !== before && !before.question) {
      const pick = (payload ?? {}) as Record<string, unknown>;
      const cardIds = [pick.suspectId, pick.roomId, pick.weaponId, pick.timeId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      );
      const askerId = before.turnOrder[before.turnIndex % Math.max(1, before.turnOrder.length)];
      if (askerId && cardIds.length) {
        return {
          ...after,
          lastSuggestion: {
            id: `${after.startedAt ?? 0}-${before.turnIndex}-${Date.now().toString(36)}`,
            askerId,
            cardIds,
            showerId: null,
            ...(before.settings?.speakMode ? { spoken: true } : {}),
            ...(typeof pick.suspectId === "string" && typeof pick.roomId === "string" && typeof pick.weaponId === "string"
              ? {
                  look: {
                    suspectId: pick.suspectId,
                    roomId: pick.roomId,
                    weaponId: pick.weaponId,
                    ...(typeof pick.timeId === "string" && pick.timeId ? { timeId: pick.timeId } : {}),
                  },
                }
              : {}),
          },
        };
      }
    }
    // Otherwise whatever was recorded last stays put until the next suggestion.
    return after;
  }
  const prev = after.lastSuggestion ?? before.lastSuggestion ?? null;
  const continuing = Boolean(before.question && prev && prev.askerId === q.askerId);
  const shown = Boolean(q.shownCardId || q.cardShown);
  const next: LastSuggestion = {
    id: continuing && prev ? prev.id : `${after.startedAt ?? 0}-${after.turnIndex}-${Date.now().toString(36)}`,
    askerId: q.askerId,
    cardIds: [q.suspectId, q.roomId, q.weaponId, q.timeId].filter((id): id is string => Boolean(id)),
    showerId: shown ? (q.showerId ?? null) : null,
    ...(q.spoken ? { spoken: true } : {}),
    ...(q.suspectId && q.roomId && q.weaponId
      ? { look: { suspectId: q.suspectId, roomId: q.roomId, weaponId: q.weaponId, ...(q.timeId ? { timeId: q.timeId } : {}) } }
      : continuing && prev?.look
        ? { look: prev.look }
        : {}),
  };
  if (
    prev &&
    prev.id === next.id &&
    prev.showerId === next.showerId &&
    prev.cardIds.join("|") === next.cardIds.join("|") &&
    after.lastSuggestion === prev
  ) {
    return after;
  }
  return { ...after, lastSuggestion: next };
}

function applyPlayCore(
  state: GameState,
  secrets: Secrets,
  from: string,
  kind: string,
  payload?: unknown,
): { state: GameState; secrets: Secrets } {
  const data = (payload ?? {}) as Record<string, unknown>;
  switch (kind as PlayKind) {
    case "roll": {
      const rolled = rollDice(state, from);
      return { state: rolled.state, secrets };
    }
    case "move":
      return { state: applyMove(state, from, data as unknown as PiecePos), secrets };
    case "stay":
      return { state: skipMove(state, from), secrets };
    case "ask":
      return {
        state: beginQuestion(state, from, data as { suspectId: string; roomId: string; weaponId: string; timeId?: string }, secrets),
        secrets,
      };
    case "reply":
      return { state: answerSpoken(state, from, Boolean(data.has), Boolean(data.retract), secrets), secrets };
    case "show": {
      const next = state.question?.spoken
        ? chooseSpokenCard(state, secrets, from, String(data.cardId ?? ""))
        : chooseShownCard(state, from, String(data.cardId ?? ""));
      const shown = next.question?.shownCardId;
      const asker = next.question?.askerId;
      let secretsNext =
        shown && asker && shown !== state.question?.shownCardId ? rememberReveal(secrets, from, asker, shown) : secrets;
      const spy = next.spy;
      if (shown && asker && spy?.targetId === asker && spy.byId && spy.byId !== asker && spy.byId !== from) {
        secretsNext = rememberReveal(secretsNext, from, spy.byId, shown);
      }
      return { state: next, secrets: secretsNext };
    }
    case "ack":
      if (state.question?.spoken && !state.question.shownCardId) return { state, secrets };
      if (state.privateShow?.cardId && state.privateShow.toId === from && !state.question?.shownCardId) {
        return { state: { ...state, privateShow: null }, secrets };
      }
      if (state.question?.missId) {
        const asker = state.question.askerId;
        const guided = (state.influences ?? []).some((item) => item.victimId === asker && item.controllerId === from);
        if (from !== asker && !guided) return { state, secrets };
        const expected = String(data.missId ?? "");
        if (expected && expected !== state.question.missId) return { state, secrets };
        return { state: acknowledgeMiss(state, secrets), secrets };
      }
      if (state.question?.showerId === from && !state.question.shownCardId && !(state.question.matchingCardIds ?? []).length) {
        return { state: releaseQuestion(state, secrets), secrets };
      }
      return { state: ackShownCard(state, from), secrets };
    case "accuse":
      return makeAccusation(state, from, data as { suspectId: string; roomId: string; weaponId: string; timeId?: string }, secrets);
    case "name":
      return { state: setNaming(state, from, data.clear ? null : data), secrets };
    case "snake":
      return { state: declareSnakeEyes(state, from), secrets };
    case "done": {
      if (state.phase === "question" && state.question) {
        const q = state.question;
        if (!q.closeTurn) return { state, secrets };
        const asker = q.askerId;
        const guided = (state.influences ?? []).some((item) => item.victimId === asker && item.controllerId === from);
        if (from !== asker && !guided && from !== turnActorId(state)) return { state, secrets };
        const closed = {
          ...state,
          phase: "action" as const,
          actionsLeft: 0,
          question: null,
          notice: null,
          noticeSelf: null,
          noticeFor: null,
        };
        return { state: endTurn(closed, from), secrets };
      }
      if (state.question?.offerAccusation) {
        const victim = state.turnOrder[state.turnIndex % Math.max(1, state.turnOrder.length)];
        const guided = (state.influences ?? []).some((item) => item.victimId === victim);
        if (!guided) return { state, secrets };
      }
      return { state: endTurn(state, from), secrets };
    }
    case "event":
      return resolveEventChoice(state, secrets, from, data);
    case "avatar":
      return { state: setAvatar(state, from, String(data.playerId ?? ""), String(data.cardId ?? "")), secrets };
    case "classic":
      return { state: setClassicNames(state, from, Boolean(data.on)), secrets };
    case "sync":
      return { state: voteSync(state, from, { agree: Boolean(data.agree), cancel: Boolean(data.cancel) }), secrets };
    default:
      return { state, secrets };
  }
}
