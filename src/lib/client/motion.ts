"use client";
// Animations: "full" or "calm". By default we follow the phone's Reduce Motion setting,
// but calm still shows what happened (soft fades instead of flying cards), and anyone can switch
// in the table menu. The choice is remembered on this device.
export type Motion = "full" | "calm";
const KEY = "gloopy.motion";

export function savedMotion(): Motion | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "full" || v === "calm" ? v : null;
  } catch {
    return null;
  }
}

export function currentMotion(): Motion {
  const saved = savedMotion();
  if (saved) return saved;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "calm" : "full";
}

export function applyMotion(m: Motion = currentMotion()) {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("calm-motion", m === "calm");
}

export function setMotion(m: Motion) {
  try {
    localStorage.setItem(KEY, m);
  } catch {}
  applyMotion(m);
}
