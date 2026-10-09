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
