import { Check, ChevronLeft, ChevronRight, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { setExtraVisuals, useExtraVisuals } from "@/lib/game/extra-visuals";
import { setSimpleJournal, useSimpleJournal } from "@/lib/game/simple-journal";
import { musicVolume, setMusicVolume, setSfxVolume, sfxTap, sfxVolume, unlockAudio } from "@/lib/game/sfx";
import {
  ACCENT_COLORS,
  CARD_COLORS,
  getAccentColor,
  getCardColor,
  getJournalColor,
  getUiColor,
  JOURNAL_COLORS,
  setAccentColor,
  setCardColor,
  setJournalColor,
  setUiColor,
  UI_COLORS,
  uiPreview,
  type AccentColor,
  type CardColor,
  type JournalColor,
  type UiColor,
} from "@/lib/game/theme";
import { cn } from "@/lib/utils";

type Panel = "main" | "ui" | "accent" | "card" | "journal";

/** A tiny picture of the screen in one background color. */
function UiTile({ color }: { color: UiColor }) {
  const p = uiPreview(color);
  return (
    <span
      aria-hidden="true"
      className="block h-14 w-full overflow-hidden rounded-xl border border-white/10 p-1.5"
      style={{ background: p.page }}
    >
      <span
        className="block h-full w-full rounded-lg border border-white/15"
        style={{ background: `linear-gradient(${p.shellTop}, ${p.shellBottom})` }}
      />
    </span>
  );
}

/** A tiny sample of text and a border in one gold-replacement color. */
function AccentTile({ hex }: { hex: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-full items-center justify-center rounded-xl bg-[#1a100c]"
      style={{ border: `2px solid ${hex}`, color: hex }}
    >
      <span className="font-display text-xl leading-none">Aa</span>
    </span>
  );
}

/** A tiny card back in one card color. */
function CardTile({ id }: { id: string }) {
  return (
    <span aria-hidden="true" className="flex h-14 w-full items-center justify-center">
      <img
        src={`/cards/backs/${id}-thumb.jpg`}
        alt=""
        draggable={false}
        className="h-full w-auto rounded-[4px] shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
      />
    </span>
  );
}

/** A tiny journal in one cover color. */
function JournalTile({ filter }: { filter: string }) {
  return (
    <span aria-hidden="true" className="flex h-14 w-full items-center justify-center">
      <img src="/journal.png" alt="" draggable={false} className="h-full w-auto" style={{ filter }} />
    </span>
  );
}

function SwatchGrid<T extends { id: string; label: string }>({
  items,
  selected,
  onPick,
  tile,
}: {
  items: T[];
  selected: string;
  onPick: (id: string) => void;
  tile: (item: T) => React.ReactNode;
}) {
  return (
    <div className="mt-4 grid max-h-[62dvh] grid-cols-3 gap-2.5 overflow-y-auto pr-0.5">
      {items.map((item) => {
        const on = item.id === selected;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            aria-label={item.label}
            onClick={() => onPick(item.id)}
            className={cn(
              "relative rounded-2xl border bg-raised p-2 text-center touch-manipulation",
              on ? "border-brass ring-2 ring-brass/60" : "border-line",
            )}
          >
            {tile(item)}
            <span className="mt-1.5 block text-xs text-muted">{item.label}</span>
            {on ? (
              <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-brass text-ink">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The gear icon. Opens the settings popup: music, sound effects, and two color pickers (the
 * background / UI and the journal), each with its own popup of small previews. Picking a color
 * applies it straight away and is remembered on this phone.
 */
export function SettingsGear() {
  const [panel, setPanel] = useState<Panel | null>(null);
  // Volume bars, 0 to 100.
  const [music, setMusicLevel] = useState(() => Math.round(musicVolume() * 100));
  const [sounds, setSoundsLevel] = useState(() => Math.round(sfxVolume() * 100));
  const extraVisuals = useExtraVisuals();
  const simpleJournal = useSimpleJournal();
  const [ui, setUi] = useState(getUiColor);
  const [accent, setAccent] = useState(getAccentColor);
  const [card, setCard] = useState(getCardColor);
  const [journal, setJournal] = useState(getJournalColor);

  function openSettings() {
    setMusicLevel(Math.round(musicVolume() * 100));
    setSoundsLevel(Math.round(sfxVolume() * 100));
    setUi(getUiColor());
    setAccent(getAccentColor());
    setCard(getCardColor());
    setJournal(getJournalColor());
    setPanel("main");
  }

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanel((cur) => (cur === "main" ? null : "main"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const uiColor = UI_COLORS.find((c) => c.id === ui) ?? UI_COLORS[0];
  const accentColor = ACCENT_COLORS.find((c) => c.id === accent) ?? ACCENT_COLORS[0];
  const cardColor = CARD_COLORS.find((c) => c.id === card) ?? CARD_COLORS[0];
  const journalColor = JOURNAL_COLORS.find((c) => c.id === journal) ?? JOURNAL_COLORS[0];

  const popup =
    panel && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100000] grid place-items-center bg-[#140e0bcc] p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(event) => {
              if (event.target === event.currentTarget) setPanel(null);
            }}
          >
            <div className="relative w-full max-w-sm rounded-[24px] border border-line bg-surface p-5 text-fg shadow-[0_18px_50px_rgba(0,0,0,0.5)]">
              {panel === "main" ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-2xl">Settings</h2>
                    <button
                      type="button"
                      aria-label="Close settings"
                      className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised"
                      onClick={() => setPanel(null)}
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <div className="mt-4 divide-y divide-line">
                    <div className="py-3">
                      <div className="flex items-center justify-between">
                        <span id="music-volume-label">Music</span>
                        <span className="text-sm tabular-nums text-muted" aria-hidden="true">
                          {music === 0 ? "Off" : `${music}%`}
                        </span>
                      </div>
                      <Slider
                        className="mt-3 h-6"
                        min={0}
                        max={100}
                        step={1}
                        value={[music]}
                        aria-label="Music volume"
                        onValueChange={([value]) => {
                          // Dragging is a real touch, so it also wakes audio on iOS Safari.
                          unlockAudio();
                          setMusicLevel(value);
                          setMusicVolume(value / 100);
                        }}
                      />
                    </div>
                    <div className="py-3">
                      <div className="flex items-center justify-between">
                        <span id="sfx-volume-label">Sound effects</span>
                        <span className="text-sm tabular-nums text-muted" aria-hidden="true">
                          {sounds === 0 ? "Off" : `${sounds}%`}
                        </span>
                      </div>
                      <Slider
                        className="mt-3 h-6"
                        min={0}
                        max={100}
                        step={1}
                        value={[sounds]}
                        aria-label="Sound effects volume"
                        onValueChange={([value]) => {
                          setSoundsLevel(value);
                          setSfxVolume(value / 100);
                        }}
                        // Let go of the bar and a click plays, so the level can be judged by ear.
                        onValueCommit={() => sfxTap()}
                      />
                    </div>
                    <div className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span id="extra-visuals-label">Extra Visuals</span>
                        <Switch
                          aria-labelledby="extra-visuals-label"
                          checked={extraVisuals}
                          onCheckedChange={(on) => {
                            setExtraVisuals(on);
                            sfxTap();
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        During a suggestion the background becomes the room, with the suspect, the weapon and the time of day behind it. Works in speak mode too. Solve the Case always plays its scene.
                      </p>
                    </div>
                    <div className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span id="simple-journal-label">Simple journaling</span>
                        <Switch
                          aria-labelledby="simple-journal-label"
                          checked={simpleJournal}
                          onCheckedChange={(on) => {
                            setSimpleJournal(on);
                            sfxTap();
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Your journal gets one square per card. Tap it and pick the player who showed you the card; their logo goes in the square. Only on this phone.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => setPanel("ui")}
                    >
                      <span>UI color</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <span className="w-14">
                          <UiTile color={uiColor} />
                        </span>
                        {uiColor.label}
                        <ChevronRight className="size-4" />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => setPanel("accent")}
                    >
                      <span>Text &amp; border color</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <span className="w-14">
                          <AccentTile hex={accentColor.hex} />
                        </span>
                        {accentColor.label}
                        <ChevronRight className="size-4" />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => setPanel("card")}
                    >
                      <span>Card color</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <span className="w-14">
                          <CardTile id={cardColor.id} />
                        </span>
                        {cardColor.label}
                        <ChevronRight className="size-4" />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => setPanel("journal")}
                    >
                      <span>Journal color</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <span className="w-14">
                          <JournalTile filter={journalColor.filter} />
                        </span>
                        {journalColor.label}
                        <ChevronRight className="size-4" />
                      </span>
                    </button>
                  </div>

                  <Button className="mt-4 w-full" variant="outline" onClick={() => setPanel(null)}>
                    Done
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm text-muted"
                      onClick={() => setPanel("main")}
                    >
                      <ChevronLeft className="size-4" /> Settings
                    </button>
                    <button
                      type="button"
                      aria-label="Close settings"
                      className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised"
                      onClick={() => setPanel(null)}
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  <h2 className="mt-1 font-display text-2xl">{panel === "ui" ? "UI color" : panel === "accent" ? "Text & border color" : panel === "card" ? "Card color" : "Journal color"}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {panel === "ui"
                      ? "Pick the color of the background and case."
                      : panel === "accent"
                        ? "Pick the color of the gold text, borders and highlights."
                        : panel === "card"
                          ? "Pick the main color of the card backs and the border around every card."
                          : "Pick the color of your journal."}
                  </p>
                  {panel === "ui" ? (
                    <SwatchGrid<UiColor>
                      items={UI_COLORS}
                      selected={ui}
                      onPick={(id) => setUi(setUiColor(id))}
                      tile={(item) => <UiTile color={item} />}
                    />
                  ) : panel === "accent" ? (
                    <SwatchGrid<AccentColor>
                      items={ACCENT_COLORS}
                      selected={accent}
                      onPick={(id) => setAccent(setAccentColor(id))}
                      tile={(item) => <AccentTile hex={item.hex} />}
                    />
                  ) : panel === "card" ? (
                    <SwatchGrid<CardColor>
                      items={CARD_COLORS}
                      selected={card}
                      onPick={(id) => setCard(setCardColor(id))}
                      tile={(item) => <CardTile id={item.id} />}
                    />
                  ) : (
                    <SwatchGrid<JournalColor>
                      items={JOURNAL_COLORS}
                      selected={journal}
                      onPick={(id) => setJournal(setJournalColor(id))}
                      tile={(item) => <JournalTile filter={item.filter} />}
                    />
                  )}
                  <Button className="mt-4 w-full" variant="outline" onClick={() => setPanel("main")}>
                    Done
                  </Button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        className="grid size-9 place-items-center rounded-full text-brass touch-manipulation"
        onClick={openSettings}
      >
        <Settings className="size-5" />
      </button>
      {popup}
    </>
  );
}
