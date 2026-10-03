/**
 * One personal color per character, used only to color-code that guest's column in the journal.
 * It is separate from every color in Settings (UI, text and border, card and journal colors) and
 * from each player's letter-badge color, and it never changes any of them.
 *
 * No two characters share a color. A guest who has not picked a character has no color yet.
 */
export const CHARACTER_COLORS: Record<string, string> = {
  "the-butler": "#7a1f2b", // Mr. Take: maroon
  "miss-scarlet": "#e0262f", // Miss Crimson / Miss Scarlet: red
  "madame-coral": "#ff8a7a", // coral
  "chef-marco": "#f27c0c", // orange
  "miss-penny": "#a8642d", // penny copper
  "oakley-autumns": "#a6c30f", // daisy lime
  "colonel-mustard": "#d9a400", // Colonel Flintwood / Mustard: mustard gold
  "mr-fairwind": "#7b7f2c", // Morgan Drake: olive coat
  "mr-green": "#3a9d4f", // Mr. Olive / Mr. Green: green
  "dr-finch": "#6fcf9f", // Dr. Bunny: mint scrubs
  "mrs-peacock": "#14a0a6", // Mrs. Pearl / Mrs. Peacock: peacock teal
  "mrs-white": "#8cc3ee", // Mrs. Snow / Mrs. White: ice blue
  "lord-harrington": "#2f56c5", // royal blue
  "the-chauffeur": "#5f7a8c", // gunmetal blue-gray
  "lady-violet": "#b392f0", // violet
  "professor-plum": "#7e3f98", // Professor Quill / Plum: plum
  "ki-annie": "#c2257f", // paint magenta
  "mr-broke": "#3c4048", // black hat: charcoal
};

/** Spare colors for characters the host adds themselves. Picked by name so a guest keeps the same one. */
const SPARE = ["#e06c9f", "#4aa3a0", "#c9822b", "#6d6fd1", "#8d6e4f", "#58b368", "#d46a4e", "#3f8fbf"];

/** The journal color for a picked character, or undefined if no character is picked. */
export function characterColor(characterId: string | undefined): string | undefined {
  if (!characterId) return undefined;
  const fixed = CHARACTER_COLORS[characterId];
  if (fixed) return fixed;
  let hash = 0;
  for (let i = 0; i < characterId.length; i++) hash = (hash * 31 + characterId.charCodeAt(i)) >>> 0;
  return SPARE[hash % SPARE.length];
}
