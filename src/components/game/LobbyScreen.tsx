import { useGame } from "@/lib/game/store";
import { MIN_CATEGORY_CARDS, answerCards, avatarCharacters } from "@/lib/game/cards";
import { CATEGORY_LABEL, type CategoryId, type GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { copyText } from "@/lib/clipboard";
import { PickCharacterButton } from "./CharacterPicker";
import { ClueCodeField } from "./ClueCodeField";
import { ProfileBadge } from "./PlayerBadge";
import { useEffect, useState } from "react";
import { SettingsGear } from "./SettingsGear";

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
  const setClassicNames = useGame((s) => s.setClassicNames);
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
  const classic = Boolean(state.settings.classicNames);
  const seated = state.players.some((p) => p.id === localPlayerId);
  const characters = avatarCharacters(state.cards, classic);

  async function copyLink() {
    if (!link) return;
    setCopied(await copyText(link));
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
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setSureLeave(true)}>
            Leave table
          </Button>
          <SettingsGear />
        </div>
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
                void copyText(code).then(setCopied);
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

        {seated ? (
          <ClueCodeField className="mt-4" active={classic} onToggle={() => setClassicNames(!classic)} />
        ) : null}

        <ul className="mt-6 max-h-[50vh] space-y-2 overflow-y-auto">
          {state.players.map((p) => (
            <li key={p.id} className="wood-panel flex items-center justify-between rounded-[16px] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileBadge player={p} cards={state.cards} size="md" className="[--ring:#241e18]" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-subtle">
                    {p.isHost ? "Host" : "Guest"}
                    {p.avatar ? ` · ${characters.find((c) => c.id === p.avatar)?.name ?? ""}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Online you pick for your own seat. On one shared device the host can set every seat. */}
                {p.id === localPlayerId || state.settings.playMode !== "online" ? <PickCharacterButton player={p} /> : null}
                {host && !p.isHost ? (
                  <Button variant="ghost" size="sm" onClick={() => kick(p.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
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
          <Button size="lg" className="mt-6 w-full" disabled={!canStart} onClick={startGame}>
            Deal the cards
          </Button>
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
      {state.settings.extraDifficulty ? (
        <p className="mt-2 text-sm text-muted">
          Extra Difficulty. An NPC holds some of the cards. It never takes a turn, and it shows a card only to the player who is asking, after everyone else has been checked.
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
