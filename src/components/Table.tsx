"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, PublicSeat } from "@/engine/game";
import { describeHand, evaluateBest } from "@/engine/evaluate";
import type { PublicRoom } from "@/lib/ops";
import type { ChatMessage } from "@/lib/client/useRoom";
import { sounds, isMuted, setMuted } from "@/lib/client/sound";
import { Gloop, Face } from "./Gloop";
import { PlayingCard } from "./PlayingCard";
import { Chat } from "./Chat";
import { GifArt, StickerArt } from "./Sticker";
import { ChipAmount, ChipStack } from "./Chips";
import { RulesModal } from "./Rules";
import { ShareWin } from "./ShareWin";

type Game = NonNullable<PublicRoom["game"]>;

function useNow(ms: number, serverNow: () => number) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms, serverNow]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** "Raise to 120" → { text: "RAISE 120", colour } — short tags like a real table. */
function actionTag(a?: string): { text: string; colour: string } | null {
  if (!a) return null;
  const timed = a.endsWith("(time)");
  const s = a.replace(" (time)", "");
  const n = s.match(/\d[\d,]*/)?.[0];
  const fmt = (x?: string) => (x ? Number(x.replace(/,/g, "")).toLocaleString() : "");
  let t: { text: string; colour: string };
  if (s.startsWith("Fold")) t = { text: "FOLD", colour: "#e5484d" };
  else if (s.startsWith("Check")) t = { text: "CHECK", colour: "#30a46c" };
  else if (s.startsWith("Call")) t = { text: `CALL ${fmt(n)}`, colour: "#30a46c" };
  else if (s.startsWith("Raise")) t = { text: `RAISE ${fmt(n)}`, colour: "#8e4ec6" };
  else if (s.startsWith("All in")) t = { text: "ALL IN", colour: "#ffb224" };
  else if (s.startsWith("Small blind")) t = { text: `SB ${fmt(n)}`, colour: "#3e63dd" };
  else if (s.startsWith("Big blind")) t = { text: `BB ${fmt(n)}`, colour: "#3e63dd" };
  else if (s.startsWith("Left")) t = { text: "LEFT", colour: "#888" };
  else t = { text: s.toUpperCase(), colour: "#888" };
  if (timed) t.text += " ⏱";
  return t;
}

/** "Two Pair, Kings and Fours" → "Two Pair" for the small tag on a winner's seat. */
const shortHand = (name?: string) => (name ? name.split(",")[0] : "");

/** Points around a stadium-shaped table (percent of the table box). Seat 0 = bottom centre. */
function seatPoint(i: number, n: number) {
  const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const sq = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.7); // squarer than an ellipse
  return { x: 50 + 47 * sq(c), y: 50 + 45 * sq(s) };
}

export function Table(props: {
  room: PublicRoom;
  me: string;
  myCards: string[];
  chat: ChatMessage[];
  busy: boolean;
  error: string | null;
  serverNow: () => number;
  isOnline: (id: string) => boolean;
  onAct: (a: Action) => Promise<boolean>;
  onChat: (kind: ChatMessage["kind"], body: string) => void;
  onLeave: () => void;
  onKick: (id: string) => void;
  onShowCards: () => void;
  children?: React.ReactNode; // results overlay
}) {
  const { room, me, myCards, chat, serverNow, isOnline } = props;
  const isHost = room.hostId === me;
  // Size of the table, so dealt cards can fly from its centre to each seat.
  const tableRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 380, h: 640 });
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, []);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const g = room.game!;
  const now = useNow(250, serverNow);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);

  const mySeat = g.seats.find((s) => s.id === me);
  // My move shows instantly while the server confirms it, so the table never feels stuck.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [g.toAct, g.handNumber, g.street]);
  useEffect(() => {
    if (props.error) setPending(null);
  }, [props.error]);
  const watching = !mySeat || mySeat.status !== "playing";
  const myTurn = g.toAct === me;
  const watchers = room.members.filter((m) => !g.seats.some((s) => s.id === m.id && s.status === "playing")).length;

  // Card sounds: a "thwip" per card dealt at the start of a hand, and per card turned on the board.
  const heard = useRef({ hand: g.handNumber, board: g.board.length });
  useEffect(() => {
    const h = heard.current;
    if (g.handNumber !== h.hand) {
      const n = Math.min(10, g.seats.filter((s) => s.inHand).length * 2);
      for (let k = 0; k < n; k++) sounds.card(k * 110);
      h.hand = g.handNumber;
      h.board = 0;
    }
    if (g.board.length > h.board) {
      for (let i = h.board; i < g.board.length; i++) sounds.flip((i < 3 ? i * 170 : 0) + 120);
      h.board = g.board.length;
    }
  }, [g.handNumber, g.board.length, g.seats]);

  // Other players' moves: chips for bets, a card toss for folds. (My own moves sound when I tap.)
  const heardActs = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    const prev = heardActs.current;
    const next: Record<string, string | undefined> = {};
    for (const s of g.seats) {
      next[s.id] = s.lastAction;
      if (s.id === me || !s.lastAction || prev[s.id] === s.lastAction || !(s.id in prev)) continue;
      if (s.lastAction === "Fold") sounds.fold();
      else if (s.lastAction !== "Check") sounds.chip();
    }
    heardActs.current = next;
  }, [g.seats, me]);

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
  // Measured on the server's clock: phone clocks are often seconds off, which used to hide stickers on phones.
  const mountedAt = useRef(serverNow());
  const [pops, setPops] = useState<Record<string, { id: number; sticker: string; name: string }>>({});
  const seen = useRef(new Set<number>());
  useEffect(() => {
    for (const m of chat) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (m.kind !== "sticker" || new Date(m.created_at).getTime() < mountedAt.current - 15000) continue;
      // Watchers have no seat: their stickers pop at the top of the table instead.
      const key = g.seats.some((s) => s.id === m.sender_id) ? m.sender_id : "watcher";
      setPops((p) => ({ ...p, [key]: { id: m.id, sticker: m.body, name: m.sender_name } }));
      setTimeout(
        () =>
          setPops((p) => {
            if (p[key]?.id !== m.id) return p;
            const rest = { ...p };
            delete rest[key];
            return rest;
          }),
        2700,
      );
    }
  }, [chat, g.seats]);

  // Instagram-style banners: new messages slide in at the top while you play (phones; desktop has the chat panel).
  const [toasts, setToasts] = useState<ChatMessage[]>([]);
  const [replyFocus, setReplyFocus] = useState(false);
  const toasted = useRef(new Set<number>());
  useEffect(() => {
    for (const m of chat) {
      if (toasted.current.has(m.id)) continue;
      toasted.current.add(m.id);
      // only new messages from others; stickers already pop over the sender's seat
      if (m.sender_id === me || m.kind === "sticker" || new Date(m.created_at).getTime() < mountedAt.current - 15000) continue;
      setToasts((t) => [m, ...t.filter((x) => x.id !== m.id)].slice(0, 2));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== m.id)), 4500);
    }
  }, [chat, me]);
  const openChat = (reply: boolean) => {
    setReplyFocus(reply);
    setToasts([]);
    setChatOpen(true);
  };

  const [readCount, setReadCount] = useState(chat.length);
  useEffect(() => {
    if (chatOpen) setReadCount(chat.length);
  }, [chatOpen, chat.length]);
  const unread = Math.max(0, chat.length - readCount);

  const iv = g.settings.blindIntervalSec * 1000;
  const nextBlindsIn = iv - ((now - g.startedAt) % iv);
  const timeLeft = g.settings.endMode === "timed" ? g.startedAt + g.settings.timeLimitMin * 60000 - now : null;

  const result = g.street === "complete" ? g.result : null;
  const winningCards = useMemo(() => {
    if (!result?.showdown) return new Set<string>();
    const w = result.pots[0]?.winners ?? [];
    return new Set(w.flatMap((id) => result.shown[id]?.bestCards ?? []));
  }, [result]);

  // The pot slides to the winner: chips sound as the chip stack flies.
  const potHeard = useRef(g.street === "complete" ? g.handNumber : 0);
  useEffect(() => {
    if (!result || !ready || potHeard.current === g.handNumber) return;
    potHeard.current = g.handNumber;
    sounds.pot(250);
  }, [result, ready, g.handNumber]);

  // Big win (Flush or better, cards face up): offer "Share" for a few seconds.
  const bigWin = useMemo(() => {
    if (!result || !mySeat || !result.won[me] || !result.shown[me]) return null;
    const all = [...result.shown[me].hole, ...g.board];
    if (all.length < 5) return null;
    const best = evaluateBest(all);
    if (best.category < 5) return null;
    return { hand: g.handNumber, amount: result.won[me], name: best.name, short: best.name.split(",")[0], cards: best.cards };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, me, g.handNumber]);
  const [winOffer, setWinOffer] = useState<NonNullable<typeof bigWin> | null>(null);
  const [sharingWin, setSharingWin] = useState<NonNullable<typeof bigWin> | null>(null);
  useEffect(() => {
    if (!bigWin || !ready) return;
    setWinOffer(bigWin);
    const t = setTimeout(() => setWinOffer((w) => (w?.hand === bigWin.hand ? null : w)), 9000);
    return () => clearTimeout(t);
  }, [bigWin, ready]);

  const handName = myCards.length === 2 ? describeHand([...myCards, ...g.board]) : null;

  const share = async () => {
    const link = `${window.location.origin}/t/${room.code}`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ title: "Gloopy poker", url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  };

  return (
    <div className="room-bg flex h-dvh flex-col text-chalk">
      {/* Top: back, blinds, menu */}
      <header className="relative z-20 flex items-center justify-between px-3 pt-3">
        <button
          onClick={props.onLeave}
          className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-xl"
          aria-label="Leave table"
        >
          ‹
        </button>
        <div className="flex items-center gap-2 text-xs tabular">
          <span className="rounded-full bg-black/40 px-3 py-1">
            <span className="text-brass">{g.blinds.smallBlind}/{g.blinds.bigBlind}</span>
            <span className="text-dim"> ↑ {clock(nextBlindsIn)}</span>
          </span>
          {timeLeft !== null && <span className="rounded-full bg-black/40 px-3 py-1 text-dim">⏳ {clock(timeLeft)}</span>}
          {watchers > 0 && (
            <span className="rounded-full bg-black/40 px-3 py-1 text-dim" title="Watching">
              👁 {watchers}
            </span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-lg tracking-widest"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl bg-[#0f1f1d] text-sm shadow-xl ring-1 ring-white/10">
              <div className="px-4 py-2 text-xs text-dim">Table {room.code}</div>
              <button className="block w-full px-4 py-2.5 text-left hover:bg-white/10" onClick={share}>
                {copied ? "Link copied" : "Share table link"}
              </button>
              <button
                className="block w-full px-4 py-2.5 text-left hover:bg-white/10"
                onClick={() => {
                  setMuted(!muted);
                  setMutedState(!muted);
                }}
              >
                {muted ? "Turn sound on" : "Turn sound off"}
              </button>
              <button
                className="block w-full px-4 py-2.5 text-left hover:bg-white/10"
                onClick={() => {
                  setRulesOpen(true);
                  setMenuOpen(false);
                }}
              >
                Rules and winning hands
              </button>
              {isHost && room.members.length > 1 && (
                <>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-white/10" onClick={() => setRemoveOpen((o) => !o)} aria-expanded={removeOpen}>
                    Remove a player {removeOpen ? "▴" : "▾"}
                  </button>
                  {removeOpen &&
                    room.members
                      .filter((m) => m.id !== me)
                      .map((m) => (
                        <button
                          key={m.id}
                          className={`flex w-full items-center justify-between px-6 py-2 text-left ${confirmKick === m.id ? "bg-[#5a2026] text-white" : "text-dim hover:bg-white/10"}`}
                          onClick={() => {
                            if (confirmKick === m.id) {
                              props.onKick(m.id);
                              setConfirmKick(null);
                              setMenuOpen(false);
                            } else setConfirmKick(m.id);
                          }}
                        >
                          <span className="truncate">{m.name}</span>
                          <span className="text-xs">{confirmKick === m.id ? "Tap to confirm" : "Remove"}</span>
                        </button>
                      ))}
                </>
              )}
              <button className="block w-full px-4 py-2.5 text-left text-[#ff9a8f] hover:bg-white/10" onClick={props.onLeave}>
                Leave table
              </button>
            </div>
          )}
        </div>
      </header>

      {(watching || (mySeat && mySeat.strikes > 0)) && (
        <div className="z-10 mt-2 flex justify-center px-3">
          <span className={`rounded-full px-3 py-1 text-xs ${watching ? "bg-black/40 text-dim" : "bg-alert/25 text-[#ffc4bc]"}`}>
            {watching
              ? mySeat?.status === "busted"
                ? "Out of chips · you'll play next game"
                : mySeat?.status === "kicked"
                  ? "Removed for 3 missed turns · back next game"
                  : "Watching · you'll get a seat next game"
              : `Missed turns ${mySeat!.strikes}/3`}
          </span>
        </div>
      )}

      {((!chatOpen && toasts.length > 0) || (winOffer && !sharingWin)) && (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex flex-col items-center gap-2 px-3 lg:right-[330px]" aria-live="polite">
          {winOffer && !sharingWin && (
            <div className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-white/15 bg-black/45 px-3 py-2 shadow-lg backdrop-blur-md">
              {mySeat && <Gloop id={mySeat.avatar} face="laugh" size={34} />}
              <span className="min-w-0 flex-1 text-sm text-white">
                <span className="block text-xs font-semibold text-[#ffe08a]">Big win: +{winOffer.amount.toLocaleString()}</span>
                You won with a <b>{winOffer.short}</b>
              </span>
              <button className="shrink-0 rounded-full bg-lime px-3.5 py-1.5 font-display font-extrabold text-ink" onClick={() => setSharingWin(winOffer)}>
                Share
              </button>
              <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10" onClick={() => setWinOffer(null)} aria-label="Dismiss">
                ✕
              </button>
            </div>
          )}
          {!chatOpen && toasts.map((m) => (
            <div
              key={m.id}
              className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-white/15 bg-black/35 px-3 py-2 shadow-lg backdrop-blur-md lg:hidden"
            >
              <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => openChat(true)} aria-label={`Reply to ${m.sender_name}`}>
                <Gloop id={m.avatar} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-white">
                    {m.sender_name}
                    {m.watching && <span className="font-normal text-dim"> · watching</span>}
                  </span>
                  <span className="block truncate text-sm text-white/90">{m.kind === "gif" ? "sent a GIF" : m.body}</span>
                </span>
                {m.kind === "gif" && (
                  <span className="shrink-0 overflow-hidden rounded-lg">
                    <GifArt id={m.body} size={64} />
                  </span>
                )}
              </button>
              <button
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10"
                onClick={() => setToasts((t) => t.filter((x) => x.id !== m.id))}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {sharingWin && mySeat && (
        <ShareWin
          kind="hand"
          gloop={mySeat.avatar}
          face="laugh"
          tag={`${sharingWin.short.toUpperCase()}!`}
          headline={`${mySeat.name} won ${sharingWin.amount.toLocaleString()}`}
          detail={`with a ${sharingWin.name}`}
          cards={sharingWin.cards}
          footer={`Table ${room.code} · ${window.location.host}`}
          onClose={() => {
            setSharingWin(null);
            setWinOffer(null);
          }}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {/* Table */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 py-2 sm:px-6">
            <div ref={tableRef} className="relative aspect-[10/17] h-full max-h-full max-w-full md:aspect-[2/1.08] md:h-auto md:w-full md:max-w-[1100px]">
              {/* rim → felt → betting line */}
              <div className="poker-rim absolute inset-[5%_7%] md:inset-[9%_6%]">
                <div className="poker-felt absolute inset-[14px] sm:inset-[18px]">
                  <div className="poker-line absolute inset-[9%]" />
                </div>
              </div>

              {/* pot + board */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="text-lg font-bold text-[#ffd86b] drop-shadow" aria-label="Pot">
                  {g.pot > 0 ? <ChipAmount amount={g.pot} size={18} /> : <span className="opacity-0">0</span>}
                </div>
                <div className="flex gap-1 sm:gap-1.5" aria-label="Board">
                  {Array.from({ length: 5 }).map((_, i) =>
                    g.board[i] ? (
                      <PlayingCard
                        key={`${g.handNumber}-${i}`}
                        card={g.board[i]}
                        size="board"
                        glow={winningCards.has(g.board[i])}
                        dim={winningCards.size > 0 && !winningCards.has(g.board[i])}
                        motion={ready ? "dealflip" : undefined}
                        delay={i < 3 ? i * 170 : 0}
                        from={{ x: -30 - (i < 3 ? i : 0) * 56, y: -24 }}
                      />
                    ) : (
                      <div key={i} className="h-[70px] w-[50px] rounded-[7px] border-2 border-dashed border-white/15 sm:h-[90px] sm:w-[64px]" />
                    ),
                  )}
                </div>
              </div>

              {result &&
                ready &&
                Object.keys(result.won).map((id) => {
                  const i = ordered.findIndex((s) => s.id === id);
                  if (i < 0) return null;
                  const p = id === me && ordered[0]?.id === me ? { x: 50, y: 90 } : seatPoint(i, ordered.length);
                  return (
                    <div
                      key={`${g.handNumber}-${id}`}
                      className="chip-fly pointer-events-none absolute left-1/2 top-[40%] z-20"
                      style={{ ["--tx" as string]: `${((p.x - 50) / 100) * box.w}px`, ["--ty" as string]: `${((p.y - 40) / 100) * box.h}px` }}
                      aria-hidden
                    >
                      <ChipStack count={5} size={22} />
                    </div>
                  );
                })}

              {pops.watcher && (
                <div className="pop pointer-events-none absolute left-1/2 top-[22%] z-20 flex flex-col items-center">
                  <StickerArt id={pops.watcher.sticker} size={78} />
                  <span className="mt-1 rounded-full bg-black/55 px-2 text-[10px] text-dim">{pops.watcher.name} (watching)</span>
                </div>
              )}

              {/* other players around the rim */}
              {ordered.map((s, i) => {
                if (i === 0 && s.id === me) return null;
                const p = seatPoint(i, ordered.length);
                return (
                  <OtherSeat
                    key={s.id}
                    seat={s}
                    x={p.x}
                    y={p.y}
                    g={g}
                    now={now}
                    online={isOnline(s.id)}
                    shown={result?.shown[s.id]?.hole}
                    handName={result?.shown[s.id]?.handName}
                    won={result?.won[s.id]}
                    pop={pops[s.id]?.sticker}
                    host={room.hostId === s.id}
                    ready={ready}
                    dealIndex={i}
                    dealCount={ordered.length}
                    toCentre={{ x: ((50 - p.x) / 100) * box.w, y: ((50 - p.y) / 100) * box.h }}
                  />
                );
              })}

              {/* me, bottom centre */}
              {mySeat && ordered[0]?.id === me && (
                <MySeat
                  seat={mySeat}
                  g={g}
                  now={now}
                  cards={myCards}
                  handName={handName}
                  won={result?.won[me]}
                  pop={pops[me]?.sticker}
                  host={room.hostId === me}
                  pending={pending}
                  canShow={!!result && !result.showdown && !!result.won[me] && !result.shown[me]}
                  onShow={props.onShowCards}
                  ready={ready}
                  dealCount={ordered.length}
                  fromCentre={{ x: 0, y: -box.h * 0.4 }}
                />
              )}
            </div>
          </div>

          {!watching && mySeat && myTurn && !pending && (
            <ActionBar
              g={g}
              seat={mySeat}
              busy={props.busy}
              onAct={async (a, label) => {
                setPending(label);
                const ok = await props.onAct(a);
                if (!ok) setPending(null);
                return ok;
              }}
            />
          )}
          {props.error && (
            <p role="alert" className="mx-3 mb-2 rounded-lg bg-alert/25 px-3 py-1.5 text-center text-sm text-[#ffd2cc]">
              {props.error}
            </p>
          )}

          {/* phone chat bar */}
          <button className="flex items-center gap-3 border-t border-white/10 bg-black/20 px-4 py-3 text-left backdrop-blur-sm lg:hidden" onClick={() => openChat(false)}>
            <span className="text-lime" aria-hidden>
              💬
            </span>
            <span className="flex-1 text-dim">Say hello…</span>
            {unread > 0 && <span className="rounded-full bg-gum px-2 text-xs font-bold text-ink">{unread}</span>}
            <span className="text-dim" aria-label="Stickers">
              🙂
            </span>
          </button>
        </div>

        {/* desktop chat */}
        <aside className="hidden w-[330px] flex-col border-l border-white/10 bg-black/15 backdrop-blur-sm lg:flex" aria-label="Chat">
          <Chat messages={chat} me={me} onSend={props.onChat} mood="table" className="flex-1" />
        </aside>
      </div>

      {chatOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-black/10 lg:hidden" onClick={() => setChatOpen(false)}>
          <div
            className="mt-auto flex h-[60dvh] flex-col rounded-t-2xl border-t border-white/15 bg-[#0b1816]/45 backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-4 py-2">
              <h2 className="flex-1 font-semibold">Chat</h2>
              <button onClick={() => setChatOpen(false)} className="px-2 py-1 text-dim">
                Close
              </button>
            </div>
            <Chat
              messages={chat}
              me={me}
              autoFocus={replyFocus}
              onSend={(kind, body) => {
                props.onChat(kind, body);
                if (kind !== "text") setChatOpen(false); // show the table so you see your sticker land
              }}
              mood="table"
              className="flex-1"
            />
          </div>
        </div>
      )}

      {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {props.children}
    </div>
  );
}

// ------------------------------------------------------------------ seats

function TimerRing({ g, now, size }: { g: Game; now: number; size: number }) {
  if (!g.deadline) return null;
  const frac = Math.max(0, g.deadline - now) / (g.settings.turnSeconds * 1000);
  const r = size / 2 - 3;
  const L = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={frac < 0.25 ? "#ff5b4d" : "#ffd23f"}
        strokeWidth="4"
        strokeDasharray={L}
        strokeDashoffset={L * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
    </svg>
  );
}

function Tag({ action, className = "" }: { action?: string; className?: string }) {
  const t = actionTag(action);
  if (!t) return null;
  return (
    <span className={`action-tag inline-block whitespace-nowrap px-3 py-0.5 text-[11px] sm:text-xs ${className}`} style={{ ["--tag" as string]: t.colour }}>
      {t.text}
    </span>
  );
}

function faceFor(seat: PublicSeat, won?: number): Face {
  if (seat.status !== "playing") return "sad";
  if (won) return "laugh";
  if (seat.folded) return "sleep";
  if (seat.allIn) return "shock";
  return "happy";
}

function OtherSeat({
  seat,
  x,
  y,
  g,
  now,
  online,
  shown,
  handName,
  won,
  pop,
  host,
  ready,
  dealIndex,
  dealCount,
  toCentre,
}: {
  seat: PublicSeat;
  x: number;
  y: number;
  ready: boolean;
  dealIndex: number;
  dealCount: number;
  toCentre: { x: number; y: number };
  g: Game;
  now: number;
  online: boolean;
  shown?: string[];
  handName?: string;
  won?: number;
  pop?: string;
  host: boolean;
}) {
  const out = seat.status !== "playing";
  const toAct = g.toAct === seat.id;
  const above = y > 55; // seats in the lower half put their tag above
  // Seats on the long sides keep their tag under their name, so it never covers the board.
  const side = Math.abs(x - 50) > 30;
  // Top and bottom seats: tag sits between the seat and the middle of the table.
  const tx = 50 + (x - 50) * 0.6;
  const ty = 50 + (y - 50) * 0.62;

  return (
    <>
      <div
        className="absolute z-10"
        // Side seats lean inward so names and chips never run off a narrow phone screen.
        style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${side ? (x < 50 ? "-25%" : "-75%") : "-50%"}, -50%)` }}
      >
        <div className={`relative flex flex-col items-center ${seat.folded || out ? "opacity-60" : ""}`}>
          {pop && (
            // Seats along the top pop downward so the sticker isn't hidden under the header.
            <div className={`pop pointer-events-none absolute left-1/2 z-20 ${y < 30 ? "top-20" : "-top-16"}`}>
              <StickerArt id={pop} size={70} />
            </div>
          )}
          <div className={`relative rounded-full ${won ? "ring-4 ring-[#ffd23f]" : ""}`}>
            {toAct && <TimerRing g={g} now={now} size={60} />}
            <Gloop id={seat.avatar} face={faceFor(seat, won)} size={48} title={seat.name} />
            {seat.isButton && (
              <span className="absolute -left-2 bottom-0 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-ink shadow">D</span>
            )}
            {/* their cards: tucked against the avatar, away from the board */}
            <div className={`absolute flex -space-x-3 ${shown ? "-bottom-2 -right-7" : "-bottom-1 -right-3"} ${x > 55 && !shown ? "!-left-3 !right-auto" : ""}`}>
              {shown
                ? // showdown: their cards turn over
                  shown.map((c) => <PlayingCard key={`${g.handNumber}-${c}`} card={c} size="sm" glow={!!won} motion={ready ? "flip" : undefined} />)
                : seat.inHand && !out
                  ? seat.folded
                    ? // folded: cards slide into the middle and vanish (nothing to show if we arrived after)
                      ready &&
                      [0, 1].map((k) => (
                        <PlayingCard key={`${g.handNumber}-muck-${k}`} size="xs" className={k ? "rotate-6" : "-rotate-6"} motion="muck" from={toCentre} />
                      ))
                    : // dealt one at a time round the table, twice
                      [0, 1].map((k) => (
                        <PlayingCard
                          key={`${g.handNumber}-${k}`}
                          size="xs"
                          className={k ? "rotate-6" : "-rotate-6"}
                          motion={ready ? "deal" : undefined}
                          delay={(k * dealCount + dealIndex) * 110}
                          from={toCentre}
                        />
                      ))
                  : null}
            </div>
          </div>
          <div className="mt-0.5 flex max-w-[92px] items-center gap-1 text-[11px] font-semibold leading-tight">
            {host && <span aria-label="Host">👑</span>}
            <span className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-[#3ddc84]" : "bg-[#ff4d4d]"}`} aria-label={online ? "Online" : "Offline"} />
            <span className="truncate">{seat.name}</span>
          </div>
          <div className="text-[11px] text-[#ffe08a]">
            {out ? <span className="text-dim">{seat.status === "kicked" ? "Left" : "Out"}</span> : <ChipAmount amount={seat.chips} size={11} />}
          </div>
          {side && won ? (
            <span className="action-tag mt-0.5 px-2 py-0.5 text-[11px]" style={{ ["--tag" as string]: "#ffd23f" }}>
              WIN +{won.toLocaleString()}
            </span>
          ) : (
            side && !out && !toAct && <Tag action={seat.lastAction} className="mt-0.5" />
          )}
          {side && won && handName ? <span className="mt-0.5 rounded-full bg-black/55 px-2 text-[10px] text-[#ffe08a]">{shortHand(handName)}</span> : null}
        </div>
      </div>

      {/* action tag / win tag toward the centre */}
      <div className="absolute z-[5] -translate-x-1/2 -translate-y-1/2" style={{ left: `${tx}%`, top: `${ty + (above ? -1 : 1)}%` }}>
        {side ? null : won ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="action-tag px-3 py-0.5 text-xs" style={{ ["--tag" as string]: "#ffd23f" }}>
              WIN +{won.toLocaleString()}
            </span>
            {handName && <span className="rounded-full bg-black/55 px-2 text-[10px] text-[#ffe08a]">{shortHand(handName)}</span>}
          </div>
        ) : (
          !side && !out && !toAct && <Tag action={seat.lastAction} />
        )}
      </div>
    </>
  );
}

function MySeat({
  seat,
  g,
  now,
  cards,
  handName,
  won,
  pop,
  host,
  pending,
  canShow,
  onShow,
  ready,
  dealCount,
  fromCentre,
}: {
  seat: PublicSeat;
  g: Game;
  now: number;
  cards: string[];
  handName: string | null;
  won?: number;
  pop?: string;
  host: boolean;
  pending: string | null;
  canShow: boolean;
  onShow: () => void;
  ready: boolean;
  dealCount: number;
  fromCentre: { x: number; y: number };
}) {
  const out = seat.status !== "playing";
  const toAct = g.toAct === seat.id && !pending;
  return (
    <div className="absolute bottom-[1%] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center md:bottom-[2%]">
      {pop && (
        <div className="pop pointer-events-none absolute -top-20 left-1/2 z-20">
          <StickerArt id={pop} size={78} />
        </div>
      )}
      {won ? (
        <span className="action-tag mb-1 px-3 py-0.5 text-xs" style={{ ["--tag" as string]: "#ffd23f" }}>
          WIN +{won.toLocaleString()}
        </span>
      ) : (
        !out && !toAct && <Tag action={pending ?? seat.lastAction} className="mb-1" />
      )}
      {/* won without a showdown: I choose whether everyone sees my cards */}
      {canShow && (
        <button onClick={onShow} className="action-tag mb-1 px-3 py-1 text-xs" style={{ ["--tag" as string]: "#3ddc84" }}>
          SHOW MY CARDS
        </button>
      )}
      {/* private: only I see my hand name */}
      {handName && !seat.folded && <div className="mb-1 text-sm font-semibold text-[#ffe08a] drop-shadow">{handName}</div>}

      <div className={`relative flex items-end ${seat.folded || out ? "opacity-60" : ""}`}>
        <div className="flex gap-1.5">
          {cards.length === 2 ? (
            // my two cards fly in from the middle and turn face up
            cards.map((c, k) => (
              <PlayingCard
                key={`${g.handNumber}-${c}`}
                card={c}
                size="hand"
                motion={ready ? "dealflip" : undefined}
                delay={k * dealCount * 110}
                from={fromCentre}
              />
            ))
          ) : seat.inHand && !out ? (
            // waiting for my cards to arrive: keep the space, show nothing yet
            [0, 1].map((k) => <PlayingCard key={k} size="hand" className="opacity-0" />)
          ) : (
            <div className="h-[84px] w-[126px]" />
          )}
        </div>
        {/* avatar overlapping the cards, like a real seat */}
        <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full ${won ? "ring-4 ring-[#ffd23f]" : ""}`}>
          {toAct && <TimerRing g={g} now={now} size={56} />}
          <Gloop id={seat.avatar} face={faceFor(seat, won)} size={44} title={seat.name} />
          {seat.isButton && (
            <span className="absolute -left-3 bottom-0 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-ink shadow">D</span>
          )}
        </div>
        <div className="absolute -right-2 bottom-1 translate-x-full text-sm text-[#ffe08a]">
          {!out && <ChipAmount amount={seat.chips} size={15} />}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-xs font-semibold">
        {host && <span aria-label="Host">👑</span>}
        <span className="h-2 w-2 rounded-full bg-[#3ddc84]" aria-label="Online" />
        <span>{seat.name}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ actions

function ActionBar({
  g,
  seat,
  busy,
  onAct,
}: {
  g: Game;
  seat: PublicSeat;
  busy: boolean;
  onAct: (a: Action, label: string) => Promise<boolean>;
}) {
  const owe = Math.max(0, g.currentBet - seat.bet);
  const toCall = Math.min(owe, seat.chips);
  const maxTo = g.legal?.maxRaiseTo ?? seat.bet + seat.chips;
  const minTo = g.legal?.minRaiseTo ?? Math.min(g.currentBet + g.minRaise, maxTo);
  const canRaise = !!g.legal?.canRaise;
  const step = Math.max(1, g.blinds.bigBlind);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(minTo);
  useEffect(() => {
    setTo(minTo);
    setOpen(false);
  }, [minTo, g.handNumber, g.street]);

  const clamp = (v: number) => Math.max(minTo, Math.min(maxTo, Math.round(v)));
  const potAfterCall = g.pot + toCall;
  // Three simple choices, each showing exactly how much it is.
  const quick: [string, number][] = [
    ["Min", minTo],
    ["Pot", clamp(g.currentBet + potAfterCall)],
    ["All in", maxTo],
  ];
  const betWord = g.currentBet === 0 ? "BET" : "RAISE";
  const act = async (a: Action) => {
    sounds.unlock();
    if (a.type === "fold") sounds.fold();
    else if (a.type !== "check") sounds.chip();
    // Same wording the server uses, so the tag doesn't change when the confirmation lands.
    const label =
      a.type === "fold"
        ? "Fold"
        : a.type === "check"
          ? "Check"
          : a.type === "call"
            ? toCall >= seat.chips
              ? "All in"
              : `Call ${toCall}`
            : a.type === "allin"
              ? "All in"
              : `Raise to ${a.to}`;
    await onAct(a, label);
  };

  const confirm = () => act(to >= maxTo ? { type: "allin" } : { type: "raise", to });

  if (open && canRaise) {
    return (
      <div className="bg-black/55 px-3 pb-3 pt-3">
        <div className="mb-3 rounded-2xl bg-black/35 p-3">
          <div className="flex items-center justify-between">
            <button
              className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-2xl disabled:opacity-30"
              onClick={() => setTo(clamp(to - step))}
              disabled={to <= minTo}
              aria-label="Less"
            >
              −
            </button>
            <div className="text-center">
              <div className="text-xs text-dim">{to >= maxTo ? "All in" : betWord === "BET" ? "Bet" : "Raise to"}</div>
              <div className="text-3xl font-bold text-white tabular">{to.toLocaleString()}</div>
            </div>
            <button
              className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-2xl disabled:opacity-30"
              onClick={() => setTo(clamp(to + step))}
              disabled={to >= maxTo}
              aria-label="More"
            >
              +
            </button>
          </div>
          <input
            type="range"
            min={minTo}
            max={maxTo}
            step={step}
            value={to}
            onChange={(e) => setTo(clamp(+e.target.value))}
            className="mt-3 w-full accent-[#8e4ec6]"
            aria-label="Amount"
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {quick.map(([label, v]) => (
              <button
                key={label}
                onClick={() => setTo(v)}
                className={`rounded-xl py-1.5 text-center transition ${to === v ? "bg-[#8e4ec6] text-white" : "bg-white/10 text-white/85"}`}
              >
                <div className="text-xs font-semibold">{label}</div>
                <div className="text-[11px] opacity-80 tabular">{v.toLocaleString()}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className="tbtn bg-white/10 text-white" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="tbtn col-span-2 bg-[#8e4ec6] text-white tabular" disabled={busy} onClick={confirm}>
            {to >= maxTo ? "ALL IN" : `${betWord} ${to.toLocaleString()}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/50 px-3 pb-3 pt-2">
      <div className="grid grid-cols-3 gap-2">
        <button className="tbtn bg-[#5a2026] text-white" disabled={busy} onClick={() => act({ type: "fold" })}>
          FOLD
        </button>
        {owe === 0 ? (
          <button className="tbtn bg-[#1f7a4d] text-white" disabled={busy} onClick={() => act({ type: "check" })}>
            CHECK
          </button>
        ) : (
          <button className="tbtn bg-[#1f7a4d] text-white tabular" disabled={busy} onClick={() => act({ type: "call" })}>
            {toCall >= seat.chips ? "ALL IN" : `CALL ${toCall.toLocaleString()}`}
          </button>
        )}
        <button className="tbtn bg-[#8e4ec6] text-white disabled:bg-white/5 disabled:text-white/40" disabled={busy || !canRaise} onClick={() => setOpen(true)}>
          {betWord}
        </button>
      </div>
    </div>
  );
}
