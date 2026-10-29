// Cards are two-character strings: rank + suit, e.g. "As" (ace of spades), "Td" (ten of diamonds).
export type Suit = "s" | "h" | "d" | "c";
export type Card = string;

export const RANKS = "23456789TJQKA";
export const SUITS: Suit[] = ["s", "h", "d", "c"];

/** Returns a number in [0, 1). Injected so tests can be deterministic. */
export type Rng = () => number;

export function rankValue(card: Card): number {
  // 2 → 2 ... A → 14
  return RANKS.indexOf(card[0]) + 2;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

/** Fisher–Yates shuffle. Returns a new array. */
export function shuffle(deck: Card[], rng: Rng): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Cryptographically strong RNG for real games (works in Node and browsers). */
export const secureRng: Rng = () => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
};

/** Small seeded RNG for tests and bots (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
