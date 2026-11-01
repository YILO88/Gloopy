"use client";
import { useEffect } from "react";
import { applyMotion } from "@/lib/client/motion";

/** Applies the animation preference (full / calm) to the whole page. */
export function MotionPref() {
  useEffect(() => {
    applyMotion();
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const on = () => applyMotion();
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, []);
  return null;
}
