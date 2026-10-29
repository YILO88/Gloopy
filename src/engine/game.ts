/**
 * Gloopy poker engine: No-Limit Texas Hold'em for 2–9 players.
 *
 * Pure and deterministic: every function takes a state (plus the current time and,
 * where cards are dealt, a random source) and returns a NEW state. Nothing here
 * talks to a database or a network, which makes it easy to test and to run inside
 * a short-lived Vercel request.
 *
 * Timers are "lazy": instead of a countdown running somewhere, each turn stores a
 * deadline, and `advance(state, now)` applies whatever should have happened by `now`
 * (auto-fold/check on a missed turn, starting the next hand). The blind level is
 * worked out from the game's start time, so nothing needs to tick.
 */
import { Card, Rng, newDeck, shuffle } from "./cards";
import { compareScores, evaluateBest } from "./evaluate";

// ---------------------------------------------------------------- settings

export interface Settings {
  maxSeats: number; // 2–9
  startingChips: number; // 1,000 / 5,000 / 10,000
  smallBlind: number; // starting small blind
  bigBlind: number; // starting big blind
  blindIntervalSec: number; // blinds double every 90 / 180 / 300 seconds
  turnSeconds: number; // 20 / 30 / 45 / 60 / 90
  endMode: "last" | "timed"; // last one standing, or a time limit
  timeLimitMin: number; // 30 / 45 / 60 / 90 (timed games only)
}

export const SETTING_OPTIONS = {
  maxSeats: [2, 3, 4, 5, 6, 7, 8, 9],
  startingChips: [1000, 5000, 10000],
  blinds: [
    [10, 20],
    [25, 50],
    [50, 100],
  ] as [number, number][],
  blindIntervalSec: [90, 180, 300],
  turnSeconds: [20, 30, 45, 60, 90],
  endMode: ["last", "timed"] as const,
  timeLimitMin: [30, 45, 60, 90],
};

export const DEFAULT_SETTINGS: Settings = {
  maxSeats: 9,
  startingChips: 5000,
  smallBlind: 10,
  bigBlind: 20,
  blindIntervalSec: 90,
  turnSeconds: 30,
  endMode: "last",
  timeLimitMin: 60,
};

export function validateSettings(s: Settings): string | null {
  const o = SETTING_OPTIONS;
  if (!o.maxSeats.includes(s.maxSeats)) return "Seats must be 2 to 9";
  if (!o.startingChips.includes(s.startingChips)) return "Invalid starting chips";
  if (!o.blinds.some(([sb, bb]) => sb === s.smallBlind && bb === s.bigBlind)) return "Invalid blinds";
  if (!o.blindIntervalSec.includes(s.blindIntervalSec)) return "Invalid blind interval";
  if (!o.turnSeconds.includes(s.turnSeconds)) return "Invalid turn timer";
  if (!o.endMode.includes(s.endMode)) return "Invalid end mode";
  if (!o.timeLimitMin.includes(s.timeLimitMin)) return "Invalid time limit";
  return null;
}

/** Pause after a hand so everyone can see what happened, before the next deal. */
export const PAUSE_AFTER_SHOWDOWN_MS = 6000;
export const PAUSE_AFTER_FOLD_MS = 2500;
/** Missed turns in a row before a player is removed. */
export const MAX_STRIKES = 3;

// ---------------------------------------------------------------- state

export interface Entrant {
  id: string;
  name: string;
  avatar: string;
}

export interface Player extends Entrant {
  seat: number; // 0..8, clockwise
  chips: number; // stack not yet in the pot
  status: "playing" | "busted" | "kicked";
  strikes: number; // missed turns in a row
  outOrder?: number; // order of busting/kicking (1 = first out)
  heldChips?: number; // a kicked player's chips, held by the dealer
}

export interface HandSeat {
  id: string;
  hole: Card[];
  startChips: number;
  bet: number; // put in on this street
  total: number; // put in this hand
  folded: boolean;
  allIn: boolean;
  needsAction: boolean;
  /** Value of fullRaiseCount when this player last acted; -1 if not yet this street. */
  actedAtRaise: number;
  lastAction?: string; // for the UI: "Fold", "Check", "Call 40", "Raise to 120", "All in"
}

export interface Pot {
  amount: number;
  eligible: string[];
  winners: string[];
  handName?: string;
}

export interface HandResult {
  pots: Pot[];
  /** Cards turned face up at showdown (players still in the hand). */
  shown: Record<string, { hole: Card[]; handName: string; bestCards: Card[] }>;
  won: Record<string, number>;
  uncalled?: { id: string; amount: number };
  showdown: boolean;
}

export type Street = "preflop" | "flop" | "turn" | "river" | "complete";

export interface Hand {
  number: number;
  buttonId: string;
  sbId: string;
  bbId: string;
  smallBlind: number;
  bigBlind: number;
  deck: Card[];
  board: Card[];
  street: Street;
  order: string[]; // player ids in seat order, starting left of the button
  seats: Record<string, HandSeat>;
  toAct: string | null;
  deadline: number | null;
  currentBet: number;
  minRaise: number;
  fullRaiseCount: number;
  result?: HandResult;
}

export interface RankEntry {
  id: string;
  name: string;
  avatar: string;
  position: number;
  chips: number;
  status: "playing" | "busted" | "kicked";
}

export interface GameState {
  settings: Settings;
  players: Player[]; // sorted by seat
  startedAt: number;
  status: "playing" | "finished";
  handNumber: number;
  hand: Hand | null;
  nextHandAt: number | null;
  outCounter: number;
  finishedAt?: number;
  ranking?: RankEntry[];
  /** Chips held by the dealer after players were kicked. */
  heldByDealer: number;
}

export class GameError extends Error {}

const clone = <T>(x: T): T => structuredClone(x);

// ---------------------------------------------------------------- blinds

/** Blinds double every `blindIntervalSec`, counted from the start of the game. */
export function blindsAt(settings: Settings, startedAt: number, now: number) {
  const level = Math.max(0, Math.floor((now - startedAt) / (settings.blindIntervalSec * 1000)));
  const mult = 2 ** Math.min(level, 30);
  return { level, smallBlind: settings.smallBlind * mult, bigBlind: settings.bigBlind * mult };
}

// ---------------------------------------------------------------- game lifecycle

export function createGame(settings: Settings, entrants: Entrant[], now: number, rng: Rng): GameState {
  const err = validateSettings(settings);
  if (err) throw new GameError(err);
  if (entrants.length < 2) throw new GameError("Need at least 2 players to start");
  if (entrants.length > settings.maxSeats) throw new GameError("Too many players for the seats");
  const state: GameState = {
    settings: clone(settings),
    players: entrants.map((e, i) => ({
      ...e,
      seat: i,
      chips: settings.startingChips,
      status: "playing",
      strikes: 0,
    })),
    startedAt: now,
    status: "playing",
    handNumber: 0,
    hand: null,
    nextHandAt: null,
    outCounter: 0,
    heldByDealer: 0,
  };
  return startHandMut(state, now, rng);
}

function player(state: GameState, id: string): Player {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new GameError("Unknown player");
  return p;
}

/** Players who can be dealt in. */
function dealable(state: GameState): Player[] {
  return state.players.filter((p) => p.status === "playing" && p.chips > 0);
}

/** Next player id after `fromSeat` (clockwise) from `list`. */
function nextBySeat(list: Player[], fromSeat: number): Player {
  const sorted = [...list].sort((a, b) => a.seat - b.seat);
  return sorted.find((p) => p.seat > fromSeat) ?? sorted[0];
}

function startHandMut(state: GameState, now: number, rng: Rng): GameState {
  const live = dealable(state);
  if (live.length < 2) return finishMut(state, now);

  const prevButton = state.hand?.buttonId;
  const prevSeat = prevButton ? player(state, prevButton).seat : -1;
  const button = nextBySeat(live, prevSeat);
  const headsUp = live.length === 2;
  const sb = headsUp ? button : nextBySeat(live, button.seat);
  const bb = nextBySeat(live, sb.seat);

  // Seat order starting left of the button.
  const order: string[] = [];
  let cur = button;
  for (let i = 0; i < live.length; i++) {
    cur = nextBySeat(live, cur.seat);
    order.push(cur.id);
  }

  const { smallBlind, bigBlind } = blindsAt(state.settings, state.startedAt, now);
  let deck = shuffle(newDeck(), rng);

  const seats: Record<string, HandSeat> = {};
  for (const id of order) {
    seats[id] = {
      id,
      hole: [],
      startChips: player(state, id).chips,
      bet: 0,
      total: 0,
      folded: false,
      allIn: false,
      needsAction: true,
      actedAtRaise: -1,
    };
  }
  // Deal two cards each, one at a time, starting left of the button.
  for (let r = 0; r < 2; r++) {
    for (const id of order) {
      seats[id].hole.push(deck[0]);
      deck = deck.slice(1);
    }
  }

  state.handNumber += 1;
  const hand: Hand = {
    number: state.handNumber,
    buttonId: button.id,
    sbId: sb.id,
    bbId: bb.id,
    smallBlind,
    bigBlind,
    deck,
    board: [],
    street: "preflop",
    order,
    seats,
    toAct: null,
    deadline: null,
    currentBet: bigBlind,
    minRaise: bigBlind,
    fullRaiseCount: 0,
  };
  state.hand = hand;
  state.nextHandAt = null;

  postBlind(state, sb.id, smallBlind, "Small blind");
  postBlind(state, bb.id, bigBlind, "Big blind");
  for (const s of Object.values(seats)) if (s.allIn) s.needsAction = false;

  return progressMut(state, now, bb.id);
}

function putChips(state: GameState, id: string, amount: number) {
  const p = player(state, id);
  const s = state.hand!.seats[id];
  const x = Math.min(amount, p.chips);
  p.chips -= x;
  s.bet += x;
  s.total += x;
  if (p.chips === 0) s.allIn = true;
  return x;
}

function postBlind(state: GameState, id: string, amount: number, label: string) {
  const put = putChips(state, id, amount);
  state.hand!.seats[id].lastAction = `${label} ${put}`;
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number } // raise TO this total bet for the street
  | { type: "allin" };

export interface Legal {
  canAct: boolean;
  canFold: boolean;
  canCheck: boolean;
  toCall: number; // chips needed to call (capped at stack)
  canRaise: boolean;
  minRaiseTo: number; // smallest legal raise-to (or all-in if smaller)
  maxRaiseTo: number; // all-in
}

export function legalActions(state: GameState, id: string): Legal {
  const none: Legal = { canAct: false, canFold: false, canCheck: false, toCall: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0 };
  const h = state.hand;
  if (state.status !== "playing" || !h || h.street === "complete" || h.toAct !== id) return none;
  const s = h.seats[id];
  const p = player(state, id);
  const owe = Math.max(0, h.currentBet - s.bet);
  const maxTo = s.bet + p.chips;
  const reopened = s.actedAtRaise < h.fullRaiseCount;
  const canRaise = p.chips > owe && reopened && maxTo > h.currentBet;
  return {
    canAct: true,
    canFold: true,
    canCheck: owe === 0,
    toCall: Math.min(owe, p.chips),
    canRaise,
    minRaiseTo: Math.min(h.currentBet + h.minRaise, maxTo),
    maxRaiseTo: maxTo,
  };
}

export function act(state: GameState, id: string, action: Action, now: number): GameState {
  const st = clone(state);
  applyAction(st, id, action);
  player(st, id).strikes = 0; // a real move clears missed turns
  return progressMut(st, now, id);
}

function applyAction(state: GameState, id: string, action: Action) {
  const h = state.hand;
  if (state.status !== "playing" || !h || h.street === "complete") throw new GameError("No hand in progress");
  if (h.toAct !== id) throw new GameError("It's not your turn");
  const legal = legalActions(state, id);
  const s = h.seats[id];
  const p = player(state, id);

  // Normalise "all in" into a call or a raise.
  if (action.type === "allin") {
    action = legal.canRaise ? { type: "raise", to: legal.maxRaiseTo } : { type: "call" };
  }

  switch (action.type) {
    case "fold":
      s.folded = true;
      s.lastAction = "Fold";
      break;
    case "check":
      if (!legal.canCheck) throw new GameError("You can't check, there's a bet to call");
      s.lastAction = "Check";
      break;
    case "call": {
      if (legal.canCheck) {
        s.lastAction = "Check";
        break;
      }
      const put = putChips(state, id, legal.toCall);
      s.lastAction = s.allIn ? "All in" : `Call ${put}`;
      break;
    }
    case "raise": {
      const to = Math.floor(action.to);
      if (!legal.canRaise) throw new GameError("You can't raise right now");
      if (to > legal.maxRaiseTo) throw new GameError("You don't have that many chips");
      if (to < legal.minRaiseTo) throw new GameError(`Minimum raise is to ${legal.minRaiseTo}`);
      const raiseSize = to - h.currentBet;
      putChips(state, id, to - s.bet);
      if (raiseSize >= h.minRaise) {
        // Full raise: sets the new minimum and reopens betting for everyone.
        h.minRaise = raiseSize;
        h.fullRaiseCount += 1;
      }
      h.currentBet = to;
      for (const o of Object.values(h.seats)) {
        if (o.id !== id && !o.folded && !o.allIn) o.needsAction = true;
      }
      s.lastAction = p.chips === 0 ? "All in" : `Raise to ${to}`;
      break;
    }
  }
  s.needsAction = false;
  s.actedAtRaise = h.fullRaiseCount;
}

// ---------------------------------------------------------------- flow

function inHand(h: Hand) {
  return h.order.filter((id) => !h.seats[id].folded);
}

function nextToAct(h: Hand, afterId: string): string | null {
  const n = h.order.length;
  const start = h.order.indexOf(afterId);
  for (let i = 1; i <= n; i++) {
    const id = h.order[(start + i + n) % n];
    const s = h.seats[id];
    if (!s.folded && !s.allIn && s.needsAction) return id;
  }
  return null;
}

function dealBoard(h: Hand, count: number) {
  h.deck = h.deck.slice(1); // burn
  h.board.push(...h.deck.slice(0, count));
  h.deck = h.deck.slice(count);
}

function nextStreet(h: Hand) {
  if (h.street === "preflop") {
    dealBoard(h, 3);
    h.street = "flop";
  } else if (h.street === "flop") {
    dealBoard(h, 1);
    h.street = "turn";
  } else if (h.street === "turn") {
    dealBoard(h, 1);
    h.street = "river";
  }
  h.currentBet = 0;
  h.minRaise = h.bigBlind;
  h.fullRaiseCount = 0;
  for (const s of Object.values(h.seats)) {
    s.bet = 0;
    s.actedAtRaise = -1;
    s.needsAction = !s.folded && !s.allIn;
    if (!s.folded && !s.allIn) s.lastAction = undefined;
  }
}

/** Moves the hand forward after an action (or at the start of a hand). */
function progressMut(state: GameState, now: number, lastActor: string): GameState {
  const h = state.hand!;
  for (;;) {
    const live = inHand(h);
    if (live.length === 1) {
      settleMut(state, now, false);
      return state;
    }
    const next = nextToAct(h, lastActor);
    if (next) {
      h.toAct = next;
      h.deadline = now + state.settings.turnSeconds * 1000;
      return state;
    }
    // Betting round is over.
    const canBet = live.filter((id) => !h.seats[id].allIn);
    if (h.street === "river" || canBet.length <= 1) {
      // Run out the board if players are all in, then show down.
      while (h.street !== "river") nextStreet(h);
      settleMut(state, now, true);
      return state;
    }
    nextStreet(h);
    lastActor = h.buttonId; // first to act after the flop: left of the button
  }
}

/** Builds main and side pots from what each player put in. */
export function buildPots(seats: HandSeat[]): { pots: Pot[]; uncalled?: { id: string; amount: number } } {
  const s = seats.map((x) => ({ ...x }));
  // Return any bet nobody could match.
  let uncalled: { id: string; amount: number } | undefined;
  const sorted = [...s].sort((a, b) => b.total - a.total);
  if (sorted.length > 1 && sorted[0].total > sorted[1].total) {
    const amount = sorted[0].total - sorted[1].total;
    sorted[0].total -= amount;
    uncalled = { id: sorted[0].id, amount };
  }
  const levels = [...new Set(s.filter((x) => !x.folded && x.total > 0).map((x) => x.total))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    const amount = s.reduce((sum, x) => sum + Math.min(x.total, L) - Math.min(x.total, prev), 0);
    const eligible = s.filter((x) => !x.folded && x.total >= L).map((x) => x.id);
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === eligible.length && last.eligible.every((e) => eligible.includes(e))) {
      last.amount += amount; // same players: merge
    } else if (amount > 0) {
      pots.push({ amount, eligible, winners: [] });
    }
    prev = L;
  }
  // Safety: money above every live player's level (folded players only) goes to the last pot.
  const leftover = s.reduce((sum, x) => sum + Math.max(0, x.total - prev), 0);
  if (leftover > 0 && pots.length) pots[pots.length - 1].amount += leftover;
  return { pots, uncalled };
}

function settleMut(state: GameState, now: number, showdown: boolean) {
  const h = state.hand!;
  const seats = h.order.map((id) => h.seats[id]);
  const { pots, uncalled } = buildPots(seats);
  const result: HandResult = { pots, shown: {}, won: {}, uncalled, showdown };
  if (uncalled) player(state, uncalled.id).chips += uncalled.amount;

  const live = inHand(h);
  if (showdown) {
    for (const id of live) {
      const best = evaluateBest([...h.seats[id].hole, ...h.board]);
      result.shown[id] = { hole: h.seats[id].hole, handName: best.name, bestCards: best.cards };
    }
  }
  for (const pot of pots) {
    let winners: string[];
    if (!showdown) winners = live;
    else {
      let bestScore: number[] | null = null;
      winners = [];
      for (const id of pot.eligible) {
        const v = evaluateBest([...h.seats[id].hole, ...h.board]);
        const c = bestScore ? compareScores(v.score, bestScore) : 1;
        if (c > 0) {
          bestScore = v.score;
          winners = [id];
        } else if (c === 0) winners.push(id);
      }
      pot.handName = result.shown[winners[0]]?.handName;
    }
    // Split evenly; odd chips go to winners closest to the left of the button.
    const ordered = h.order.filter((id) => winners.includes(id));
    const share = Math.floor(pot.amount / ordered.length);
    let rest = pot.amount - share * ordered.length;
    for (const id of ordered) {
      const x = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      player(state, id).chips += x;
      result.won[id] = (result.won[id] ?? 0) + x;
    }
    pot.winners = ordered;
  }

  h.result = result;
  h.street = "complete";
  h.toAct = null;
  h.deadline = null;

  // Anyone with no chips left is out until the next game. Bigger starting stacks bust later.
  const busted = state.players
    .filter((p) => p.status === "playing" && p.chips === 0)
    .sort((a, b) => (h.seats[a.id]?.startChips ?? 0) - (h.seats[b.id]?.startChips ?? 0));
  for (const p of busted) {
    p.status = "busted";
    p.outOrder = ++state.outCounter;
  }

  const timeUp =
    state.settings.endMode === "timed" && now >= state.startedAt + state.settings.timeLimitMin * 60_000;
  if (dealable(state).length < 2 || timeUp) {
    finishMut(state, now);
  } else {
    state.nextHandAt = now + (showdown ? PAUSE_AFTER_SHOWDOWN_MS : PAUSE_AFTER_FOLD_MS);
  }
}

function finishMut(state: GameState, now: number): GameState {
  state.status = "finished";
  state.finishedAt = now;
  state.nextHandAt = null;
  if (state.hand) {
    state.hand.toAct = null;
    state.hand.deadline = null;
  }
  state.ranking = computeRanking(state);
  return state;
}

/** Still playing by chips; then busted players (last out ranks higher); kicked players at the bottom. */
export function computeRanking(state: GameState): RankEntry[] {
  const playing = state.players.filter((p) => p.status === "playing").sort((a, b) => b.chips - a.chips);
  const busted = state.players.filter((p) => p.status === "busted").sort((a, b) => (b.outOrder ?? 0) - (a.outOrder ?? 0));
  const kicked = state.players.filter((p) => p.status === "kicked").sort((a, b) => (b.outOrder ?? 0) - (a.outOrder ?? 0));
  const out: RankEntry[] = [];
  let pos = 0;
  let prevChips: number | null = null;
  playing.forEach((p, i) => {
    if (prevChips === null || p.chips !== prevChips) pos = i + 1; // equal chips share a place
    prevChips = p.chips;
    out.push({ id: p.id, name: p.name, avatar: p.avatar, position: pos, chips: p.chips, status: "playing" });
  });
  for (const p of [...busted, ...kicked]) {
    out.push({ id: p.id, name: p.name, avatar: p.avatar, position: out.length + 1, chips: 0, status: p.status });
  }
  return out;
}

// ---------------------------------------------------------------- timers

/** Applies a missed turn: check if free, otherwise fold. 3 in a row and the player is removed. */
function missTurnMut(state: GameState, now: number) {
  const h = state.hand!;
  const id = h.toAct!;
  const legal = legalActions(state, id);
  applyAction(state, id, legal.canCheck ? { type: "check" } : { type: "fold" });
  const p = player(state, id);
  p.strikes += 1;
  h.seats[id].lastAction = (legal.canCheck ? "Check" : "Fold") + " (time)";
  if (p.strikes >= MAX_STRIKES) kickMut(state, id);
  progressMut(state, now, id);
}

function kickMut(state: GameState, id: string) {
  const p = player(state, id);
  p.status = "kicked";
  p.outOrder = ++state.outCounter;
  p.heldChips = p.chips;
  state.heldByDealer += p.chips;
  p.chips = 0;
  const s = state.hand?.seats[id];
  if (s && state.hand!.street !== "complete") {
    s.folded = true;
    s.needsAction = false;
    s.lastAction = "Left";
  }
}

/**
 * Applies everything that should have happened by `now`:
 * missed turns (auto check/fold) and starting the next hand after the pause.
 * Safe to call as often as you like; returns the same object if nothing changed.
 */
export function advance(state: GameState, now: number, rng: Rng): GameState {
  if (state.status !== "playing") return state;
  let st = state;
  for (let guard = 0; guard < 100; guard++) {
    const h = st.hand;
    if (h && h.toAct && h.deadline !== null && now >= h.deadline) {
      if (st === state) st = clone(state);
      missTurnMut(st, h.deadline);
      continue;
    }
    if (h && h.street === "complete" && st.status === "playing" && st.nextHandAt !== null && now >= st.nextHandAt) {
      if (st === state) st = clone(state);
      startHandMut(st, st.nextHandAt!, rng);
      continue;
    }
    break;
  }
  return st;
}

/** Player is disconnected: treat their turn as missed right away instead of waiting out the timer. */
export function skipDisconnected(state: GameState, id: string, now: number): GameState {
  const h = state.hand;
  if (state.status !== "playing" || !h || h.toAct !== id) return state;
  const st = clone(state);
  missTurnMut(st, now);
  return st;
}

// ---------------------------------------------------------------- views

export interface PublicSeat {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  chips: number;
  status: Player["status"];
  strikes: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  bet: number;
  lastAction?: string;
  isButton: boolean;
  isSB: boolean;
  isBB: boolean;
}

export interface PublicGame {
  status: GameState["status"];
  settings: Settings;
  startedAt: number;
  handNumber: number;
  street: Street | null;
  board: Card[];
  pot: number; // everything in the middle, including current bets
  currentBet: number;
  minRaise: number;
  toAct: string | null;
  deadline: number | null;
  nextHandAt: number | null;
  blinds: { smallBlind: number; bigBlind: number };
  seats: PublicSeat[];
  result: HandResult | null; // only face-up cards are included
  ranking: RankEntry[] | null;
  /** What the player whose turn it is may do (not secret: everyone can work it out). */
  legal: Legal | null;
  finishedAt: number | null;
}

/** Everything anyone may see: no deck, no face-down cards. Safe to send to players and watchers. */
export function publicView(state: GameState): PublicGame {
  const h = state.hand;
  return {
    status: state.status,
    settings: state.settings,
    startedAt: state.startedAt,
    handNumber: state.handNumber,
    street: h?.street ?? null,
    board: h ? [...h.board] : [],
    pot: h ? Object.values(h.seats).reduce((s, x) => s + x.total, 0) : 0,
    currentBet: h?.currentBet ?? 0,
    minRaise: h?.minRaise ?? 0,
    toAct: h?.toAct ?? null,
    deadline: h?.deadline ?? null,
    nextHandAt: state.nextHandAt,
    blinds: h ? { smallBlind: h.smallBlind, bigBlind: h.bigBlind } : { smallBlind: state.settings.smallBlind, bigBlind: state.settings.bigBlind },
    seats: state.players.map((p) => {
      const s = h?.seats[p.id];
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seat: p.seat,
        chips: p.chips,
        status: p.status,
        strikes: p.strikes,
        inHand: !!s,
        folded: s?.folded ?? false,
        allIn: s?.allIn ?? false,
        bet: s?.bet ?? 0,
        lastAction: s?.lastAction,
        isButton: h?.buttonId === p.id,
        isSB: h?.sbId === p.id,
        isBB: h?.bbId === p.id,
      };
    }),
    result: h?.result ? clone(h.result) : null,
    ranking: state.ranking ?? null,
    finishedAt: state.finishedAt ?? null,
    legal: h?.toAct ? legalActions(state, h.toAct) : null,
  };
}

/** A player's own face-down cards (only ever sent to that player). */
export function holeCards(state: GameState, id: string): Card[] {
  return state.hand?.seats[id]?.hole.slice() ?? [];
}

/** Total chips in the game: stacks + pot + dealer-held. Never changes; used by tests. */
export function totalChips(state: GameState): number {
  const stacks = state.players.reduce((s, p) => s + p.chips, 0);
  const h = state.hand;
  const pot = h && h.street !== "complete" ? Object.values(h.seats).reduce((s, x) => s + x.total, 0) : 0;
  return stacks + pot + state.heldByDealer;
}
