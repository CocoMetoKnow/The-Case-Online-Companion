/**
 * Team Mode randomness. Everything in a run comes from one small seeded generator, so the same seed
 * always builds the same case (handy for "play this exact case again" and for tests), and the
 * generator's position is kept inside the saved game, so a refresh never changes what happens next.
 */

/** Turn any text into a 32-bit number (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A readable seed such as "AMBER-4821", shown on the case file so a table can replay it. */
export function freshSeed(): string {
  const words = ["AMBER", "RAVEN", "IVORY", "EMBER", "CLARET", "SABLE", "LANTERN", "THISTLE", "COBALT", "WILLOW", "ONYX", "HOLLY"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${1000 + Math.floor(Math.random() * 9000)}`;
}

/** mulberry32. Pure: give it a state, get back a value in [0,1) and the next state. */
export function nextFloat(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** A stateful wrapper for code that builds something in one go (the case generator, puzzle makers). */
export class Rng {
  state: number;
  constructor(seed: number | string) {
    this.state = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
  }
  float(): number {
    const [v, s] = nextFloat(this.state);
    this.state = s;
    return v;
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.float() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.float() * list.length)];
  }
  /** Fisher-Yates on a copy. */
  shuffle<T>(list: readonly T[]): T[] {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  sample<T>(list: readonly T[], n: number): T[] {
    return this.shuffle(list).slice(0, n);
  }
  /** Weighted pick. */
  weighted<T>(items: readonly { item: T; w: number }[]): T {
    const total = items.reduce((s, i) => s + i.w, 0);
    let r = this.float() * total;
    for (const i of items) {
      r -= i.w;
      if (r <= 0) return i.item;
    }
    return items[items.length - 1].item;
  }
}
