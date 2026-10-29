"use client";
import { useEffect, useRef } from "react";
import type { PublicRoom } from "@/lib/ops";
import { sounds } from "@/lib/client/sound";
import { Gloop } from "./Gloop";

/** End of game: winner sees "You won"; everyone gets the leaderboard and a sound. */
export function Results({ room, me, busy, onAgain, onLeave }: { room: PublicRoom; me: string; busy: boolean; onAgain: () => void; onLeave: () => void }) {
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
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="results-h">
      <div className="sticker w-full max-w-md p-5 text-ink">
        {iWon ? (
          <div className="mb-3 flex flex-col items-center">
            <Gloop id={mine!.avatar} face="laugh" size={110} className="wobble" />
            <h2 id="results-h" className="font-display text-5xl font-extrabold">
              You won
            </h2>
            <p className="text-ink/70">{mine!.chips.toLocaleString()} chips</p>
          </div>
        ) : (
          <div className="mb-3 flex flex-col items-center">
            {mine && <Gloop id={mine.avatar} face="cry" size={80} />}
            <h2 id="results-h" className="font-display text-3xl font-extrabold">
              {mine ? `You finished #${mine.position}` : "Game over"}
            </h2>
          </div>
        )}
        <h3 className="mb-2 font-display text-xl font-extrabold">Leaderboard</h3>
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
        <div className="grid grid-cols-2 gap-3">
          <button className="btn bg-white py-2 text-lg" onClick={onLeave}>
            Leave
          </button>
          <button className="btn bg-lime py-2 text-lg" onClick={onAgain} disabled={busy}>
            Play again
          </button>
        </div>
      </div>
    </div>
  );
}
