// GET  /api/friends → my friends, requests to me, requests I sent
// POST /api/friends { op: "request" | "accept" | "decline" | "remove", username }
import { GameError } from "@/engine/game";
import { publicProfile, requireAccount } from "@/lib/server/account-api";
import { errorResponse, json, readJson } from "@/lib/server/http";
import { getAccounts } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireAccount(req);
    const accounts = getAccounts();
    const links = await accounts.friendships(me.id);
    const other = (f: { requester: string; addressee: string }) => (f.requester === me.id ? f.addressee : f.requester);
    const people = new Map((await accounts.profiles(links.map(other))).map((p) => [p.id, publicProfile(p)]));
    const pick = (pred: (f: (typeof links)[number]) => boolean) =>
      links.filter(pred).map((f) => people.get(other(f))).filter(Boolean);
    return json({
      friends: pick((f) => f.status === "accepted"),
      incoming: pick((f) => f.status === "pending" && f.addressee === me.id),
      outgoing: pick((f) => f.status === "pending" && f.requester === me.id),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireAccount(req);
    const body = await readJson(req);
    const accounts = getAccounts();
    const them = typeof body.username === "string" ? await accounts.profileByUsername(body.username.replace(/^@/, "")) : null;
    if (!them) throw new GameError("No one has that username");
    if (them.id === me.id) throw new GameError("That's you!");
    const link = (await accounts.friendships(me.id)).find((f) => f.requester === them.id || f.addressee === them.id);
    const now = new Date().toISOString();
    switch (body.op) {
      case "request":
        if (link?.status === "accepted") return json({ status: "friends" });
        if (link && link.requester === them.id) {
          // They already asked me: asking back means yes.
          await accounts.setFriendship({ requester: them.id, addressee: me.id, status: "accepted", created_at: link.created_at });
          return json({ status: "friends" });
        }
        if (!link) await accounts.setFriendship({ requester: me.id, addressee: them.id, status: "pending", created_at: now });
        return json({ status: "requested" });
      case "accept":
        if (!link || link.requester !== them.id) throw new GameError("No request from them");
        await accounts.setFriendship({ ...link, status: "accepted" });
        return json({ status: "friends" });
      case "decline":
      case "remove":
        await accounts.removeFriendship(me.id, them.id);
        return json({ status: "none" });
      default:
        throw new GameError("Unknown request");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
