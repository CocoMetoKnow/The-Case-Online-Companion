import { useGame } from "@/lib/game/store";
import { MIN_CATEGORY_CARDS, answerCards } from "@/lib/game/cards";
import { CATEGORY_LABEL, type CategoryId, type GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { CAST, portraitOf, takenPortraits } from "@/lib/game/cast";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";

export function LobbyScreen() {
  const state = useGame((s) => s.state);
  const addLocalGuest = useGame((s) => s.addLocalGuest);
  const kick = useGame((s) => s.kick);
  const lockLobby = useGame((s) => s.lockLobby);
  const startGame = useGame((s) => s.startGame);
  const joinError = useGame((s) => s.joinError);
  const leave = useGame((s) => s.leave);
  const setJoinCode = useGame((s) => s.setJoinCode);
  const joinOnline = useGame((s) => s.joinOnline);
  const localPlayerId = useGame((s) => s.localPlayerId);
  const [guest, setGuest] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [sureLeave, setSureLeave] = useState(false);
  const code = state?.code.replace(/^gmm/i, "") ?? "";

  useEffect(() => {
    if (!code) return;
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("code", code);
    setLink(url.toString());
  }, [code]);

  if (!state) return null;
  const host = localPlayerId === state.hostId;
  const groups: CategoryId[] = state.settings.timeOfDayEnabled ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
  const answers = answerCards(state.settings.timeOfDayEnabled);
  const total = state.cards.filter((card) => groups.includes(card.category)).length;
  const playable = Math.max(0, total - answers);
  const picked = Math.min(15, state.settings.maxPlayers || 15);
  const cap = Math.min(picked, playable);
  const deckOk =
    groups.every((cat) => state.cards.filter((card) => card.category === cat).length >= MIN_CATEGORY_CARDS) &&
    state.players.length <= cap;
  const canStart = state.players.length >= 2 && deckOk;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const area = document.createElement("textarea");
      area.value = link;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
  }

  async function shareLink() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "The Case",
          text: `Join my case. Code ${code}`,
          url: link,
        });
        return;
      } catch {
        return;
      }
    }
    await copyLink();
  }

  return (
    <main className="paper-wash min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-xl">
        <Button variant="outline" onClick={() => setSureLeave(true)}>
          Leave table
        </Button>
        {sureLeave ? (
          <div className="mt-4 rounded-[20px] border border-line bg-raised p-4">
            <p className="font-display text-3xl">Are you sure?</p>
            <p className="mt-1 text-sm text-muted">This leaves the table.</p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" onClick={leave}>
                Yes, leave
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setSureLeave(false)}>
                Stay
              </Button>
            </div>
          </div>
        ) : null}
        <h1 className="mt-4 font-display text-4xl">Waiting to deal</h1>
        <p className="mt-1 text-muted">
          {state.settings.playMode === "online"
            ? "Each guest opens this on their phone and joins with the code. Their cards stay in their case."
            : "Add a name for everyone at the table, then deal."}
        </p>
        <p className="mt-2 text-sm text-brass">
          {state.players.length} of {cap} seated
          {picked > cap ? ` · you picked ${picked}, this deck holds ${cap}` : ""}
          {state.players.length >= cap ? " · the table is full" : ""}
        </p>

        <div className="wood-panel mt-6 rounded-[24px] p-5 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Table code</p>
          <p className="mt-1 font-display text-4xl tracking-[0.18em]">{code}</p>
          <p className="mt-3 break-all text-sm">{link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                void navigator.clipboard.writeText(code).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Copied" : "Copy code"}
            </Button>
            <Button type="button" variant="outline" className="flex-1" disabled={!link} onClick={copyLink}>
              Copy link
            </Button>
            <Button type="button" className="flex-1" disabled={!link} onClick={shareLink}>
              Share
            </Button>
          </div>
        </div>

        <HouseRules state={state} />

        <CharacterPicker />

        <ul className="mt-6 max-h-[50vh] space-y-2 overflow-y-auto">
          {state.players.map((p) => (
            <li key={p.id} className="wood-panel flex items-center justify-between rounded-[16px] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="lobby-face" style={{ borderColor: p.color }}>
                  <img src={portraitOf(p).src} alt="" />
                </span>
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-subtle">{p.isHost ? "Host" : "Guest"}</p>
                </div>
              </div>
              {host && !p.isHost ? (
                <Button variant="ghost" size="sm" onClick={() => kick(p.id)}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        {host && state.settings.playMode !== "online" ? (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!guest.trim()) return;
              addLocalGuest(guest);
              setGuest("");
            }}
          >
            <Input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Add a guest name" />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </form>
        ) : null}

        {host ? (
          <div className="mt-6 flex items-center justify-between rounded-[16px] border border-line px-4 py-3">
            <span className="text-sm">Lock lobby</span>
            <Switch checked={state.settings.locked} onCheckedChange={lockLobby} />
          </div>
        ) : (
          <div className="mt-6">
            {state.players.some((p) => p.id === localPlayerId) ? (
              <p className="text-sm text-muted">You're in. Waiting for the host to deal the cards.</p>
            ) : (
              <>
                <p className="text-sm text-muted">You're not in this lobby. The code is still open.</p>
                <Button
                  className="mt-3 w-full"
                  onClick={() => {
                    setJoinCode(code);
                    joinOnline();
                  }}
                >
                  Join again
                </Button>
              </>
            )}
          </div>
        )}

        {host ? (
          <div className="sticky-action mt-6">
            <Button size="lg" className="w-full" disabled={!canStart} onClick={startGame}>
              Deal the cards
            </Button>
          </div>
        ) : null}
        {joinError ? <p className="mt-2 text-center text-sm text-brass">{joinError}</p> : null}
        {!canStart ? (
          <p className="mt-2 text-center text-xs text-subtle">
            {!deckOk
              ? "Not enough cards for the players sitting down. The answers stay out, and everyone gets the same number."
              : "Need the host and one other player."}
          </p>
        ) : state.players.length < picked ? (
          <p className="mt-2 text-center text-xs text-subtle">
            {state.players.length} are here, under the cap of {picked}. Deal now and only they get cards.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function HouseRules({ state }: { state: GameState }) {
  const cats: CategoryId[] = ["suspect", "weapon", "room"];
  if (state.settings.timeOfDayEnabled) cats.push("time");
  return (
    <section className="mt-6 rounded-[16px] border border-line px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">House rules</p>
      <p className="mt-1 text-sm text-muted">
        {state.settings.heist
          ? state.settings.timeOfDayEnabled
            ? "An hour goes in the envelope with who took it, where, and what was stolen."
            : "The envelope holds who took it, where, and what was stolen."
          : state.settings.timeOfDayEnabled
            ? "An hour goes in the envelope with the suspect, room, and weapon."
            : "No time cards. The envelope is a suspect, a room, and a weapon."}
      </p>
      {state.settings.speakMode ? (
        <p className="mt-2 text-sm text-muted">
          Speak mode. Turns run as normal, but you say your suggestion out loud. The game then asks each player in order if they have a card to show.
        </p>
      ) : null}
      {cats.map((cat) => {
        const names = state.cards.filter((card) => card.category === cat).map((card) => card.name);
        return (
          <p key={cat} className="mt-2 text-sm">
            <span className="text-subtle">
              {state.settings.heist && cat === "weapon"
                ? "What was stolen"
                : state.settings.heist && cat === "suspect"
                  ? "Who took it"
                  : state.settings.heist && cat === "room"
                    ? "Where"
                    : CATEGORY_LABEL[cat]}{" "}
              · {names.length}.{" "}
            </span>
            {names.join(", ")}
          </p>
        );
      })}
    </section>
  );
}

/**
 * UI / RENDER LAYER — pick the character who represents you.
 * Calls the store's `pickCharacter` (engine rule: setPortrait). Faces already
 * worn by someone else are dimmed. Host on a shared phone picks for whoever is tapped last in the roster below.
 */
function CharacterPicker() {
  const state = useGame((s) => s.state);
  const me = useGame((s) => s.localPlayerId);
  const pick = useGame((s) => s.pickCharacter);
  if (!state || state.startedAt) return null;
  const self = state.players.find((p) => p.id === me);
  if (!self) return null;
  const taken = takenPortraits(state.players, me);
  const mine = portraitOf(self);
  return (
    <section className="mt-6" aria-label="Choose your character">
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">Your character</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {CAST.map((face, i) => {
          const worn = taken.has(i);
          const on = mine.src === face.src;
          return (
            <button
              key={face.src}
              type="button"
              disabled={worn}
              aria-pressed={on}
              aria-label={`${face.name}${worn ? " (taken)" : ""}`}
              className={`pick-face${on ? " pick-face-on" : ""}`}
              onClick={() => pick(i)}
            >
              <img src={face.src} alt="" loading="lazy" decoding="async" />
              <span>{face.name.split(" ").pop()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
