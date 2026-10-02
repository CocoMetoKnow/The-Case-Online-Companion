import type { GameState } from "./types";

export function sanitizeState(state: GameState, viewerId: string): GameState {
  const q = state.question;
  let question = q;
  if (q) {
    const spying = state.spy?.byId === viewerId && state.spy.targetId === q.askerId;
    // A lost Gambler bet means the asker never gets to see the card that was shown.
    const lostBet = q.gambleResult === "lost" && viewerId === q.askerId && viewerId !== q.showerId;
    const canSeeShown = (viewerId === q.askerId && !lostBet) || viewerId === q.showerId || spying;
    question = {
      ...q,
      matchingCardIds: viewerId === q.showerId ? q.matchingCardIds : [],
      shownCardId: canSeeShown ? q.shownCardId : null,
    };
    // Extra Difficulty: only the asker is ever told the NPC showed a card. Everyone else sees nothing special.
    if (q.npcShown && viewerId !== q.askerId) {
      question = { ...question, showerId: null, npcShown: false, cardShown: false };
    }
    // Speak mode: the cards were said out loud. The game keeps them for the asker's reminder (and the NPC), nobody else's screen.
    if (q.spoken && viewerId !== q.askerId) {
      question = { ...question, suspectId: "", roomId: "", weaponId: "", timeId: undefined };
    }
    // The category of a Gambler bet stays with the gambler. The table only hears whether the bet won or lost.
    if (q.gamble && viewerId !== q.askerId) {
      question = { ...question, gamble: { category: "" } };
    }
  }
  let event = state.event;
  if (event && event.step === "show-private" && event.data.viewerId !== viewerId) {
    event = { ...event, data: { ...event.data, cardId: undefined } };
  }
  if (event && event.kind === "red-herring" && event.step === "deliver") {
    const data = { ...event.data };
    const senderId = String(data.senderId ?? "");
    const truthId = String(data.truthId ?? "");
    const lieId = String(data.lieId ?? "");
    const heard = Array.isArray(data.heard) ? (data.heard as string[]) : [];
    if (viewerId === senderId) {
      event = { ...event, data };
    } else if (viewerId === truthId || viewerId === lieId) {
      event = {
        ...event,
        data: {
          senderId,
          note: viewerId === truthId ? data.truthText : data.lieText,
          pending: !heard.includes(viewerId),
        },
      };
    } else {
      event = { ...event, data: { senderId } };
    }
  }
  if (event && event.kind === "rumor" && event.step === "show-rumor" && event.data.viewerId !== viewerId) {
    event = { ...event, data: { ...event.data, rumor: undefined } };
  }
  if (event && event.data?.secret && event.data.byId !== viewerId) {
    event = { ...event, data: { ...event.data, cardId: undefined } };
  }
  if (event && event.data?.spyTarget && event.data.byId !== viewerId) {
    event = { ...event, data: { ...event.data, spyTarget: undefined } };
  }
  let gambler = state.gambler ?? null;
  if (gambler && gambler.playerId !== viewerId) gambler = { playerId: gambler.playerId, category: "" };
  let hush = state.hush;
  if (hush && hush.byId !== viewerId) hush = { cardId: "", byId: hush.byId };
  let spy = state.spy;
  if (spy && spy.byId !== viewerId) spy = { ...spy, targetId: "" };
  if (q && spy && spy.byId === viewerId && spy.targetId && spy.targetId === q.askerId && q.shownCardId) {
    question = { ...question!, shownCardId: q.shownCardId };
  }
  let privateShow = state.privateShow ?? null;
  if (privateShow && viewerId !== privateShow.fromId && viewerId !== privateShow.toId) {
    privateShow = { ...privateShow, cardId: "" };
  }
  return { ...state, question, event, hush, spy, privateShow, gambler };
}
