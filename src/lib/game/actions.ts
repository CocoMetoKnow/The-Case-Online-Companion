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
import type { GameState, PiecePos, Secrets } from "./types";

export type PlayKind = "roll" | "move" | "stay" | "ask" | "show" | "reply" | "ack" | "accuse" | "done" | "event" | "snake" | "name" | "sync" | "avatar" | "classic";

/** One shared rules pass. The room runs this so every phone sees the same result. */
export function applyPlay(
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
