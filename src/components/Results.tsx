"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicRoom } from "@/lib/ops";
import { sounds } from "@/lib/client/sound";
import type { ChatMessage } from "@/lib/client/useRoom";
import { Gloop } from "./Gloop";
import { Chat } from "./Chat";
import { ShareWin } from "./ShareWin";

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
        {/* Leaderboard and the game's chat, side by side as tabs */}
        <div className="mb-3 grid grid-cols-2 gap-2" role="tablist">
          {(["board", "chat"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-xl border-[3px] border-ink py-1 font-display text-lg font-extrabold ${tab === t ? "bg-ink text-white" : "bg-white"}`}
            >
              {t === "board" ? "Leaderboard" : `Chat${chat.length ? ` (${chat.length})` : ""}`}
            </button>
          ))}
        </div>
        {tab === "chat" ? (
          <div className="mb-4 flex h-[46dvh] min-h-[260px] flex-col overflow-hidden rounded-2xl border-[3px] border-ink">
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
              </span>
              <span className="text-sm tabular">
                {r.status === "kicked" ? "Left" : r.status === "busted" ? "Out" : r.chips.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn bg-white py-2 text-lg" onClick={onLeave}>
            Leave
          </button>
          <button className="btn bg-lime py-2 text-lg" onClick={onAgain} disabled={busy}>
            Play again
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
        <p className="mt-3 text-center text-xs text-ink/60">This table closes 15 minutes after the game, or when everyone has left.</p>
      </div>
    </div>
  );
}
