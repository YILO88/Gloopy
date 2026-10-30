"use client";
/**
 * /check: a self-test you run in the browser against the real Supabase project.
 * It signs in two throwaway anonymous players, starts a game between them, and then
 * tries to cheat: read the other player's cards, read the deck, write to the database.
 * Every cheat must fail. It also checks that live updates arrive.
 */
import { useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Result = { name: string; ok: boolean; detail: string };

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

function client(tag: string) {
  return createClient(URL_, KEY, { auth: { storageKey: `gloopy-check-${tag}`, persistSession: false, autoRefreshToken: false } });
}

async function call(token: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export default function Check() {
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const out: Result[] = [];
    const add = (name: string, ok: boolean, detail: string) => {
      out.push({ name, ok, detail });
      setResults([...out]);
    };
    try {
      // 1. Two players sign in anonymously.
      const a: SupabaseClient = client("a");
      const b: SupabaseClient = client("b");
      const sa = await a.auth.signInAnonymously();
      const sb = await b.auth.signInAnonymously();
      if (sa.error || sb.error) throw new Error(`Sign-in failed: ${(sa.error ?? sb.error)!.message}`);
      const A = { id: sa.data.user!.id, token: sa.data.session!.access_token };
      const B = { id: sb.data.user!.id, token: sb.data.session!.access_token };
      add("Two players can sign in anonymously", true, "Signed in as two separate players");

      // 2. A creates a table, B joins, A starts.
      const created = await call(A.token, "/api/rooms", { name: "Check A", avatar: "lime" });
      const code: string = created.code;
      await call(B.token, `/api/rooms/${code}`, { op: "join", name: "Check B", avatar: "berry" });
      const started = await call(A.token, `/api/rooms/${code}`, { op: "start" });
      add("Create, join and start a game", started.room.phase === "playing", `Table ${code}, game started`);

      // 3. Each player can read their own two cards (and the server sent them).
      await new Promise((r) => setTimeout(r, 600));
      const ownA = await a.from("hole_cards").select("player_id, cards").eq("room_code", code);
      const ownB = await b.from("hole_cards").select("player_id, cards").eq("room_code", code);
      const aCards: string[] = ownA.data?.find((r) => r.player_id === A.id)?.cards ?? [];
      const bCards: string[] = ownB.data?.find((r) => r.player_id === B.id)?.cards ?? [];
      add("Each player can read their own 2 cards", aCards.length === 2 && bCards.length === 2, `A sees ${aCards.length}, B sees ${bCards.length}`);

      // 4. Cheat: read the other player's cards.
      add(
        "A cannot see B's cards",
        (ownA.data ?? []).every((r) => r.player_id === A.id),
        `A's query returned ${ownA.data?.length ?? 0} row(s), all A's own`,
      );
      const peek = await a.from("hole_cards").select("cards").eq("player_id", B.id);
      add("A cannot read B's cards by asking for them directly", (peek.data ?? []).length === 0, `${peek.data?.length ?? 0} rows returned`);

      // 5. Cheat: read the deck and full game state.
      const secrets = await a.from("room_secrets").select("*").eq("code", code);
      add("Nobody can read the deck or full game state", (secrets.data ?? []).length === 0, `${secrets.data?.length ?? 0} rows returned`);

      // 6. The public table state has no face-down cards.
      const pub = await a.from("rooms").select("state").eq("code", code).single();
      const json = JSON.stringify(pub.data?.state ?? {});
      const leaked = [...aCards, ...bCards].filter((c) => json.includes(`"${c}"`));
      add("Public table state shows no face-down cards", !!pub.data && leaked.length === 0, leaked.length ? `Leaked: ${leaked.join(", ")}` : "Clean");

      // 7. Cheat: write to the database directly.
      const w1 = await a.from("rooms").update({ state: {} }).eq("code", code).select();
      add("Players cannot change the table directly", (w1.data ?? []).length === 0, w1.error ? "Refused" : "No rows changed");
      const w2 = await a.from("hole_cards").insert({ room_code: code, player_id: A.id, hand_number: 1, cards: ["As", "Ah"] });
      add("Players cannot give themselves cards", !!w2.error, w2.error ? "Refused" : "Insert went through!");
      const w3 = await a.rpc("gloopy_save", { p_code: code, p_expected: 0, p_room: {}, p_state: {}, p_holes: null });
      add("Players cannot call the server's save function", !!w3.error, w3.error ? "Refused" : "Call went through!");
      const w4 = await a.from("chat_messages").insert({ room_code: code, sender_id: B.id, sender_name: "fake", avatar: "lime", kind: "text", body: "hi" });
      add("Players cannot post chat as someone else", !!w4.error, w4.error ? "Refused" : "Insert went through!");

      // 8. Live updates: A listens, whoever's turn it is folds.
      const got = new Promise<number>((resolve) => {
        const t0 = Date.now();
        const ch = a
          .channel(`check:${code}`)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code}` }, () => {
            resolve(Date.now() - t0);
            a.removeChannel(ch);
          })
          .subscribe();
        setTimeout(() => resolve(-1), 8000);
      });
      await new Promise((r) => setTimeout(r, 1500)); // let the subscription connect
      const state = await call(A.token, `/api/rooms/${code}`);
      const toAct = state.room.game.toAct as string;
      await call(toAct === A.id ? A.token : B.token, `/api/rooms/${code}`, { op: "act", action: { type: "fold" } });
      const ms = await got;
      add("Moves reach other players live", ms >= 0, ms >= 0 ? "Update arrived" : "No live update within 8 seconds");

      // 9. Chat arrives.
      await call(B.token, `/api/rooms/${code}/chat`, { kind: "sticker", body: "gg" });
      const chat = await a.from("chat_messages").select("sender_id, body").eq("room_code", code);
      add("Chat and stickers work", (chat.data ?? []).some((m) => m.sender_id === B.id && m.body === "gg"), `${chat.data?.length ?? 0} message(s)`);

      await call(A.token, `/api/rooms/${code}`, { op: "leave" }).catch(() => {});
      await call(B.token, `/api/rooms/${code}`, { op: "leave" }).catch(() => {});
    } catch (e) {
      add("Check stopped", false, (e as Error).message);
    }
    setRunning(false);
  }

  const passed = results.filter((r) => r.ok).length;
  const done = !running && results.length > 0;
  const allOk = done && results.every((r) => r.ok);

  return (
    <main className="min-h-dvh px-4 py-8">
      <section className="sticker mx-auto max-w-xl p-5">
        <h1 className="font-display text-3xl font-extrabold">Gloopy safety check</h1>
        <p className="mb-4 text-sm text-ink/70">
          Starts a test game between two pretend players, then tries to cheat. Every cheat should fail. Takes about 15 seconds.
        </p>
        <button className="btn mb-4 w-full bg-lime py-3 text-xl" onClick={run} disabled={running}>
          {running ? "Checking…" : results.length ? "Run again" : "Run the check"}
        </button>
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li key={i} className={`rounded-xl border-[3px] border-ink px-3 py-2 ${r.ok ? "bg-[#e5fbd0]" : "bg-[#ffe1e1]"}`}>
              <div className="font-semibold">
                {r.ok ? "✅" : "❌"} {r.name}
              </div>
              <div className="text-sm text-ink/70">{r.detail}</div>
            </li>
          ))}
        </ul>
        {done && (
          <p className={`mt-4 rounded-xl p-3 text-center font-display text-xl font-extrabold ${allOk ? "bg-lime" : "bg-[#ffe1e1]"}`}>
            {allOk ? `All ${passed} checks passed` : `${passed} of ${results.length} passed. Send a screenshot to Claude.`}
          </p>
        )}
      </section>
    </main>
  );
}
