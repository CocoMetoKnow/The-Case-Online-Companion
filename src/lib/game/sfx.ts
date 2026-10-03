import { haptic } from "./haptics";

/**
 * Audio engine. Every sound is a real recorded file now (see public/assets/audio),
 * not synthesized tones — this file is the complete replacement for the old
 * procedural Web Audio composer. Every exported function name is unchanged from
 * before, so nothing anywhere else in the app had to be touched to make the
 * switch; only what plays behind each name is new.
 */

const MUSIC_KEY = "gmm.music";
const SFX_KEY = "gmm.sfx";
const MUSIC_VOL_KEY = "gmm.musicVol";
const SFX_VOL_KEY = "gmm.sfxVol";

/**
 * Music and sound effects each have their own volume bar (Settings), 0 to 100. The bar's
 * default of 70 plays at exactly the levels the old on/off switches used (0.35 music,
 * 0.45 effects), so nothing is louder or quieter until a player drags a bar. 100 is a
 * little louder than before, 0 is silent. SFX still sit under the music bed.
 */
const MAX_SFX_GAIN = 0.45 / 0.7;
const MAX_BGM_GAIN = 0.35 / 0.7;
const DEFAULT_VOLUME = 0.7;

/**
 * Per-sample trim so the whole set sounds even. Measured (ffmpeg volumedetect):
 * the win / fail / thud / sting / twinkle samples were 10-20 dB hotter than the
 * clicks and paper sounds, so they are pulled down much further. The two
 * journal sounds (pageTurn, pencil) keep a trim of 1 so they stay exactly as
 * they were relative to the master.
 */
const TRIM: Record<string, number> = {
  win: 0.25,
  fail: 0.25,
  thud: 0.4,
  twinkle: 0.55,
  solveStart: 0.55,
  card: 1,
  typewriter: 1.2,
  digital: 1.2,
  dice: 0.55,
  paperSlide: 1.2,
  tap: 1.2,
  tick: 0.55,
  tickLow: 2,
  staticSoft: 0.35,
  stingSoft: 0.15,
  pageTurn: 1,
  pencil: 1,
};
const BGM_FILE = "/assets/audio/leberch-dark-cinematic-509801.mp3";

const SFX_FILES = {
  card: "/assets/audio/card_place.mp3",
  solveStart: "/assets/audio/mysterious_sting.mp3",
  win: "/assets/audio/victorious_clue.mp3",
  fail: "/assets/audio/muffled_static.mp3",
  typewriter: "/assets/audio/ui_typewriter.mp3",
  digital: "/assets/audio/digital_tone.mp3",
  // Dice roll: the longer tumbling recording from the extras folder.
  dice: "/assets/audio/extras/dice_rolling_alt.mp3",
  // UI press sounds. quick_clack used to be the dice; it is now the general button press.
  tap: "/assets/audio/quick_clack.mp3",
  tick: "/assets/audio/extras/clock_tick_alt1.mp3",
  tickLow: "/assets/audio/extras/clock_tick_alt2.mp3",
  staticSoft: "/assets/audio/extras/muffled_static_alt.mp3",
  stingSoft: "/assets/audio/extras/mysterious_sting_alt.mp3",
  paperSlide: "/assets/audio/paper_slide.mp3",
  pageTurn: "/assets/audio/page_turn.mp3",
  pencil: "/assets/audio/pencil_writing.mp3",
  thud: "/assets/audio/heavy_thud.mp3",
  twinkle: "/assets/audio/twinkle_gliss.mp3",
} as const;

type SfxName = keyof typeof SFX_FILES;

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Map<SfxName, Promise<AudioBuffer | null>>();
let bgmEl: HTMLAudioElement | null = null;
/** The music loop's own volume knob. iOS Safari ignores <audio>.volume, so the loop is routed through Web Audio to make the bar work there too. */
let musicBus: GainNode | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function bus(): GainNode | null {
  const c = ac();
  if (!c) return null;
  if (!sfxBus) {
    sfxBus = c.createGain();
    sfxBus.gain.value = sfxVolume() * MAX_SFX_GAIN;
    sfxBus.connect(c.destination);
  }
  return sfxBus;
}

function loadBuffer(name: SfxName): Promise<AudioBuffer | null> {
  const c = ac();
  if (!c) return Promise.resolve(null);
  const have = buffers.get(name);
  if (have) return Promise.resolve(have);
  let job = loading.get(name);
  if (!job) {
    job = fetch(SFX_FILES[name])
      .then((res) => res.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .then((buf) => {
        buffers.set(name, buf);
        return buf;
      })
      .catch(() => null);
    loading.set(name, job);
  }
  return job;
}

/** Decode every short effect into memory up front, so a touch never waits on a network fetch on mobile Safari. */
export function preloadSfx() {
  if (!ac()) return;
  for (const name of Object.keys(SFX_FILES) as SfxName[]) void loadBuffer(name);
}

/** Voices that may only sound once at a time (rapid taps cut the previous one short instead of stacking). */
const voices = new Map<SfxName, { src: AudioBufferSourceNode; gain: GainNode }>();

let lastPlayAt = 0;

function play(name: SfxName, opts: { gain?: number; rate?: number; exclusive?: boolean } = {}) {
  if (!sfxEnabled()) return;
  lastPlayAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const c = ac();
  const master = bus();
  if (!c || !master) return;
  void loadBuffer(name).then((buf) => {
    if (!buf || !sfxEnabled()) return;
    if (opts.exclusive) {
      const old = voices.get(name);
      if (old) {
        try {
          old.gain.gain.setTargetAtTime(0, c.currentTime, 0.02);
          old.src.stop(c.currentTime + 0.1);
        } catch {
          // Already finished; nothing to cut.
        }
      }
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = c.createGain();
    g.gain.value = (opts.gain ?? 1) * (TRIM[name] ?? 1);
    src.connect(g);
    g.connect(master);
    if (opts.exclusive) {
      voices.set(name, { src, gain: g });
      src.onended = () => {
        if (voices.get(name)?.src === src) voices.delete(name);
      };
    }
    src.start();
  });
}

function readVolume(volKey: string, switchKey: string): number {
  if (typeof localStorage === "undefined") return DEFAULT_VOLUME;
  const raw = localStorage.getItem(volKey);
  if (raw !== null) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  }
  // No bar value saved yet: honor the old on/off switch.
  return localStorage.getItem(switchKey) === "0" ? 0 : DEFAULT_VOLUME;
}

/** Music volume, 0 to 1 (the Settings bar shows this as 0 to 100). */
export function musicVolume(): number {
  return readVolume(MUSIC_VOL_KEY, MUSIC_KEY);
}

/** Sound effect volume, 0 to 1 (the Settings bar shows this as 0 to 100). */
export function sfxVolume(): number {
  return readVolume(SFX_VOL_KEY, SFX_KEY);
}

export function musicEnabled(): boolean {
  return musicVolume() > 0;
}

export function sfxEnabled(): boolean {
  return sfxVolume() > 0;
}

/** Drag the sound effects bar. Takes effect on the very next sound, and on any sound already playing. */
export function setSfxVolume(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SFX_VOL_KEY, String(v));
    localStorage.setItem(SFX_KEY, v > 0 ? "1" : "0");
  }
  if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(v * MAX_SFX_GAIN, ctx.currentTime, 0.01);
  return v;
}

/** Kept for any older caller: on restores the default volume, off mutes. */
export function setSfx(on: boolean): boolean {
  setSfxVolume(on ? DEFAULT_VOLUME : 0);
  return on;
}

function applyMusicVolume(v: number) {
  if (musicBus && ctx) {
    musicBus.gain.setTargetAtTime(v * MAX_BGM_GAIN, ctx.currentTime, 0.01);
    return;
  }
  if (bgmEl) bgmEl.volume = v * MAX_BGM_GAIN;
}

function bgm(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!bgmEl) {
    bgmEl = new Audio(BGM_FILE);
    bgmEl.loop = true;
    bgmEl.preload = "auto";
    bgmEl.volume = musicVolume() * MAX_BGM_GAIN;
  }
  if (!musicBus) {
    const c = ac();
    if (c) {
      try {
        const source = c.createMediaElementSource(bgmEl);
        musicBus = c.createGain();
        musicBus.gain.value = musicVolume() * MAX_BGM_GAIN;
        source.connect(musicBus);
        musicBus.connect(c.destination);
        // The gain node now sets the loudness, so the element itself plays at full level.
        bgmEl.volume = 1;
      } catch {
        // Routing failed: fall back to the element's own volume.
        musicBus = null;
      }
    }
  }
  return bgmEl;
}

function startMusic() {
  const el = bgm();
  if (!el) return;
  applyMusicVolume(musicVolume());
  void el.play().catch(() => {
    // Safari withholds autoplay until a real user gesture; unlockAudio()
    // below runs on the first tap, which is what actually starts this.
  });
}

function stopMusic() {
  bgmEl?.pause();
}

/** Drag the music bar. Changes the loop's loudness live; 0 pauses it, anything above 0 plays it. */
export function setMusicVolume(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(MUSIC_VOL_KEY, String(v));
    localStorage.setItem(MUSIC_KEY, v > 0 ? "1" : "0");
  }
  if (v > 0) {
    const el = bgm();
    applyMusicVolume(v);
    if (el?.paused) startMusic();
  } else {
    stopMusic();
  }
  return v;
}

/** Kept for any older caller: on restores the default volume, off mutes. */
export function setMusic(on: boolean): boolean {
  setMusicVolume(on ? DEFAULT_VOLUME : 0);
  return on;
}

/** Call on the first tap anywhere in the app: unlocks the audio context on iOS Safari and starts the BGM loop. */
export function unlockAudio() {
  ac();
  preloadSfx();
  if (musicEnabled()) startMusic();
}

// --- Named triggers. Every call site elsewhere in the app already calls
// one of these exact functions; only the sample behind each one is new. ---

let lastDiceAt = 0;
/**
 * The dice roll. Called from the exact moment the dice animation starts (see
 * Briefcase). The guard keeps a second caller for the same roll (a remote
 * state update, a power-up re-roll that lands in the same beat) from clacking twice.
 */
export function sfxDice() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastDiceAt < 700) return;
  lastDiceAt = now;
  haptic("dice");
  play("dice");
}
/** A card slides into place — dealing, or showing a card you chose. */
export function sfxCard() {
  haptic("card");
  play("card");
}
/** The journal opens or turns a page. */
export function sfxPaper() {
  haptic("card");
  play("pageTurn");
}
/** A mark goes down in the journal. */
export function sfxPencil() {
  play("pencil", { gain: 0.85 });
}
/** Snake eyes — a house card is about to turn over. */
export function sfxSnake() {
  haptic("snake");
  play("thud");
}
/** A Solve the Case attempt comes back wrong. */
export function sfxFail() {
  haptic("snake");
  play("fail");
}
/** The case is solved. */
export function sfxWin() {
  haptic("win");
  play("win");
}
/** A quiet, general UI tap. */
export function sfxSoft() {
  play("digital", { gain: 0.6 });
}
/** A clear cue: it is your turn. */
export function sfxTurn() {
  haptic("dice");
  play("typewriter", { gain: 0.85 });
}
/** Notes just slammed shut. */
export function sfxBlocked() {
  haptic("snake");
  play("thud");
}
/** A card lands in your hand, or someone shows you one. */
export function sfxReceive() {
  haptic("card");
  play("paperSlide");
}
/** Someone is asking you for a card. */
export function sfxAsked() {
  play("digital", { gain: 0.7 });
}
/** You have a card you can show. */
export function sfxCanShow() {
  play("twinkle", { gain: 0.8 });
}
/** A house card, a power, turns over. */
export function sfxPower() {
  haptic("snake");
  play("twinkle");
}
/**
 * A card is picked while naming the solution. This used to fire once, on the
 * "Solve the Case" button; it now fires on every card tapped inside a category.
 * Exclusive, so quick taps restart the cue rather than piling up.
 */
export function sfxSolveStart() {
  haptic("card");
  play("solveStart", { exclusive: true });
}

/** A card slides down to show you a clue. Fired by the reveal itself so sound and motion start together. */
export function sfxReveal() {
  haptic("card");
  play("paperSlide", { exclusive: true });
}

// --- UI press sounds -------------------------------------------------------
// Every button in the app makes a sound. One listener on the document (installed
// once by AppShell) covers all of them, so a new button never ships silent.
// A button picks its sound with data-sfx="tap|soft|select|confirm|deny|drama|none".
// No attribute means "tap". If the click already played a more specific sound
// (the journal's page turn, a pencil mark, the dice), the generic one stays out of the way.

export type UiSound = "tap" | "soft" | "select" | "confirm" | "deny" | "drama" | "none";

/** Primary press: a short, dry clack. */
export function sfxTap() {
  play("tap", { gain: 0.6 });
}
/** Secondary press: back, close, cancel, outline buttons. */
export function sfxUiSoft() {
  play("tick", { gain: 0.8 });
}
/** Choosing something: a card, a toggle, a tab. */
export function sfxSelect() {
  play("tickLow", { gain: 0.85 });
}
/** Committing: Yes, Ask the table, Show this card. */
export function sfxConfirm() {
  play("typewriter", { gain: 0.7 });
}
/** Declining: No, nothing to show. */
export function sfxDeny() {
  play("staticSoft", { gain: 0.55 });
}
/** A weighty step: opening the accusation. */
export function sfxDrama() {
  play("stingSoft", { gain: 0.7 });
}

const UI_PLAYERS: Record<Exclude<UiSound, "none">, () => void> = {
  tap: sfxTap,
  soft: sfxUiSoft,
  select: sfxSelect,
  confirm: sfxConfirm,
  deny: sfxDeny,
  drama: sfxDrama,
};

const PRESSABLE = 'button, a[href], summary, [role="button"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"], [role="menuitem"]';

/** Install the document-wide press sound. Returns a cleanup function. */
export function installUiSounds(): () => void {
  if (typeof document === "undefined") return () => {};
  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const el = target?.closest?.(PRESSABLE) as HTMLElement | null;
    if (!el) return;
    if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return;
    const kind = (el.closest("[data-sfx]")?.getAttribute("data-sfx") ?? "tap") as UiSound;
    if (kind === "none") return;
    // Bubble phase: the button's own handler has already run. If it played something, stay quiet.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastPlayAt < 90) return;
    (UI_PLAYERS[kind] ?? sfxTap)();
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

type QuestionCue = {
  askerId?: string | null;
  showerId?: string | null;
  missId?: string | null;
  shownCardId?: string | null;
  matchingCardIds?: string[];
};

/** Sounds stay on the phone that has to act. Other phones stay quiet. */
export function playQuestionCue(
  prev: { question?: QuestionCue | null } | null,
  next: { question?: QuestionCue | null } | null,
  listenerId: string,
  everyone: boolean,
) {
  const q = next?.question;
  if (!q) return;
  const hear = (id?: string | null) => Boolean(id && (everyone || id === listenerId));
  const askedNow = Boolean(q.showerId && q.showerId !== prev?.question?.showerId && !q.shownCardId && !q.missId);
  if (askedNow && hear(q.showerId)) {
    sfxAsked();
    if ((q.matchingCardIds?.length ?? 0) > 0) sfxCanShow();
  }
  if (q.missId && q.missId !== prev?.question?.missId && hear(q.askerId)) sfxAsked();
  // The paper-slide for a shown card is played by the reveal animation itself (CardReveal),
  // so it starts on the same frame as the card instead of a network tick earlier.
}
