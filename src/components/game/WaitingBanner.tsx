import { blockingPlayerIds } from "@/lib/game/engine";
import { useActorId, useGame } from "@/lib/game/store";
import { ProfileBadge } from "./PlayerBadge";

/**
 * While a power up is waiting on someone else, this says who. It shows their profile pictures and names, and it
 * names the power up, so nobody wonders why the game has stopped. It does not show for the player who has to act.
 */
export function WaitingBanner() {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  if (!state || state.phase !== "event" || !state.event) return null;
  if (state.settings.playMode !== "online") return null;
  const blocking = blockingPlayerIds(state);
  if (!blocking.length || blocking.includes(actor)) return null;
  const players = blocking
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (!players.length) return null;
  return (
    <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[16px] border border-brass bg-[#2a1410] px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.5)]" role="status">
      <div className="flex shrink-0 -space-x-2">
        {players.slice(0, 4).map((p) => (
          <ProfileBadge key={p.id} player={p} cards={state.cards} size="md" />
        ))}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-[0.18em] text-brass">{state.event.title}</p>
        <p className="font-display text-lg leading-tight text-paper">
          Waiting on {players.map((p) => p.name).join(", ")}
        </p>
      </div>
    </div>
  );
}
