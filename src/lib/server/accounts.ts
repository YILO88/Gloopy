/**
 * Accounts: profiles, friends and game results. Server only.
 * Two implementations like rooms: Supabase (real) and memory (tests / local runs).
 * The browser never reads these tables directly; every request goes through /api and is checked here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { GameError } from "@/engine/game";
import { BoardRow, GameKind, ResultRow, leaderboard } from "@/lib/results";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  created_at: string;
}

export interface Friendship {
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
  created_at: string;
}

export interface AccountStore {
  profile(id: string): Promise<Profile | null>;
  profileByUsername(username: string): Promise<Profile | null>;
  profiles(ids: string[]): Promise<Profile[]>;
  /** Create or update; throws GameError if the username belongs to someone else. */
  saveProfile(p: Omit<Profile, "created_at">): Promise<Profile>;
  recordResults(rows: ResultRow[]): Promise<void>;
  results(playerId: string, limit?: number): Promise<ResultRow[]>;
  leaderboard(game: GameKind, since: number, ids: string[] | null, limit?: number): Promise<BoardRow[]>;
  friendships(id: string): Promise<Friendship[]>;
  setFriendship(f: Friendship): Promise<void>;
  removeFriendship(a: string, b: string): Promise<void>;
}

// ------------------------------------------------------------------ memory

export class MemoryAccounts implements AccountStore {
  byId = new Map<string, Profile>();
  rows: ResultRow[] = [];
  friends: Friendship[] = [];

  async profile(id: string) {
    return this.byId.get(id) ?? null;
  }
  async profileByUsername(username: string) {
    return [...this.byId.values()].find((p) => p.username === username.toLowerCase()) ?? null;
  }
  async profiles(ids: string[]) {
    return ids.map((id) => this.byId.get(id)).filter((p): p is Profile => !!p);
  }
  async saveProfile(p: Omit<Profile, "created_at">) {
    const clash = await this.profileByUsername(p.username);
    if (clash && clash.id !== p.id) throw new GameError("That username is taken");
    const saved = { created_at: this.byId.get(p.id)?.created_at ?? new Date().toISOString(), ...p };
    this.byId.set(p.id, saved);
    return saved;
  }
  async recordResults(rows: ResultRow[]) {
    for (const r of rows) {
      const dup = this.rows.some((x) => x.room_code === r.room_code && x.game_number === r.game_number && x.player_id === r.player_id);
      if (!dup) this.rows.unshift(r);
    }
  }
  async results(playerId: string, limit = 500) {
    return this.rows.filter((r) => r.player_id === playerId).slice(0, limit);
  }
  async leaderboard(game: GameKind, since: number, ids: string[] | null, limit = 50) {
    const profiles = new Map([...this.byId.values()].map((p) => [p.id, { username: p.username, display_name: p.display_name, avatar: p.avatar }]));
    return leaderboard(this.rows, profiles, game, since, ids, limit);
  }
  async friendships(id: string) {
    return this.friends.filter((f) => f.requester === id || f.addressee === id);
  }
  async setFriendship(f: Friendship) {
    await this.removeFriendship(f.requester, f.addressee);
    this.friends.push(f);
  }
  async removeFriendship(a: string, b: string) {
    this.friends = this.friends.filter((f) => !((f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a)));
  }
}

// ------------------------------------------------------------------ supabase

export class SupabaseAccounts implements AccountStore {
  constructor(private db: SupabaseClient) {}

  async profile(id: string) {
    const { data, error } = await this.db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Profile) ?? null;
  }
  async profileByUsername(username: string) {
    const { data, error } = await this.db.from("profiles").select("*").eq("username", username.toLowerCase()).maybeSingle();
    if (error) throw error;
    return (data as Profile) ?? null;
  }
  async profiles(ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await this.db.from("profiles").select("*").in("id", ids);
    if (error) throw error;
    return (data as Profile[]) ?? [];
  }
  async saveProfile(p: Omit<Profile, "created_at">) {
    const { data, error } = await this.db.from("profiles").upsert(p, { onConflict: "id" }).select().single();
    if (error) {
      if (error.code === "23505") throw new GameError("That username is taken");
      throw error;
    }
    return data as Profile;
  }
  async recordResults(rows: ResultRow[]) {
    if (!rows.length) return;
    const { error } = await this.db.from("game_results").upsert(rows, { onConflict: "room_code,game_number,player_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  async results(playerId: string, limit = 500) {
    const { data, error } = await this.db
      .from("game_results")
      .select("*")
      .eq("player_id", playerId)
      .order("finished_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as ResultRow[]) ?? [];
  }
  async leaderboard(game: GameKind, since: number, ids: string[] | null, limit = 50) {
    const { data, error } = await this.db.rpc("gloopy_leaderboard", {
      p_game: game,
      p_since: new Date(since).toISOString(),
      p_ids: ids,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data as BoardRow[]) ?? []).map((r) => ({ ...r, wins: Number(r.wins), games: Number(r.games) }));
  }
  async friendships(id: string) {
    const { data, error } = await this.db.from("friendships").select("*").or(`requester.eq.${id},addressee.eq.${id}`);
    if (error) throw error;
    return (data as Friendship[]) ?? [];
  }
  async setFriendship(f: Friendship) {
    await this.removeFriendship(f.requester, f.addressee);
    const { error } = await this.db.from("friendships").insert(f);
    if (error) throw error;
  }
  async removeFriendship(a: string, b: string) {
    const { error } = await this.db
      .from("friendships")
      .delete()
      .or(`and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a})`);
    if (error) throw error;
  }
}
