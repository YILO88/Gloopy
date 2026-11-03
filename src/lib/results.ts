/**
 * Game results for profiles and leaderboards. Shared by every Gloopy game; each game passes its
 * own finishing order. Pure functions: no database here.
 *
 * Rules (owner's decisions):
 *  - Only people get results; bots never appear anywhere.
 *  - Placing ignores bots: if a bot finishes 1st and you finish 2nd, you're the winner among people.
 *  - A win needs at least 2 people at the table (beating only bots is practice).
 *  - A game counts for leaderboards ("ranked") only if 2+ players had Gloopy accounts.
 */
import type { Card } from "@/engine/cards";
import type { Room } from "@/engine/room";
import { GameError } from "@/engine/game";

export type GameKind = "poker";
export const GAMES: { id: GameKind; name: string; icon: string }[] = [{ id: "poker", name: "Poker", icon: "♠" }];

export interface ResultRow {
  game: GameKind;
  room_code: string;
  game_number: number;
  player_id: string;
  finished_at: string; // ISO time
  place: number; // among people (bots ignored)
  place_all: number; // including bots
  people: number;
  bots: number;
  accounts: number;
  ranked: boolean;
  won: boolean;
  stats: { chips?: number; biggestPot?: number; bestHand?: { name: string; cards: Card[]; score: number[] } };
}

/** One row per person who played, when a poker game has just finished. */
export function pokerResultRows(room: Room): ResultRow[] {
  const g = room.game;
  if (!g || g.status !== "finished" || !g.ranking) return [];
  const isBot = (id: string) => !!g.players.find((p) => p.id === id)?.bot;
  const people = g.ranking.filter((r) => !isBot(r.id));
  const accounts = people.filter((r) => room.members.find((m) => m.id === r.id)?.username).length;
  const bots = g.ranking.length - people.length;
  const ranked = accounts >= 2;
  return people.map((r) => {
    const place = 1 + people.filter((o) => o.position < r.position).length;
    const st = g.stats?.[r.id];
    return {
      game: "poker",
      room_code: room.code,
      game_number: room.gameNumber,
      player_id: r.id,
      finished_at: new Date(g.finishedAt ?? Date.now()).toISOString(),
      place,
      place_all: r.position,
      people: people.length,
      bots,
      accounts,
      ranked,
      won: people.length >= 2 && place === 1,
      stats: { chips: r.chips, biggestPot: st?.biggestPot ?? 0, ...(st?.bestHand ? { bestHand: st.bestHand } : {}) },
    };
  });
}

// ------------------------------------------------------------------ summaries

export interface GameSummary {
  game: GameKind;
  played: number;
  /** Games against at least one other person (practice with only bots left out). */
  contested: number;
  wins: number;
  top3: number;
  biggestPot: number;
  bestHand: { name: string; cards: Card[] } | null;
}

export interface Summary {
  played: number;
  wins: number;
  games: GameSummary[];
  recent: { game: GameKind; place: number; people: number; bots: number; won: boolean; ranked: boolean; finished_at: string; practice: boolean }[];
}

const better = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

/** Profile numbers from a player's result rows (newest first). */
export function summarize(rows: ResultRow[]): Summary {
  const games: GameSummary[] = GAMES.map(({ id }) => {
    const mine = rows.filter((r) => r.game === id);
    let best: ResultRow["stats"]["bestHand"] | undefined;
    for (const r of mine) if (r.stats.bestHand && (!best || better(r.stats.bestHand.score, best.score))) best = r.stats.bestHand;
    return {
      game: id,
      played: mine.length,
      contested: mine.filter((r) => r.people >= 2).length,
      wins: mine.filter((r) => r.won).length,
      top3: mine.filter((r) => r.people >= 2 && r.place <= 3).length,
      biggestPot: Math.max(0, ...mine.map((r) => r.stats.biggestPot ?? 0)),
      bestHand: best ? { name: best.name, cards: best.cards } : null,
    };
  });
  return {
    played: rows.length,
    wins: rows.filter((r) => r.won).length,
    games,
    recent: rows.slice(0, 10).map((r) => ({
      game: r.game,
      place: r.people >= 2 ? r.place : r.place_all,
      people: r.people,
      bots: r.bots,
      won: r.won,
      ranked: r.ranked,
      finished_at: r.finished_at,
      practice: r.people < 2,
    })),
  };
}

export type Period = "week" | "month" | "all";
export function periodStart(period: Period, now: number): number {
  if (period === "all") return 0;
  return now - (period === "week" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

export interface BoardRow {
  player_id: string;
  username: string;
  display_name: string;
  avatar: string;
  wins: number;
  games: number;
}

/** Leaderboard from result rows: ranked games only, most wins first (fewer games breaks ties). */
export function leaderboard(rows: ResultRow[], profiles: Map<string, { username: string; display_name: string; avatar: string }>, game: GameKind, since: number, ids: string[] | null, limit = 50): BoardRow[] {
  const by = new Map<string, BoardRow>();
  for (const r of rows) {
    if (r.game !== game || !r.ranked || Date.parse(r.finished_at) < since) continue;
    if (ids && !ids.includes(r.player_id)) continue;
    const p = profiles.get(r.player_id);
    if (!p) continue;
    const row = by.get(r.player_id) ?? { player_id: r.player_id, ...p, wins: 0, games: 0 };
    row.games++;
    if (r.won) row.wins++;
    by.set(r.player_id, row);
  }
  if (ids) for (const id of ids) if (!by.has(id) && profiles.get(id)) by.set(id, { player_id: id, ...profiles.get(id)!, wins: 0, games: 0 });
  return [...by.values()]
    .filter((r) => ids || r.wins > 0)
    .sort((a, b) => b.wins - a.wins || a.games - b.games || a.username.localeCompare(b.username))
    .slice(0, limit);
}

// ------------------------------------------------------------------ usernames

const RESERVED = new Set(["admin", "gloopy", "support", "moderator", "bot", "system", "guest", "null", "undefined"]);
export function cleanUsername(raw: unknown): string {
  const u = String(raw ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,16}$/.test(u)) throw new GameError("Usernames are 3–16 letters, numbers or _");
  if (RESERVED.has(u) || u.startsWith("bot")) throw new GameError("That username isn't available");
  return u;
}
