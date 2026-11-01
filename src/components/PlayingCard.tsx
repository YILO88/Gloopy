import { useState, type CSSProperties } from "react";
import { Burst } from "./Burst";

const SUIT: Record<string, { sym: string; red: boolean; name: string }> = {
  s: { sym: "♠", red: false, name: "spades" },
  h: { sym: "♥", red: true, name: "hearts" },
  d: { sym: "♦", red: true, name: "diamonds" },
  c: { sym: "♣", red: false, name: "clubs" },
};
const RANK_NAME: Record<string, string> = { T: "10" };
const RANK_WORD: Record<string, string> = { T: "ten", J: "jack", Q: "queen", K: "king", A: "ace" };

export function cardLabel(card: string) {
  const r = RANK_WORD[card[0]] ?? card[0];
  return `${r} of ${SUIT[card[1]].name}`;
}

export type CardSize = "xs" | "sm" | "board" | "hand";

// Width × height, with the font size driving the rank and suit (which are sized in em).
const DIMS: Record<CardSize, string> = {
  xs: "w-[22px] h-[31px] text-[9px] rounded-[4px]",
  sm: "w-[30px] h-[42px] text-[12px] rounded-[5px]",
  board: "w-[50px] h-[70px] text-[20px] rounded-[7px] sm:w-[64px] sm:h-[90px] sm:text-[26px]",
  hand: "w-[60px] h-[84px] text-[24px] rounded-[8px] sm:w-[66px] sm:h-[92px] sm:text-[26px]",
};

const BACK_STYLE: CSSProperties = {
  background:
    "radial-gradient(circle at 50% 50%, #b6f23a 0 18%, transparent 19%), repeating-linear-gradient(45deg, #2747c9 0 3px, #1f3aa8 3px 6px)",
};

/**
 * How a card arrives:
 *  - "deal": slides in from the middle of the table (`from` = offset in px from where it lands)
 *  - "flip": turns over from face-down to face-up
 *  - "dealflip": slides in face-down, then turns over (your own cards, board cards)
 *  - "muck": a folded hand sliding into the middle and disappearing
 *  - "river": the last board card: flies in big and face down, hangs, flips, then settles with a burst
 */
export type CardMotion = "deal" | "flip" | "dealflip" | "muck" | "river";

/** A playing card. `card` like "As"; omit it for a face-down card. */
export function PlayingCard({
  card,
  size = "board",
  dim = false,
  glow = false,
  className = "",
  motion,
  delay = 0,
  from,
}: {
  card?: string;
  size?: CardSize;
  dim?: boolean;
  glow?: boolean;
  className?: string;
  motion?: CardMotion;
  /** Milliseconds to wait before the motion starts (for dealing one card after another). */
  delay?: number;
  /** Where the card comes from (deal) or goes to (muck), in px relative to where it sits. */
  from?: { x: number; y: number };
}) {
  // The motion is decided when the card first appears and never replays,
  // so cards already on the table don't jump when the screen updates.
  const [frozen] = useState(() => ({ motion, delay, from }));
  motion = frozen.motion;
  delay = frozen.delay;
  from = frozen.from;
  const dims = DIMS[size];
  const travel = from ?? { x: 0, y: -40 };
  const vars = {
    "--d": `${delay}ms`,
    "--fx": `${Math.round(travel.x)}px`,
    "--fy": `${Math.round(travel.y)}px`,
  } as CSSProperties;

  const back = <div className={`absolute inset-0 rounded-[inherit] border border-white/70`} style={BACK_STYLE} />;
  const front = card ? <Face card={card} /> : back;
  const lift = glow ? "-translate-y-2 ring-[3px] ring-[#ffd23f]" : "";
  const shade = dim ? "brightness-[.55]" : "";

  if (motion === "river") {
    return (
      <div className={`${dims} ${className} relative select-none [perspective:900px] card-river ${shade} ${lift}`} style={vars} aria-label={card ? cardLabel(card) : "face-down card"} role="img">
        <div className="card-flip card-flip-river absolute inset-0 rounded-[inherit] shadow-[0_6px_16px_rgba(0,0,0,.45)] [transform-style:preserve-3d]">
          <div className="absolute inset-0 rounded-[inherit] [backface-visibility:hidden]">{front}</div>
          <div className="absolute inset-0 rounded-[inherit] [backface-visibility:hidden] [transform:rotateY(180deg)]">{back}</div>
        </div>
        <Burst delay={delay + 1380} radius={62} />
      </div>
    );
  }

  if (motion === "flip" || motion === "dealflip") {
    // Two faces on a turning card: back shows first, then it flips to the front.
    return (
      <div
        className={`${dims} ${className} relative select-none [perspective:700px] ${motion === "dealflip" ? "card-deal" : ""} ${shade} transition-transform duration-300 ${lift}`}
        style={vars}
        aria-label={card ? cardLabel(card) : "face-down card"}
        role="img"
      >
        <div
          className={`card-flip absolute inset-0 rounded-[inherit] shadow-[0_3px_6px_rgba(0,0,0,.4)] [transform-style:preserve-3d] ${motion === "dealflip" ? "card-flip-late" : ""}`}
        >
          <div className="absolute inset-0 rounded-[inherit] [backface-visibility:hidden]">{front}</div>
          <div className="absolute inset-0 rounded-[inherit] [backface-visibility:hidden] [transform:rotateY(180deg)]">{back}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${dims} ${className} relative select-none shadow-[0_3px_6px_rgba(0,0,0,.4)] transition-transform duration-300 ${shade} ${lift} ${
        motion === "deal" ? "card-deal" : motion === "muck" ? "card-muck" : ""
      }`}
      style={vars}
      aria-label={card ? cardLabel(card) : "face-down card"}
      role="img"
    >
      {front}
    </div>
  );
}

function Face({ card }: { card: string }) {
  const s = SUIT[card[1]];
  const rank = RANK_NAME[card[0]] ?? card[0];
  const color = s.red ? "text-[#d4202f]" : "text-[#14141c]";
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[inherit] border border-black/10 bg-[#fdfdf8]">
      <span className={`absolute left-[0.18em] top-[0.06em] flex flex-col items-center font-bold leading-[0.9] ${color}`}>
        <span className={rank === "10" ? "tracking-[-0.08em]" : ""}>{rank}</span>
        <span className="text-[0.62em]">{s.sym}</span>
      </span>
      <span className={`absolute -bottom-[0.12em] right-[0.08em] leading-none ${color}`} style={{ fontSize: "1.55em" }}>
        {s.sym}
      </span>
    </div>
  );
}
