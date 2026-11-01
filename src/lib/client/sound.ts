"use client";
// Table sounds. Browsers only allow sound after a tap.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("gloopy.muted", m ? "1" : "0");
  } catch {}
}
export function isMuted() {
  try {
    muted = localStorage.getItem("gloopy.muted") === "1";
  } catch {}
  return muted;
}

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "triangle", gain = 0.18) {
  const a = ac();
  if (!a || muted) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

// Real recordings (Kenney "Casino Audio", CC0) live in /public/sounds. They load after the first tap.
const SAMPLES = {
  deal: ["card-slide-1", "card-slide-2", "card-slide-3", "card-slide-4"],
  flip: ["card-place-1", "card-place-2", "card-place-4"],
  fold: ["card-shove-1", "card-shove-2"],
  chip: ["chips-collide-1", "chips-collide-2", "chips-collide-3"],
  pot: ["chips-handle-1", "chips-handle-5"],
} as const;
type Sample = keyof typeof SAMPLES;
const buffers = new Map<string, AudioBuffer>();
let loading = false;

function load() {
  const a = ac();
  if (!a || loading) return;
  loading = true;
  for (const name of Object.values(SAMPLES).flat()) {
    fetch(`/sounds/${name}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => new Promise<AudioBuffer>((ok, bad) => a.decodeAudioData(b, ok, bad)))
      .then((buf) => buffers.set(name, buf))
      .catch(() => {});
  }
}

function play(kind: Sample, delayMs = 0, gain = 0.5) {
  const a = ac();
  if (!a || muted) return;
  load();
  const names = SAMPLES[kind];
  const buf = buffers.get(names[Math.floor(Math.random() * names.length)]);
  if (!buf) return;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.95 + Math.random() * 0.1; // tiny variation so repeats don't sound robotic
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g).connect(a.destination);
  src.start(a.currentTime + delayMs / 1000);
}

export const sounds = {
  unlock() {
    load();
  },
  /** A card dealt to a player. */
  card(delayMs = 0) {
    play("deal", delayMs, 0.45);
  },
  /** A card turned face up on the board. */
  flip(delayMs = 0) {
    play("flip", delayMs, 0.5);
  },
  /** A hand thrown away. */
  fold() {
    play("fold", 0, 0.4);
  },
  yourTurn() {
    tone(880, 0, 0.15, "sine", 0.12);
    tone(1320, 0.12, 0.2, "sine", 0.1);
  },
  /** Chips going into the pot. */
  chip() {
    play("chip", 0, 0.5);
  },
  /** The pot sliding to the winner. */
  pot(delayMs = 0) {
    play("pot", delayMs, 0.55);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, "triangle", 0.2));
    tone(1319, 0.5, 0.6, "triangle", 0.16);
  },
  lose() {
    // the classic "wah wah wah wahhh"
    const a = ac();
    if (!a || muted) return;
    [392, 370, 349].forEach((f, i) => tone(f, i * 0.35, 0.3, "sawtooth", 0.08));
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sawtooth";
    const t = a.currentTime + 1.05;
    o.frequency.setValueAtTime(330, t);
    o.frequency.linearRampToValueAtTime(300, t + 0.9);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 1.05);
  },
};
