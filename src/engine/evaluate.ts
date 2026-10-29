import { Card, rankValue, suitOf } from "./cards";

export const CATEGORY_NAMES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

export interface HandValue {
  /** 0 = high card ... 8 = straight flush (royal flush is the ace-high straight flush). */
  category: number;
  /** Category first, then tie-breaking ranks, highest first. Compare element by element. */
  score: number[];
  /** The five cards that make the hand. */
  cards: Card[];
  /** Friendly name, e.g. "Pair of Sixes". */
  name: string;
}

const PLURAL: Record<number, string> = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens", 8: "Eights",
  9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};
const SINGLE: Record<number, string> = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight",
  9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};

export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Highest card of a straight in these distinct descending ranks, or 0. Handles the wheel (A-2-3-4-5). */
function straightHigh(ranksDesc: number[]): number {
  const set = new Set(ranksDesc);
  if (set.size !== 5) return 0;
  const max = ranksDesc[0];
  const min = ranksDesc[4];
  if (max - min === 4) return max;
  if (max === 14 && ranksDesc[1] === 5 && min === 2) return 5; // wheel
  return 0;
}

function evaluate5(cards: Card[]): HandValue {
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const sHigh = straightHigh(ranks);

  // Group ranks by count, ordered by (count desc, rank desc).
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);

  let category: number;
  let tiebreak: number[];
  let name: string;

  if (flush && sHigh) {
    category = 8;
    tiebreak = [sHigh];
    name = sHigh === 14 ? "Royal Flush" : `Straight Flush, ${SINGLE[sHigh]} high`;
  } else if (groups[0][1] === 4) {
    category = 7;
    tiebreak = byGroup;
    name = `Four of a Kind, ${PLURAL[byGroup[0]]}`;
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    tiebreak = byGroup;
    name = `Full House, ${PLURAL[byGroup[0]]} over ${PLURAL[byGroup[1]]}`;
  } else if (flush) {
    category = 5;
    tiebreak = ranks;
    name = `Flush, ${SINGLE[ranks[0]]} high`;
  } else if (sHigh) {
    category = 4;
    tiebreak = [sHigh];
    name = `Straight, ${SINGLE[sHigh]} high`;
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreak = byGroup;
    name = `Three of a Kind, ${PLURAL[byGroup[0]]}`;
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    tiebreak = byGroup;
    name = `Two Pair, ${PLURAL[byGroup[0]]} and ${PLURAL[byGroup[1]]}`;
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreak = byGroup;
    name = `Pair of ${PLURAL[byGroup[0]]}`;
  } else {
    category = 0;
    tiebreak = ranks;
    name = `High Card, ${SINGLE[ranks[0]]}`;
  }
  return { category, score: [category, ...tiebreak], cards, name };
}

/** Best five-card hand from 5 to 7 cards. */
export function evaluateBest(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error("evaluateBest needs 5 to 7 cards");
  let best: HandValue | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(v.score, best.score) > 0) best = v;
          }
  return best!;
}

/** Name of the best hand so far, for showing "Pair of Sixes" under a player's cards. Works with 2+ cards. */
export function describeHand(cards: Card[]): string {
  if (cards.length >= 5) return evaluateBest(cards).name;
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (groups[0][1] === 4) return `Four of a Kind, ${PLURAL[groups[0][0]]}`;
  if (groups[0][1] === 3) return `Three of a Kind, ${PLURAL[groups[0][0]]}`;
  if (groups[0][1] === 2 && groups[1]?.[1] === 2)
    return `Two Pair, ${PLURAL[groups[0][0]]} and ${PLURAL[groups[1][0]]}`;
  if (groups[0][1] === 2) return `Pair of ${PLURAL[groups[0][0]]}`;
  return `High Card, ${SINGLE[ranks[0]]}`;
}
