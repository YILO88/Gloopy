"use client";
// /leaderboard: pick a game (Poker for now), Friends or World, this week / month / all time.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, ErrorNote, Page } from "@/components/AccountUI";
import { Gloop } from "@/components/Gloop";
import { useMe } from "@/lib/client/account";
import { api } from "@/lib/client/api";
import { GAMES, GameKind, Period } from "@/lib/results";

interface Row {
  username: string;
  displayName: string;
  avatar: string;
  wins: number;
  games: number;
  isMe: boolean;
}

export default function LeaderboardPage() {
  const { me } = useMe();
  const [game, setGame] = useState<GameKind>("poker");
  const [scope, setScope] = useState<"friends" | "world">("friends");
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<{ rows: Row[]; me: Row | null; needsAccount?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me && !me.profile && scope === "friends") setScope("world");
  }, [me, scope]);
  useEffect(() => {
    setData(null);
    api<{ rows: Row[]; me: Row | null }>(`/api/leaderboard?game=${game}&scope=${scope}&period=${period}`).then(setData, (e) => setError((e as Error).message));
  }, [game, scope, period]);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1));
  const Item = ({ r, rank }: { r: Row; rank: string }) => (
    <li className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink px-2 py-1.5 ${r.isMe ? "bg-lime" : "bg-white"}`}>
      <span className="w-7 text-center font-display text-xl font-extrabold">{rank}</span>
      <Link href={`/u/${r.username}`} className="flex min-w-0 flex-1 items-center gap-2">
        <Gloop id={r.avatar} size={32} />
        <span className="truncate font-bold">
          {r.displayName}
          {r.isMe && " (you)"}
        </span>
      </Link>
      <span className="font-display text-lg font-extrabold tabular">
        {r.wins} {r.wins === 1 ? "win" : "wins"}
      </span>
    </li>
  );

  return (
    <Page title="Leaderboards">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold">Game</span>
          <div className="flex gap-2">
            {GAMES.map((g) => (
              <button key={g.id} onClick={() => setGame(g.id)} className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${game === g.id ? "bg-lime" : "bg-white"}`}>
                {g.icon} {g.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2" role="tablist">
          {(["friends", "world"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={`rounded-xl border-[3px] border-ink py-1 font-display text-lg font-extrabold capitalize ${scope === s ? "bg-ink text-white" : "bg-white"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mb-3 flex gap-2">
          {(
            [
              ["week", "This week"],
              ["month", "This month"],
              ["all", "All time"],
            ] as [Period, string][]
          ).map(([p, label]) => (
            <button key={p} onClick={() => setPeriod(p)} className={`rounded-full border-2 border-ink px-3 py-0.5 text-xs font-bold ${period === p ? "bg-lime" : "bg-white"}`}>
              {label}
            </button>
          ))}
        </div>

        <ErrorNote text={error} />
        {scope === "friends" && me && !me.profile ? (
          <div className="py-4 text-center">
            <p className="mb-2">Sign in to see how you rank against your friends.</p>
            <Link href="/account?next=/leaderboard" className="btn inline-block bg-lime px-4 py-1.5">
              Sign in
            </Link>
          </div>
        ) : !data ? (
          <p className="py-6 text-center font-display text-lg font-extrabold">Loading…</p>
        ) : data.rows.length === 0 ? (
          <div className="flex flex-col items-center py-4 text-center">
            <Gloop id="sky" face="smug" size={64} />
            <p className="mt-1 text-sm">No wins here yet. Play a game with friends who have accounts!</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {data.rows.map((r, i) => (
              <Item key={r.username} r={r} rank={r.wins > 0 ? medal(i) : "–"} />
            ))}
            {data.me && <Item r={data.me} rank="–" />}
          </ol>
        )}
        <p className="mt-3 text-xs text-ink/60">A win counts when 2 or more players with accounts were at the table. Bots never appear here.</p>
      </Card>
    </Page>
  );
}
