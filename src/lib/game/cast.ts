export const CAST = [
  { src: "/characters/scarlet.jpg?v=3", label: "Guest" },
  { src: "/characters/violet.jpg?v=3", label: "Guest" },
  { src: "/characters/finch.jpg?v=3", label: "Guest" },
  { src: "/characters/chef.jpg?v=3", label: "Guest" },
  { src: "/characters/colonel.jpg?v=3", label: "Guest" },
  { src: "/characters/professor.jpg?v=3", label: "Guest" },
  { src: "/characters/butler.jpg?v=3", label: "Guest" },
] as const;

export function portraitFor(seat: number) {
  const i = ((seat % CAST.length) + CAST.length) % CAST.length;
  return CAST[i];
}
