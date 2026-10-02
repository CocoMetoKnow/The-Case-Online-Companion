import { Button } from "@/components/ui/button";
import { avatarCharacters } from "@/lib/game/cards";
import { useGame } from "@/lib/game/store";
import type { Player } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Headshot, suspectArt } from "./PlayerBadge";

/**
 * "Pick Your Character": a button that opens a popup of every character profile picture in
 * the game, whether or not that character is a card in this deck. The chosen character's art becomes the player's profile picture (journal
 * header, lobby). One guest per character; taken ones are dimmed and name who has them.
 */
export function PickCharacterButton({
  player,
  className,
  variant = "outline",
  size = "sm",
}: {
  player: Player;
  className?: string;
  variant?: "outline" | "default" | "ghost" | "paper";
  size?: "sm" | "default" | "lg";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        Pick Your Character
      </Button>
      {open ? <CharacterPicker player={player} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function CharacterPicker({ player, onClose }: { player: Player; onClose: () => void }) {
  const state = useGame((s) => s.state);
  const setAvatar = useGame((s) => s.setAvatar);
  if (!state) return null;
  const characters = avatarCharacters(state.cards, Boolean(state.settings.classicNames));
  const owners = new Map<string, Player>(state.players.filter((p) => p.avatar).map((p): [string, Player] => [p.avatar as string, p]));
  const current = state.players.find((p) => p.id === player.id)?.avatar;

  return (
    <div
      className="picker-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Pick your character"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="case-shell flex max-h-[88dvh] w-full max-w-md flex-col rounded-[28px] px-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-brass">{player.name}</p>
            <h2 className="font-display text-3xl leading-none text-paper">Pick your character</h2>
          </div>
          <button type="button" aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full border border-paper/30 text-lg text-paper" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">Their portrait becomes your profile picture next to your letter.</p>
        <ul className="mt-3 grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-y-auto pb-1">
          {characters.map((card) => {
            const owner = owners.get(card.id);
            const mine = current === card.id;
            const taken = Boolean(owner) && !mine;
            const art = suspectArt(card);
            return (
              <li key={card.id}>
                <button
                  type="button"
                  disabled={taken}
                  aria-pressed={mine}
                  aria-label={taken ? `${card.name}, taken by ${owner?.name}` : card.name}
                  className={cn("picker-choice", mine && "picker-choice-on", taken && "picker-choice-taken")}
                  onClick={() => {
                    setAvatar(player.id, mine ? "" : card.id);
                    onClose();
                  }}
                >
                  <span className="picker-photo">
                    {art ? <Headshot src={art} className="size-full" /> : <span className="grid size-full place-items-center bg-[#2a1818] font-display text-3xl text-paper">{card.name.slice(0, 1)}</span>}
                  </span>
                  <span className="mt-1 block truncate text-center font-display text-sm leading-tight text-paper">{card.name}</span>
                  {taken ? <span className="block truncate text-center text-[10px] uppercase tracking-[0.1em] text-subtle">{owner?.name}</span> : null}
                  {mine ? <span className="block text-center text-[10px] uppercase tracking-[0.1em] text-brass">Yours · tap to clear</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
