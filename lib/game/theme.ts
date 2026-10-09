/**
 * Player-chosen colors for the whole app (the screen background / case look) and for the
 * detective journal. Each choice is saved on this phone in localStorage and applied by setting
 * a data attribute on <html>; styles.css turns that attribute into the actual colors. The
 * default choice ("classic" background, "blue" journal) removes the attribute, so the game
 * looks exactly as it always did until someone picks something else.
 *
 * A tiny inline script in routes/__root.tsx applies the saved choice before the first paint.
 *
 * LOOK (skin): a fifth, separate choice. "classic" (the default, no attribute) is the original look. "casefile" sets
 * data-skin="casefile" on <html>, and skin-casefile.css restyles the whole app as a detective's case file. The skin
 * is built from the same variables as the color choices above (--ui-h / --ui-s, --color-brass, the journal and card
 * colors), so every color option keeps working in both looks.
 */

import { useSyncExternalStore } from "react";

const UI_KEY = "gmm.uiColor";
const JOURNAL_KEY = "gmm.journalColor";
const ACCENT_KEY = "gmm.accentColor";
const CARD_KEY = "gmm.cardColor";
const SKIN_KEY = "gmm.skin";

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
export const DEFAULT_ACCENT = "gold";
export const DEFAULT_CARD = "red";
export const DEFAULT_SKIN = "classic";

/** The overall look of the app. Everyone starts on "classic"; "casefile" is the mystery look. */
export interface Skin {
  id: string;
  label: string;
  blurb: string;
}

export const SKINS: Skin[] = [
  { id: "classic", label: "Classic", blurb: "The look the game has always had." },
  { id: "casefile", label: "Case File", blurb: "Lamplight, leather and evidence tags." },
];

/** The main color of the card backs and of the border wrapped around card fronts. */
export interface CardColor {
  id: string;
  label: string;
}

/** Each id has a matching /cards/backs/<id>.jpg and <id>-thumb.jpg, and a :root[data-card] rule in styles.css. */
export const CARD_COLORS: CardColor[] = [
  { id: "red", label: "Red" },
  { id: "orange", label: "Orange" },
  { id: "yellow", label: "Yellow" },
  { id: "green", label: "Green" },
  { id: "teal", label: "Teal" },
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
  { id: "pink", label: "Pink" },
  { id: "brown", label: "Brown" },
  { id: "black", label: "Black" },
];

/** The color of the "gold" text, borders, outlines and highlights (--color-brass in styles.css). */
export interface AccentColor {
  id: string;
  label: string;
  /** Must match the :root[data-accent] rules in styles.css. */
  hex: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: "gold", label: "Gold", hex: "#b08d57" },
  { id: "red", label: "Red", hex: "#d9594f" },
  { id: "orange", label: "Orange", hex: "#e48b3a" },
  { id: "yellow", label: "Yellow", hex: "#e6c64a" },
  { id: "green", label: "Green", hex: "#5fbb7c" },
  { id: "teal", label: "Teal", hex: "#4fb6b2" },
  { id: "blue", label: "Blue", hex: "#5d9ddb" },
  { id: "purple", label: "Purple", hex: "#a681dc" },
  { id: "pink", label: "Pink", hex: "#e47fae" },
  { id: "silver", label: "Silver", hex: "#b9bdc6" },
  { id: "white", label: "White", hex: "#f1ece2" },
];

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

export function getAccentColor(): string {
  return read(ACCENT_KEY, DEFAULT_ACCENT, ACCENT_COLORS.map((c) => c.id));
}

export function getCardColor(): string {
  return read(CARD_KEY, DEFAULT_CARD, CARD_COLORS.map((c) => c.id));
}

export function getSkin(): string {
  return read(SKIN_KEY, DEFAULT_SKIN, SKINS.map((c) => c.id));
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

export function setAccentColor(id: string): string {
  const next = ACCENT_COLORS.some((c) => c.id === id) ? id : DEFAULT_ACCENT;
  write(ACCENT_KEY, next);
  applyAttr("data-accent", next, DEFAULT_ACCENT);
  return next;
}

export function setCardColor(id: string): string {
  const next = CARD_COLORS.some((c) => c.id === id) ? id : DEFAULT_CARD;
  write(CARD_KEY, next);
  applyAttr("data-card", next, DEFAULT_CARD);
  return next;
}

const skinListeners = new Set<() => void>();
let skinMemory: string | null = null;

/** The two typefaces the Case File look uses are only fetched once somebody turns it on. */
const SKIN_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Special+Elite&display=swap";

function ensureSkinFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById("skin-fonts")) return;
  const link = document.createElement("link");
  link.id = "skin-fonts";
  link.rel = "stylesheet";
  link.href = SKIN_FONTS_HREF;
  document.head.appendChild(link);
}

export function setSkin(id: string): string {
  const next = SKINS.some((c) => c.id === id) ? id : DEFAULT_SKIN;
  write(SKIN_KEY, next);
  skinMemory = next;
  applyAttr("data-skin", next, DEFAULT_SKIN);
  if (next !== DEFAULT_SKIN) ensureSkinFonts();
  skinListeners.forEach((fn) => fn());
  return next;
}

/** The look in use right now; components that need different markup per look (the title screen) read this. */
export function useSkin(): string {
  return useSyncExternalStore(
    (fn) => {
      skinListeners.add(fn);
      return () => skinListeners.delete(fn);
    },
    () => skinMemory ?? getSkin(),
    () => DEFAULT_SKIN,
  );
}

/** Re-applies all saved choices. Safe to call any number of times. */
export function initTheme() {
  setUiColor(getUiColor());
  setJournalColor(getJournalColor());
  setAccentColor(getAccentColor());
  setCardColor(getCardColor());
  setSkin(getSkin());
}

/** Source of the pre-paint script in routes/__root.tsx (kept here so the keys stay in sync). */
export const THEME_BOOT_SCRIPT =
  "try{var d=document.documentElement,g=function(k){return localStorage.getItem(k)};" +
  `var u=g(${JSON.stringify(UI_KEY)}),j=g(${JSON.stringify(JOURNAL_KEY)}),a=g(${JSON.stringify(ACCENT_KEY)}),c=g(${JSON.stringify(CARD_KEY)}),k=g(${JSON.stringify(SKIN_KEY)});` +
  `if(u&&u!==${JSON.stringify(DEFAULT_UI)})d.setAttribute("data-ui",u);` +
  `if(j&&j!==${JSON.stringify(DEFAULT_JOURNAL)})d.setAttribute("data-journal",j);` +
  `if(a&&a!==${JSON.stringify(DEFAULT_ACCENT)})d.setAttribute("data-accent",a);` +
  `if(c&&c!==${JSON.stringify(DEFAULT_CARD)})d.setAttribute("data-card",c);` +
  `if(k===${JSON.stringify("casefile")})d.setAttribute("data-skin",k)}catch(e){}`;
