import "server-only";
import { GameError } from "@/engine/game";
import { cleanAvatar, cleanName } from "@/lib/ops";
import { cleanUsername } from "@/lib/results";
import type { Profile } from "./accounts";
import { callerFromRequest, getAccounts } from "./supabase";

/** What the browser may see about someone (no internal ids beyond what's needed). */
export const publicProfile = (p: Profile) => ({ id: p.id, username: p.username, displayName: p.display_name, avatar: p.avatar, since: p.created_at });

/** The caller must be signed in with an account (not a guest) and have set up a profile. */
export async function requireAccount(req: Request): Promise<Profile> {
  const caller = await callerFromRequest(req);
  if (!caller) throw new AuthError("Please reload the page to sign in");
  if (caller.guest) throw new AuthError("Create an account first");
  const p = await getAccounts().profile(caller.id);
  if (!p) throw new AuthError("Finish setting up your profile first");
  return p;
}

export class AuthError extends GameError {}

export function cleanProfileInput(body: Record<string, unknown>) {
  return { username: cleanUsername(body.username), display_name: cleanName(body.displayName), avatar: cleanAvatar(body.avatar) };
}
