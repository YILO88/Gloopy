// GET  /api/me  → am I a guest or signed in, and my profile (if set up)
// POST /api/me  { username, displayName, avatar } → create or update my profile (signed-in only)
import { GameError } from "@/engine/game";
import { publicProfile, cleanProfileInput } from "@/lib/server/account-api";
import { errorResponse, json, readJson } from "@/lib/server/http";
import { callerFromRequest, getAccounts } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const caller = await callerFromRequest(req);
    if (!caller) return json({ error: "Please reload the page to sign in" }, 401);
    const p = caller.guest ? null : await getAccounts().profile(caller.id);
    return json({ id: caller.id, guest: caller.guest, profile: p ? publicProfile(p) : null });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await callerFromRequest(req);
    if (!caller) return json({ error: "Please reload the page to sign in" }, 401);
    if (caller.guest) throw new GameError("Sign in with Discord, Google or email first");
    const input = cleanProfileInput(await readJson(req));
    const p = await getAccounts().saveProfile({ id: caller.id, ...input });
    return json({ profile: publicProfile(p) });
  } catch (e) {
    return errorResponse(e);
  }
}
