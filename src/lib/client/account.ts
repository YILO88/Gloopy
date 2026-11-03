"use client";
/**
 * Accounts in the browser: sign in with Discord, Google or an email code, and read my profile.
 * A guest who signs in keeps the same player id (Supabase links the new sign-in to the guest),
 * so the game they just played still counts as theirs.
 * Test mode (no Supabase): signing in just sets a flag in this tab.
 */
import { useCallback, useEffect, useState } from "react";
import { DEV, api, supabase } from "./api";

export interface MyProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  since: string;
}

export interface Me {
  id: string;
  guest: boolean;
  profile: MyProfile | null;
}

/** Who I am (guest or signed in) and my profile. `null` while loading. */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { me, error, refresh };
}

export type Provider = "discord" | "google";
const RETURN_KEY = "gloopy.signin";

/** Where to come back to after the Discord/Google page. */
function doneUrl(next: string) {
  return `${window.location.origin}/account/done?next=${encodeURIComponent(next)}`;
}

/** Continue with Discord / Google. Leaves the page (to the provider) and comes back to /account/done. */
export async function signInWith(provider: Provider, next = "/account") {
  if (DEV) {
    sessionStorage.setItem("gloopy.devAccount", provider);
    window.location.href = next;
    return;
  }
  const sb = supabase();
  sessionStorage.setItem(RETURN_KEY, JSON.stringify({ provider, next }));
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (user?.is_anonymous) {
    // Turn this guest into an account: same id, so tonight's game is kept.
    const { error } = await sb.auth.linkIdentity({ provider, options: { redirectTo: doneUrl(next) } });
    if (!error) return;
    if (!/already/i.test(error.message)) throw new Error(friendly(error.message));
  }
  // Already has an account with this provider (e.g. on a new phone): sign in to it.
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: doneUrl(next) } });
  if (error) throw new Error(friendly(error.message));
}

/** Back from Discord/Google. If that login already belonged to an account, sign in to it instead. */
export async function finishSignIn(): Promise<string> {
  const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null") as { provider: Provider; next: string } | null;
  const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
  const next = params.get("next") ?? saved?.next ?? "/account";
  const code = params.get("error_code") ?? "";
  const desc = params.get("error_description") ?? "";
  if (code || desc) {
    if (/identity_already_exists|already linked|already exists/i.test(code + desc) && saved) {
      sessionStorage.removeItem(RETURN_KEY);
      await supabase().auth.signOut({ scope: "local" });
      await supabase().auth.signInWithOAuth({ provider: saved.provider, options: { redirectTo: doneUrl(next) } });
      return "redirecting";
    }
    throw new Error(friendly(desc || code));
  }
  // The Supabase client finishes the sign-in from the link by itself; wait until it has.
  for (let i = 0; i < 20; i++) {
    const { data } = await supabase().auth.getSession();
    if (data.session && !data.session.user.is_anonymous) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  sessionStorage.removeItem(RETURN_KEY);
  return next;
}

/** Email: step 1, send a 6-digit code. Returns how to check it in step 2. */
export async function sendEmailCode(email: string): Promise<"link" | "signin"> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("That email doesn't look right");
  if (DEV) return "link";
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.user.is_anonymous) {
    const { error } = await sb.auth.updateUser({ email: clean });
    if (!error) return "link";
    if (!/already|registered|exists/i.test(error.message)) throw new Error(friendly(error.message));
  }
  const { error } = await sb.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
  if (error) throw new Error(friendly(error.message));
  return "signin";
}

/** Email: step 2, check the code. */
export async function verifyEmailCode(email: string, token: string, mode: "link" | "signin") {
  if (DEV) {
    if (!/^\d{6}$/.test(token.trim())) throw new Error("That code isn't right");
    sessionStorage.setItem("gloopy.devAccount", "email");
    return;
  }
  const sb = supabase();
  if (mode === "signin") await sb.auth.signOut({ scope: "local" });
  const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: mode === "link" ? "email_change" : "email" });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? "That code isn't right or has expired. Send a new one." : friendly(error.message));
}

export async function signOut() {
  if (DEV) sessionStorage.removeItem("gloopy.devAccount");
  else await supabase().auth.signOut();
  window.location.href = "/";
}

export async function saveMyProfile(p: { username: string; displayName: string; avatar: string }) {
  return api<{ profile: MyProfile }>("/api/me", p);
}

function friendly(msg: string) {
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return "That sign-in option isn't switched on yet. Try another one.";
  if (/manual linking/i.test(msg)) return "Signing in isn't fully set up yet (manual linking is off in Supabase).";
  if (/rate limit/i.test(msg)) return "Too many emails sent. Wait a few minutes and try again.";
  return msg;
}
