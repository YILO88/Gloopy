import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Room } from "@/engine/room";
import { PublicRoom, newHoles } from "@/lib/ops";
import { MemoryStore, RoomStore } from "./store";
import { AccountStore, MemoryAccounts, SupabaseAccounts } from "./accounts";

let admin: SupabaseClient | null = null;

/** Server-side Supabase client with the secret key. Never sent to browsers. */
export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Either key name works: newer projects say "secret", older ones "service_role".
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export class SupabaseStore implements RoomStore {
  constructor(private db: SupabaseClient, public accounts?: AccountStore) {}

  async load(code: string) {
    const { data, error } = await this.db.from("room_secrets").select("room, version, updated_at").eq("code", code).maybeSingle();
    if (error) throw error;
    return data
      ? { room: data.room as Room, version: data.version as number, updatedAt: Date.parse(data.updated_at as string) }
      : null;
  }

  async create(code: string, room: Room, pub: PublicRoom) {
    const { data, error } = await this.db.rpc("gloopy_create", { p_code: code, p_room: room, p_state: pub });
    if (error) throw error;
    return data === true;
  }

  async save(code: string, expected: number, room: Room, pub: PublicRoom, holes: ReturnType<typeof newHoles>) {
    const { data, error } = await this.db.rpc("gloopy_save", {
      p_code: code,
      p_expected: expected,
      p_room: room,
      p_state: pub,
      p_holes: holes,
    });
    if (error) throw error;
    if (data !== true) return false;
    // Push the new state straight to every screen (faster than waiting for the database to
    // announce the change), and each player's new cards to that player alone.
    await this.broadcast(code, pub, holes);
    return true;
  }

  async remove(code: string) {
    // Deleting the table also deletes its cards and chat (they're linked to it).
    const { error } = await this.db.from("rooms").delete().eq("code", code);
    if (error) throw error;
    await this.send(`game:${code}`, "closed", { code });
  }

  private async broadcast(code: string, pub: PublicRoom, holes: ReturnType<typeof newHoles>) {
    const sends = [this.send(`game:${code}`, "state", pub)];
    for (const h of holes ?? []) sends.push(this.send(`cards:${h.player_id}`, "cards", { room_code: code, ...h }));
    await Promise.allSettled(sends);
  }

  /** Send on a private channel. Only the server can send; players can only listen (see 0002 migration). */
  private async send(topic: string, event: string, payload: unknown) {
    const ch = this.db.channel(topic, { config: { private: true } });
    try {
      await ch.httpSend(event, payload, { timeout: 2000 });
    } catch {
      // Live push is a speed-up only: the database change still reaches everyone.
    } finally {
      await this.db.removeChannel(ch);
    }
  }
}

// Local development without Supabase: one shared in-memory store per server process.
const g = globalThis as unknown as { __gloopyMemory?: MemoryStore; __gloopyAccounts?: MemoryAccounts };

export function getStore(): RoomStore {
  if (process.env.GLOOPY_MEMORY_STORE === "1") return (g.__gloopyMemory ??= new MemoryStore(getAccounts()));
  return new SupabaseStore(supabaseAdmin(), getAccounts());
}

export function getAccounts(): AccountStore {
  if (process.env.GLOOPY_MEMORY_STORE === "1") return (g.__gloopyAccounts ??= new MemoryAccounts());
  return new SupabaseAccounts(supabaseAdmin());
}

/** Who is calling, and are they a guest (no account yet) or signed in with Discord/Google/email? */
export async function callerFromRequest(req: Request): Promise<{ id: string; guest: boolean } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  if (process.env.GLOOPY_MEMORY_STORE === "1") {
    // Test mode: "dev-<id>" is a guest, "devacct-<id>" has signed in.
    if (token.startsWith("devacct-")) return { id: token.slice(8), guest: false };
    if (token.startsWith("dev-")) return { id: token.slice(4), guest: true };
  }
  const { data, error } = await supabaseAdmin().auth.getClaims(token);
  const claims = data?.claims as { sub?: string; is_anonymous?: boolean } | undefined;
  if (error || typeof claims?.sub !== "string") return null;
  return { id: claims.sub, guest: claims.is_anonymous !== false };
}

/** Who is calling: checks the player's sign-in token and returns their id. */
export async function userFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  if (process.env.GLOOPY_MEMORY_STORE === "1" && token.startsWith("dev-")) return token.slice(4);
  if (process.env.GLOOPY_MEMORY_STORE === "1" && token.startsWith("devacct-")) return token.slice(8);
  // getClaims checks the sign-in token's signature right here on the server (keys are cached),
  // instead of asking Supabase on every move. Saves a full round trip per request.
  const { data, error } = await supabaseAdmin().auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;
  return sub;
}

/** For joining a table: signed-in players always sit as their account's name and Gloop. */
export async function seatIdentity(req: Request): Promise<{ id: string; username?: string; name?: string; avatar?: string } | null> {
  const caller = await callerFromRequest(req);
  if (!caller) return null;
  if (caller.guest) return { id: caller.id };
  const p = await getAccounts().profile(caller.id).catch(() => null);
  return p ? { id: caller.id, username: p.username, name: p.display_name, avatar: p.avatar } : { id: caller.id };
}
