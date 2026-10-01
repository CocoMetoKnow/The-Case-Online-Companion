export const CAST = [
  { name: "Miss Scarlet", src: "/characters/scarlet.jpg?v=3", label: "Guest" },
  { name: "Lady Violet", src: "/characters/violet.jpg?v=3", label: "Guest" },
  { name: "Dr. Finch", src: "/characters/finch.jpg?v=4", label: "Guest" },
  { name: "Chef Marco", src: "/characters/chef.jpg?v=3", label: "Guest" },
  { name: "Colonel Flintwood", src: "/characters/colonel.jpg?v=3", label: "Guest" },
  { name: "Professor Plum", src: "/characters/professor.jpg?v=3", label: "Guest" },
  { name: "The Butler", src: "/characters/butler.jpg?v=4", label: "Guest" },
] as const;

export function portraitFor(seat: number) {
  const i = ((seat % CAST.length) + CAST.length) % CAST.length;
  return CAST[i];
}

/** The one place that decides which face a player wears: their pick, else seat order. */
export function portraitOf(player: { seat: number; portrait?: number }) {
  return portraitFor(typeof player.portrait === "number" ? player.portrait : player.seat);
}

/** Cast indexes already worn by other players, so a pick stays unique at the table. */
export function takenPortraits(players: { id: string; seat: number; portrait?: number }[], exceptId?: string) {
  return new Set(
    players.filter((p) => p.id !== exceptId).map((p) => (typeof p.portrait === "number" ? p.portrait : p.seat) % CAST.length),
  );
}
