import type { CSSProperties } from "react";

/** A ring of short gold rays that shoots outward once (used for the river landing and the winner). */
export function Burst({ delay = 0, radius = 60, rays = 12 }: { delay?: number; radius?: number; rays?: number }) {
  return (
    <span className="burst" style={{ ["--r" as string]: `${radius}px` } as CSSProperties} aria-hidden>
      {Array.from({ length: rays }).map((_, k) => (
        <i key={k} style={{ ["--a" as string]: `${(360 / rays) * k}deg`, ["--d" as string]: `${delay + (k % 3) * 25}ms` } as CSSProperties} />
      ))}
    </span>
  );
}
