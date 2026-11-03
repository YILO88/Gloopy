// GET /api/users/:username → someone's profile and stats (all Gloopy games, then per game)
import { publicProfile } from "@/lib/server/account-api";
import { errorResponse, json } from "@/lib/server/http";
import { summarize } from "@/lib/results";
import { callerFromRequest, getAccounts } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ username: string }> }) {
  try {
    const caller = await callerFromRequest(req);
    if (!caller) return json({ error: "Please reload the page to sign in" }, 401);
    const { username } = await ctx.params;
    const accounts = getAccounts();
    const p = await accounts.profileByUsername(decodeURIComponent(username).replace(/^@/, ""));
    if (!p) return json({ error: "No one has that username" }, 404);
    const summary = summarize(await accounts.results(p.id));
    const links = await accounts.friendships(p.id);
    const friendCount = links.filter((f) => f.status === "accepted").length;
    const link = links.find((f) => f.requester === caller.id || f.addressee === caller.id);
    const friend = !link ? "none" : link.status === "accepted" ? "friends" : link.requester === caller.id ? "requested" : "incoming";
    return json({ profile: publicProfile(p), summary, friendCount, isMe: p.id === caller.id, friend });
  } catch (e) {
    return errorResponse(e);
  }
}
