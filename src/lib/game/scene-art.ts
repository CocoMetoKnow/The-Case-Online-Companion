import type { CardDef } from "./types";

/** Cut-out character art (transparent WebP, public/cutouts/chars). Every character with a full-length picture. */
const CHAR_IDS = new Set([
  "lord-harrington", "lady-violet", "dr-finch", "chef-marco", "miss-scarlet", "colonel-mustard",
  "professor-plum", "mrs-peacock", "the-butler", "mrs-white", "mr-green", "mr-broke", "madame-coral",
  "the-chauffeur", "miss-penny", "oakley-autumns", "mr-fairwind", "ki-annie",
]);

/** Cut-out weapons (public/cutouts/items) and the matching heist items (public/cutouts/items/heist). */
const ITEM_IDS = new Set([
  "candlestick", "rope", "lead-pipe", "revolver", "knife", "wrench", "poison-bottle", "fireplace-poker",
  "heavy-bookend", "walking-cane", "golf-club", "horseshoe", "trophy-cup", "silk-scarf",
]);

const ROOM_IDS = new Set([
  "observatory", "grand-hall", "lounge", "library", "study", "dining-room", "conservatory", "billiard-room",
  "kitchen", "cellar", "ballroom", "catacombs", "the-vault", "smugglers-tunnel", "boiler-room",
]);

/** A host's own photo wins; otherwise the cut-out, otherwise nothing (the scene falls back to a framed card). */
export function charCutout(card: CardDef | undefined): string | undefined {
  if (!card || card.imageDataUrl) return undefined;
  return CHAR_IDS.has(card.id) ? `/cutouts/chars/${card.id}.webp` : undefined;
}

export function itemCutout(card: CardDef | undefined, heist: boolean): string | undefined {
  if (!card || card.imageDataUrl) return undefined;
  if (!ITEM_IDS.has(card.id)) return undefined;
  return heist ? `/cutouts/items/heist/${card.id}.webp` : `/cutouts/items/${card.id}.webp`;
}

export function roomBackdrop(card: CardDef | undefined): string | undefined {
  if (!card || card.imageDataUrl) return card?.imageDataUrl;
  return ROOM_IDS.has(card.id) ? `/cutouts/rooms/${card.id}.webp` : undefined;
}

/** The time of day in words: "Dusk", or "Dusk · 6:30" when the card prints a clock. */
export function timeWords(card: CardDef | undefined): string {
  if (!card) return "";
  return card.clock ? `${card.name} · ${card.clock}` : card.name;
}
