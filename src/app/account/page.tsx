"use client";
// /account: sign in (guests), set up or edit my profile, sign out. Gloopy-wide.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, ErrorNote, Page, SignInPanel } from "@/components/AccountUI";
import { Gloop } from "@/components/Gloop";
import { ProfilePicker } from "@/components/ProfilePicker";
import { saveMyProfile, signOut, useMe } from "@/lib/client/account";
import { loadProfile, saveProfile } from "@/lib/client/api";
import { GLOOPS } from "@/lib/gloops";

export default function AccountPage() {
  return (
    <Suspense>
      <Account />
    </Suspense>
  );
}

function Account() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "";
  const { me, error, refresh } = useMe();

  if (!me)
    return (
      <Page title="Account">
        <Card>{error ? <ErrorNote text={error} /> : <p className="text-center font-display text-xl font-extrabold">Loading…</p>}</Card>
      </Page>
    );

  if (me.guest)
    return (
      <Page title="Sign in" back={next || "/"}>
        <SignInPanel next={`/account${next ? `?next=${encodeURIComponent(next)}` : ""}`} onSignedIn={refresh} />
      </Page>
    );

  return (
    <Page title={me.profile ? "My account" : "Almost done"} back={next || "/"}>
      <ProfileForm
        initial={me.profile}
        onSaved={(username) => {
          if (next) router.push(next);
          else if (!me.profile) router.push(`/u/${username}`);
          else refresh();
        }}
      />
      {me.profile && (
        <Card>
          <div className="grid grid-cols-3 gap-2 text-center font-display font-extrabold">
            <Link href={`/u/${me.profile.username}`} className="btn bg-white py-2">
              My profile
            </Link>
            <Link href="/friends" className="btn bg-white py-2">
              Friends
            </Link>
            <Link href="/leaderboard" className="btn bg-white py-2">
              Leaderboards
            </Link>
          </div>
          <button className="mt-4 w-full text-sm underline" onClick={signOut}>
            Sign out
          </button>
        </Card>
      )}
    </Page>
  );
}

function ProfileForm({ initial, onSaved }: { initial: { username: string; displayName: string; avatar: string } | null; onSaved: (username: string) => void }) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [name, setName] = useState(initial?.displayName ?? "");
  const [avatar, setAvatar] = useState(initial?.avatar ?? GLOOPS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initial) return;
    // New account: start from the guest nickname and Gloop they already use.
    const p = loadProfile();
    if (p) {
      setName(p.name);
      setAvatar(p.avatar);
      setUsername(p.name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16));
    }
  }, [initial]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { profile } = await saveMyProfile({ username, displayName: name, avatar });
      saveProfile({ name: profile.displayName, avatar: profile.avatar });
      setSaved(true);
      onSaved(profile.username);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Card>
      {!initial && (
        <div className="mb-3 flex items-center gap-3">
          <Gloop id="mint" face="laugh" size={52} />
          <p className="text-sm">
            <b>You&apos;re signed in.</b> Pick a username so friends can find you. Your name and Gloop are used at every table.
          </p>
        </div>
      )}
      <ProfilePicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">Username</span>
        <div className="field flex items-center gap-1 text-lg">
          <span className="text-ink/50">@</span>
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            value={username}
            maxLength={16}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="ada"
            autoCapitalize="none"
            aria-label="Username"
          />
        </div>
        <span className="mt-1 block text-xs text-ink/60">3–16 letters, numbers or _. Friends add you with this.</span>
      </label>
      <button className="btn mt-4 w-full bg-lime py-2.5 text-xl" disabled={busy || username.length < 3 || !name.trim()} onClick={save}>
        {busy ? "Saving…" : initial ? (saved ? "Saved" : "Save changes") : "Done"}
      </button>
      <div className="mt-3">
        <ErrorNote text={error} />
      </div>
    </Card>
  );
}
