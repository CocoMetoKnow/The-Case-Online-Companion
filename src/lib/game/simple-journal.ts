import { useSyncExternalStore } from "react";

/**
 * Simple journaling: a personal setting, saved on this phone only. When it is on, the journal has one square per card.
 * Tapping the square lists the other players, and the one you pick (who showed you the card) shows in the square.
 */
const KEY = "gmm.simple-journal";
const listeners = new Set<() => void>();
let memory: boolean | null = null;

export function getSimpleJournal(): boolean {
  if (memory !== null) return memory;
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSimpleJournal(on: boolean) {
  memory = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Private mode: it still applies for this visit through the listeners below.
  }
  listeners.forEach((fn) => fn());
}

export function useSimpleJournal(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSimpleJournal,
    () => false,
  );
}
