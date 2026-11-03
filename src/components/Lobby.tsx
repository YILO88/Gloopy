"use client";
import { useEffect, useState } from "react";
import { BotLevel, DEFAULT_SETTINGS, SETTING_OPTIONS, Settings } from "@/engine/game";
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
  onKick,
  onAddBots,
  onRemoveBot,
}: {
  room: PublicRoom;
  me: string;
  chat: ChatMessage[];
  busy: boolean;
  onStart: () => void;
  onLeave: () => void;
  onSettings: (s: Settings) => void;
  onChat: (kind: ChatMessage["kind"], body: string) => void;
  onKick: (id: string) => void;
  onAddBots: (count: number, level: BotLevel) => Promise<boolean>;
  onRemoveBot: (id: string) => void;
}) {
  const [botsOpen, setBotsOpen] = useState(false);
  const accounts = room.members.filter((m) => m.role === "player" && m.username).length;
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
        {host ? (
          <button className="btn bg-lime px-3 py-1 text-base lg:invisible" disabled={busy || players.length < 2} onClick={onStart}>
            Start
          </button>
        ) : (
          <span className="w-16" />
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_1fr_1fr]">
        {/* Players */}
        <Fold title={`Players ${players.length}/${s.maxSeats}`} defaultOpen>
          <ul className="space-y-2">
            {players.map((m) => (
              <li key={m.id} className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink px-2 py-1.5 ${m.id === me ? "bg-lime" : "bg-mist"}`}>
                <Gloop id={m.avatar} size={40} />
                <span className="flex-1 truncate font-display text-lg font-extrabold">
                  {m.name}
                  {m.id === me && <span className="font-sans text-sm font-medium"> (you)</span>}
                  {m.bot && (
                    <span className="ml-2 rounded-md bg-ink px-1.5 py-0.5 align-middle font-sans text-[11px] font-bold uppercase text-white">
                      Bot · {m.bot}
                    </span>
                  )}
                </span>
                {m.id === room.hostId && (
                  <span title="Host" aria-label="Host" className="text-2xl">
                    👑
                  </span>
                )}
                {host && m.bot && (
                  <button
                    className="grid h-7 w-7 place-items-center rounded-full border-2 border-ink/30 text-sm font-bold text-ink/60 hover:border-ink hover:text-ink"
                    onClick={() => onRemoveBot(m.id)}
                    aria-label={`Remove bot ${m.name}`}
                  >
                    ✕
                  </button>
                )}
                {host && m.id !== me && !m.bot && <RemoveButton name={m.name} onConfirm={() => onKick(m.id)} />}
              </li>
            ))}
            {Array.from({ length: Math.max(0, s.maxSeats - players.length) }).map((_, i) => (
              <li key={i} className="hidden items-center gap-3 rounded-2xl border-[3px] border-dashed border-ink/25 px-2 py-1.5 text-ink/40 lg:flex">
                <span className="h-10 w-10 rounded-full border-[3px] border-dashed border-ink/25" />
                <span className="font-display text-lg font-bold">Empty seat</span>
              </li>
            ))}
            {s.maxSeats > players.length && (
              <li className="rounded-2xl border-[3px] border-dashed border-ink/25 px-3 py-1.5 text-center font-display font-bold text-ink/45 lg:hidden">
                {s.maxSeats - players.length} empty {s.maxSeats - players.length === 1 ? "seat" : "seats"}
              </li>
            )}
          </ul>
          {host && players.length === 1 && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border-[3px] border-ink bg-mist p-3">
              <Gloop id="lime" face="laugh" size={44} />
              <div className="flex-1">
                <p className="font-display text-lg font-extrabold leading-tight">Play solo with bots</p>
                <p className="text-xs text-ink/70">Practice anytime. Solo games don&apos;t count for leaderboards.</p>
              </div>
              <button className="btn bg-lime px-3 py-1 text-base" onClick={() => setBotsOpen(true)}>
                Add bots
              </button>
            </div>
          )}
          {accounts > 0 && (
            <p className="mt-3 text-xs text-ink/70">
              {accounts >= 2 ? "🏆 This game counts for leaderboards." : "Leaderboards count games with 2+ players who have accounts."}
            </p>
          )}
          {waiting.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 font-display text-lg font-extrabold">Waiting room</h3>
              <ol className="space-y-1">
                {waiting.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="w-5 text-right font-bold">{i + 1}.</span>
                    <Gloop id={m.avatar} size={26} />
                    <span className="flex-1 truncate">{m.name}</span>
                    {host && <RemoveButton name={m.name} onConfirm={() => onKick(m.id)} />}
                  </li>
                ))}
              </ol>
            </>
          )}
        </Fold>

        {host && (
          <Fold title="Add bots" open={botsOpen} onToggle={setBotsOpen}>
            <AddBots free={s.maxSeats - players.length} busy={busy} onAdd={onAddBots} />
          </Fold>
        )}

        {/* Table setup */}
        <Fold title="Table setup" defaultOpen={host} className="flex flex-col">
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
                {players.length < 2 && <p className="mt-2 text-center text-sm">Share the link or add bots. You need at least 2 players.</p>}
              </>
            ) : (
              <p className="rounded-2xl bg-mist p-3 text-center font-display text-lg font-bold">Waiting for {hostName} to start…</p>
            )}
          </div>
        </Fold>

        {/* Chat */}
        <Fold title={`Chat${chat.length ? ` (${chat.length})` : ""}`} flush>
          <Chat messages={chat} me={me} onSend={onChat} mood="lobby" className="h-[380px] lg:h-[520px]" />
        </Fold>
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

/** A panel that folds up on phones (tap the title) and is always open on wide screens. */
function Fold({
  title,
  defaultOpen = false,
  flush = false,
  className = "",
  open: openProp,
  onToggle,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  flush?: boolean;
  className?: string;
  /** Optional: control the fold from outside (e.g. a button elsewhere opens it). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const setOpen = (f: (o: boolean) => boolean) => (onToggle ? onToggle(f(open)) : setOwnOpen(f));
  return (
    <section className={`sticker overflow-hidden ${flush ? "flex flex-col" : ""}`}>
      <h2>
        <button
          className={`flex w-full items-center justify-between px-4 py-3 text-left font-display text-2xl font-extrabold lg:pointer-events-none ${flush ? "border-b-[3px] border-ink" : ""}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {title}
          <span className={`text-xl transition-transform lg:hidden ${open ? "rotate-180" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
      </h2>
      <div className={`${open ? "" : "hidden"} lg:block ${flush ? "min-h-0 flex-1" : `px-4 pb-4 ${className}`}`}>{children}</div>
    </section>
  );
}

/** Host-only "remove" button. First tap asks, second tap confirms. */
function RemoveButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 3000);
    return () => clearTimeout(t);
  }, [sure]);
  return sure ? (
    <button className="rounded-full border-2 border-ink bg-[#ff5b5b] px-2 py-0.5 text-xs font-bold text-white" onClick={onConfirm}>
      Remove?
    </button>
  ) : (
    <button
      className="grid h-7 w-7 place-items-center rounded-full border-2 border-ink/30 text-sm font-bold text-ink/60 hover:border-ink hover:text-ink"
      onClick={() => setSure(true)}
      aria-label={`Remove ${name} from the table`}
      title={`Remove ${name}`}
    >
      ✕
    </button>
  );
}

/** Host-only: fill empty seats with bots. How many, and how good. */
function AddBots({ free, busy, onAdd }: { free: number; busy: boolean; onAdd: (count: number, level: BotLevel) => Promise<boolean> }) {
  const [count, setCount] = useState(1);
  const [level, setLevel] = useState<BotLevel>("normal");
  const n = Math.max(1, Math.min(count, Math.max(1, free)));
  if (free <= 0) return <p className="text-sm text-ink/70">Every seat is taken. Remove a bot or add seats in Table setup.</p>;
  return (
    <div>
      <p className="mb-3 text-sm text-ink/70">Fill empty seats with computer players. Only you (the host) can add them.</p>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold">How many</span>
        <div className="flex items-center gap-3">
          <button className="btn grid h-10 w-10 place-items-center rounded-full bg-white p-0 text-2xl" onClick={() => setCount(n - 1)} disabled={n <= 1} aria-label="Fewer bots">
            −
          </button>
          <span className="w-8 text-center font-display text-3xl font-extrabold tabular" aria-live="polite">
            {n}
          </span>
          <button className="btn grid h-10 w-10 place-items-center rounded-full bg-white p-0 text-2xl" onClick={() => setCount(n + 1)} disabled={n >= free} aria-label="More bots">
            +
          </button>
        </div>
      </div>
      <p className="mb-1.5 font-bold">How good</p>
      <div className="flex overflow-hidden rounded-2xl border-[3px] border-ink" role="radiogroup" aria-label="Bot difficulty">
        {(["easy", "normal", "hard"] as BotLevel[]).map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={level === l}
            onClick={() => setLevel(l)}
            className={`flex-1 border-r-2 border-ink py-2 font-display text-lg font-extrabold capitalize last:border-r-0 ${level === l ? "bg-lime" : "bg-white"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ink/60">
        {level === "easy" ? "Calls a lot, rarely bluffs. Good for learning." : level === "normal" ? "Plays the odds. A fair game." : "Bets big hands hard and bluffs sometimes."}
      </p>
      <button className="btn mt-3 w-full bg-lime py-2 text-xl" disabled={busy} onClick={() => onAdd(n, level).then((ok) => ok && setCount(1))}>
        Add {n} bot{n === 1 ? "" : "s"}
      </button>
    </div>
  );
}
