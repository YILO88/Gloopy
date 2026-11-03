import { describe, expect, it } from "vitest";
import { seededRng } from "@/engine/cards";
import { DEFAULT_SETTINGS, act, advance, legalActions } from "@/engine/game";
import { Room, addBots, createRoom, joinRoom, startGame } from "@/engine/room";
import { MemoryAccounts } from "@/lib/server/accounts";
import { leaderboard, pokerResultRows, summarize, cleanUsername } from "./results";

const rng = seededRng(5);
const T0 = 2_000_000;

/** Plays a room's game to the end: people call everything, bots play themselves. */
function playOut(room: Room): Room {
  let g = room.game!;
  let now = T0;
  for (let i = 0; i < 20000 && g.status === "playing"; i++) {
    const id = g.hand!.toAct;
    const p = id && g.players.find((x) => x.id === id);
    if (p && !p.bot) g = act(g, id!, legalActions(g, id!).canRaise && i % 3 === 0 ? { type: "allin" } : legalActions(g, id!).canCheck ? { type: "check" } : { type: "call" }, now);
    else {
      now = id ? g.hand!.deadline! : (g.nextHandAt ?? now) + 1;
      g = advance(g, now, rng);
    }
  }
  return { ...room, game: g };
}

describe("results and leaderboard rules", () => {
  it("two account holders + a guest + bots: ranked, bots ignored in placing", () => {
    let r = createRoom("RES01", { id: "a", name: "Ada", avatar: "lime", username: "ada" }, T0, { ...DEFAULT_SETTINGS, startingChips: 5000 });
    r = joinRoom(r, { id: "k", name: "Kofi", avatar: "sun", username: "kofi" }, T0);
    r = joinRoom(r, { id: "g", name: "Guest", avatar: "sky" }, T0);
    r = addBots(r, "a", 2, "hard", T0, rng);
    r = playOut(startGame(r, "a", T0, rng));
    const rows = pokerResultRows(r);
    expect(rows.map((x) => x.player_id).sort()).toEqual(["a", "g", "k"]); // no bots
    expect(rows.every((x) => x.ranked && x.accounts === 2 && x.people === 3 && x.bots === 2)).toBe(true);
    expect(rows.filter((x) => x.won)).toHaveLength(1);
    expect(rows.find((x) => x.won)!.place).toBe(1);
    expect(new Set(rows.map((x) => x.place)).size).toBe(3);
  });

  it("if a bot finishes 1st, the best person is still the winner", () => {
    let r = createRoom("RES02", { id: "a", name: "Ada", avatar: "lime", username: "ada" }, T0);
    r = joinRoom(r, { id: "k", name: "Kofi", avatar: "sun", username: "kofi" }, T0);
    r = addBots(r, "a", 1, "hard", T0, rng);
    r = startGame(r, "a", T0, rng);
    // fake a finish where the bot ranks 1st
    const bot = r.game!.players.find((p) => p.bot)!;
    r.game = { ...r.game!, status: "finished", finishedAt: T0, ranking: [
      { id: bot.id, name: bot.name, avatar: bot.avatar, position: 1, chips: 15000, status: "playing" },
      { id: "k", name: "Kofi", avatar: "sun", position: 2, chips: 0, status: "busted" },
      { id: "a", name: "Ada", avatar: "lime", position: 3, chips: 0, status: "busted" },
    ] };
    const rows = pokerResultRows(r);
    expect(rows.find((x) => x.player_id === "k")).toMatchObject({ place: 1, place_all: 2, won: true, ranked: true });
    expect(rows.find((x) => x.player_id === "a")).toMatchObject({ place: 2, won: false });
  });

  it("only one account holder (or solo with bots): not ranked; solo is practice, not a win", () => {
    let r = createRoom("RES03", { id: "a", name: "Ada", avatar: "lime", username: "ada" }, T0);
    r = addBots(r, "a", 2, "easy", T0, rng);
    r = playOut(startGame(r, "a", T0, rng));
    const [row] = pokerResultRows(r);
    expect(row).toMatchObject({ ranked: false, won: false, people: 1 });
    expect(summarize([row]).recent[0].practice).toBe(true);

    let r2 = createRoom("RES04", { id: "a", name: "Ada", avatar: "lime", username: "ada" }, T0);
    r2 = joinRoom(r2, { id: "g", name: "Guest", avatar: "sky" }, T0);
    r2 = playOut(startGame(r2, "a", T0, rng));
    expect(pokerResultRows(r2).every((x) => !x.ranked)).toBe(true);
  });

  it("leaderboards count ranked wins only, by period, and friends see just friends", async () => {
    const acc = new MemoryAccounts();
    for (const [id, u] of [["a", "ada"], ["k", "kofi"], ["t", "tunde"]]) await acc.saveProfile({ id, username: u, display_name: u, avatar: "lime" });
    const row = (player_id: string, won: boolean, ranked: boolean, daysAgo: number, n: number) => ({
      game: "poker" as const, room_code: "X" + n, game_number: 1, player_id, finished_at: new Date(T0 - daysAgo * 864e5).toISOString(),
      place: won ? 1 : 2, place_all: 1, people: 2, bots: 0, accounts: 2, ranked, won, stats: {},
    });
    await acc.recordResults([row("a", true, true, 1, 1), row("a", true, true, 20, 2), row("k", true, true, 1, 3), row("k", true, false, 1, 4), row("t", true, true, 60, 5)]);
    await acc.recordResults([row("a", true, true, 1, 1)]); // duplicates ignored
    const profiles = new Map([...acc.byId.values()].map((p) => [p.id, p]));
    const week = leaderboard(acc.rows, profiles, "poker", T0 - 7 * 864e5, null);
    expect(week.map((x) => [x.username, x.wins])).toEqual([["ada", 1], ["kofi", 1]]);
    const all = leaderboard(acc.rows, profiles, "poker", -Infinity, null);
    expect(all[0]).toMatchObject({ username: "ada", wins: 2 });
    const friends = leaderboard(acc.rows, profiles, "poker", -Infinity, ["a", "t"]);
    expect(friends.map((x) => x.username)).toEqual(["ada", "tunde"]);
  });

  it("usernames: simple, lowercase, no impersonating bots or Gloopy", () => {
    expect(cleanUsername("@Ada_99")).toBe("ada_99");
    expect(() => cleanUsername("ab")).toThrow();
    expect(() => cleanUsername("gloopy")).toThrow();
    expect(() => cleanUsername("botzippy")).toThrow();
    expect(() => cleanUsername("a b c")).toThrow();
  });
});
