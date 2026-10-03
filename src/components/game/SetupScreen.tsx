import { asHeist, cardArt, classicName, CLASSIC_CARDS, DEFAULT_CARDS, EVENT_DEFS, EXTRA_GUESTS, EXTRA_WEAPONS, MIN_CATEGORY_CARDS, PHYSICAL_EVENTS, UNDERGROUND_ROOMS, answerCards } from "@/lib/game/cards";
import { useGame } from "@/lib/game/store";
import type { CardDef, CategoryId, EventKind, GameSettings } from "@/lib/game/types";
import { CATEGORY_LABEL } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MusicToggle } from "./MusicToggle";
import { ClueCodeField } from "./ClueCodeField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState } from "react";

const BASE_SUSPECTS = unique([...CLASSIC_CARDS, ...DEFAULT_CARDS].filter((c) => c.category === "suspect"));
const BASE_ROOMS = unique([...CLASSIC_CARDS, ...DEFAULT_CARDS].filter((c) => c.category === "room"));
const BASE_WEAPONS = unique([...CLASSIC_CARDS, ...DEFAULT_CARDS].filter((c) => c.category === "weapon"));
const TIME_CARDS = DEFAULT_CARDS.filter((c) => c.category === "time");

const PRESET_NAMES: Record<string, string> = { classic: "Opening Night", default: "Harrington House", take: "The Take" };

/**
 * One button on the setup screen that opens a popup with the three choices made before anyone joins:
 * the Preset Decks, how many phones are in play, and how many players can join.
 */
function StartingSettings({
  setId,
  playMode,
  picked,
  seatMax,
  answers,
  loadPreset,
  patchSettings,
}: {
  setId: string;
  playMode: string;
  picked: number;
  seatMax: number;
  answers: number;
  loadPreset: (id: "classic" | "harrington" | "take") => void;
  patchSettings: (patch: Partial<GameSettings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const deck = PRESET_NAMES[setId];
  const phones = playMode === "hotseat" ? "This phone" : "One phone each";
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-line px-4 py-3 text-left"
      >
        <span>
          <span className="block font-display text-xl leading-tight">Starting Settings</span>
          <span className="mt-0.5 block text-sm text-muted">
            {deck ? `${deck} · ` : ""}
            {phones} · up to {picked} players
          </span>
        </span>
        <span aria-hidden className="text-muted">
          ›
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Starting Settings" className="max-h-[min(720px,calc(100%-24px))] overflow-y-auto">
          <div className="mt-4 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-subtle">Preset Decks</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => loadPreset("classic")}
                className={`min-h-11 rounded-[12px] border px-1 py-2 text-xs leading-tight sm:text-sm ${setId === "classic" ? "border-brass bg-raised" : "border-line"}`}
              >
                Opening Night
              </button>
              <button
                type="button"
                onClick={() => loadPreset("harrington")}
                className={`min-h-11 rounded-[12px] border px-1 py-2 text-xs leading-tight sm:text-sm ${setId === "default" ? "border-brass bg-raised" : "border-line"}`}
              >
                Harrington House
              </button>
              <button
                type="button"
                onClick={() => loadPreset("take")}
                className={`min-h-11 rounded-[12px] border px-1 py-2 text-xs leading-tight sm:text-sm ${setId === "take" ? "border-brass bg-raised" : "border-line"}`}
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
                    playMode === id ? "border-brass bg-raised" : "border-line"
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

          </div>
          <Button className="mt-5 w-full" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SetupScreen() {
  const setup = useGame((s) => s.setup);
  const setSetup = useGame((s) => s.setSetup);
  const patchSettings = useGame((s) => s.patchSettings);
  const setView = useGame((s) => s.setView);
  const hostTable = useGame((s) => s.hostTable);
  const loadPreset = useGame((s) => s.loadPreset);
  const loadFile = useGame((s) => s.loadFile);
  const saveFile = useGame((s) => s.saveFile);
  const clearFile = useGame((s) => s.clearFile);
  const cardSets = useGame((s) => s.cardSets);
  const setDeck = useGame((s) => s.setDeck);

  const files = ["file-1", "file-2", "file-3"] as const;
  const activeFile = cardSets.find((s) => s.id === setup.setId);
  // Nothing is written to a saved deck until Save preset is tapped. The name box is a draft too.
  const [draftName, setDraftName] = useState<{ id: string; name: string } | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const nameNow = activeFile ? (draftName?.id === activeFile.id ? draftName.name : activeFile.name) : "";
  const unsaved = useMemo(() => {
    if (!activeFile) return false;
    const ids = (cards: CardDef[]) => JSON.stringify(cards.map((c) => [c.id, c.name, c.blurb, c.imageDataUrl ?? ""]));
    const timesNow = setup.deck.filter((c) => c.category === "time").map((c) => c.id);
    const timesSaved = activeFile.timeCardIds ?? activeFile.cards.filter((c) => c.category === "time").map((c) => c.id);
    const t = activeFile.toggles;
    const s = setup.settings;
    const togglesSame =
      !t ||
      (t.timeOfDayEnabled === Boolean(s.timeOfDayEnabled) &&
        t.heist === Boolean(s.heist) &&
        t.speakMode === Boolean(s.speakMode) &&
        t.manualNotes === Boolean(s.manualNotes) &&
        t.evenDeal === Boolean(s.evenDeal) &&
        Boolean(t.extraDifficulty) === Boolean(s.extraDifficulty) &&
        JSON.stringify(t.enabledEvents ?? null) === JSON.stringify(s.enabledEvents ?? null));
    return (
      ids(setup.deck.filter((c) => c.category !== "time")) !== ids(activeFile.cards.filter((c) => c.category !== "time")) ||
      JSON.stringify([...timesNow].sort()) !== JSON.stringify([...timesSaved].sort()) ||
      !togglesSame ||
      nameNow.trim() !== activeFile.name.trim()
    );
  }, [activeFile, setup.deck, setup.settings, nameNow]);
  const pickFile = (id: string) => {
    setJustSaved(false);
    // Tapping an empty slot keeps the deck on screen in a new file, so there is nothing to lose.
    if (unsaved && id !== setup.setId && cardSets.some((f) => f.id === id)) {
      setSwitchTo(id);
      return;
    }
    setDraftName(null);
    loadFile(id);
  };
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
        <p className="mt-1 text-sm text-muted">Open a group to choose its cards. The number on each button is how many are in the deck.</p>

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
                    onClick={() => pickFile(id)}
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
              <>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    aria-label="Saved deck name"
                    value={nameNow}
                    maxLength={24}
                    onChange={(e) => {
                      setJustSaved(false);
                      setDraftName({ id: activeFile.id, name: e.target.value });
                    }}
                  />
                  <Button variant="ghost" size="sm" onClick={() => clearFile(activeFile.id)}>
                    Clear
                  </Button>
                </div>
                <Button
                  className="mt-2 w-full"
                  variant={unsaved ? "default" : "outline"}
                  disabled={!unsaved}
                  data-sfx="confirm"
                  onClick={() => {
                    saveFile(nameNow);
                    setDraftName(null);
                    setJustSaved(true);
                  }}
                >
                  {unsaved ? "Save preset" : justSaved ? "Preset saved ✓" : "Save preset"}
                </Button>
                <p className={`mt-1 text-xs ${unsaved ? "text-brass" : "text-subtle"}`}>
                  {unsaved
                    ? "You have changes that are not saved to this file yet. Cards, switches and time cards are only kept once you tap Save preset."
                    : "Everything on screen matches this file."}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-subtle">Pick a file above, then tap Save preset to keep changes to it.</p>
            )}
            {switchTo ? (
              <div className="mt-2 rounded-xl border border-line bg-black/20 p-3">
                <p className="font-display text-xl">Leave without saving?</p>
                <p className="mt-1 text-sm text-muted">This file has changes that were not saved. Switching drops them.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setSwitchTo(null)}>
                    Stay
                  </Button>
                  <Button
                    onClick={() => {
                      const id = switchTo;
                      setSwitchTo(null);
                      setDraftName(null);
                      loadFile(id);
                    }}
                  >
                    Switch anyway
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <StartingSettings
            setId={setup.setId}
            playMode={setup.settings.playMode}
            picked={picked}
            seatMax={seatMax}
            answers={answers}
            loadPreset={loadPreset}
            patchSettings={patchSettings}
          />

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

          {setup.settings.timeOfDayEnabled ? (
            <CardGroup
              title={CATEGORY_LABEL.time}
              cards={TIME_CARDS}
              deck={setup.deck}
              onToggle={(card, on) => setDeck(toggleCard(setup.deck, card, on, "time"))}
            />
          ) : null}

          <PowerUps />

          <ExtraSettings />

          <ClueCodeField
            active={Boolean(setup.settings.classicNames)}
            onToggle={() => patchSettings({ classicNames: !setup.settings.classicNames })}
          />

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

function ExtraSettings() {
  const settings = useGame((s) => s.setup.settings);
  const deck = useGame((s) => s.setup.deck);
  const patchSettings = useGame((s) => s.patchSettings);
  const setDeck = useGame((s) => s.setDeck);
  const [open, setOpen] = useState(false);
  const rows: { key: string; title: string; text: string; on: boolean; set: (v: boolean) => void }[] = [
    {
      key: "evenDeal",
      title: "Deal each category evenly",
      text: "At the start, suspects, rooms, and the rest are split as evenly as they can be.",
      on: Boolean(settings.evenDeal),
      set: (v) => patchSettings({ evenDeal: v }),
    },
    {
      key: "manualNotes",
      title: "Only mark the opening deal",
      text: "Your cards and the cards on the table are still marked at the start. After that, the journal is not marked for you.",
      on: Boolean(settings.manualNotes),
      set: (v) => patchSettings({ manualNotes: v }),
    },
    {
      key: "heist",
      title: "Heist mode",
      text: "The case is a theft. These cards become the jewels, paintings, and other valuables that were stolen.",
      on: Boolean(settings.heist),
      set: (v) => patchSettings({ heist: v }),
    },
    {
      key: "speakMode",
      title: "Speak mode",
      text: "Turns run exactly like a normal game. On your turn you pick your cards and say them out loud. Each player is then asked in order if they hold a card you named, and can pick any card to show you privately.",
      on: Boolean(settings.speakMode),
      set: (v) => patchSettings({ speakMode: v }),
    },
    {
      key: "extraDifficulty",
      title: "Extra Difficulty",
      text: "Adds an NPC. It never takes a turn, but it holds cards from the deal. It is asked last, only if no other player has a card you asked for, and it shows you a card in private without telling anyone else. In Speak mode you tap End your turn yourself, so the timing never gives the NPC away.",
      on: Boolean(settings.extraDifficulty),
      set: (v) => patchSettings({ extraDifficulty: v }),
    },
    {
      key: "timeOfDayEnabled",
      title: "Time of day cards",
      text: "Ten hours, dawn through midnight, go in the envelope with the rest.",
      on: Boolean(settings.timeOfDayEnabled),
      set: (v) => {
        patchSettings({ timeOfDayEnabled: v });
        if (v && !deck.some((c) => c.category === "time")) {
          setDeck([...deck, ...TIME_CARDS.map((c) => ({ ...c }))]);
        }
      },
    },
  ];
  const onCount = rows.filter((row) => row.on).length;
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Extra settings · {onCount} on
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Extra settings" className="max-h-[min(640px,calc(100%-24px))] overflow-y-auto">
          <div className="mt-3 space-y-4">
            {rows.map((row) => (
              <div key={row.key} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-sm text-muted">{row.text}</p>
                </div>
                <Switch checked={row.on} onCheckedChange={row.set} />
              </div>
            ))}
          </div>
          <Button className="mt-4 w-full" onClick={() => setOpen(false)}>
            Done
          </Button>
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
  const [open, setOpen] = useState(false);
  const onCount = cards.filter((card) => deck.some((item) => item.id === card.id)).length;
  const heist = useGame((s) => Boolean(s.setup.settings.heist));
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        {title} · {onCount} on
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title} className="max-h-[min(720px,calc(100%-24px))] overflow-y-auto">
          <p className="mt-1 text-sm text-muted">{onCount} on. At least {MIN_CATEGORY_CARDS} stay on. The case is chosen only from the cards you leave on.</p>
          {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
          <PickGrid cards={cards} deck={deck} heist={heist} onToggle={onToggle} />
          <Button className="mt-4 w-full" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </>
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
  const classic = useGame((s) => Boolean(s.setup.settings.classicNames));
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {cards.map((card, index) => {
        const on = deck.some((item) => item.id === card.id);
        const base = shown[index]?.name ?? card.name;
        const label = classic && card.category === "suspect" ? classicName(base, true) : base;
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
