import { avatarCharacters, defaultCardArt, portraitArt } from "@/lib/game/cards";
import type { CardDef, Player } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

/** The profile picture for a character. Custom uploads win, then the round portrait, then the card painting. */
export function suspectArt(card: CardDef | undefined): string | undefined {
  if (!card) return undefined;
  return card.imageDataUrl || portraitArt(card.id) || defaultCardArt(card.id);
}

/** The chosen character's card art for a player, or nothing if they have not picked one. */
export function avatarFor(player: Pick<Player, "avatar"> | undefined, cards: CardDef[]): string | undefined {
  if (!player?.avatar) return undefined;
  return suspectArt(avatarCharacters(cards).find((card) => card.id === player.avatar));
}

/**
 * Tight circular headshot. The card paintings are tall portraits, so the picture is drawn at
 * 150% width and pinned near the top: hat or hair, face and the top of the shoulders sit
 * inside the circle (see .avatar-crop in styles.css).
 */
export function Headshot({ src, className, label }: { src: string; className?: string; label?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  // A portrait that will not load (missing file, bad cache) falls back to the card painting, so the circle is never empty.
  const isPortrait = src.startsWith("/portraits/");
  const fallback = isPortrait ? defaultCardArt(src.slice("/portraits/".length).replace(/\.jpg.*$/, "")) : undefined;
  const useFallback = isPortrait && failed === src && Boolean(fallback);
  const shown = useFallback ? fallback! : src;
  if (failed === shown) return null;
  const ready = isPortrait && !useFallback;
  return (
    <span className={cn("avatar-crop", ready && "avatar-crop-ready", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <img src={shown} alt="" decoding="async" draggable={false} onError={() => setFailed(shown)} />
    </span>
  );
}

/**
 * A player's indicator: their headshot with the letter badge tucked over its lower-right edge,
 * matching the journal header in the reference. With no character picked yet it is just the
 * letter badge, exactly like before.
 */
export function ProfileBadge({
  player,
  cards,
  size = "md",
  className,
}: {
  player: Pick<Player, "name" | "color" | "avatar">;
  cards: CardDef[];
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const art = avatarFor(player, cards);
  const letter = (player.name.trim().slice(0, 1) || "?").toUpperCase();
  return (
    <span className={cn("profile-badge", `profile-badge-${size}`, art && "has-art", className)} title={player.name}>
      {art ? <Headshot src={art} className="profile-badge-photo" /> : null}
      <span className="profile-badge-letter" style={{ background: player.color }}>
        {letter}
      </span>
    </span>
  );
}
