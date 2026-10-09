import { useSyncExternalStore } from "react";

/**
 * Camera controls for the digital board. Saved on this phone only.
 *  - "touch": the default. Drag with a finger (or the mouse on a computer) to move the board, pinch with two fingers
 *    (or scroll the mouse wheel) to zoom. The turn, zoom and reset buttons stay in the camera strip.
 *  - "joystick": the thumb stick that pops up from the camera button.
 */
export type CameraControls = "touch" | "joystick";

const KEY = "gmm.camera-controls";
const listeners = new Set<() => void>();
let memory: CameraControls | null = null;

export function getCameraControls(): CameraControls {
  if (memory !== null) return memory;
  if (typeof localStorage === "undefined") return "touch";
  try {
    return localStorage.getItem(KEY) === "joystick" ? "joystick" : "touch";
  } catch {
    return "touch";
  }
}

export function setCameraControls(mode: CameraControls) {
  memory = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private mode: it still applies for this visit through the listeners below.
  }
  listeners.forEach((fn) => fn());
}

export function useCameraControls(): CameraControls {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getCameraControls,
    () => "touch",
  );
}

/** True on a device whose main pointer is a mouse (a computer), so the hint can say "scroll" instead of "pinch". */
export function hasMouse(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
