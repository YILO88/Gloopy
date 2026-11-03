// GET /api/leaderboard?game=poker&scope=friends|world&period=week|month|all
// Only games with 2+ account holders count; bots never appear. Anyone can look; friends needs an account.
import { GameError } from "@/engine/game";
import { GAMES, GameKind, Period, periodStart } from "@/lib/results";
import { errorResponse, json } from "@/lib/server/http";
import { callerFromRequest, getAccounts } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const caller = await callerFromRequest(req);
    if (!caller) return json({ error: "Please reload the page to sign in" }, 401);
    const q = new URL(req.url).searchParams;
    const game = (q.get("game") ?? "poker") as GameKind;
    if (!GAMES.some((g) => g.id === game)) throw new GameError("Unknown game");
    const period = (["week", "month", "all"].includes(q.get("period") ?? "") ? q.get("period") : "month") as Period;
    const scope = q.get("scope") === "world" ? "world" : "friends";
    const accounts = getAccounts();
    const since = periodStart(period, Date.now());
    const me = caller.guest ? null : await accounts.profile(caller.id);
    let ids: string[] | null = null;
    if (scope === "friends") {
      if (!me) return json({ rows: [], needsAccount: true });
      const links = await accounts.friendships(me.id);
      ids = [me.id, ...links.filter((f) => f.status === "accepted").map((f) => (f.requester === me.id ? f.addressee : f.requester))];
    }
    const rows = await accounts.leaderboard(game, since, ids, 50);
    let mine = null;
    if (me && !rows.some((r) => r.player_id === me.id)) mine = (await accounts.leaderboard(game, since, [me.id], 1))[0] ?? null;
    const view = (r: (typeof rows)[number]) => ({ username: r.username, displayName: r.display_name, avatar: r.avatar, wins: r.wins, games: r.games, isMe: r.player_id === me?.id });
    return json({ rows: rows.map(view), me: mine ? view(mine) : null });
  } catch (e) {
    return errorResponse(e);
  }
}
