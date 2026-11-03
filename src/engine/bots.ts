/**
 * Bot players: how a computer player chooses its move.
 *
 * Easy:   plays loosely, calls a lot, rarely bluffs, makes the odd mistake.
 * Normal: estimates its chance of winning and compares it with the price of calling.
 * Hard:   same estimate with more samples, bets for value more, bluffs and semi-bluffs sometimes.
 *
 * The estimate deals out the unknown cards many times at random (a "Monte Carlo" simulation),
 * using only what the bot could see at a real table: its own cards, the board and how many opponents remain.
 */
import { Card, Rng, newDeck } from "./cards";
import { compareScores, evaluateBest } from "./evaluate";
import type { Action, BotLevel, GameState } from "./game";
import { legalActions } from "./game";

const RANKS = "23456789TJQKA";
const rankOf = (c: Card) => RANKS.indexOf(c[0]) + 2;

/** Rough pre-flop hand strength, 0 (worst) .. 1 (aces). */
export function preflopStrength(hole: Card[]): number {
  const [a, b] = hole.map(rankOf).sort((x, y) => y - x);
  const suited = hole[0][1] === hole[1][1];
  let score: number;
  if (a === b) score = Math.max(5, a * 2 - 4); // pairs: 22 ≈ 5 .. AA = 24
  else {
    score = a === 14 ? 10 : a === 13 ? 8 : a === 12 ? 7 : a === 11 ? 6 : a / 2;
    if (suited) score += 2;
    const gap = a - b - 1;
    score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && a < 12) score += 1;
  }
  return Math.max(0, Math.min(1, score / 24));
}

/** Chance of winning at showdown against `opponents` random hands (ties count as half). */
export function winChance(hole: Card[], board: Card[], opponents: number, samples: number, rng: Rng): number {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board]);
  const rest = newDeck().filter((c) => !known.has(c));
  let score = 0;
  for (let s = 0; s < samples; s++) {
    // partial shuffle: only the cards we need
    const need = opponents * 2 + (5 - board.length);
    const deck = rest.slice();
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const fullBoard = board.concat(deck.slice(opponents * 2, need));
    const mine = evaluateBest(hole.concat(fullBoard)).score;
    let best = 1; // 1 = winning outright, 0.5 = tied, 0 = lost
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = evaluateBest(deck.slice(o * 2, o * 2 + 2).concat(fullBoard)).score;
      const c = compareScores(mine, theirs);
      if (c < 0) {
        best = 0;
        break;
      }
      if (c === 0) ties++;
    }
    score += best === 0 ? 0 : ties ? 1 / (ties + 1) : 1;
  }
  return score / samples;
}

const SAMPLES: Record<BotLevel, number> = { easy: 60, normal: 150, hard: 300 };

export function botDecision(state: GameState, id: string, level: BotLevel, rng: Rng): Action {
  const h = state.hand!;
  const legal = legalActions(state, id);
  const me = h.seats[id];
  const stack = state.players.find((p) => p.id === id)!.chips;
  const opponents = h.order.filter((x) => x !== id && !h.seats[x].folded).length;
  const pot = Object.values(h.seats).reduce((s, x) => s + x.total, 0);
  const toCall = legal.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const bb = h.bigBlind;

  // Chance of winning: pre-flop blends a quick chart with a small simulation.
  let equity = winChance(me.hole, h.board, opponents, SAMPLES[level], rng);
  if (h.board.length === 0) equity = 0.5 * equity + 0.5 * (preflopStrength(me.hole) / Math.max(1, opponents * 0.6));

  const raiseTo = (fractionOfPot: number): Action => {
    if (!legal.canRaise) return toCall === 0 ? { type: "check" } : { type: "call" };
    let to = h.currentBet + Math.round((fractionOfPot * (pot + toCall)) / bb) * bb;
    to = Math.max(to, legal.minRaiseTo);
    if (to >= legal.maxRaiseTo) return { type: "allin" };
    return { type: "raise", to };
  };
  const passive = (): Action => (toCall === 0 ? { type: "check" } : { type: "fold" });
  const roll = rng();

  if (level === "easy") {
    // Loose and friendly: calls a lot, raises only with big hands, the odd random mistake.
    if (roll < 0.08) return toCall === 0 ? { type: "check" } : toCall < stack * 0.25 ? { type: "call" } : { type: "fold" };
    if (equity > 0.75 && roll < 0.5) return raiseTo(0.5);
    if (toCall === 0) return roll < 0.12 ? raiseTo(0.4) : { type: "check" };
    if (equity + 0.15 >= potOdds || toCall <= bb * 2) return { type: "call" };
    return { type: "fold" };
  }

  const tight = level === "hard" ? 0.02 : 0.05; // how much better than the price a call must be
  const late = h.board.length >= 3;

  if (equity > (level === "hard" ? 0.68 : 0.72)) {
    // Strong: bet for value; very strong on the river with a short stack, push.
    if (late && h.board.length === 5 && equity > 0.85 && stack < pot * 1.5) return legal.canRaise ? { type: "allin" } : { type: "call" };
    return raiseTo(level === "hard" ? 0.6 + roll * 0.4 : 0.6);
  }
  if (equity > 0.55 && roll < (level === "hard" ? 0.45 : 0.3)) return raiseTo(0.5);
  if (toCall === 0) {
    // Checked to us: hard bots sometimes bluff or semi-bluff.
    const bluff = level === "hard" ? (late ? 0.18 : 0.1) : 0.07;
    if (roll < bluff) return raiseTo(0.5);
    return { type: "check" };
  }
  if (equity >= potOdds + tight) return { type: "call" };
  // A small price to see more cards with something to hope for.
  if (level === "hard" && h.board.length < 5 && toCall <= pot * 0.2 && equity > 0.25) return { type: "call" };
  return passive();
}
