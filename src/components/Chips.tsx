/** A little stack of colourful poker chips, used next to stacks, bets and the pot. */
const CHIP_COLOURS = ["#7b3fe4", "#f5b301", "#1e9be0", "#e8432d", "#20b46a"];

export function ChipStack({ count = 3, size = 16, seed = 0 }: { count?: number; size?: number; seed?: number }) {
  const chips = Array.from({ length: count }, (_, i) => CHIP_COLOURS[(i + seed) % CHIP_COLOURS.length]);
  return (
    <span className="inline-flex -space-x-[5px]" aria-hidden>
      {chips.map((c, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9.2" fill={c} stroke="rgba(0,0,0,.35)" strokeWidth="0.8" />
          <circle cx="10" cy="10" r="6.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeDasharray="3.2 2.6" />
          <circle cx="10" cy="10" r="4.2" fill={c} stroke="rgba(255,255,255,.5)" strokeWidth="0.8" />
        </svg>
      ))}
    </span>
  );
}

/** Chip count with a stack, e.g. [chips] 15,700 */
export function ChipAmount({ amount, className = "", size = 14, seed = 0 }: { amount: number; className?: string; size?: number; seed?: number }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular ${className}`}>
      <ChipStack size={size} seed={seed} />
      <span>{amount.toLocaleString()}</span>
    </span>
  );
}
