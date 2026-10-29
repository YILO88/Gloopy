"use client";
/**
 * Browser side: who am I, and talking to the game server.
 * Real mode: Supabase anonymous sign-in (no email). Test mode (NEXT_PUBLIC_GLOOPY_DEV=1): a local id.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicRoom } from "@/lib/ops";

export const DEV = process.env.NEXT_PUBLIC_GLOOPY_DEV === "1";

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return client;
}

function devId(): string {
  const key = "gloopy.devId";
  let id = sessionStorage.getItem(key); // per tab, so several tabs = several players
  if (!id) {
    id = "dev" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(key, id);
  }
  return id;
}

/** Signs in anonymously if needed. Returns my player id and a token for the server. */
export async function identity(): Promise<{ id: string; token: string }> {
  if (DEV) {
    const id = devId();
    return { id, token: "dev-" + id };
  }
  const sb = supabase();
  let { data } = await sb.auth.getSession();
  if (!data.session) {
    const res = await sb.auth.signInAnonymously();
    if (res.error) throw new Error("Couldn't sign in. Check your connection and reload.");
    ({ data } = await sb.auth.getSession());
  }
  return { id: data.session!.user.id, token: data.session!.access_token };
}

export interface RoomResponse {
  room: PublicRoom;
  myCards: string[];
  serverNow: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = RoomResponse>(path: string, body?: unknown): Promise<T> {
  const { token } = await identity();
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: true,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong", res.status);
  return data as T;
}

// ------------------------------------------------------------------ saved profile

export interface Profile {
  name: string;
  avatar: string;
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem("gloopy.profile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem("gloopy.profile", JSON.stringify(p));
  } catch {
    /* private mode: fine, just not remembered */
  }
}
