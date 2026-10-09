import { useSyncExternalStore } from "react";

/**
 * Extra Visuals: when on, a suggestion changes the background of the screen to the room that was named, with the
 * suspect, the weapon and the time of day (in words) sitting in the background behind the normal question screen.
 * It never takes over the screen. Saved on this phone only. Solve the Case plays its own scene whether or not this is on.
 */
const KEY = "gmm.extra-visuals";
/** What this setting was saved under before it was renamed, so nobody's choice is lost. */
const OLD_KEY = "gmm.immersion";
const listeners = new Set<() => void>();
let memory: boolean | null = null;

export function getExtraVisuals(): boolean {
  if (memory !== null) return memory;
  if (typeof localStorage === "undefined") return false;
  try {
    const saved = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    return saved === "1";
  } catch {
    return false;
  }
}

export function setExtraVisuals(on: boolean) {
  memory = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Private mode: it still applies for this visit through the listeners below.
  }
  listeners.forEach((fn) => fn());
}

export function useExtraVisuals(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getExtraVisuals,
    () => false,
  );
}
