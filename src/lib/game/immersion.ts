import { useSyncExternalStore } from "react";

/**
 * Immersion Mode: when on, every suggestion plays a short scene (the room as the background, the weapon, the
 * suspect and the time in words). Saved on this phone only. Solve the Case plays its scene whether or not this is on.
 */
const KEY = "gmm.immersion";
const listeners = new Set<() => void>();

export function getImmersion(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setImmersion(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Private mode: it still applies for this visit through the listeners below.
    memory = on;
  }
  listeners.forEach((fn) => fn());
}

let memory: boolean | null = null;
const read = () => (memory !== null ? memory : getImmersion());

export function useImmersion(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
    () => false,
  );
}
