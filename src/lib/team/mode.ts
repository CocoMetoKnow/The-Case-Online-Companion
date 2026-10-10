/** Whether the Team Mode screen is open, plus its saved run. Kept apart from the main game store so the two never touch. */
import { useSyncExternalStore } from "react";
import { deserialize, serialize, type TeamState } from "./engine.ts";

const KEY = "gmm.team.v1";
let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function openTeam() {
  open = true;
  emit();
}
export function closeTeam() {
  open = false;
  emit();
}
export function useTeamOpen(): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => open,
    () => false,
  );
}

export function loadSaved(): TeamState | null {
  try {
    return deserialize(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
export function saveRun(s: TeamState | null) {
  try {
    if (!s || s.status !== "play") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, serialize(s));
  } catch {
    /* private mode or full storage: the run just will not survive a refresh */
  }
}

// ---------------------------------------------------------------------------------------------
// Online: who this phone is, and what it was doing, so a refresh puts it back at the table.

const PID_KEY = "gmm.team.pid";
const ONLINE_KEY = "gmm.team.online.v1";

export interface OnlineSave {
  role: "host" | "guest";
  code: string;
  pid: string;
  name: string;
  /** Host only: the case code to open the lobby with, and the running game once it starts. */
  seed?: string;
  state?: TeamState;
  seats?: string[];
}

/** A random id kept on this phone, so rejoining the same room returns you to your own seat. */
export function myPid(): string {
  try {
    let v = localStorage.getItem(PID_KEY);
    if (!v) {
      v = `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
      localStorage.setItem(PID_KEY, v);
    }
    return v;
  } catch {
    return `t${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function loadOnline(): OnlineSave | null {
  try {
    const raw = localStorage.getItem(ONLINE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as OnlineSave;
    if (!v || !v.code || !v.pid || (v.role !== "host" && v.role !== "guest")) return null;
    if (v.state && v.state.v !== 1) return null;
    return v;
  } catch {
    return null;
  }
}
export function saveOnline(v: OnlineSave | null) {
  try {
    if (!v) localStorage.removeItem(ONLINE_KEY);
    else localStorage.setItem(ONLINE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
