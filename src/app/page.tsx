"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMe } from "@/lib/client/account";
import { ProfilePicker } from "@/components/ProfilePicker";
import { Gloop } from "@/components/Gloop";
import { PlayingCard } from "@/components/PlayingCard";
import { RulesButton } from "@/components/Rules";
import { GLOOPS } from "@/lib/gloops";
import { api, loadProfile, saveProfile } from "@/lib/client/api";
import { sounds } from "@/lib/client/sound";

const HOW_TO = [
  { gloop: "sun", face: "happy" as const, title: "Make a table", text: "Pick a Gloop and a nickname, then create a table. You're the host." },
  { gloop: "sky", face: "smug" as const, title: "Share the link", text: "Send the link to your friends. Up to 9 can sit down; everyone else watches." },
  { gloop: "berry", face: "laugh" as const, title: "Play Hold'em", text: "Blinds double as the game goes on. Last one with chips wins." },
];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(GLOOPS[0].id);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const { me } = useMe();
  const account = me?.profile ?? null;

  useEffect(() => {
    if (account) {
      // Signed in: always play as my account's name and Gloop.
      setName(account.displayName);
      setAvatar(account.avatar);
      return;
    }
    const p = loadProfile();
    if (p) {
      setName(p.name);
      setAvatar(p.avatar);
    } else setAvatar(GLOOPS[Math.floor(Math.random() * GLOOPS.length)].id);
  }, [account]);

  const ready = name.trim().length > 0;

  async function create() {
    if (!ready) return setError("Pick a nickname first");
    sounds.unlock();
    setBusy(true);
    setError(null);
    saveProfile({ name: name.trim(), avatar });
    try {
      const res = await api<{ code: string }>("/api/rooms", { name: name.trim(), avatar });
      router.push(`/t/${res.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function join() {
    if (!ready) return setError("Pick a nickname first");
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return setError("Type the table code your friend sent you");
    sounds.unlock();
    saveProfile({ name: name.trim(), avatar });
    router.push(`/t/${c}`);
  }

  const h = HOW_TO[step];

  return (
    <main className="relative min-h-dvh overflow-hidden px-4 pb-10 pt-8">
      {/* pond blobs */}
      <div aria-hidden className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-pond-deep" />
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-pond-deep" />

      <div className="relative mx-auto -mt-4 mb-2 flex max-w-4xl justify-end">
        {account ? (
          <Link href={`/u/${account.username}`} className="btn flex items-center gap-1.5 bg-white py-0.5 pl-1 pr-3 text-base" aria-label="My profile">
            <Gloop id={account.avatar} size={28} /> @{account.username}
          </Link>
        ) : (
          <Link href="/account" className="btn bg-white px-3 py-0.5 text-base">
            Sign in
          </Link>
        )}
      </div>
      <header className="relative mx-auto mb-6 flex max-w-4xl items-end justify-center gap-3">
        <h1 className="font-display text-6xl font-extrabold leading-none tracking-tight text-lime [text-shadow:0_4px_0_#1c1b3a] sm:text-7xl">
          gloopy
        </h1>
        <div className="mb-1 flex -space-x-3">
          <div className="rotate-[-10deg]">
            <PlayingCard card="As" size="board" />
          </div>
          <div className="rotate-[8deg]">
            <PlayingCard card="Kh" size="board" />
          </div>
        </div>
      </header>
      <p className="relative mb-8 text-center text-lg font-medium text-white">Poker night with your people. One link, no download.</p>

      <div className="relative mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.15fr_1fr]">
        <section className="sticker p-5 sm:p-6" aria-labelledby="you">
          <h2 id="you" className="sr-only">
            Your Gloop
          </h2>
          {account ? (
            <div className="flex items-center gap-3">
              <Gloop id={account.avatar} size={72} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-2xl font-extrabold">{account.displayName}</p>
                <p className="text-sm text-ink/60">@{account.username} · ready to play</p>
              </div>
              <Link href="/account" className="text-sm underline">
                Edit
              </Link>
            </div>
          ) : (
            <ProfilePicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
          )}
          <button className="btn mt-5 w-full bg-lime py-3 text-2xl text-ink" onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create table"}
          </button>
          <div className="mt-4 flex gap-2">
            <input
              className="field min-w-0 flex-1 uppercase tracking-widest"
              placeholder="Table code"
              value={code}
              maxLength={8}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
              aria-label="Table code"
            />
            <button className="btn bg-gum px-5 text-xl text-ink" onClick={join}>
              Join
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-[#ffe1e1] px-3 py-2 font-medium text-[#a1122a]">
              {error}
            </p>
          )}
        </section>

        {me && (
          <div className="md:col-span-2 md:order-last">
            {account ? (
              <nav className="grid grid-cols-3 gap-3" aria-label="Your Gloopy">
                {[
                  ["/leaderboard", "🏆", "Leaderboards"],
                  ["/friends", "👯", "Friends"],
                  [`/u/${account.username}`, "", "Profile"],
                ].map(([href, icon, label]) => (
                  <Link key={href} href={href} className="sticker flex flex-col items-center gap-1 px-1 py-3 text-center font-display text-sm font-extrabold sm:text-lg">
                    {icon ? <span className="text-3xl leading-none">{icon}</span> : <Gloop id={account.avatar} size={32} />}
                    {label}
                  </Link>
                ))}
              </nav>
            ) : (
              <Link href="/account" className="sticker flex items-center gap-3 bg-lime p-4">
                <Gloop id="sun" face="cool" size={52} />
                <span className="flex-1">
                  <span className="block font-display text-xl font-extrabold">Track your wins</span>
                  <span className="block text-sm">Free account: stats, friends and leaderboards. Guests can keep playing as now.</span>
                </span>
                <span className="font-display text-3xl font-extrabold">›</span>
              </Link>
            )}
          </div>
        )}

        <section className="sticker flex flex-col p-5 sm:p-6" aria-labelledby="how">
          <div className="flex items-center justify-between gap-2">
            <h2 id="how" className="font-display text-2xl font-extrabold">
              How it works
            </h2>
            <RulesButton label="Rules and winning hands" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
            <Gloop id={h.gloop} face={h.face} size={96} />
            <h3 className="font-display text-xl font-extrabold">
              {step + 1}. {h.title}
            </h3>
            <p className="max-w-xs">{h.text}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button className="btn bg-mist px-3 text-lg" onClick={() => setStep((s) => (s + 2) % 3)} aria-label="Previous step">
              ‹
            </button>
            {HOW_TO.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Step ${i + 1}`}
                className={`h-3 w-3 rounded-full border-2 border-ink ${i === step ? "bg-ink" : "bg-white"}`}
              />
            ))}
            <button className="btn bg-mist px-3 text-lg" onClick={() => setStep((s) => (s + 1) % 3)} aria-label="Next step">
              ›
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
