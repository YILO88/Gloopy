import { GIFS, STICKERS } from "@/lib/gloops";
import { Gloop, Face } from "./Gloop";

const FACE: Record<string, Face> = {};

export function StickerArt({ id, size = 72 }: { id: string; size?: number }) {
  const s = STICKERS.find((x) => x.id === id);
  if (!s) return null;
  return (
    <figure className="inline-flex flex-col items-center" style={{ width: size }}>
      <Gloop id={s.gloop} face={(FACE[s.id] ?? s.face) as Face} size={size * 0.8} />
      <figcaption
        className="-mt-2 rounded-full border-2 border-ink bg-lime px-2 font-display text-[11px] font-extrabold leading-5 text-ink whitespace-nowrap"
        style={{ fontSize: Math.max(10, size / 7) }}
      >
        {s.caption}
      </figcaption>
    </figure>
  );
}

/** Placeholder animated GIF: a Gloop doing something silly. */
export function GifArt({ id, size = 120 }: { id: string; size?: number }) {
  const g = GIFS.find((x) => x.id === id);
  if (!g) return null;
  const face: Face = g.motion === "shake" ? "angry" : g.motion === "spin" ? "shock" : "laugh";
  return (
    <figure
      className="relative overflow-hidden rounded-xl border-2 border-black/30 bg-[#ffe9f3]"
      style={{ width: size, height: size * 0.75 }}
      aria-label={g.caption}
    >
      {g.motion === "rain" &&
        [10, 30, 55, 75, 90].map((x, i) => (
          <span key={x} className="g-rain absolute top-0 text-lg" style={{ left: `${x}%`, animationDelay: `${i * 0.22}s` }}>
            🪙
          </span>
        ))}
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <div className={`g-${g.motion === "rain" ? "bounce" : g.motion}`}>
          <Gloop id={g.gloop} face={face} size={size * 0.42} />
        </div>
      </div>
      <figcaption className="absolute left-1.5 top-1 font-display text-xs font-extrabold text-ink">{g.caption}</figcaption>
    </figure>
  );
}
