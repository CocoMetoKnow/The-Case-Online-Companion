/**
 * ============================================================
 *  UI / RENDER LAYER — shared presentation state
 * ============================================================
 *  Nothing in here knows the rules of the game. The game engine / logic
 *  module may call the exported `uiHooks` (open the journal, skip a deal,
 *  switch skins) but should never import React components.
 *
 *  Persisted (localStorage):
 *    gmm.ui  = "classic" | "detective"   (skin)
 *    gmm.music / gmm.sfx                 (see lib/game/sfx.ts)
 *    gmm.player-name.v1                  (see lib/game/storage.ts)
 */
import { create } from "zustand";

export type Skin = "detective" | "classic";
const SKIN_KEY = "gmm.ui";

export function readSkin(): Skin {
  try {
    return localStorage.getItem(SKIN_KEY) === "classic" ? "classic" : "detective";
  } catch {
    return "detective";
  }
}

function applySkin(skin: Skin) {
  if (typeof document !== "undefined") document.documentElement.dataset.ui = skin;
}

interface UIState {
  skin: Skin;
  journalOpen: boolean;
  /** True while the opening deal is animating; the hand ignores taps until it lands. */
  dealing: boolean;
  setSkin: (skin: Skin) => void;
  initSkin: () => void;
  setJournalOpen: (open: boolean) => void;
  setDealing: (dealing: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  skin: "detective",
  journalOpen: false,
  dealing: false,
  setSkin: (skin) => {
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* private mode: the choice simply lasts for this visit */
    }
    applySkin(skin);
    set({ skin });
  },
  initSkin: () => {
    const skin = readSkin();
    applySkin(skin);
    set({ skin });
  },
  setJournalOpen: (journalOpen) => set({ journalOpen }),
  setDealing: (dealing) => set({ dealing }),
}));

/** Stable entry points for the logic module. */
export const uiHooks = {
  openJournal: () => useUI.getState().setJournalOpen(true),
  closeJournal: () => useUI.getState().setJournalOpen(false),
  setSkin: (skin: Skin) => useUI.getState().setSkin(skin),
  /** Fired by the hand when the last dealt card lands (or the deal is skipped). */
  onDealEnd: (fn: () => void) => {
    const handler = () => fn();
    window.addEventListener("case:deal-end", handler);
    return () => window.removeEventListener("case:deal-end", handler);
  },
};

// Decks already dealt this session, so re-renders never replay the animation.
const dealt = new Set<string>();
export const dealLedger = {
  has: (key: string) => dealt.has(key),
  add: (key: string) => void dealt.add(key),
};
