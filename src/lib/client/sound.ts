"use client";
// Tiny synthesized sounds (no audio files needed). Browsers only allow sound after a tap.

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

export const sounds = {
  unlock() {
    ac();
  },
  yourTurn() {
    tone(880, 0, 0.15, "sine", 0.12);
    tone(1320, 0.12, 0.2, "sine", 0.1);
  },
  chip() {
    tone(2200, 0, 0.05, "square", 0.04);
    tone(1700, 0.04, 0.05, "square", 0.03);
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
