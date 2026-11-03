"use client";
/** Shared pieces for the account screens (sign in, profile, friends, leaderboards). Gloopy-wide, not poker-only. */
import Link from "next/link";
import { useState } from "react";
import { DEV } from "@/lib/client/api";
import { Provider, sendEmailCode, signInWith, verifyEmailCode } from "@/lib/client/account";
import { Gloop } from "./Gloop";

export function Page({ title, back = "/", children }: { title: string; back?: string; children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden px-4 pb-10 pt-4">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-pond-deep" />
      <header className="relative mx-auto mb-4 flex max-w-xl items-center justify-between gap-3">
        <Link href={back} className="btn shrink-0 whitespace-nowrap bg-white px-3 py-1 text-base">
          ‹ Back
        </Link>
        <h1 className="truncate font-display text-2xl font-extrabold text-white [text-shadow:0_3px_0_#1c1b3a] sm:text-3xl">{title}</h1>
        <span className="w-[72px] shrink-0" />
      </header>
      <div className="relative mx-auto max-w-xl space-y-4">{children}</div>
    </main>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`sticker p-4 ${className}`}>{children}</section>;
}

export function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border-2 border-ink bg-mist px-2 py-2 text-center">
      <div className="font-display text-2xl font-extrabold leading-none tabular">{value}</div>
      <div className="mt-1 text-[11px] leading-tight">{label}</div>
    </div>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl bg-[#ffe1e1] px-3 py-2 text-sm font-medium text-[#a1122a]">
      {text}
    </p>
  );
}

const DiscordIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#fff"
      d="M20 5.5A17 17 0 0 0 15.7 4l-.5 1a15 15 0 0 0-6.4 0L8.3 4A17 17 0 0 0 4 5.5C1.4 9.4.7 13.2 1 17a17 17 0 0 0 5.2 2.6l1.1-1.7c-.6-.2-1.2-.5-1.7-.9l.4-.3a12 12 0 0 0 12 0l.4.3c-.5.4-1.1.7-1.7.9l1.1 1.7A17 17 0 0 0 23 17c.4-4.4-.7-8.2-3-11.5ZM8.5 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z"
    />
  </svg>
);
const GoogleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8Z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
  </svg>
);

/** Discord, Google, or a 6-digit email code. No passwords. (Apple: planned, not built yet.) */
export function SignInPanel({ next, onSignedIn }: { next: string; onSignedIn: () => void }) {
  const [busy, setBusy] = useState<Provider | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"link" | "signin" | null>(null);
  const [code, setCode] = useState("");

  const go = async (p: Provider) => {
    setBusy(p);
    setError(null);
    try {
      await signInWith(p, next);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  const send = async () => {
    setBusy("email");
    setError(null);
    try {
      setMode(await sendEmailCode(email));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };
  const verify = async () => {
    setBusy("email");
    setError(null);
    try {
      await verifyEmailCode(email, code, mode!);
      onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Card>
      <div className="flex flex-col items-center text-center">
        <Gloop id="sun" face="cool" size={78} />
        <h2 className="font-display text-2xl font-extrabold">Save your wins</h2>
        <p className="mb-3 text-sm text-ink/70">One tap, no password. Your stats, friends and leaderboards follow you to any device.</p>
      </div>
      <button className="btn flex w-full items-center justify-center gap-2 bg-[#5865F2] py-2.5 text-lg text-white" disabled={!!busy} onClick={() => go("discord")}>
        <DiscordIcon /> {busy === "discord" ? "Opening Discord…" : "Continue with Discord"}
      </button>
      <button className="btn mt-3 flex w-full items-center justify-center gap-2 bg-white py-2.5 text-lg" disabled={!!busy} onClick={() => go("google")}>
        <GoogleIcon /> {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <div className="my-4 flex items-center gap-2 text-sm text-ink/50">
        <span className="h-0.5 flex-1 bg-ink/15" />
        or
        <span className="h-0.5 flex-1 bg-ink/15" />
      </div>
      {mode === null ? (
        <>
          <input
            className="field w-full"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label="Email"
          />
          <button className="btn mt-3 w-full bg-mist py-2 text-lg" disabled={!!busy || !email.trim()} onClick={send}>
            {busy === "email" ? "Sending…" : "Email me a 6-digit code"}
          </button>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm">
            We sent a code to <b>{email}</b>. {DEV && "(Test mode: any 6 digits work.)"}
          </p>
          <input
            className="field w-full text-center font-display text-3xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="······"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            aria-label="6-digit code"
          />
          <button className="btn mt-3 w-full bg-lime py-2 text-lg" disabled={!!busy || code.length !== 6} onClick={verify}>
            {busy === "email" ? "Checking…" : "Sign in"}
          </button>
          <button className="mt-2 w-full text-sm underline" onClick={() => (setMode(null), setCode(""))}>
            Use a different email
          </button>
        </>
      )}
      <div className="mt-3">
        <ErrorNote text={error} />
      </div>
      <Link href={next.startsWith("/account") ? "/" : next} className="mt-3 block text-center text-sm underline">
        Keep playing as a guest
      </Link>
    </Card>
  );
}

/** Mini playing cards for a best hand (profile). */
export function MiniCards({ cards }: { cards: string[] }) {
  const sym: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  return (
    <span className="inline-flex gap-1">
      {cards.map((c) => (
        <span
          key={c}
          className={`grid h-9 w-7 place-items-center rounded-md border-2 border-ink bg-white text-[11px] font-bold leading-none ${c[1] === "h" || c[1] === "d" ? "text-[#d4202f]" : ""}`}
        >
          {c[0] === "T" ? "10" : c[0]}
          <br />
          {sym[c[1]]}
        </span>
      ))}
    </span>
  );
}
