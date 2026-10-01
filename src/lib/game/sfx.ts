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

/** SFX sit above the music bed without clipping; both toggle independently and persist via localStorage. */
const SFX_GAIN = 0.75;
const BGM_GAIN = 0.35;
const BGM_FILE = "/assets/audio/leberch-dark-cinematic-509801.mp3";

const SFX_FILES = {
  card: "/assets/audio/card_place.mp3",
  solveStart: "/assets/audio/mysterious_sting.mp3",
  win: "/assets/audio/victorious_clue.mp3",
  fail: "/assets/audio/muffled_static.mp3",
  typewriter: "/assets/audio/ui_typewriter.mp3",
  digital: "/assets/audio/digital_tone.mp3",
  dice: "/assets/audio/quick_clack.mp3",
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
    sfxBus.gain.value = SFX_GAIN;
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

function play(name: SfxName, opts: { gain?: number; rate?: number } = {}) {
  if (!sfxEnabled()) return;
  const c = ac();
  const master = bus();
  if (!c || !master) return;
  void loadBuffer(name).then((buf) => {
    if (!buf || !sfxEnabled()) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = c.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g);
    g.connect(master);
    src.start();
  });
}

export function musicEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(MUSIC_KEY) !== "0";
}

export function sfxEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(SFX_KEY) !== "0";
}

export function setSfx(on: boolean): boolean {
  if (typeof localStorage !== "undefined") localStorage.setItem(SFX_KEY, on ? "1" : "0");
  return on;
}

function bgm(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!bgmEl) {
    bgmEl = new Audio(BGM_FILE);
    bgmEl.loop = true;
    bgmEl.preload = "auto";
    bgmEl.volume = BGM_GAIN;
  }
  return bgmEl;
}

function startMusic() {
  const el = bgm();
  if (!el) return;
  el.volume = BGM_GAIN;
  void el.play().catch(() => {
    // Safari withholds autoplay until a real user gesture; unlockAudio()
    // below runs on the first tap, which is what actually starts this.
  });
}

function stopMusic() {
  bgmEl?.pause();
}

export function setMusic(on: boolean): boolean {
  if (typeof localStorage !== "undefined") localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
  if (on) startMusic();
  else stopMusic();
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

/** The dice land. */
export function sfxDice() {
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
/** A Solve the Case attempt is being made. */
export function sfxSolveStart() {
  haptic("snake");
  play("solveStart");
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
  if (q.shownCardId && q.shownCardId !== prev?.question?.shownCardId && hear(q.askerId)) sfxReceive();
}
