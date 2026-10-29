"use client";
import { useState } from "react";
import { DEFAULT_SETTINGS, SETTING_OPTIONS, Settings } from "@/engine/game";
import type { PublicRoom } from "@/lib/ops";
import type { ChatMessage } from "@/lib/client/useRoom";
import { Gloop } from "./Gloop";
import { Chat } from "./Chat";

const fmtSec = (s: number) => (s < 60 ? `${s} seconds` : s % 60 === 0 ? `${s / 60} minute${s === 60 ? "" : "s"}` : `${s} seconds`);

export function Lobby({
  room,
  me,
  chat,
  busy,
  onStart,
  onLeave,
  onSettings,
  onChat,
}: {
  room: PublicRoom;
  me: string;
  chat: ChatMessage[];
  busy: boolean;
  onStart: () => void;
  onLeave: () => void;
  onSettings: (s: Settings) => void;
  onChat: (kind: ChatMessage["kind"], body: string) => void;
}) {
  const host = room.hostId === me;
  const players = room.members.filter((m) => m.role === "player").sort((a, b) => a.joinedAt - b.joinedAt);
  const waiting = room.members.filter((m) => m.role === "waiting").sort((a, b) => a.joinedAt - b.joinedAt);
  const hostName = room.members.find((m) => m.id === room.hostId)?.name ?? "the host";
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/t/${room.code}` : "";
  const s = room.settings;

  const copy = async () => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Gloopy poker", text: "Join my poker table", url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  };

  const set = (patch: Partial<Settings>) => onSettings({ ...s, ...patch });

  return (
    <main className="min-h-dvh px-3 pb-8 pt-4 sm:px-6">
      <header className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-3">
        <button onClick={onLeave} className="btn bg-white px-3 py-1 text-base">
          Leave
        </button>
        <span className="font-display text-4xl font-extrabold text-lime [text-shadow:0_3px_0_#1c1b3a]">gloopy</span>
        <span className="w-16" />
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_1fr_1fr]">
        {/* Players */}
        <section className="sticker p-4" aria-labelledby="players-h">
          <h2 id="players-h" className="mb-3 font-display text-2xl font-extrabold">
            Players {players.length}/{s.maxSeats}
          </h2>
          <ul className="space-y-2">
            {players.map((m) => (
              <li key={m.id} className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink px-2 py-1.5 ${m.id === me ? "bg-lime" : "bg-mist"}`}>
                <Gloop id={m.avatar} size={40} />
                <span className="flex-1 truncate font-display text-lg font-extrabold">
                  {m.name}
                  {m.id === me && <span className="font-sans text-sm font-medium"> (you)</span>}
                </span>
                {m.id === room.hostId && (
                  <span title="Host" aria-label="Host" className="text-2xl">
                    👑
                  </span>
                )}
              </li>
            ))}
            {Array.from({ length: Math.max(0, s.maxSeats - players.length) }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl border-[3px] border-dashed border-ink/25 px-2 py-1.5 text-ink/40">
                <span className="h-10 w-10 rounded-full border-[3px] border-dashed border-ink/25" />
                <span className="font-display text-lg font-bold">Empty seat</span>
              </li>
            ))}
          </ul>
          {waiting.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 font-display text-lg font-extrabold">Waiting room</h3>
              <ol className="space-y-1">
                {waiting.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="w-5 text-right font-bold">{i + 1}.</span>
                    <Gloop id={m.avatar} size={26} />
                    <span className="truncate">{m.name}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        {/* Table setup */}
        <section className="sticker flex flex-col p-4" aria-labelledby="setup-h">
          <h2 id="setup-h" className="font-display text-2xl font-extrabold">
            Table setup
          </h2>
          <p className="mb-3 text-sm text-ink/70">{host ? "You're the host. Set the table, then start." : `${hostName} sets the table.`}</p>

          <div className="mb-4 rounded-2xl border-[3px] border-ink bg-mist p-3 text-center">
            <p className="text-sm">Table code</p>
            <p className="font-display text-4xl font-extrabold tracking-[0.2em]">{room.code}</p>
            <button onClick={copy} className="btn mt-2 bg-gum px-4 py-1 text-lg">
              {copied ? "Link copied" : "Share link"}
            </button>
          </div>

          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
            <Row label="Seats" host={host} value={String(s.maxSeats)} options={SETTING_OPTIONS.maxSeats.map((n) => [String(n), String(n)])} onChange={(v) => set({ maxSeats: +v })} />
            <Row label="Starting chips" host={host} value={String(s.startingChips)} options={SETTING_OPTIONS.startingChips.map((n) => [String(n), n.toLocaleString()])} onChange={(v) => set({ startingChips: +v })} />
            <Row
              label="Starting blinds"
              host={host}
              value={`${s.smallBlind}/${s.bigBlind}`}
              options={SETTING_OPTIONS.blinds.map(([a, b]) => [`${a}/${b}`, `${a} / ${b}`])}
              onChange={(v) => {
                const [a, b] = v.split("/").map(Number);
                set({ smallBlind: a, bigBlind: b });
              }}
            />
            <Row label="Blinds double every" host={host} value={String(s.blindIntervalSec)} options={SETTING_OPTIONS.blindIntervalSec.map((n) => [String(n), fmtSec(n)])} onChange={(v) => set({ blindIntervalSec: +v })} />
            <Row label="Turn timer" host={host} value={String(s.turnSeconds)} options={SETTING_OPTIONS.turnSeconds.map((n) => [String(n), `${n} seconds`])} onChange={(v) => set({ turnSeconds: +v })} />
            <Row
              label="Game ends"
              host={host}
              value={s.endMode}
              options={[
                ["last", "Last one standing"],
                ["timed", "Time limit"],
              ]}
              onChange={(v) => set({ endMode: v as Settings["endMode"] })}
            />
            {s.endMode === "timed" && (
              <Row label="Time limit" host={host} value={String(s.timeLimitMin)} options={SETTING_OPTIONS.timeLimitMin.map((n) => [String(n), `${n} minutes`])} onChange={(v) => set({ timeLimitMin: +v })} />
            )}
          </dl>
          {host && JSON.stringify(s) !== JSON.stringify(DEFAULT_SETTINGS) && (
            <button className="mt-2 self-start text-sm underline" onClick={() => onSettings(DEFAULT_SETTINGS)}>
              Reset to defaults
            </button>
          )}

          <div className="mt-auto pt-5">
            {host ? (
              <>
                <button className="btn w-full bg-lime py-3 text-2xl" disabled={busy || players.length < 2} onClick={onStart}>
                  Start game
                </button>
                {players.length < 2 && <p className="mt-2 text-center text-sm">Share the link. You need at least 2 players.</p>}
              </>
            ) : (
              <p className="rounded-2xl bg-mist p-3 text-center font-display text-lg font-bold">Waiting for {hostName} to start…</p>
            )}
          </div>
        </section>

        {/* Chat */}
        <section className="sticker flex h-[460px] flex-col overflow-hidden lg:h-auto" aria-label="Chat">
          <h2 className="border-b-[3px] border-ink px-4 py-2 font-display text-2xl font-extrabold">Chat</h2>
          <Chat messages={chat} me={me} onSend={onChat} mood="lobby" className="flex-1" />
        </section>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  options,
  host,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  host: boolean;
  onChange: (v: string) => void;
}) {
  const shown = options.find((o) => o[0] === value)?.[1] ?? value;
  return (
    <>
      <dt className="font-medium">{label}</dt>
      <dd>
        {host ? (
          <select className="field w-full py-1.5" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-display text-lg font-bold">{shown}</span>
        )}
      </dd>
    </>
  );
}
