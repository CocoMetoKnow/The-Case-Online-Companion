/**
 * Player-chosen colors for the whole app (the screen background / case look) and for the
 * detective journal. Each choice is saved on this phone in localStorage and applied by setting
 * a data attribute on <html>; styles.css turns that attribute into the actual colors. The
 * default choice ("classic" background, "blue" journal) removes the attribute, so the game
 * looks exactly as it always did until someone picks something else.
 *
 * A tiny inline script in routes/__root.tsx applies the saved choice before the first paint.
 */

const UI_KEY = "gmm.uiColor";
const JOURNAL_KEY = "gmm.journalColor";

export interface UiColor {
  id: string;
  label: string;
  /** Hue / saturation used for the little preview tile (must match styles.css). */
  h: number;
  s: number;
}

export interface JournalColor {
  id: string;
  label: string;
  /** The CSS filter that recolors /journal.png (must match styles.css). */
  filter: string;
}

export const DEFAULT_UI = "classic";
export const DEFAULT_JOURNAL = "blue";

export const UI_COLORS: UiColor[] = [
  { id: "classic", label: "Classic", h: 28, s: 30 },
  { id: "red", label: "Red", h: 2, s: 48 },
  { id: "orange", label: "Orange", h: 24, s: 55 },
  { id: "yellow", label: "Yellow", h: 46, s: 55 },
  { id: "green", label: "Green", h: 140, s: 38 },
  { id: "teal", label: "Teal", h: 178, s: 40 },
  { id: "blue", label: "Blue", h: 215, s: 45 },
  { id: "purple", label: "Purple", h: 270, s: 38 },
  { id: "pink", label: "Pink", h: 330, s: 42 },
  { id: "black", label: "Black", h: 0, s: 0 },
];

export const JOURNAL_COLORS: JournalColor[] = [
  { id: "red", label: "Red", filter: "hue-rotate(138deg) saturate(1.6) brightness(1.3)" },
  { id: "orange", label: "Orange", filter: "hue-rotate(163deg) saturate(1.4) brightness(1.5)" },
  { id: "yellow", label: "Yellow", filter: "hue-rotate(186deg) saturate(1.5) brightness(1.7)" },
  { id: "green", label: "Green", filter: "hue-rotate(273deg) saturate(1.2) brightness(1.2)" },
  { id: "teal", label: "Teal", filter: "hue-rotate(313deg) saturate(1.2) brightness(1.2)" },
  { id: "blue", label: "Blue", filter: "none" },
  { id: "purple", label: "Purple", filter: "hue-rotate(53deg) saturate(1.1) brightness(1.25)" },
  { id: "pink", label: "Pink", filter: "hue-rotate(108deg) saturate(1) brightness(1.5)" },
  { id: "brown", label: "Brown", filter: "hue-rotate(165deg) saturate(0.7) brightness(0.95)" },
  { id: "black", label: "Black", filter: "grayscale(1) brightness(0.55)" },
];

function read(key: string, fallback: string, valid: string[]): string {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v && valid.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / full storage: the color still applies for this visit.
  }
}

export function getUiColor(): string {
  return read(UI_KEY, DEFAULT_UI, UI_COLORS.map((c) => c.id));
}

export function getJournalColor(): string {
  return read(JOURNAL_KEY, DEFAULT_JOURNAL, JOURNAL_COLORS.map((c) => c.id));
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Colors of one background choice, for painting its preview tile. */
export function uiPreview(c: UiColor) {
  const hsl = (l: number, extra = 0) => `hsl(${c.h} ${Math.min(100, c.s + extra)}% ${l}%)`;
  return {
    page: c.id === "classic" ? "#241811" : hsl(10),
    shellTop: c.id === "classic" ? "#4f3727" : hsl(22, 6),
    shellBottom: c.id === "classic" ? "#1a100c" : hsl(9),
  };
}

function applyAttr(name: string, value: string, fallback: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (value === fallback) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

export function setUiColor(id: string): string {
  const next = UI_COLORS.some((c) => c.id === id) ? id : DEFAULT_UI;
  write(UI_KEY, next);
  applyAttr("data-ui", next, DEFAULT_UI);
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="theme-color"]');
    const c = UI_COLORS.find((x) => x.id === next);
    if (meta && c) meta.setAttribute("content", next === DEFAULT_UI ? "#14110e" : hslToHex(c.h, c.s, 7));
  }
  return next;
}

export function setJournalColor(id: string): string {
  const next = JOURNAL_COLORS.some((c) => c.id === id) ? id : DEFAULT_JOURNAL;
  write(JOURNAL_KEY, next);
  applyAttr("data-journal", next, DEFAULT_JOURNAL);
  return next;
}

/** Re-applies both saved choices. Safe to call any number of times. */
export function initTheme() {
  setUiColor(getUiColor());
  setJournalColor(getJournalColor());
}

/** Source of the pre-paint script in routes/__root.tsx (kept here so the keys stay in sync). */
export const THEME_BOOT_SCRIPT = `try{var d=document.documentElement,u=localStorage.getItem(${JSON.stringify(
  UI_KEY,
)}),j=localStorage.getItem(${JSON.stringify(
  JOURNAL_KEY,
)});if(u&&u!=="${DEFAULT_UI}")d.setAttribute("data-ui",u);if(j&&j!=="${DEFAULT_JOURNAL}")d.setAttribute("data-journal",j)}catch(e){}`;
