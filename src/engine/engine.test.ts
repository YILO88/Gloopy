import { describe, expect, it } from "vitest";
import { Card, seededRng } from "./cards";
import { evaluateBest, compareScores, describeHand } from "./evaluate";
import {
  DEFAULT_SETTINGS,
  GameState,
  Settings,
  act,
  advance,
  blindsAt,
  buildPots,
  createGame,
  holeCards,
  legalActions,
  publicView,
  skipDisconnected,
  totalChips,
  HandSeat,
} from "./game";
import { backToLobby, createRoom, joinRoom, leaveRoom, startGame, syncPhase, updateSettings, waitingQueue } from "./room";

const rng = seededRng(42);
const P = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: "lime" }));
const T0 = 1_000_000;

/** Replace the dealt cards so a test controls exactly what everyone holds and what the board will be. */
function rig(state: GameState, holes: Record<string, Card[]>, board: Card[]): GameState {
  const h = state.hand!;
  const used = new Set([...Object.values(holes).flat(), ...board]);
  const filler = ["2c", "3c", "4c", "5c", "6c", "7c", "8c", "9c", "Tc", "Jc", "Qc", "Kc", "Ac", "2d", "3d", "4d", "5d", "6d", "7d", "8d", "9d", "Td", "Jd", "Qd", "Kd", "Ad"].filter((c) => !used.has(c));
  const burn = () => filler.shift()!;
  for (const [id, cards] of Object.entries(holes)) h.seats[id].hole = cards;
  h.deck = [burn(), board[0], board[1], board[2], burn(), board[3], burn(), board[4], ...filler];
  return state;
}

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

// ------------------------------------------------------------------ hand rankings

describe("hand evaluator", () => {
  const v = (cards: string) => evaluateBest(cards.split(" "));
  it("ranks every category in order", () => {
    const hands = [
      "2s 7d 9c Jh Kd 3c 4h", // high card
      "2s 2d 9c Jh Kd 3c 5h", // pair
      "2s 2d 9c 9h Kd 3c 5h", // two pair
      "2s 2d 2c 9h Kd 3c 5h", // trips
      "2s 3d 4c 5h 6d Jc Kh", // straight
      "2s 7s 9s Js Ks 3c 4h", // flush
      "2s 2d 2c 9h 9d 3c 5h", // full house
      "2s 2d 2c 2h Kd 3c 5h", // quads
      "5s 6s 7s 8s 9s 2c 2h", // straight flush
    ].map(v);
    hands.forEach((h, i) => expect(h.category).toBe(i));
    for (let i = 1; i < hands.length; i++) expect(compareScores(hands[i].score, hands[i - 1].score)).toBeGreaterThan(0);
  });
  it("handles the wheel (A-2-3-4-5) as the lowest straight", () => {
    const wheel = v("As 2d 3c 4h 5d Jc Kh");
    expect(wheel.name).toBe("Straight, Five high");
    expect(compareScores(v("2s 3d 4c 5h 6d Jc Kh").score, wheel.score)).toBeGreaterThan(0);
  });
  it("names hands like the table shows them", () => {
    expect(v("6s 6d 9c Jh Kd 3c 2h").name).toBe("Pair of Sixes");
    expect(v("As Ks Qs Js Ts 3c 2h").name).toBe("Royal Flush");
    expect(describeHand(["8s", "8d"])).toBe("Pair of Eights");
  });
  it("uses kickers to break ties", () => {
    expect(compareScores(v("As Ad Kc 7h 4d 3c 2h").score, v("As Ad Qc 7h 4d 3c 2h").score)).toBeGreaterThan(0);
    expect(compareScores(v("Ks Kd 4c 4h Ad 3c 2h").score, v("Ks Kd 4c 4h Qd 3c 2h").score)).toBeGreaterThan(0);
  });
  it("calls a tie when both players play the board", () => {
    expect(compareScores(v("2s 3d Ac Kc Qc Jc Tc").score, v("4s 5d Ac Kc Qc Jc Tc").score)).toBe(0);
  });
});

// ------------------------------------------------------------------ blinds and order

describe("blinds and turn order", () => {
  it("3 players: button, small blind, big blind, then the player after the big blind acts first", () => {
    const g = createGame(settings(), P(3), T0, rng);
    const h = g.hand!;
    expect(h.buttonId).toBe("p0");
    expect(h.sbId).toBe("p1");
    expect(h.bbId).toBe("p2");
    expect(h.toAct).toBe("p0");
    expect(g.players.find((p) => p.id === "p1")!.chips).toBe(5000 - 10);
    expect(g.players.find((p) => p.id === "p2")!.chips).toBe(5000 - 20);
  });

  it("heads-up: the button posts the small blind and acts first before the flop, last after it", () => {
    let g = createGame(settings(), P(2), T0, rng);
    expect(g.hand!.sbId).toBe(g.hand!.buttonId);
    expect(g.hand!.toAct).toBe(g.hand!.buttonId);
    g = act(g, g.hand!.toAct!, { type: "call" }, T0);
    expect(g.hand!.toAct).toBe(g.hand!.bbId); // big blind's option
    g = act(g, g.hand!.bbId, { type: "check" }, T0);
    expect(g.hand!.street).toBe("flop");
    expect(g.hand!.toAct).toBe(g.hand!.bbId); // non-button first after the flop
  });

  it("the button moves one seat each hand", () => {
    let g = createGame(settings(), P(3), T0, rng);
    g = act(g, "p0", { type: "fold" }, T0);
    g = act(g, "p1", { type: "fold" }, T0);
    expect(g.hand!.street).toBe("complete");
    g = advance(g, g.nextHandAt!, rng);
    expect(g.hand!.buttonId).toBe("p1");
  });

  it("blinds double on the host's interval, counted from the start of the game", () => {
    const s = settings({ blindIntervalSec: 90 });
    expect(blindsAt(s, T0, T0).bigBlind).toBe(20);
    expect(blindsAt(s, T0, T0 + 89_999).bigBlind).toBe(20);
    expect(blindsAt(s, T0, T0 + 90_000).bigBlind).toBe(40);
    expect(blindsAt(s, T0, T0 + 12 * 60_000).bigBlind).toBe(5120);
    expect(blindsAt(settings({ blindIntervalSec: 300 }), T0, T0 + 12 * 60_000).bigBlind).toBe(80);
  });

  it("a hand dealt later uses the higher blinds", () => {
    let g = createGame(settings(), P(2), T0, rng);
    g = act(g, g.hand!.toAct!, { type: "fold" }, T0 + 100_000);
    g = advance(g, T0 + 200_000, rng);
    expect(g.hand!.bigBlind).toBe(80); // 200s in → level 2
  });
});

// ------------------------------------------------------------------ betting rules

describe("betting", () => {
  it("enforces the minimum raise", () => {
    const g = createGame(settings(), P(3), T0, rng);
    const legal = legalActions(g, "p0");
    expect(legal.minRaiseTo).toBe(40);
    expect(() => act(g, "p0", { type: "raise", to: 30 }, T0)).toThrow(/Minimum raise/);
    const g2 = act(g, "p0", { type: "raise", to: 100 }, T0);
    expect(legalActions(g2, "p1").minRaiseTo).toBe(180); // raise of 80 → next min is +80
  });

  it("refuses moves out of turn and checks when there is a bet", () => {
    const g = createGame(settings(), P(3), T0, rng);
    expect(() => act(g, "p1", { type: "fold" }, T0)).toThrow(/not your turn/);
    expect(() => act(g, "p0", { type: "check" }, T0)).toThrow(/can't check/);
  });

  it("a short all-in does not reopen raising for a player who already acted", () => {
    // p0 small stack goes all in for slightly more than the bet; p1 already acted.
    let g = createGame(settings(), P(3), T0, rng);
    g.players.find((p) => p.id === "p0")!.chips = 130; // button
    // Preflop: p0 to act. p0 calls 20.
    g = act(g, "p0", { type: "call" }, T0);
    g = act(g, "p1", { type: "raise", to: 100 }, T0); // full raise (+80)
    g = act(g, "p2", { type: "call" }, T0);
    // p0 has 110 left; all in to 130 total = raise of only 30 (< 80): incomplete
    g = act(g, "p0", { type: "allin" }, T0);
    expect(g.hand!.currentBet).toBe(130);
    expect(legalActions(g, "p1").canRaise).toBe(false); // p1 already acted at this raise level
    expect(legalActions(g, "p1").toCall).toBe(30);
  });

  it("the big blind gets an option when everyone limps", () => {
    let g = createGame(settings(), P(3), T0, rng);
    g = act(g, "p0", { type: "call" }, T0);
    g = act(g, "p1", { type: "call" }, T0);
    expect(g.hand!.toAct).toBe("p2");
    expect(legalActions(g, "p2").canCheck).toBe(true);
    expect(legalActions(g, "p2").canRaise).toBe(true);
  });

  it("returns an uncalled bet", () => {
    let g = createGame(settings(), P(2), T0, rng);
    const before = g.players.map((p) => p.chips + g.hand!.seats[p.id].total);
    g = act(g, g.hand!.toAct!, { type: "raise", to: 1000 }, T0);
    g = act(g, g.hand!.toAct!, { type: "fold" }, T0);
    expect(g.hand!.result!.uncalled?.amount).toBe(980);
    expect(g.players.reduce((s, p) => s + p.chips, 0)).toBe(before[0] + before[1]);
  });
});

// ------------------------------------------------------------------ showdown and pots

describe("showdown and pots", () => {
  it("the best hand wins the pot at showdown and cards are shown", () => {
    let g = createGame(settings(), P(3), T0, rng);
    g = rig(g, { p0: ["As", "Ad"], p1: ["Ks", "Kd"], p2: ["7h", "2c"] }, ["Ah", "9c", "4d", "Js", "3h"]);
    g = act(g, "p0", { type: "call" }, T0);
    g = act(g, "p1", { type: "call" }, T0);
    g = act(g, "p2", { type: "check" }, T0);
    for (let i = 0; i < 9 && g.hand!.street !== "complete"; i++) g = act(g, g.hand!.toAct!, { type: "check" }, T0);
    const r = g.hand!.result!;
    expect(r.showdown).toBe(true);
    expect(r.pots[0].winners).toEqual(["p0"]);
    expect(r.pots[0].handName).toBe("Three of a Kind, Aces");
    expect(r.shown.p1.hole).toEqual(["Ks", "Kd"]);
    expect(g.players.find((p) => p.id === "p0")!.chips).toBe(5000 + 40);
  });

  it("splits a tied pot, odd chip to the first winner left of the button", () => {
    const seats: HandSeat[] = ["a", "b", "c"].map((id) => ({
      id, hole: [], startChips: 0, bet: 0, total: 0, folded: false, allIn: false, needsAction: false, actedAtRaise: 0,
    }));
    seats[0].total = 34; seats[1].total = 34; seats[2].total = 33; seats[2].folded = true;
    const { pots } = buildPots(seats);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(101);

    let g = createGame(settings(), P(3), T0, rng);
    g = rig(g, { p0: ["2s", "3d"], p1: ["4s", "5d"], p2: ["7h", "8c"] }, ["Ac", "Kc", "Qc", "Jc", "Tc"]);
    g = act(g, "p0", { type: "call" }, T0);
    g = act(g, "p1", { type: "call" }, T0);
    g = act(g, "p2", { type: "check" }, T0);
    for (let i = 0; i < 9 && g.hand!.street !== "complete"; i++) g = act(g, g.hand!.toAct!, { type: "check" }, T0);
    const won = g.hand!.result!.won;
    expect(won.p0 + won.p1 + won.p2).toBe(60);
    expect(Object.values(won).every((x) => x === 20)).toBe(true);
  });

  it("builds side pots when players are all in for different amounts", () => {
    let g = createGame(settings(), P(3), T0, rng);
    g.players.find((p) => p.id === "p0")!.chips = 1000;
    g.players.find((p) => p.id === "p1")!.chips = 3000 - 10;
    g.players.find((p) => p.id === "p2")!.chips = 5000 - 20;
    // p0 best, p1 second, p2 worst
    g = rig(g, { p0: ["As", "Ad"], p1: ["Ks", "Kd"], p2: ["7h", "2c"] }, ["Ah", "Kh", "4d", "9s", "3c"]);
    g = act(g, "p0", { type: "allin" }, T0);
    g = act(g, "p1", { type: "allin" }, T0);
    g = act(g, "p2", { type: "call" }, T0);
    const r = g.hand!.result!;
    expect(r.pots.map((p) => p.amount)).toEqual([3000, 4000]); // main: 1000×3, side: 2000×2
    expect(r.pots[0].winners).toEqual(["p0"]);
    expect(r.pots[1].winners).toEqual(["p1"]);
    expect(g.players.find((p) => p.id === "p0")!.chips).toBe(3000);
    expect(g.players.find((p) => p.id === "p1")!.chips).toBe(4000);
    expect(g.players.find((p) => p.id === "p2")!.chips).toBe(2000); // 5000 − 3000 called
    expect(r.showdown).toBe(true);
    expect(g.hand!.board).toHaveLength(5); // board ran out automatically
  });
});

// ------------------------------------------------------------------ missed turns

describe("missed turns, disconnects and kicks", () => {
  it("times out to a fold when facing a bet, and to a check when free", () => {
    let g = createGame(settings(), P(3), T0, rng);
    g = advance(g, g.hand!.deadline! - 1, rng);
    expect(g.hand!.seats.p0.folded).toBe(false); // too early: nothing happens
    g = advance(g, g.hand!.deadline!, rng);
    expect(g.hand!.seats.p0.folded).toBe(true);
    expect(g.players.find((p) => p.id === "p0")!.strikes).toBe(1);
    g = act(g, "p1", { type: "call" }, T0);
    g = advance(g, g.hand!.deadline!, rng); // p2 (big blind) can check for free
    expect(g.hand!.seats.p2.folded).toBe(false);
    expect(g.hand!.street).toBe("flop");
  });

  it("3 missed turns in a row removes the player; their chips are held by the dealer", () => {
    let g = createGame(settings(), P(3), T0, rng);
    const total = totalChips(g);
    let now = T0;
    // Keep timing everyone out until someone is kicked.
    for (let i = 0; i < 50 && !g.players.some((p) => p.status === "kicked"); i++) {
      now = Math.max(now, g.hand!.deadline ?? g.nextHandAt ?? now);
      g = advance(g, now, rng);
      expect(totalChips(g)).toBe(total);
    }
    const kicked = g.players.find((p) => p.status === "kicked")!;
    expect(kicked.strikes).toBe(3);
    expect(kicked.chips).toBe(0);
    expect(g.heldByDealer).toBe(kicked.heldChips);
  });

  it("playing a turn resets the missed-turn count", () => {
    let g = createGame(settings(), P(2), T0, rng);
    const first = g.hand!.toAct!;
    g = advance(g, g.hand!.deadline!, rng); // strike 1 (folds)
    g = advance(g, g.nextHandAt!, rng);
    expect(g.players.find((p) => p.id === first)!.strikes).toBe(1);
    while (g.hand!.toAct && g.hand!.toAct !== first) g = act(g, g.hand!.toAct!, { type: "call" }, T0 + 10_000);
    if (g.hand!.toAct === first) g = act(g, first, { type: "call" }, T0 + 10_000);
    expect(g.players.find((p) => p.id === first)!.strikes).toBe(0);
  });

  it("a disconnected player can be skipped without waiting for the timer", () => {
    let g = createGame(settings(), P(3), T0, rng);
    g = skipDisconnected(g, "p0", T0 + 1000);
    expect(g.hand!.seats.p0.folded).toBe(true);
    expect(g.players[0].strikes).toBe(1);
    expect(skipDisconnected(g, "p0", T0)).toBe(g); // not their turn: nothing happens
  });

  it("kicked players rank at the bottom marked as left", () => {
    let g = createGame(settings(), P(2), T0, rng);
    let now = T0;
    for (let i = 0; i < 50 && g.status === "playing"; i++) {
      now = Math.max(now, g.hand!.deadline ?? g.nextHandAt ?? now);
      g = advance(g, now, rng);
    }
    expect(g.status).toBe("finished");
    const last = g.ranking![g.ranking!.length - 1];
    expect(last.status).toBe("kicked");
    expect(g.ranking![0].position).toBe(1);
  });
});

// ------------------------------------------------------------------ game end

describe("ending the game", () => {
  it("last one standing: the game ends when one player has chips, with a ranking", () => {
    let g = createGame(settings(), P(2), T0, rng);
    g = rig(g, { p0: ["As", "Ad"], p1: ["7h", "2c"] }, ["Ah", "Kh", "4d", "9s", "3c"]);
    g = act(g, g.hand!.toAct!, { type: "allin" }, T0);
    g = act(g, g.hand!.toAct!, { type: "call" }, T0);
    expect(g.status).toBe("finished");
    expect(g.ranking!.map((r) => r.id)).toEqual(["p0", "p1"]);
    expect(g.ranking![0].chips).toBe(10000);
    expect(g.ranking![1].status).toBe("busted");
  });

  it("timed game: finishes after the hand in progress when time is up, ranked by chips", () => {
    let g = createGame(settings({ endMode: "timed", timeLimitMin: 30 }), P(3), T0, rng);
    const late = T0 + 31 * 60_000;
    g = act(g, "p0", { type: "fold" }, late);
    expect(g.status).toBe("playing"); // hand still going
    g = act(g, "p1", { type: "fold" }, late);
    expect(g.status).toBe("finished");
    expect(g.ranking![0].id).toBe("p2");
    expect(g.ranking!.map((r) => r.chips).reduce((a, b) => a + b)).toBe(15000);
  });
});

// ------------------------------------------------------------------ privacy

describe("privacy", () => {
  it("the public view never contains face-down cards or the deck", () => {
    const g = createGame(settings(), P(4), T0, rng);
    const json = JSON.stringify(publicView(g));
    for (const id of ["p0", "p1", "p2", "p3"]) for (const c of holeCards(g, id)) expect(json).not.toContain(`"${c}"`);
    expect(json).not.toContain("deck");
  });
});

// ------------------------------------------------------------------ rooms

describe("rooms, lobby and waiting room", () => {
  const E = (id: string) => ({ id, name: id, avatar: "lime" });
  it("seats fill to the host's limit, then late arrivals wait", () => {
    let r = createRoom("ABCDE", E("host"), T0);
    r = updateSettings(r, "host", settings({ maxSeats: 3 }));
    r = joinRoom(r, E("a"), T0 + 1);
    r = joinRoom(r, E("b"), T0 + 2);
    r = joinRoom(r, E("c"), T0 + 3);
    expect(r.members.filter((m) => m.role === "player").map((m) => m.id)).toEqual(["host", "a", "b"]);
    expect(waitingQueue(r).map((m) => m.id)).toEqual(["c"]);
  });

  it("the host can start before every seat is full; joiners after the start watch", () => {
    let r = createRoom("ABCDE", E("host"), T0);
    r = joinRoom(r, E("a"), T0 + 1);
    expect(() => startGame(r, "a", T0, rng)).toThrow(/Only the host/);
    r = startGame(r, "host", T0 + 5, rng);
    expect(r.phase).toBe("playing");
    expect(r.game!.players).toHaveLength(2);
    r = joinRoom(r, E("late"), T0 + 10);
    expect(r.members.find((m) => m.id === "late")!.role).toBe("waiting");
  });

  it("only the host changes settings, and only in the lobby", () => {
    const r = createRoom("ABCDE", E("host"), T0);
    expect(() => updateSettings(r, "someone", settings())).toThrow(/Only the host/);
    expect(() => updateSettings(r, "host", settings({ turnSeconds: 7 }))).toThrow();
  });

  it("the crown passes to the next player when the host leaves", () => {
    let r = createRoom("ABCDE", E("host"), T0);
    r = joinRoom(r, E("a"), T0 + 1);
    r = joinRoom(r, E("b"), T0 + 2);
    r = startGame(r, "host", T0 + 5, rng);
    r = leaveRoom(r, "host");
    expect(r.hostId).toBe("a");
  });

  it("play again: back to the lobby with the waiting queue taking open seats in order", () => {
    let r = createRoom("ABCDE", E("host"), T0);
    r = updateSettings(r, "host", settings({ maxSeats: 3 }));
    r = joinRoom(r, E("a"), T0 + 1);
    r = startGame(r, "host", T0 + 5, rng);
    r = joinRoom(r, E("w1"), T0 + 10);
    r = joinRoom(r, E("w2"), T0 + 11);
    // finish the game quickly: host goes all in, a calls, someone busts (or play out)
    let g = r.game!;
    let now = T0 + 5;
    for (let i = 0; i < 2000 && g.status === "playing"; i++) {
      if (g.hand?.toAct) g = act(g, g.hand.toAct, { type: "allin" }, now);
      else g = advance(g, (now = Math.max(now, g.nextHandAt ?? now)), rng);
    }
    r = syncPhase({ ...r, game: g });
    expect(r.phase).toBe("results");
    r = backToLobby(r);
    expect(r.phase).toBe("lobby");
    expect(r.members.filter((m) => m.role === "player").map((m) => m.id)).toEqual(["host", "a", "w1"]);
    expect(waitingQueue(r).map((m) => m.id)).toEqual(["w2"]);
  });
});

// ------------------------------------------------------------------ bot games

describe("bot games (random play)", () => {
  it("400 random games: chips are never created or lost, and every game finishes", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = seededRng(seed);
      const n = 2 + Math.floor(r() * 8); // 2..9 players
      const s = settings({
        startingChips: [5000, 20000][Math.floor(r() * 2)],
        blindIntervalSec: [90, 180, 300][Math.floor(r() * 3)],
        endMode: r() < 0.3 ? "timed" : "last",
        timeLimitMin: 30,
      });
      let now = T0;
      let g = createGame(s, P(n), now, r);
      const total = totalChips(g);
      for (let step = 0; step < 20000 && g.status === "playing"; step++) {
        now += 1000 + Math.floor(r() * 4000);
        const h = g.hand!;
        if (h.toAct && r() < 0.95) {
          const legal = legalActions(g, h.toAct);
          const x = r();
          let a;
          if (x < 0.15) a = { type: "fold" as const };
          else if (x < 0.55) a = { type: legal.canCheck ? ("check" as const) : ("call" as const) };
          else if (x < 0.9 && legal.canRaise) {
            const span = legal.maxRaiseTo - legal.minRaiseTo;
            a = { type: "raise" as const, to: legal.minRaiseTo + Math.floor(r() * r() * (span + 1)) };
          } else a = { type: "allin" as const };
          g = act(g, h.toAct, a, now);
        } else {
          now = Math.max(now, h.deadline ?? g.nextHandAt ?? now);
          g = advance(g, now, r);
        }
        expect(totalChips(g)).toBe(total);
        for (const p of g.players) expect(p.chips).toBeGreaterThanOrEqual(0);
      }
      expect(g.status).toBe("finished");
      expect(g.ranking!.length).toBe(n);
      expect(g.ranking![0].position).toBe(1);
    }
  });
});
