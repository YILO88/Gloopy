// POST /api/rooms/:code/chat  { kind: "text" | "sticker" | "gif", body }
// Players and watchers can chat. Messages go into chat_messages, which Realtime pushes to everyone.
// GET is only used in local test mode (no Supabase), where browsers poll instead.
import { GameError } from "@/engine/game";
import { isGif, isSticker } from "@/lib/gloops";
import { errorResponse, json, readJson } from "@/lib/server/http";
import { MemoryStore, NotFoundError } from "@/lib/server/store";
import { getStore, supabaseAdmin, userFromRequest } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = raw.toUpperCase();
    const userId = await userFromRequest(req);
    if (!userId) return json({ error: "Please reload the page to sign in" }, 401);
    const { kind, body } = await readJson(req);

    let text: string;
    if (kind === "text" && typeof body === "string") {
      text = body.replace(/\s+/g, " ").trim().slice(0, 200);
      if (!text) throw new GameError("Type a message");
    } else if (kind === "sticker" && typeof body === "string" && isSticker(body)) text = body;
    else if (kind === "gif" && typeof body === "string" && isGif(body)) text = body;
    else throw new GameError("That message can't be sent");

    const store = getStore();
    const loaded = await store.load(code);
    if (!loaded) throw new NotFoundError();
    const me = loaded.room.members.find((m) => m.id === userId);
    if (!me) throw new GameError("Join the table to chat");
    const seat = loaded.room.game?.players.find((p) => p.id === userId);
    const watching = loaded.room.phase === "playing" && (!seat || seat.status !== "playing");
    const row = { room_code: code, sender_id: userId, sender_name: me.name, avatar: me.avatar, watching, kind, body: text };

    if (store instanceof MemoryStore) {
      const list = store.chat.get(code) ?? [];
      list.push({ ...row, kind: kind as "text", id: list.length + 1, created_at: new Date().toISOString() });
      store.chat.set(code, list.slice(-100));
    } else {
      const { error } = await supabaseAdmin().from("chat_messages").insert(row);
      if (error) throw error;
    }
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const store = getStore();
  if (!(store instanceof MemoryStore)) return json({ error: "Not available" }, 404);
  return json({ messages: (store.chat.get(code.toUpperCase()) ?? []).slice(-50) });
}
