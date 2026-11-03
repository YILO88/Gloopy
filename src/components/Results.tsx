"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicRoom } from "@/lib/ops";
import { sounds } from "@/lib/client/sound";
import type { ChatMessage } from "@/lib/client/useRoom";
import { Gloop } from "./Gloop";
import { Chat } from "./Chat";
import { ShareWin } from "./ShareWin";
import Link from "next/link";
import { useMe } from "@/lib/client/account";
import { api } from "@/lib/client/api";

/** End of game: winner sees "You won"; everyone gets the leaderboard and a sound. */
export function Results({
  room,
  me,
  busy,
  chat,
  onChat,
  onAgain,
  onLeave,
}: {
  room: PublicRoom;
  me: string;
  busy: boolean;
  chat: ChatMessage[];
  onChat: (kind: ChatMessage["kind"], body: string) => void;
  onAgain: () => void;
  onLeave: () => void;
}) {
  const [tab, setTab] = useState<"board" | "chat">("board");
  const [sharing, setSharing] = useState(false);
  const { me: account } = useMe();
  const signedIn = !!account?.profile;
  const [asked, setAsked] = useState<Record<string, string>>({});
  const addFriend = async (username: string) => {
    setAsked((a) => ({ ...a, [username]: "…" }));
    try {
      const r = await api<{ status: string }>("/api/friends", { op: "request", username });
      setAsked((a) => ({ ...a, [username]: r.status === "friends" ? "Friends" : "Sent" }));
    } catch {
      setAsked((a) => ({ ...a, [username]: "Try later" }));
    }
  };
  // New messages since the chat was last open (the chat icon shows the count).
  const [seen, setSeen] = useState(chat.length);
  useEffect(() => {
    if (tab === "chat") setSeen(chat.length);
  }, [tab, chat.length]);
  const ranking = room.game?.ranking ?? [];
  const mine = ranking.find((r) => r.id === me);
  const iWon = mine?.position === 1;
  const played = !!mine;
  const played_ = useRef(false);
  useEffect(() => {
    if (played_.current || !played) return;
    played_.current = true;
    if (iWon) sounds.win();
    else sounds.lose();
  }, [iWon, played]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="results-h">
      <div className="sticker flex max-h-[92dvh] w-full min-w-0 max-w-md flex-col p-5 text-ink">
        {iWon ? (
          <div className="mb-3 flex flex-col items-center">
            <Gloop id={mine!.avatar} face="laugh" size={110} className="wobble" />
            <h2 id="results-h" className="font-display text-5xl font-extrabold">
              You won
            </h2>
            <p className="text-ink/70">{mine!.chips.toLocaleString()} chips</p>
            <button className="btn mt-2 bg-lime px-5 py-1.5 text-lg" onClick={() => setSharing(true)}>
              Share my win
            </button>
          </div>
        ) : (
          <div className="mb-3 flex flex-col items-center">
            {mine && <Gloop id={mine.avatar} face="cry" size={80} />}
            <h2 id="results-h" className="font-display text-3xl font-extrabold">
              {mine ? `You finished #${mine.position}` : "Game over"}
            </h2>
          </div>
        )}
        {tab === "chat" ? (
          <div className="mb-4 flex h-[46dvh] min-h-[260px] flex-col overflow-hidden rounded-2xl border-[3px] border-ink" aria-label="Chat">
            <Chat messages={chat} me={me} onSend={onChat} mood="lobby" className="flex-1" />
          </div>
        ) : (
        <ol className="mb-4 max-h-[42dvh] space-y-1.5 overflow-y-auto">
          {ranking.map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink px-2 py-1 ${r.position === 1 ? "bg-lime" : r.id === me ? "bg-mist" : "bg-white"}`}
            >
              <span className="w-7 text-center font-display text-xl font-extrabold">{r.position}</span>
              <Gloop id={r.avatar} size={34} />
              <span className="flex-1 truncate font-semibold">
                {r.name}
                {r.id === me && " (you)"}
                {room.members.find((m) => m.id === r.id)?.bot && (
                  <span className="ml-1.5 rounded bg-ink px-1 align-middle text-[10px] font-bold uppercase text-white">Bot</span>
                )}
              </span>
              {(() => {
                const u = room.members.find((m) => m.id === r.id)?.username;
                if (!signedIn || !u || r.id === me || u === account?.profile?.username) return null;
                return asked[u] ? (
                  <span className="text-xs font-bold">{asked[u]}</span>
                ) : (
                  <button className="rounded-full border-2 border-ink bg-white px-2 text-xs font-bold" onClick={() => addFriend(u)} aria-label={`Add ${r.name} as a friend`}>
                    + Friend
                  </button>
                );
              })()}
              <span className="text-sm tabular">
                {r.status === "kicked" ? "Left" : r.status === "busted" ? "Out" : r.chips.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
        )}
        <div className="flex gap-3">
          <button className="btn flex-1 bg-white py-2 text-lg" onClick={onLeave}>
            Leave
          </button>
          <button className="btn flex-1 bg-lime py-2 text-lg" onClick={onAgain} disabled={busy}>
            Play again
          </button>
          <button
            className={`btn relative grid w-12 shrink-0 place-items-center text-xl ${tab === "chat" ? "bg-ink text-white" : "bg-white"}`}
            onClick={() => setTab(tab === "chat" ? "board" : "chat")}
            aria-label={tab === "chat" ? "Back to leaderboard" : "Open chat"}
            aria-pressed={tab === "chat"}
          >
            {tab === "chat" ? "🏆" : "💬"}
            {tab !== "chat" && chat.length > seen && (
              <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full border-2 border-ink bg-gum px-1 text-[11px] font-bold text-white">
                {chat.length - seen}
              </span>
            )}
          </button>
        </div>
        {sharing && mine && (
          <ShareWin
            kind="winner"
            gloop={mine.avatar}
            face="cool"
            tag="WINNER"
            headline={`${mine.name} took it all`}
            detail={[
              `${mine.chips.toLocaleString()} chips`,
              ranking.length > 1 && `beat ${ranking.length - 1} friend${ranking.length > 2 ? "s" : ""}`,
              room.game?.handNumber && `${room.game.handNumber} hand${room.game.handNumber === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            footer={`Table ${room.code} · ${typeof window !== "undefined" ? window.location.host : "gloopy"}`}
            onClose={() => setSharing(false)}
          />
        )}
        {account && !signedIn && (
          <Link href={`/account?next=/t/${room.code}`} className="mt-3 flex items-center gap-2 rounded-2xl border-[3px] border-ink bg-lime px-3 py-2">
            <span className="flex-1 text-sm">
              <b>Track your wins.</b> Create a free account and this game goes in your history.
            </span>
            <span className="font-display text-2xl font-extrabold">›</span>
          </Link>
        )}
        <p className="mt-3 text-center text-xs text-ink/60">This table closes 15 minutes after the game, or when everyone has left.</p>
      </div>
    </div>
  );
}
