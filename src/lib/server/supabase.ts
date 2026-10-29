import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Room } from "@/engine/room";
import { PublicRoom, newHoles } from "@/lib/ops";
import { MemoryStore, RoomStore } from "./store";

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
  constructor(private db: SupabaseClient) {}

  async load(code: string) {
    const { data, error } = await this.db.from("room_secrets").select("room, version").eq("code", code).maybeSingle();
    if (error) throw error;
    return data ? { room: data.room as Room, version: data.version as number } : null;
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
    return data === true;
  }
}

// Local development without Supabase: one shared in-memory store per server process.
const g = globalThis as unknown as { __gloopyMemory?: MemoryStore };

export function getStore(): RoomStore {
  if (process.env.GLOOPY_MEMORY_STORE === "1") return (g.__gloopyMemory ??= new MemoryStore());
  return new SupabaseStore(supabaseAdmin());
}

/** Who is calling: checks the player's sign-in token and returns their id. */
export async function userFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  if (process.env.GLOOPY_MEMORY_STORE === "1" && token.startsWith("dev-")) return token.slice(4);
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
