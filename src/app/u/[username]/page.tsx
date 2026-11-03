"use client";
// /u/:username: a player's Gloopy profile. Totals across all games on top, then one tab per game.
// Also the friend link: opening someone's profile lets you add them.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, ErrorNote, MiniCards, Page, Stat } from "@/components/AccountUI";
import { Gloop } from "@/components/Gloop";
import { useMe } from "@/lib/client/account";
import { api } from "@/lib/client/api";
import { GAMES, GameKind, Summary } from "@/lib/results";

interface ProfileResponse {
  profile: { username: string; displayName: string; avatar: string; since: string };
  summary: Summary;
  friendCount: number;
  isMe: boolean;
  friend: "none" | "friends" | "requested" | "incoming";
}

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? d.toLocaleDateString(undefined, { weekday: "short" }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { me } = useMe();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameKind>("poker");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<ProfileResponse>(`/api/users/${encodeURIComponent(username)}`).then(setData, (e) => setError((e as Error).message));
  }, [username]);
  useEffect(load, [load]);

  const friendOp = async (op: string) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/friends", { op, username });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const shareLink = async () => {
    const link = `${window.location.origin}/u/${username}`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  };

  if (!data)
    return (
      <Page title="Profile">
        <Card>{error ? <ErrorNote text={error} /> : <p className="text-center font-display text-xl font-extrabold">Loading…</p>}</Card>
      </Page>
    );

  const { profile, summary, friendCount, isMe, friend } = data;
  const g = summary.games.find((x) => x.game === game)!;
  const winRate = g.contested ? Math.round((g.wins / g.contested) * 100) : 0;

  return (
    <Page title={isMe ? "My profile" : "Profile"}>
      <Card className="text-center">
        <div className="flex justify-center">
          <Gloop id={profile.avatar} size={96} />
        </div>
        <h2 className="font-display text-3xl font-extrabold">{profile.displayName}</h2>
        <p className="text-sm text-ink/60">
          @{profile.username} · Gloopy since {new Date(profile.since).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={summary.played} label="games played" />
          <Stat value={summary.wins} label="wins" />
          <Stat value={friendCount} label="friends" />
        </div>
        <p className="mt-1.5 text-xs text-ink/60">All Gloopy games together</p>

        {isMe ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn bg-lime py-1.5 text-sm sm:text-base" onClick={shareLink}>
              {copied ? "Link copied" : "Share my friend link"}
            </button>
            <Link href="/account" className="btn bg-white py-1.5">
              Edit
            </Link>
          </div>
        ) : me && !me.profile ? (
          <Link href={`/account?next=/u/${profile.username}`} className="btn mt-3 block bg-lime py-1.5">
            Sign in to add {profile.displayName}
          </Link>
        ) : friend === "friends" ? (
          <p className="mt-3 font-display text-lg font-extrabold">✓ Friends</p>
        ) : friend === "requested" ? (
          <button className="btn mt-3 w-full bg-white py-1.5" disabled={busy} onClick={() => friendOp("remove")}>
            Request sent · Cancel
          </button>
        ) : friend === "incoming" ? (
          <button className="btn mt-3 w-full bg-lime py-1.5" disabled={busy} onClick={() => friendOp("accept")}>
            Accept friend request
          </button>
        ) : (
          <button className="btn mt-3 w-full bg-lime py-1.5" disabled={busy} onClick={() => friendOp("request")}>
            Add friend
          </button>
        )}
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Game">
          {GAMES.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={game === x.id}
              onClick={() => setGame(x.id)}
              className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${game === x.id ? "bg-lime" : "bg-white"}`}
            >
              {x.icon} {x.name}
            </button>
          ))}
          <span className="rounded-full border-2 border-ink/30 px-3 py-0.5 text-sm font-bold text-ink/40">More games soon</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={g.wins} label="wins" />
          <Stat value={`${winRate}%`} label="win rate" />
          <Stat value={g.top3} label="top 3" />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-ink/60">Biggest pot</p>
            <p className="font-display text-2xl font-extrabold tabular">{g.biggestPot.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink/60">Best hand{g.bestHand ? `: ${g.bestHand.name.split(",")[0]}` : ""}</p>
            {g.bestHand ? <MiniCards cards={g.bestHand.cards} /> : <p className="text-sm text-ink/50">None shown yet</p>}
          </div>
        </div>
        <h3 className="mb-1 mt-4 text-sm font-bold">Recent games</h3>
        {summary.recent.filter((r) => r.game === game).length === 0 && <p className="text-sm text-ink/60">No games yet.</p>}
        <ul className="space-y-1.5">
          {summary.recent
            .filter((r) => r.game === game)
            .map((r, i) => (
              <li key={i} className={`flex items-center gap-2 rounded-xl border-2 border-ink px-2 py-1 text-sm ${r.practice ? "opacity-70" : ""}`}>
                <span className={`rounded-full border-2 border-ink px-2 text-xs font-bold ${r.won ? "bg-lime" : "bg-white"}`}>{ord(r.place)}</span>
                <span className="flex-1">
                  {r.practice ? `Practice with ${r.bots} bot${r.bots === 1 ? "" : "s"}` : `${r.people} players${r.bots ? ` + ${r.bots} bot${r.bots === 1 ? "" : "s"}` : ""}`}
                  {!r.practice && !r.ranked && <span className="text-ink/50"> · not ranked</span>}
                </span>
                <span className="text-xs text-ink/60">{when(r.finished_at)}</span>
              </li>
            ))}
        </ul>
        <p className="mt-2 text-xs text-ink/60">Practice games with bots show here but don&apos;t count for leaderboards.</p>
      </Card>
    </Page>
  );
}
