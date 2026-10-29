// POST /api/rooms/:code  { op, ... }  → every move and lobby change goes through here.
// GET  /api/rooms/:code               → current public state (plus your own cards).
import { secureRng } from "@/engine/cards";
import { holeCards } from "@/engine/game";
import { Op, applyOp, toPublic } from "@/lib/ops";
import { errorResponse, json, readJson } from "@/lib/server/http";
import { NotFoundError, mutateRoom } from "@/lib/server/store";
import { getStore, userFromRequest } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const OPS = new Set(["join", "leave", "settings", "start", "act", "tick", "again"]);

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = raw.toUpperCase();
    const userId = await userFromRequest(req);
    if (!userId) return json({ error: "Please reload the page to sign in" }, 401);
    const body = await readJson(req);
    if (typeof body.op !== "string" || !OPS.has(body.op)) return json({ error: "Unknown request" }, 400);
    const { room, pub } = await mutateRoom(getStore(), code, (r, now) => applyOp(r, userId, body as Op, now, secureRng));
    return json({ room: pub, myCards: room.game ? holeCards(room.game, userId) : [], serverNow: Date.now() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = raw.toUpperCase();
    const userId = await userFromRequest(req);
    if (!userId) return json({ error: "Please reload the page to sign in" }, 401);
    const loaded = await getStore().load(code);
    if (!loaded) throw new NotFoundError();
    const now = Date.now();
    return json({
      room: toPublic(loaded.room, now),
      myCards: loaded.room.game ? holeCards(loaded.room.game, userId) : [],
      serverNow: now,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
