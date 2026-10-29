"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, PublicSeat } from "@/engine/game";
import { describeHand } from "@/engine/evaluate";
import type { PublicRoom } from "@/lib/ops";
import type { ChatMessage } from "@/lib/client/useRoom";
import { sounds, isMuted, setMuted } from "@/lib/client/sound";
import { Gloop, Face } from "./Gloop";
import { PlayingCard } from "./PlayingCard";
import { Chat } from "./Chat";
import { StickerArt } from "./Sticker";

function useNow(ms: number, serverNow: () => number) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms, serverNow]);
  return now;
}

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Table(props: {
  room: PublicRoom;
  me: string;
  myCards: string[];
  chat: ChatMessage[];
  busy: boolean;
  error: string | null;
  serverNow: () => number;
  onAct: (a: Action) => Promise<boolean>;
  onChat: (kind: ChatMessage["kind"], body: string) => void;
  onLeave: () => void;
  children?: React.ReactNode; // results overlay
}) {
  const { room, me, myCards, chat, serverNow } = props;
  const g = room.game!;
  const now = useNow(250, serverNow);
  const [chatOpen, setChatOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);

  const mySeat = g.seats.find((s) => s.id === me);
  const watching = !mySeat || mySeat.status !== "playing";
  const myTurn = g.toAct === me;

  // Your-turn ping.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) sounds.yourTurn();
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  // Rotate seats so I'm at the bottom (watchers see seat 0 at the bottom).
  const ordered = useMemo(() => {
    const seats = [...g.seats].sort((a, b) => a.seat - b.seat);
    const idx = Math.max(0, seats.findIndex((s) => s.id === me));
    return [...seats.slice(idx), ...seats.slice(0, idx)];
  }, [g.seats, me]);

  // Sticker reactions popping over seats.
  const mountedAt = useRef(Date.now());
  const [pops, setPops] = useState<Record<string, { id: number; sticker: string }>>({});
  const seen = useRef(new Set<number>());
  useEffect(() => {
    for (const m of chat) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (m.kind !== "sticker" || new Date(m.created_at).getTime() < mountedAt.current - 5000) continue;
      setPops((p) => ({ ...p, [m.sender_id]: { id: m.id, sticker: m.body } }));
      setTimeout(
        () =>
          setPops((p) => {
            if (p[m.sender_id]?.id !== m.id) return p;
            const rest = { ...p };
            delete rest[m.sender_id];
            return rest;
          }),
        2700,
      );
    }
  }, [chat]);

  // Unread chat badge on phones.
  const [readCount, setReadCount] = useState(chat.length);
  useEffect(() => {
    if (chatOpen) setReadCount(chat.length);
  }, [chatOpen, chat.length]);
  const unread = Math.max(0, chat.length - readCount);

  const nextBlindsIn = (() => {
    const iv = g.settings.blindIntervalSec * 1000;
    const elapsed = now - g.startedAt;
    return iv - (elapsed % iv);
  })();
  const timeLeft = g.settings.endMode === "timed" ? g.startedAt + g.settings.timeLimitMin * 60000 - now : null;

  const result = g.street === "complete" ? g.result : null;
  const winnerLine = useMemo(() => {
    if (!result) return null;
    const names = (ids: string[]) => ids.map((id) => g.seats.find((s) => s.id === id)?.name ?? "?").join(" and ");
    return result.pots.map((p, i) => {
      const who = names(p.winners);
      const label = result.pots.length > 1 ? (i === 0 ? "main pot" : "side pot") : "the pot";
      return `${who} ${p.winners.length > 1 ? "split" : "wins"} ${label} (${p.amount.toLocaleString()})${p.handName ? ` with ${p.handName}` : ""}`;
    });
  }, [result, g.seats]);

  const handName = myCards.length === 2 ? describeHand([...myCards, ...g.board]) : null;

  return (
    <div className="flex h-dvh flex-col bg-room text-chalk">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2 text-sm">
        <button onClick={props.onLeave} className="rounded-lg px-2 py-1 text-dim hover:text-chalk" aria-label="Leave table">
          ← <span className="hidden sm:inline">Leave</span>
        </button>
        <span className="font-display text-xl font-extrabold text-lime">gloopy</span>
        <span className="hidden text-dim sm:inline">Table {room.code}</span>
        <div className="ml-auto flex items-center gap-4 tabular">
          <span className="whitespace-nowrap">
            <span className="hidden sm:inline">Blinds </span>
            <b className="text-brass">{g.blinds.smallBlind}/{g.blinds.bigBlind}</b>
            <span className="text-dim"> up in {fmtClock(nextBlindsIn)}</span>
          </span>
          {timeLeft !== null && <span className="hidden sm:inline">Ends in {fmtClock(timeLeft)}</span>}
          <button
            className="rounded-lg px-2 py-1 text-dim hover:text-chalk"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            aria-pressed={muted}
            aria-label={muted ? "Sound off" : "Sound on"}
            title={muted ? "Sound off" : "Sound on"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Table area */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {watching && (
            <div className="mx-3 mt-2 rounded-xl bg-white/5 px-3 py-2 text-center text-sm text-dim">
              {mySeat?.status === "busted"
                ? "You're out of chips. You'll be dealt in next game."
                : mySeat?.status === "kicked"
                  ? "You missed 3 turns in a row, so you were taken out of this game. You can play the next one."
                  : "You're watching. You'll get a seat when the next game starts."}
            </div>
          )}
          {mySeat && mySeat.strikes > 0 && mySeat.status === "playing" && (
            <div className="mx-3 mt-2 rounded-xl bg-alert/15 px-3 py-2 text-center text-sm text-[#ffb3a8]">
              Missed turns: {mySeat.strikes} of 3. Play your next turn to stay in.
            </div>
          )}

          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
            <div className="relative aspect-[3/4] h-full max-h-full max-w-full md:aspect-[16/9]">
              {/* felt */}
              <div
                className="absolute inset-[9%_8%] rounded-[50%] md:inset-[12%_9%]"
                style={{
                  background: "radial-gradient(ellipse at 50% 40%, #2a8a5a 0%, #1e6b45 55%, #134a30 100%)",
                  boxShadow: "0 0 0 10px #5a3415, 0 0 0 12px #d4a84b, 0 0 0 18px #3d230d, 0 18px 40px rgba(0,0,0,.6)",
                }}
              />
              {/* centre: pot, board, result */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="rounded-full bg-black/35 px-3 py-0.5 text-sm tabular" aria-label="Pot">
                  Pot <b className="text-brass">{g.pot.toLocaleString()}</b>
                </div>
                <div className="flex gap-1 sm:gap-1.5" aria-label="Board">
                  {Array.from({ length: 5 }).map((_, i) =>
                    g.board[i] ? (
                      <PlayingCard
                        key={i}
                        card={g.board[i]}
                        size="board"
                        glow={!!result?.showdown && !!result.pots[0]?.winners.some((w) => result.shown[w]?.bestCards.includes(g.board[i]))}
                      />
                    ) : (
                      <div key={i} className="h-[50px] w-9 rounded-md border border-dashed border-white/15 sm:h-[60px] sm:w-11" />
                    ),
                  )}
                </div>
                {winnerLine && (
                  <div className="max-w-[80%] rounded-lg bg-black/45 px-3 py-1 text-center text-sm" role="status">
                    {winnerLine.map((l) => (
                      <div key={l}>{l}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* bets in front of each seat */}
              {ordered.map((s, i) => {
                if (s.bet <= 0) return null;
                const a = Math.PI / 2 + (i * 2 * Math.PI) / ordered.length;
                return (
                  <div
                    key={s.id + "-bet"}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-brass tabular"
                    style={{ left: `${50 + 26 * Math.cos(a)}%`, top: `${50 + 21 * Math.sin(a)}%` }}
                  >
                    {s.bet.toLocaleString()}
                  </div>
                );
              })}

              {/* seats around the oval */}
              {ordered.map((s, i) => {
                const a = Math.PI / 2 + (i * 2 * Math.PI) / ordered.length;
                const left = 50 + 44 * Math.cos(a);
                const top = 50 + (i === 0 ? 37 : 41) * Math.sin(a);
                return (
                  <SeatView
                    key={s.id}
                    seat={s}
                    me={s.id === me}
                    left={left}
                    top={top}
                    toAct={g.toAct === s.id}
                    deadline={g.deadline}
                    turnMs={g.settings.turnSeconds * 1000}
                    now={now}
                    myCards={s.id === me ? myCards : []}
                    shown={result?.shown[s.id]?.hole}
                    won={result?.won[s.id]}
                    pop={pops[s.id]?.sticker}
                  />
                );
              })}
            </div>
          </div>

          {/* actions */}
          {!watching && mySeat && (
            <ActionBar
              g={g}
              seat={mySeat}
              myTurn={myTurn}
              busy={props.busy}
              handName={handName}
              onAct={props.onAct}
              toActName={g.seats.find((s) => s.id === g.toAct)?.name}
            />
          )}
          {props.error && (
            <p role="alert" className="mx-3 mb-2 rounded-lg bg-alert/20 px-3 py-1.5 text-center text-sm text-[#ffc9c1]">
              {props.error}
            </p>
          )}

          {/* phone chat bar */}
          <button
            className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-left text-dim lg:hidden"
            onClick={() => setChatOpen(true)}
          >
            <span className="flex-1">Say hello…</span>
            {unread > 0 && <span className="rounded-full bg-gum px-2 text-xs font-bold text-ink">{unread}</span>}
            <span>Stickers</span>
          </button>
        </div>

        {/* desktop chat */}
        <aside className="hidden w-[340px] flex-col border-l border-white/10 lg:flex" aria-label="Chat">
          <h2 className="border-b border-white/10 px-4 py-2 font-semibold">Chat</h2>
          <Chat messages={chat} me={me} onSend={props.onChat} mood="table" className="flex-1" />
        </aside>
      </div>

      {/* phone chat sheet */}
      {chatOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-black/50 lg:hidden" onClick={() => setChatOpen(false)}>
          <div className="mt-auto flex h-[70dvh] flex-col rounded-t-2xl bg-room" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center border-b border-white/10 px-4 py-2">
              <h2 className="flex-1 font-semibold">Chat</h2>
              <button onClick={() => setChatOpen(false)} className="px-2 py-1 text-dim">
                Close
              </button>
            </div>
            <Chat messages={chat} me={me} onSend={props.onChat} mood="table" className="flex-1" />
          </div>
        </div>
      )}

      {props.children}
    </div>
  );
}

function SeatView({
  seat,
  me,
  left,
  top,
  toAct,
  deadline,
  turnMs,
  now,
  myCards,
  shown,
  won,
  pop,
}: {
  seat: PublicSeat;
  me: boolean;
  left: number;
  top: number;
  toAct: boolean;
  deadline: number | null;
  turnMs: number;
  now: number;
  myCards: string[];
  shown?: string[];
  won?: number;
  pop?: string;
}) {
  const out = seat.status !== "playing";
  const face: Face = out ? "sad" : won ? "laugh" : seat.folded ? "sleep" : seat.allIn ? "shock" : toAct ? "happy" : "happy";
  const remaining = toAct && deadline ? Math.max(0, deadline - now) : 0;
  const frac = toAct ? remaining / turnMs : 0;
  const R = 31;
  const L = 2 * Math.PI * R;

  return (
    // Anchored on the avatar's centre, so cards and labels hang below it.
    <div className="absolute -translate-x-1/2 -translate-y-[30px]" style={{ left: `${left}%`, top: `${top}%` }}>
      <div className={`relative flex flex-col items-center ${seat.folded || out ? "opacity-55" : ""}`}>
        {pop && (
          <div className="pop pointer-events-none absolute -top-20 left-1/2 z-20">
            <StickerArt id={pop} size={78} />
          </div>
        )}
        <div className="relative">
          <svg width="72" height="72" viewBox="0 0 72 72" className="absolute -left-[6px] -top-[6px]" aria-hidden>
            {toAct && (
              <circle
                cx="36"
                cy="36"
                r={R}
                fill="none"
                stroke={frac < 0.25 ? "#ff6b5b" : "#d4a84b"}
                strokeWidth="4"
                strokeDasharray={L}
                strokeDashoffset={L * (1 - frac)}
                transform="rotate(-90 36 36)"
                strokeLinecap="round"
              />
            )}
          </svg>
          <div className={`rounded-full ${won ? "ring-4 ring-brass" : ""}`}>
            <Gloop id={seat.avatar} face={face} size={60} title={seat.name} />
          </div>
          {seat.isButton && (
            <span className="absolute -right-2 -top-1 grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-ink shadow" title="Dealer button">
              D
            </span>
          )}
        </div>
        <div className={`-mt-1 min-w-[84px] rounded-lg px-2 py-0.5 text-center ${me ? "bg-felt-deep ring-1 ring-brass/60" : "bg-black/60"}`}>
          <div className="max-w-[96px] truncate text-xs font-semibold">{seat.name}</div>
          <div className="text-xs text-brass tabular">{out ? (seat.status === "kicked" ? "Left" : "Out") : seat.chips.toLocaleString()}</div>
        </div>
        {seat.lastAction && !out && (
          <div className="mt-0.5 rounded bg-black/50 px-1.5 text-[11px] text-dim">{toAct ? "Thinking…" : seat.lastAction}</div>
        )}
        {/* cards */}
        <div className={me ? "absolute left-[calc(100%+6px)] top-2 flex gap-1" : "mt-1 flex -space-x-2"}>
          {me && myCards.length === 2
            ? myCards.map((c) => <PlayingCard key={c} card={c} size="md" />)
            : shown
              ? shown.map((c) => <PlayingCard key={c} card={c} size="sm" />)
              : seat.inHand && !seat.folded && !out
                ? [0, 1].map((i) => <PlayingCard key={i} size="sm" />)
                : null}
        </div>
      </div>
      {won ? (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-sm font-bold text-lime tabular">+{won.toLocaleString()}</div>
      ) : null}
    </div>
  );
}

function ActionBar({
  g,
  seat,
  myTurn,
  busy,
  handName,
  onAct,
  toActName,
}: {
  g: NonNullable<PublicRoom["game"]>;
  seat: PublicSeat;
  myTurn: boolean;
  busy: boolean;
  handName: string | null;
  onAct: (a: Action) => Promise<boolean>;
  toActName?: string;
}) {
  const owe = Math.max(0, g.currentBet - seat.bet);
  const toCall = Math.min(owe, seat.chips);
  const maxTo = g.legal?.maxRaiseTo ?? seat.bet + seat.chips;
  const minTo = g.legal?.minRaiseTo ?? Math.min(g.currentBet + g.minRaise, maxTo);
  const canRaise = !!g.legal?.canRaise;
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [to, setTo] = useState(minTo);
  useEffect(() => {
    setTo(minTo);
    setRaiseOpen(false);
  }, [minTo, myTurn]);

  const potAfterCall = g.pot + toCall;
  const presets: [string, number][] = [
    ["Min", minTo],
    ["½ pot", g.currentBet + Math.floor(potAfterCall / 2)],
    ["Pot", g.currentBet + potAfterCall],
  ];
  const clamp = (x: number) => Math.max(minTo, Math.min(maxTo, Math.floor(x)));

  const act = async (a: Action) => {
    sounds.unlock();
    if (a.type !== "fold" && a.type !== "check") sounds.chip();
    await onAct(a);
  };

  if (!myTurn) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm">
        <span className="text-dim">{g.street === "complete" ? "Next hand coming up…" : toActName ? `Waiting for ${toActName}…` : ""}</span>
        {handName && <span className="font-semibold text-brass">{handName}</span>}
      </div>
    );
  }

  return (
    <div className="border-t border-white/10 px-3 py-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-lime">Your turn</span>
        {handName && <span className="font-semibold text-brass">{handName}</span>}
      </div>
      {raiseOpen && canRaise && (
        <div className="mb-3 rounded-xl bg-black/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            {presets.map(([l, v]) => (
              <button key={l} className="tbtn flex-1 bg-white/10 py-1.5 text-sm" onClick={() => setTo(clamp(v))}>
                {l}
              </button>
            ))}
            <button className="tbtn flex-1 bg-white/10 py-1.5 text-sm" onClick={() => setTo(maxTo)}>
              All in
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={minTo}
              max={maxTo}
              step={Math.max(1, Math.floor(g.blinds.smallBlind))}
              value={to}
              onChange={(e) => setTo(clamp(+e.target.value))}
              className="flex-1 accent-[#d4a84b]"
              aria-label="Raise amount"
            />
            <input
              type="number"
              className="w-24 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-right tabular"
              value={to}
              min={minTo}
              max={maxTo}
              onChange={(e) => setTo(+e.target.value)}
              onBlur={() => setTo(clamp(to))}
              aria-label="Raise to"
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <button className="tbtn bg-[#3a2a2a] text-[#ffc9c1]" disabled={busy} onClick={() => act({ type: "fold" })}>
          Fold
        </button>
        {owe === 0 ? (
          <button className="tbtn bg-felt" disabled={busy} onClick={() => act({ type: "check" })}>
            Check
          </button>
        ) : (
          <button className="tbtn bg-felt tabular" disabled={busy} onClick={() => act({ type: "call" })}>
            {toCall >= seat.chips ? `All in ${toCall.toLocaleString()}` : `Call ${toCall.toLocaleString()}`}
          </button>
        )}
        {canRaise ? (
          raiseOpen ? (
            <button className="tbtn bg-brass text-ink tabular" disabled={busy} onClick={() => act(to >= maxTo ? { type: "allin" } : { type: "raise", to })}>
              {to >= maxTo ? "All in" : `Raise to ${to.toLocaleString()}`}
            </button>
          ) : (
            <button className="tbtn bg-brass text-ink" disabled={busy} onClick={() => setRaiseOpen(true)}>
              {g.currentBet === 0 ? "Bet" : "Raise"}
            </button>
          )
        ) : (
          <button className="tbtn bg-white/5 text-dim" disabled>
            Raise
          </button>
        )}
      </div>
    </div>
  );
}
