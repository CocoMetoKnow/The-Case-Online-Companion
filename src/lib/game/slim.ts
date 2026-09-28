import type { GameState } from "./types";

/** Drop pictures and trim the log so a turn is a small message, not the whole case file. */
export function slimState(state: GameState): GameState {
  return {
    ...state,
    cards: state.cards.map(({ imageDataUrl: _image, blurb, ...card }) => ({
      ...card,
      blurb: (blurb ?? "").slice(0, 80),
    })),
    log: state.log.slice(-12),
  };
}

/** Same cards as last time: a short stamp, not the whole deck. */
export function shortStamp(parts: string[]): string {
  let hash = 2166136261;
  for (const text of parts) {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 124;
  }
  return (hash >>> 0).toString(36);
}

export function cardStamp(cards: { id: string; name: string; category: string }[]): string {
  return shortStamp(cards.map((card) => `${card.id}\n${card.name}\n${card.category}`));
}
