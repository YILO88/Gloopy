"use client";
// /friends: find people by @username, share my friend link, answer requests, see my friends.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, ErrorNote, Page } from "@/components/AccountUI";
import { Gloop } from "@/components/Gloop";
import { useMe } from "@/lib/client/account";
import { api } from "@/lib/client/api";

interface Person {
  username: string;
  displayName: string;
  avatar: string;
}
interface FriendsResponse {
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
}

export default function FriendsPage() {
  const { me } = useMe();
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<FriendsResponse>("/api/friends").then(setData, (e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    if (me?.profile) load();
  }, [me, load]);

  const op = async (o: string, username: string) => {
    setError(null);
    setNote(null);
    try {
      const r = await api<{ status: string }>("/api/friends", { op: o, username });
      if (o === "request") setNote(r.status === "friends" ? `You and @${username} are now friends.` : `Request sent to @${username}.`);
      setSearch("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shareLink = async () => {
    const link = `${window.location.origin}/u/${me!.profile!.username}`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  };

  if (me && !me.profile)
    return (
      <Page title="Friends">
        <Card className="text-center">
          <Gloop id="berry" face="happy" size={80} className="mx-auto" />
          <p className="my-2">Create a free account to add friends and see how you stack up.</p>
          <Link href="/account?next=/friends" className="btn inline-block bg-lime px-5 py-2 text-lg">
            Sign in
          </Link>
        </Card>
      </Page>
    );

  const Row = ({ p, children }: { p: Person; children?: React.ReactNode }) => (
    <li className="flex items-center gap-3 rounded-2xl border-[3px] border-ink px-2 py-1.5">
      <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Gloop id={p.avatar} size={34} />
        <span className="min-w-0">
          <span className="block truncate font-bold">{p.displayName}</span>
          <span className="block truncate text-xs text-ink/60">@{p.username}</span>
        </span>
      </Link>
      {children}
    </li>
  );

  return (
    <Page title="Friends">
      <Card>
        <div className="flex gap-2">
          <div className="field flex min-w-0 flex-1 items-center gap-1">
            <span className="text-ink/50">@</span>
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="username"
              value={search}
              autoCapitalize="none"
              onChange={(e) => setSearch(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && search && op("request", search)}
              aria-label="Friend's username"
            />
          </div>
          <button className="btn bg-gum px-4" disabled={search.length < 3} onClick={() => op("request", search)}>
            Add
          </button>
        </div>
        <button className="btn mt-3 w-full bg-lime py-2 text-lg" disabled={!me?.profile} onClick={shareLink}>
          {copied ? "Link copied" : "Share my friend link"}
        </button>
        <p className="mt-1.5 text-center text-xs text-ink/60">Paste it in Discord. Opening it lets them add you.</p>
        <div className="mt-2 space-y-2">
          <ErrorNote text={error} />
          {note && <p className="rounded-xl bg-mist px-3 py-2 text-sm font-medium">{note}</p>}
        </div>
      </Card>

      {!!data?.incoming.length && (
        <Card>
          <h2 className="mb-2 font-display text-xl font-extrabold">Requests</h2>
          <ul className="space-y-2">
            {data.incoming.map((p) => (
              <Row key={p.username} p={p}>
                <button className="btn bg-lime px-3 py-0.5 text-sm" onClick={() => op("accept", p.username)}>
                  Accept
                </button>
                <button className="grid h-8 w-8 place-items-center rounded-full border-2 border-ink text-sm font-bold" onClick={() => op("decline", p.username)} aria-label={`Decline ${p.displayName}`}>
                  ✕
                </button>
              </Row>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 flex items-center justify-between font-display text-xl font-extrabold">
          My friends <span className="font-sans text-sm font-medium text-ink/60">{data?.friends.length ?? ""}</span>
        </h2>
        {data && data.friends.length === 0 && <p className="text-sm text-ink/60">No friends yet. Add someone by username or share your link.</p>}
        <ul className="space-y-2">
          {data?.friends.map((p) => (
            <Row key={p.username} p={p} />
          ))}
        </ul>
        {!!data?.outgoing.length && (
          <>
            <h3 className="mb-1 mt-4 text-sm font-bold">Waiting for them to accept</h3>
            <ul className="space-y-2">
              {data.outgoing.map((p) => (
                <Row key={p.username} p={p}>
                  <button className="text-xs underline" onClick={() => op("remove", p.username)}>
                    Cancel
                  </button>
                </Row>
              ))}
            </ul>
          </>
        )}
      </Card>
    </Page>
  );
}
