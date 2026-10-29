// POST /api/rooms  { name, avatar }  → creates a table and makes you the host.
import { secureRng } from "@/engine/cards";
import { makeRoomCode } from "@/engine/room";
import { newRoom, toPublic } from "@/lib/ops";
import { errorResponse, json, readJson } from "@/lib/server/http";
import { getStore, userFromRequest } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userId = await userFromRequest(req);
    if (!userId) return json({ error: "Please reload the page to sign in" }, 401);
    const body = await readJson(req);
    const store = getStore();
    for (let i = 0; i < 5; i++) {
      const code = makeRoomCode(secureRng);
      const now = Date.now();
      const room = newRoom(code, userId, body.name, body.avatar, now);
      if (await store.create(code, room, toPublic(room, now))) {
        return json({ code, room: toPublic(room, now), serverNow: Date.now() });
      }
    }
    return json({ error: "Couldn't create a table, try again" }, 500);
  } catch (e) {
    return errorResponse(e);
  }
}
