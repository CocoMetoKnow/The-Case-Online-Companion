import { asHeist, cardArt, CLASSIC_CARDS, DEFAULT_CARDS, EVENT_DEFS, EXTRA_GUESTS, EXTRA_WEAPONS, MIN_CATEGORY_CARDS, PHYSICAL_EVENTS, UNDERGROUND_ROOMS, answerCards } from "@/lib/game/cards";
import { useGame } from "@/lib/game/store";
import type { CardDef, CategoryId, EventKind } from "@/lib/game/types";
import { CATEGORY_LABEL } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MusicToggle } from "./MusicToggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

const BASE_SUSPECTS = unique([...CLASSIC_CARDS, ...DEFAULT_CARDS].filter((c) => c.category === "suspect"));
const BASE_ROOMS = unique([...CLASSIC_CARDS, ...DEFAULT_CARDS].filter((c) => c.category === "room"));
const BASE_WEAPONS = unique([...CLASSIC_CARDS, ...DEFAULT_CARDS].filter((c) => c.category === "weapon"));
const TIME_CARDS = DEFAULT_CARDS.filter((c) => c.category === "time");

export function SetupScreen() {
  const setup = useGame((s) => s.setup);
  const setSetup = useGame((s) => s.setSetup);
  const patchSettings = useGame((s) => s.patchSettings);
  const setView = useGame((s) => s.setView);
  const hostTable = useGame((s) => s.hostTable);
  const loadPreset = useGame((s) => s.loadPreset);
  const loadFile = useGame((s) => s.loadFile);
  const renameFile = useGame((s) => s.renameFile);
  const clearFile = useGame((s) => s.clearFile);
  const cardSets = useGame((s) => s.cardSets);
  const setDeck = useGame((s) => s.setDeck);

  const files = ["file-1", "file-2", "file-3"] as const;
  const activeFile = cardSets.find((s) => s.id === setup.setId);
  const groups: CategoryId[] = setup.settings.timeOfDayEnabled ? ["suspect", "room", "weapon", "time"] : ["suspect", "room", "weapon"];
  const answers = answerCards(setup.settings.timeOfDayEnabled);
  const activeCount = setup.deck.filter((card) => groups.includes(card.category)).length;
  const seatMax = Math.min(15, activeCount - answers);
  const picked = Math.max(2, Math.min(15, setup.settings.maxPlayers || 2));
  const seatsOk = seatMax >= 2 && picked >= 2 && picked <= 15;
  const ready = groups.every((cat) => setup.deck.filter((card) => card.category === cat).length >= MIN_CATEGORY_CARDS) && seatsOk;

  return (
    <main className="leather min-h-dvh px-4 py-6">
      <div className="mx-auto max-w-lg">
        <button type="button" className="text-sm text-muted" onClick={() => setView("landing")}>
          Close the case
        </button>
        <div className="mt-3 flex items-center justify-between gap-3">
          <h1 className="font-display text-4xl">Build the deck</h1>
          <MusicToggle />
        </div>
        <p className="mt-1 text-sm text-muted">Tap the cards you want. The number in each group is how many are in the deck.</p>

        <div className="case-shell mt-5 space-y-5 rounded-[28px] p-4">
          <label className="block space-y-2">
            <Label>Your name</Label>
            <Input
              value={/^detective$/i.test(setup.name.trim()) ? "" : setup.name}
              onChange={(e) => setSetup({ name: /^detective$/i.test(e.target.value.trim()) ? "" : e.target.value })}
              placeholder="Your name"
              autoComplete="off"
              name="seat-label"
            />
          </label>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-subtle">Saved decks</p>
            <p className="mt-1 text-sm text-muted">Three files stay on this phone. Tap one to switch the whole deck.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {files.map((id, i) => {
                const file = cardSets.find((s) => s.id === id);
                const active = setup.setId === id;
                const times = file?.timeOfDayEnabled ?? file?.cards.some((c) => c.category === "time");
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => loadFile(id)}
                    className={`min-h-20 rounded-[14px] border px-2 py-2 text-left ${
                      active ? "border-brass bg-raised" : "border-line"
                    }`}
                  >
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-brass">File {i + 1}</span>
                    <span className="mt-1 block truncate font-display text-lg leading-tight">
                      {file?.name ?? "Empty"}
                    </span>
                    <span className="mt-1 block text-[11px] text-subtle">
                      {file ? `${file.cards.filter((c) => times || c.category !== "time").length} cards${times ? " · times" : ""}` : "Tap to keep this deck"}
                    </span>
                  </button>
                );
              })}
            </div>
            {activeFile ? (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  aria-label="Saved deck name"
                  value={activeFile.name}
                  onChange={(e) => renameFile(activeFile.id, e.target.value)}
                />
                <Button variant="ghost" size="sm" onClick={() => clearFile(activeFile.id)}>
                  Clear
                </Button>
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-subtle">Start from</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => loadPreset("classic")}
                className={`min-h-11 rounded-[12px] border px-1 py-2 text-xs leading-tight sm:text-sm ${setup.setId === "classic" ? "border-brass bg-raised" : "border-line"}`}
              >
                Opening Night
              </button>
              <button
                type="button"
                onClick={() => loadPreset("harrington")}
                className={`min-h-11 rounded-[12px] border px-1 py-2 text-xs leading-tight sm:text-sm ${setup.setId === "default" ? "border-brass bg-raised" : "border-line"}`}
              >
                Harrington House
              </button>
              <button
                type="button"
                onClick={() => loadPreset("take")}
                className={`min-h-11 rounded-[12px] border px-1 py-2 text-xs leading-tight sm:text-sm ${setup.setId === "take" ? "border-brass bg-raised" : "border-line"}`}
              >
                The Take
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-subtle">Phones</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["online", "One each"],
                  ["hotseat", "This phone"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => patchSettings({ playMode: id, honorHands: false })}
                  className={`h-11 rounded-[12px] border text-sm ${
                    setup.settings.playMode === id ? "border-brass bg-raised" : "border-line"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">Online, each person uses their own phone. The lobby stops at the number you pick.</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-subtle">How many can join</p>
            <p className="mt-1 text-sm text-muted">
              Pick the most that can join, up to 15. If fewer sit down, the deal uses only those players. A full table of 15 needs {answers === 4 ? "19" : "18"} cards on.
            </p>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {Array.from({ length: 14 }, (_, index) => index + 2).map((count) => {
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => patchSettings({ maxPlayers: count })}
                    className={`h-11 rounded-[12px] border text-sm ${
                      picked === count ? "border-brass bg-raised" : "border-line"
                    }`}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
            {seatMax < 2 ? (
              <p className="mt-2 text-sm text-muted">Turn on more cards before anyone can sit down.</p>
            ) : seatMax < picked ? (
              <p className="mt-2 text-sm text-brass">
                You picked {picked}. This deck can give {seatMax} players a card, so the lobby stops there. Any smaller group still gets an even hand.
              </p>
            ) : (
              <p className="mt-2 text-sm text-brass">
                {picked} can join. If only some of them sit down, those players are dealt the cards.
              </p>
            )}
          </div>

          <CardGroup
            title={CATEGORY_LABEL.suspect}
            cards={unique([...BASE_SUSPECTS, ...EXTRA_GUESTS])}
            note="Up to 15 characters can be on at once."
            deck={setup.deck}
            onToggle={(card, on) => setDeck(toggleCard(setup.deck, card, on, "suspect"))}
          />
          <CardGroup
            title={CATEGORY_LABEL.room}
            cards={unique([...BASE_ROOMS, ...UNDERGROUND_ROOMS])}
            note="A secret passage opens when both ends are on: Catacombs and the Vault, or the tunnel and the Boiler Room."
            deck={setup.deck}
            onToggle={(card, on) => setDeck(toggleCard(setup.deck, card, on, "room"))}
          />
          <CardGroup
            title={setup.settings.heist ? "What was stolen" : CATEGORY_LABEL.weapon}
            cards={unique([...BASE_WEAPONS, ...EXTRA_WEAPONS])}
            deck={setup.deck}
            onToggle={(card, on) => setDeck(toggleCard(setup.deck, card, on, "weapon"))}
          />

          <PowerUps />

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Deal each category evenly</p>
              <p className="text-sm text-muted">At the start, suspects, rooms, and the rest are split as evenly as they can be.</p>
            </div>
            <Switch checked={Boolean(setup.settings.evenDeal)} onCheckedChange={(v) => patchSettings({ evenDeal: v })} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Only mark the opening deal</p>
              <p className="text-sm text-muted">Your cards and the cards on the table are still marked at the start. After that, the journal is not marked for you.</p>
            </div>
            <Switch checked={Boolean(setup.settings.manualNotes)} onCheckedChange={(v) => patchSettings({ manualNotes: v })} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Thief mode</p>
              <p className="text-sm text-muted">The case is a theft. These cards become the jewels, paintings, and other valuables that were stolen.</p>
            </div>
            <Switch checked={Boolean(setup.settings.heist)} onCheckedChange={(v) => patchSettings({ heist: v })} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Speak mode</p>
              <p className="text-sm text-muted">Turns run exactly like a normal game. On your turn you say your suggestion out loud and tap “I’m in a room”. Each player is then asked in order if they hold a card you named, and can pick any card to show you privately.</p>
            </div>
            <Switch checked={Boolean(setup.settings.speakMode)} onCheckedChange={(v) => patchSettings({ speakMode: v })} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Time of day cards</p>
              <p className="text-sm text-muted">Ten hours, dawn through midnight, go in the envelope with the rest.</p>
            </div>
            <Switch
              checked={setup.settings.timeOfDayEnabled}
              onCheckedChange={(v) => {
                patchSettings({ timeOfDayEnabled: v });
                if (v && !setup.deck.some((c) => c.category === "time")) {
                  setDeck([...setup.deck, ...TIME_CARDS.map((c) => ({ ...c }))]);
                }
              }}
            />
          </div>
          {setup.settings.timeOfDayEnabled ? (
            <CardGroup
              title={CATEGORY_LABEL.time}
              cards={TIME_CARDS}
              deck={setup.deck}
              onToggle={(card, on) => setDeck(toggleCard(setup.deck, card, on, "time"))}
            />
          ) : null}

          <Button size="lg" className="w-full" disabled={!ready} onClick={hostTable}>
            Open the lobby
          </Button>
          {!ready ? (
            <p className="text-center text-sm text-muted">
              Each group needs at least {MIN_CATEGORY_CARDS} cards on, and the deck needs one card for every seat plus the answers.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function unique(cards: CardDef[]): CardDef[] {
  const seen = new Set<string>();
  const out: CardDef[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

function PowerUps() {
  const settings = useGame((s) => s.setup.settings);
  const patchSettings = useGame((s) => s.patchSettings);
  const [open, setOpen] = useState(false);
  const list = EVENT_DEFS.filter((def) => (PHYSICAL_EVENTS as string[]).includes(def.kind)).map((def) => ({
    ...def,
    kind: def.kind as EventKind,
  }));
  const picked = settings.enabledEvents;
  const onCount = picked ? list.filter((def) => picked.includes(def.kind)).length : list.length;
  const setList = (kinds: EventKind[]) => patchSettings({ enabledEvents: kinds });
  const toggle = (kind: EventKind, on: boolean) => {
    const current = picked ?? list.map((def) => def.kind);
    setList(on ? [...new Set([...current, kind])] : current.filter((id) => id !== kind));
  };
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Power ups · {onCount} on
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Power ups" className="max-h-[min(640px,calc(100%-24px))] overflow-y-auto">
          <p className="mt-1 text-sm text-muted">Choose which house cards can be drawn. Each one says what it does.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setList(list.map((def) => def.kind))}>
              All on
            </Button>
            <Button size="sm" variant="outline" onClick={() => setList([])}>
              All off
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {list.map((def) => {
              const timeLocked = def.kind === "name-time" && !settings.timeOfDayEnabled;
              const on = !timeLocked && (picked ? picked.includes(def.kind) : true);
              return (
                <div key={def.kind} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{def.title}</p>
                    <p className="text-sm text-muted">{def.description}</p>
                    {timeLocked ? <p className="text-xs text-brass">Turn on time cards to deal this one.</p> : null}
                  </div>
                  <Switch checked={on} disabled={timeLocked} onCheckedChange={(value) => toggle(def.kind, value)} />
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toggleCard(deck: CardDef[], card: CardDef, on: boolean, category: CategoryId): CardDef[] {
  const same = deck.filter((item) => item.category === category).length;
  if (!on && same <= MIN_CATEGORY_CARDS) return deck;
  if (on && category === "suspect" && same >= 15) return deck;
  const rest = deck.filter((item) => item.id !== card.id);
  return on ? [...rest, { ...card }] : rest;
}

function CardGroup({
  title,
  cards,
  note,
  deck,
  onToggle,
}: {
  title: string;
  cards: CardDef[];
  note?: string;
  deck: CardDef[];
  onToggle: (card: CardDef, on: boolean) => void;
}) {
  const onCount = cards.filter((card) => deck.some((item) => item.id === card.id)).length;
  const heist = useGame((s) => Boolean(s.setup.settings.heist));
  return (
    <section>
      <p className="text-xs uppercase tracking-[0.16em] text-subtle">
        {title} · {onCount}
      </p>
      <p className="mt-1 text-sm text-muted">At least {MIN_CATEGORY_CARDS} stay on. The case is chosen only from the cards you leave on.</p>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
      <PickGrid cards={cards} deck={deck} heist={heist} onToggle={onToggle} />
    </section>
  );
}

function PickGrid({
  cards,
  deck,
  heist,
  onToggle,
}: {
  cards: CardDef[];
  deck: CardDef[];
  heist: boolean;
  onToggle: (card: CardDef, on: boolean) => void;
}) {
  const shown = heist ? asHeist(cards) : cards;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {cards.map((card, index) => {
        const on = deck.some((item) => item.id === card.id);
        const label = shown[index]?.name ?? card.name;
        return (
          <button
            key={card.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(card, !on)}
            className={`overflow-hidden rounded-[12px] border text-left ${on ? "border-brass" : "border-line opacity-45"}`}
          >
            <img
              src={cardArt(card.id, heist)}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = "0";
              }}
              className="aspect-[2/3] w-full bg-[#1a1410] object-contain object-center"
            />
            <span className="block truncate px-1.5 py-1 text-xs">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
