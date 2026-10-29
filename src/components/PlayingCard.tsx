const SUIT: Record<string, { sym: string; red: boolean; name: string }> = {
  s: { sym: "♠", red: false, name: "spades" },
  h: { sym: "♥", red: true, name: "hearts" },
  d: { sym: "♦", red: true, name: "diamonds" },
  c: { sym: "♣", red: false, name: "clubs" },
};
const RANK_NAME: Record<string, string> = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
const RANK_WORD: Record<string, string> = { T: "ten", J: "jack", Q: "queen", K: "king", A: "ace" };

export function cardLabel(card: string) {
  const r = RANK_WORD[card[0]] ?? card[0];
  return `${r} of ${SUIT[card[1]].name}`;
}

/** A playing card. `card` like "As"; omit it for a face-down card. */
export function PlayingCard({
  card,
  size = "md",
  dim = false,
  glow = false,
}: {
  card?: string;
  size?: "sm" | "md" | "lg" | "board";
  dim?: boolean;
  glow?: boolean;
}) {
  const dims = {
    sm: "w-8 h-11 text-[13px]",
    md: "w-11 h-[60px] text-base",
    lg: "w-14 h-[78px] text-xl",
    board: "w-9 h-[50px] text-sm sm:w-11 sm:h-[60px] sm:text-base",
  }[size];
  if (!card) {
    return (
      <div
        className={`${dims} rounded-md border border-black/40 shadow-md`}
        style={{
          background:
            "repeating-linear-gradient(45deg, #1e6b45 0 4px, #18573a 4px 8px), #1e6b45",
          boxShadow: "inset 0 0 0 2px #d4a84b, 0 2px 4px rgba(0,0,0,.4)",
        }}
        aria-label="face-down card"
      />
    );
  }
  const s = SUIT[card[1]];
  const rank = RANK_NAME[card[0]] ?? card[0];
  return (
    <div
      className={`${dims} relative select-none rounded-md bg-white shadow-md transition ${dim ? "opacity-40" : ""} ${glow ? "ring-2 ring-brass -translate-y-1" : ""}`}
      aria-label={cardLabel(card)}
      role="img"
    >
      <span className={`absolute left-1 top-0.5 flex flex-col items-center font-bold leading-[0.95] ${s.red ? "text-[#d62d3a]" : "text-[#16161d]"}`}>
        <span>{rank}</span>
        <span className="text-[0.8em]">{s.sym}</span>
      </span>
      <span
        className={`absolute bottom-0.5 right-1 leading-none ${s.red ? "text-[#d62d3a]" : "text-[#16161d]"}`}
        style={{ fontSize: "1.3em" }}
      >
        {s.sym}
      </span>
    </div>
  );
}
