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

/** A playing card. `card` like "As"; omit it for a face-down card. */
export function PlayingCard({
  card,
  size = "board",
  dim = false,
  glow = false,
  className = "",
}: {
  card?: string;
  size?: CardSize;
  dim?: boolean;
  glow?: boolean;
  className?: string;
}) {
  const dims = DIMS[size];
  if (!card) {
    return (
      <div
        className={`${dims} ${className} border border-white/70 shadow-[0_2px_4px_rgba(0,0,0,.45)]`}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, #b6f23a 0 18%, transparent 19%), repeating-linear-gradient(45deg, #2747c9 0 3px, #1f3aa8 3px 6px)",
        }}
        aria-label="face-down card"
      />
    );
  }
  const s = SUIT[card[1]];
  const rank = RANK_NAME[card[0]] ?? card[0];
  const color = s.red ? "text-[#d4202f]" : "text-[#14141c]";
  return (
    <div
      className={`${dims} ${className} relative select-none overflow-hidden border border-black/10 bg-[#fdfdf8] shadow-[0_3px_6px_rgba(0,0,0,.4)] transition-transform duration-300 ${dim ? "brightness-[.55]" : ""} ${glow ? "-translate-y-2 ring-[3px] ring-[#ffd23f]" : ""}`}
      aria-label={cardLabel(card)}
      role="img"
    >
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
