import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cardArt } from "@/lib/game/cards";
import { charCutout, itemCutout, roomBackdrop, timeWords } from "@/lib/game/scene-art";
import { sfxDrama, sfxReveal, sfxSolveStart } from "@/lib/game/sfx";
import { useImmersion } from "@/lib/game/immersion";
import { turnActorId, useActorId, useGame } from "@/lib/game/store";
import type { CardDef, CategoryId } from "@/lib/game/types";

type Pick = Partial<Record<CategoryId, string>>;

function find(cards: CardDef[], id: string | undefined) {
  return id ? cards.find((card) => card.id === id) : undefined;
}

/** A framed picture, used when a card has no cut-out (a host's own photo, or a custom card). */
function Framed({ card, heist }: { card: CardDef; heist: boolean }) {
  const src = card.imageDataUrl ?? cardArt(card.id, heist);
  return (
    <div className="cs-frame">
      {src ? <img src={src} alt="" draggable={false} /> : <span>{card.name.slice(0, 1)}</span>}
    </div>
  );
}

function Silhouette({ label }: { label: string }) {
  return (
    <div className="cs-empty" aria-hidden>
      <span>?</span>
      <em>{label}</em>
    </div>
  );
}

/**
 * The evidence board: the room as the backdrop, the suspect standing in a spotlight, the weapon dropped in front of
 * them under a magnifying glass, and the time typed out in words. Each slot re-plays its own entrance when its card changes.
 * `staged` spaces the entrances out one after another (the reveal); without it they pop in as soon as they are picked.
 */
export function EvidenceBoard({
  cards,
  pick,
  heist,
  staged = false,
  showEmpty = true,
}: {
  cards: CardDef[];
  pick: Pick;
  heist: boolean;
  staged?: boolean;
  showEmpty?: boolean;
}) {
  const suspect = find(cards, pick.suspect);
  const weapon = find(cards, pick.weapon);
  const room = find(cards, pick.room);
  const time = find(cards, pick.time);
  const bg = roomBackdrop(room);
  const delay = (n: number): CSSProperties => ({ ["--d" as string]: staged ? `${n}s` : "0s" });
  const suspectArt = charCutout(suspect);
  const weaponArt = itemCutout(weapon, heist);
  const timeText = timeWords(time);

  return (
    <div className="cs-board">
      <div key={room?.id ?? "none"} className="cs-bg" style={{ ...delay(2.4), backgroundImage: bg ? `url(${bg})` : undefined }} />
      <div className="cs-dim" />
      <div className="cs-spot" />
      <div className="cs-dust" />

      <div className="cs-people" style={delay(0.5)}>
        {suspect ? (
          <figure key={suspect.id} className="cs-suspect" style={delay(0.5)}>
            {suspectArt ? <img src={suspectArt} alt={suspect.name} draggable={false} /> : <Framed card={suspect} heist={heist} />}
            <figcaption className="cs-tag">{suspect.name}</figcaption>
          </figure>
        ) : showEmpty ? (
          <Silhouette label={heist ? "Who took it" : "The suspect"} />
        ) : null}
      </div>

      <div className="cs-things" style={delay(1.5)}>
        {weapon ? (
          <figure key={weapon.id} className="cs-weapon" style={delay(1.5)}>
            <div className="cs-weapon-art">
              {weaponArt ? <img src={weaponArt} alt={weapon.name} draggable={false} /> : <Framed card={weapon} heist={heist} />}
              <span className="cs-lens" aria-hidden />
            </div>
            <figcaption className="cs-tag cs-tag-small">{weapon.name}</figcaption>
          </figure>
        ) : showEmpty ? (
          <Silhouette label={heist ? "What was taken" : "The weapon"} />
        ) : null}
      </div>

      <div className="cs-notes">
        {room ? (
          <p key={room.id} className="cs-stamp-line" style={delay(2.4)}>
            <b>{heist ? "Where" : "Scene"}</b>
            <span>{room.name}</span>
          </p>
        ) : showEmpty ? (
          <p className="cs-stamp-line cs-faint">
            <b>{heist ? "Where" : "Scene"}</b>
            <span>…</span>
          </p>
        ) : null}
        {time ? (
          <p key={time.id} className="cs-stamp-line cs-typed" style={{ ...delay(3.3), ["--n" as string]: timeText.length }}>
            <b>Time</b>
            <span>{timeText}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function useFlashOnChange(pick: Pick, mute = false) {
  const key = `${pick.suspect ?? ""}|${pick.weapon ?? ""}|${pick.room ?? ""}|${pick.time ?? ""}`;
  const prev = useRef(key);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    setFlash((n) => n + 1);
    if (!mute) sfxReveal();
  }, [key, mute]);
  return flash;
}

/** What everyone else watches while one player names the solution. */
export function FinalWatch({ onLeave }: { onLeave?: () => void }) {
  const state = useGame((s) => s.state);
  const actor = useActorId();
  const naming = state?.naming;
  const pick: Pick = {
    suspect: naming?.suspectId,
    weapon: naming?.weaponId,
    room: naming?.roomId,
    time: naming?.timeId,
  };
  const flash = useFlashOnChange(pick);
  if (!state || !naming || state.phase === "gameover" || state.phase === "lobby") return null;
  if (turnActorId(state) === actor) return null;
  const who = state.players.find((player) => player.id === naming.playerId)?.name ?? "Someone";
  const heist = Boolean(state.settings.heist);
  return (
    <div className="cs-root cs-final folio-sheet" role="dialog" aria-label={`${who} is naming the solution`}>
      <EvidenceBoard cards={state.cards} pick={pick} heist={heist} />
      <div className="cs-heartbeat" aria-hidden />
      {flash ? <div key={flash} className="cs-flash" aria-hidden /> : null}
      <header className="cs-head">
        <div className="flex items-start justify-between gap-3">
          <p className="cs-kicker">Solve the Case</p>
          {onLeave ? (
            <button type="button" className="text-sm text-[#ffd7d2]" onClick={onLeave}>
              Leave
            </button>
          ) : null}
        </div>
        <h2 className="cs-who">{who}</h2>
        <p className="cs-sub">is accusing. Every card lands as it is picked.</p>
      </header>
    </div>
  );
}

/** A hard bit of the screen edge that throbs, for whoever is making the final guess. */
export function Heartbeat() {
  return <div className="cs-heartbeat cs-heartbeat-self" aria-hidden />;
}

let lastSuggestion = "";

/** Immersion Mode: a short scene for each suggestion. Tap anywhere to close it; it closes itself after a few seconds. */
export function SuggestionScene() {
  const state = useGame((s) => s.state);
  const immersion = useImmersion();
  const [shown, setShown] = useState<string | null>(null);
  const q = state?.question;
  const key =
    state && q && q.suspectId && q.roomId && q.weaponId && state.phase !== "gameover" && state.phase !== "lobby"
      ? `${state.startedAt ?? ""}:${state.turnIndex}:${q.askerId}:${q.suspectId}:${q.roomId}:${q.weaponId}:${q.timeId ?? ""}`
      : "";

  useEffect(() => {
    if (!immersion || !key || key === lastSuggestion) return;
    lastSuggestion = key;
    setShown(key);
    sfxSolveStart();
    const timer = window.setTimeout(() => setShown((cur) => (cur === key ? null : cur)), 5600);
    return () => window.clearTimeout(timer);
  }, [immersion, key]);

  if (!state || !q || !immersion || !shown || shown !== key) return null;
  const asker = state.players.find((player) => player.id === q.askerId)?.name ?? "Someone";
  const heist = Boolean(state.settings.heist);
  const pick: Pick = { suspect: q.suspectId, weapon: q.weaponId, room: q.roomId, time: q.timeId };
  const suspect = find(state.cards, q.suspectId);
  const weapon = find(state.cards, q.weaponId);
  const room = find(state.cards, q.roomId);
  const time = find(state.cards, q.timeId);
  return (
    <button type="button" className="cs-root cs-suggest" onClick={() => setShown(null)} aria-label="Close the scene" data-sfx="soft">
      <EvidenceBoard cards={state.cards} pick={pick} heist={heist} staged showEmpty={false} />
      <header className="cs-head">
        <p className="cs-kicker">{heist ? "A theory" : "A suggestion"}</p>
        <h2 className="cs-who cs-who-sm">{asker}</h2>
      </header>
      <p className="cs-line">
        {heist ? "Did " : "Was it "}
        <b>{suspect?.name}</b>
        {heist ? " take the " : ", with the "}
        <b>{weapon?.name}</b>
        {", "}
        {heist ? "from the " : "in the "}
        <b>{room?.name}</b>
        {time ? (
          <>
            {", at "}
            <b>{timeWords(time)}</b>
          </>
        ) : null}
        {"?"}
      </p>
      <span className="cs-tap">Tap to close</span>
    </button>
  );
}

let lastReveal = "";

/** Solve the Case, for the whole table: the guess lands card by card, then the result is stamped on it. */
export function FinalReveal() {
  const state = useGame((s) => s.state);
  const acc = state?.accusation;
  const key = acc ? `${acc.playerId}:${acc.at ?? ""}:${acc.suspectId}:${acc.roomId}:${acc.weaponId}:${acc.timeId ?? ""}` : "";
  const [shown, setShown] = useState<string | null>(null);
  const [canClose, setCanClose] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      // A phone that opens the game after the guess was made does not replay it.
      first.current = false;
      lastReveal = key || lastReveal;
      return;
    }
    if (!key || key === lastReveal) return;
    lastReveal = key;
    setShown(key);
    setCanClose(false);
    const cues = [
      window.setTimeout(() => sfxReveal(), 500),
      window.setTimeout(() => sfxReveal(), 1500),
      window.setTimeout(() => sfxReveal(), 2400),
      window.setTimeout(() => sfxReveal(), 3300),
      window.setTimeout(() => sfxDrama(), 4600),
      window.setTimeout(() => setCanClose(true), 5200),
    ];
    const end = window.setTimeout(() => setShown((cur) => (cur === key ? null : cur)), 7600);
    return () => {
      cues.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(end);
    };
  }, [key]);

  if (!state || !acc || !shown || shown !== key) return null;
  const who = state.players.find((player) => player.id === acc.playerId)?.name ?? "Someone";
  const heist = Boolean(state.settings.heist);
  const pick: Pick = { suspect: acc.suspectId, weapon: acc.weaponId, room: acc.roomId, time: acc.timeId };
  return (
    <div
      className="cs-root cs-reveal"
      role="dialog"
      aria-label={`${who} solves the case`}
      onClick={() => canClose && setShown(null)}
    >
      <EvidenceBoard cards={state.cards} pick={pick} heist={heist} staged showEmpty={false} />
      <div className="cs-heartbeat" aria-hidden />
      <div className="cs-curtain" aria-hidden />
      <header className="cs-head">
        <p className="cs-kicker">Solve the Case</p>
        <h2 className="cs-who">{who}</h2>
        <p className="cs-sub cs-sub-late">names the solution</p>
      </header>
      <div className={acc.correct ? "cs-verdict cs-verdict-yes" : "cs-verdict cs-verdict-no"} aria-live="polite">
        {acc.correct ? "Case closed" : "Wrong"}
      </div>
      {canClose ? <span className="cs-tap">Tap to continue</span> : null}
    </div>
  );
}
