// ===== UI LAYER: turn tracker. Display only, it reads the game state and never changes it. =====
import { currentPlayer, useActorId, useGame } from "@/lib/game/store";
import type { GameState, Player } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { avatarFor, Headshot } from "./PlayerBadge";

/** Players who still take turns, starting with whoever is up now and then in seating order. */
function lineUp(state: GameState): Player[] {
  const cur = currentPlayer(state);
  const seats = state.turnOrder
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p) && !p!.eliminated);
  const at = cur ? seats.findIndex((p) => p.id === cur.id) : -1;
  return at <= 0 ? seats : [...seats.slice(at), ...seats.slice(0, at)];
}

function Face({ player, size, ring }: { player: Player; size: number; ring?: boolean }) {
  const cards = useGame((s) => s.state?.cards ?? []);
  const art = avatarFor(player, cards);
  const letter = (player.name.trim().slice(0, 1) || "?").toUpperCase();
  return (
    <span
      className={cn("turn-face", ring && "turn-face-on")}
      style={{ width: size, height: size, borderColor: player.color }}
    >
      {art ? (
        <Headshot src={art} className="size-full" />
      ) : (
        <span className="grid size-full place-items-center rounded-full font-semibold text-[#f6f1e6]" style={{ background: player.color, fontSize: size * 0.45 }}>
          {letter}
        </span>
      )}
    </span>
  );
}

/**
 * The whole turn order at a glance. The player up now is big and ringed, the player after them is
 * tagged "Next", and everyone else follows in order. Your own seat says "You".
 */
export function TurnTracker() {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  if (!state || state.phase === "lobby" || state.phase === "gameover") return null;
  const order = lineUp(state);
  if (order.length < 2) return null;
  const [now, ...rest] = order;
  const next = rest[0];
  const guided = (state.influences ?? []).some((i) => i.victimId === now.id);

  return (
    <div className="turn-tracker" role="list" aria-label="Turn order">
      <div className="turn-slot turn-slot-now" role="listitem" aria-current="true">
        <Face player={now} size={44} ring />
        <span className="turn-tag turn-tag-now">{now.id === actor ? "Your turn" : "Up now"}</span>
        <span className="turn-name">{now.id === actor ? "You" : now.name}</span>
      </div>
      <span className="turn-arrow" aria-hidden>
        ›
      </span>
      {rest.map((player) => {
        const isNext = player.id === next.id;
        const mine = player.id === actor;
        return (
          <div key={player.id} className={cn("turn-slot", isNext && "turn-slot-next")} role="listitem">
            <Face player={player} size={isNext ? 36 : 30} />
            <span className={cn("turn-tag", isNext && "turn-tag-next")}>{isNext ? (mine ? "You're next" : "Next") : mine ? "You" : "\u00a0"}</span>
            <span className="turn-name">{mine ? "You" : player.name}</span>
          </div>
        );
      })}
      {guided ? <span className="sr-only">This turn is being guided by another player.</span> : null}
    </div>
  );
}
