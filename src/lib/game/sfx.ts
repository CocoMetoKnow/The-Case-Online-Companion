import { haptic } from "./haptics";

const MUSIC_KEY = "gmm.music";
const SFX_KEY = "gmm.sfx";

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let music: {
  bus: GainNode;
  oscs: OscillatorNode[];
  noise: AudioBufferSourceNode;
  timer: number;
} | null = null;

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
  if (!out) {
    out = c.createGain();
    out.gain.value = 0.85;
    out.connect(c.destination);
  }
  return out;
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

export function unlockAudio() {
  ac();
  if (musicEnabled()) startMusic();
}

export function setMusic(on: boolean): boolean {
  if (typeof localStorage !== "undefined") localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
  if (on) startMusic();
  else stopMusic();
  return on;
}

function envGain(node: GainNode, at: number, peak: number, attack: number, release: number) {
  node.gain.setValueAtTime(0.0001, at);
  node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
}

function tone(freq: number, attack: number, release: number, type: OscillatorType, peak: number, at = 0) {
  const c = ac();
  const master = bus();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  const filter = c.createBiquadFilter();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.max(freq * 4, 800), t);
  osc.connect(filter);
  filter.connect(g);
  g.connect(master);
  envGain(g, t, peak, attack, release);
  osc.start(t);
  osc.stop(t + attack + release + 0.05);
  osc.onended = () => {
    osc.disconnect();
    filter.disconnect();
    g.disconnect();
  };
}

function noiseHit(at: number, dur: number, peak: number, freq: number, q = 0.8) {
  const c = ac();
  const master = bus();
  if (!c || !master) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.86 + white * 0.14;
    data[i] = last * Math.pow(1 - i / len, 1.6);
  }
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  const t = c.currentTime + at;
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.start(t);
  src.stop(t + dur + 0.02);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    g.disconnect();
  };
}

export function sfxDice() {
  haptic("dice");
  if (!sfxEnabled()) return;
  const hits: Array<[number, number, number]> = [
    [0, 0.18, 240],
    [0.07, 0.12, 180],
    [0.14, 0.08, 140],
    [0.22, 0.05, 110],
  ];
  for (const [at, peak, freq] of hits) {
    noiseHit(at, 0.09, peak, freq, 1.2);
    tone(freq * 0.55, 0.005, 0.08, "sine", peak * 0.35, at);
  }
}

export function sfxCard() {
  haptic("card");
  if (!sfxEnabled()) return;
  noiseHit(0, 0.06, 0.08, 1800, 0.7);
  tone(640, 0.005, 0.07, "triangle", 0.03);
}

export function sfxPaper() {
  haptic("card");
  if (!sfxEnabled()) return;
  noiseHit(0, 0.12, 0.06, 900, 0.5);
  noiseHit(0.05, 0.16, 0.04, 600, 0.4);
  tone(220, 0.01, 0.12, "sine", 0.02, 0.02);
}

export function sfxSnake() {
  haptic("snake");
  if (!sfxEnabled()) return;
  tone(110, 0.04, 0.7, "sine", 0.06);
  tone(130.81, 0.05, 0.8, "triangle", 0.035, 0.04);
  tone(164.81, 0.08, 0.9, "sine", 0.03, 0.08);
  tone(98, 0.06, 0.7, "triangle", 0.04, 0.22);
}

export function sfxFail() {
  haptic("snake");
  if (!sfxEnabled()) return;
  tone(311, 0.05, 0.32, "triangle", 0.05);
  tone(233, 0.08, 0.5, "sine", 0.045, 0.14);
  tone(155, 0.14, 0.8, "triangle", 0.04, 0.3);
}

export function sfxWin() {
  haptic("win");
  if (!sfxEnabled()) return;
  const notes = [196, 246.94, 293.66, 392, 493.88];
  notes.forEach((freq, i) => tone(freq, 0.02, 0.55, "triangle", 0.045, i * 0.11));
  tone(392, 0.08, 0.9, "sine", 0.04, 0.45);
}

export function sfxSoft() {
  if (!sfxEnabled()) return;
  tone(330, 0.01, 0.12, "sine", 0.02);
}

/** A clear bell: it is your turn. */
export function sfxTurn() {
  haptic("dice");
  if (!sfxEnabled()) return;
  tone(523.25, 0.01, 0.18, "sine", 0.05);
  tone(659.25, 0.01, 0.28, "triangle", 0.045, 0.12);
  tone(783.99, 0.02, 0.36, "sine", 0.035, 0.24);
}

/** Notes just slammed shut. */
export function sfxBlocked() {
  haptic("snake");
  if (!sfxEnabled()) return;
  tone(196, 0.02, 0.22, "triangle", 0.05);
  tone(155, 0.04, 0.4, "sine", 0.045, 0.12);
  noiseHit(0, 0.12, 0.05, 400, 0.6);
}

/** A card lands in your hand, or someone shows you one. */
export function sfxReceive() {
  haptic("card");
  if (!sfxEnabled()) return;
  noiseHit(0, 0.05, 0.06, 1700, 0.6);
  tone(523.25, 0.01, 0.14, "triangle", 0.045);
  tone(783.99, 0.01, 0.2, "sine", 0.035, 0.07);
}

/** Someone is asking you for a card. */
export function sfxAsked() {
  haptic("card");
  if (!sfxEnabled()) return;
  tone(392, 0.01, 0.12, "sine", 0.04);
  tone(523.25, 0.01, 0.16, "triangle", 0.04, 0.1);
}

/** You have a card you can show. */
export function sfxCanShow() {
  haptic("card");
  if (!sfxEnabled()) return;
  tone(659.25, 0.01, 0.12, "triangle", 0.045, 0.28);
  tone(880, 0.015, 0.2, "sine", 0.04, 0.4);
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

/** A house card, a power, turns over. */
export function sfxPower() {
  haptic("snake");
  if (!sfxEnabled()) return;
  tone(392, 0.02, 0.16, "triangle", 0.04);
  tone(523.25, 0.02, 0.22, "sine", 0.04, 0.08);
  tone(659.25, 0.03, 0.36, "triangle", 0.035, 0.16);
  noiseHit(0.02, 0.08, 0.04, 2200, 0.5);
}

const PHRASE = [220, 0, 261.63, 329.63, 293.66, 0, 246.94, 220, 196, 0, 174.61, 196, 220, 261.63, 0, 164.81];
const CHORDS: number[][] = [
  [110, 164.81, 220],
  [146.83, 174.61, 220],
  [164.81, 196, 246.94],
  [110, 164.81, 220],
];

function startMusic() {
  if (music) return;
  const c = ac();
  const master = bus();
  if (!c || !master) return;

  const bed = c.createGain();
  bed.gain.setValueAtTime(0.0001, c.currentTime);
  bed.gain.exponentialRampToValueAtTime(1, c.currentTime + 2.2);
  bed.connect(master);

  const oscs: OscillatorNode[] = [];
  for (const freq of CHORDS[0]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    const filter = c.createBiquadFilter();
    osc.type = "sine";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = 700;
    g.gain.value = freq < 140 ? 0.045 : 0.02;
    osc.connect(filter);
    filter.connect(g);
    g.connect(bed);
    osc.start();
    oscs.push(osc);
  }

  const len = c.sampleRate * 2;
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.98 + white * 0.02;
    data[i] = last;
  }
  const noise = c.createBufferSource();
  const hush = c.createBiquadFilter();
  const hushGain = c.createGain();
  noise.buffer = buffer;
  noise.loop = true;
  hush.type = "lowpass";
  hush.frequency.value = 500;
  hushGain.gain.value = 0.035;
  noise.connect(hush);
  hush.connect(hushGain);
  hushGain.connect(bed);
  noise.start();

  let step = 0;
  const timer = window.setInterval(() => {
    const live = ac();
    if (!live || !music) return;
    const note = PHRASE[step % PHRASE.length];
    if (step % 8 === 0) {
      const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
      oscs.forEach((osc, i) => {
        osc.frequency.setTargetAtTime(chord[i] ?? chord[0], live.currentTime, 0.4);
      });
    }
    step += 1;
    if (!note) return;
    tone(note, 0.03, 1.15, "triangle", 0.04);
    if (step % 4 === 1) tone(note / 2, 0.04, 1.3, "sine", 0.02);
  }, 1280);

  music = { bus: bed, oscs, noise, timer };
}

function stopMusic() {
  const c = ac();
  const current = music;
  if (!current) return;
  window.clearInterval(current.timer);
  music = null;
  if (c) {
    current.bus.gain.cancelScheduledValues(c.currentTime);
    current.bus.gain.setValueAtTime(Math.max(current.bus.gain.value, 0.0001), c.currentTime);
    current.bus.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.45);
  }
  window.setTimeout(() => {
    current.oscs.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* already stopped */
      }
    });
    try {
      current.noise.stop();
      current.noise.disconnect();
    } catch {
      /* already stopped */
    }
    try {
      current.bus.disconnect();
    } catch {
      /* already stopped */
    }
  }, 500);
}
