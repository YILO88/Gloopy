"use client";
import { useEffect, useState } from "react";
import { PlayingCard } from "./PlayingCard";
import { Gloop } from "./Gloop";

/** Poker hands from best to worst. `used` marks the cards that make the hand; the rest are dimmed. */
const HANDS: { name: string; meaning: string; cards: string[]; used: number }[] = [
  { name: "Royal Flush", meaning: "A K Q J 10, all one suit", cards: ["As", "Ks", "Qs", "Js", "Ts"], used: 5 },
  { name: "Straight Flush", meaning: "Five in a row, all one suit", cards: ["9h", "8h", "7h", "6h", "5h"], used: 5 },
  { name: "Four of a Kind", meaning: "Four cards of the same number", cards: ["Qc", "Qd", "Qh", "Qs", "7d"], used: 4 },
  { name: "Full House", meaning: "Three of a kind plus a pair", cards: ["Kh", "Kd", "Ks", "4c", "4h"], used: 5 },
  { name: "Flush", meaning: "Any five of the same suit", cards: ["Ad", "Jd", "8d", "5d", "2d"], used: 5 },
  { name: "Straight", meaning: "Five in a row, any suits", cards: ["Tc", "9d", "8h", "7s", "6c"], used: 5 },
  { name: "Three of a Kind", meaning: "Three cards of the same number", cards: ["7c", "7d", "7h", "Ks", "2d"], used: 3 },
  { name: "Two Pair", meaning: "Two different pairs", cards: ["Jh", "Jc", "4d", "4s", "Ac"], used: 4 },
  { name: "Pair", meaning: "Two cards of the same number", cards: ["Ah", "Ad", "Kc", "8s", "3h"], used: 2 },
  { name: "High Card", meaning: "Nothing matches: your highest card plays", cards: ["Ac", "Jd", "8h", "6s", "3c"], used: 1 },
];

/** Small round ⓘ button that opens the rules. */
export function RulesButton({ className = "", label = "Rules and hand rankings" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`grid h-8 w-8 place-items-center rounded-full border-[3px] border-ink bg-lime font-display text-lg font-extrabold leading-none text-ink ${className}`}
        aria-label={label}
        title={label}
      >
        i
      </button>
      {open && <RulesModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function RulesModal({ onClose, start = "hands" }: { onClose: () => void; start?: "hands" | "play" }) {
  const [tab, setTab] = useState<"hands" | "play">(start);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="rules-h">
      <div className="sticker flex max-h-[92dvh] w-full min-w-0 max-w-lg flex-col p-4 text-ink sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <Gloop id="sun" face="smug" size={44} />
          <h2 id="rules-h" className="flex-1 font-display text-2xl font-extrabold">
            How to play
          </h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-ink text-lg font-bold" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2" role="tablist">
          {(["hands", "play"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-xl border-[3px] border-ink py-1 font-display text-lg font-extrabold ${tab === t ? "bg-ink text-white" : "bg-white"}`}
            >
              {t === "hands" ? "Winning hands" : "Rules"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === "hands" ? (
            <>
              <p className="mb-2 text-sm text-ink/70">Best at the top. The highest hand at the end wins the pot.</p>
              <ol className="space-y-2">
                {HANDS.map((h, i) => (
                  <li key={h.name} className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink px-2.5 py-2 ${i === 0 ? "bg-lime" : "bg-mist"}`}>
                    <span className="w-6 shrink-0 text-center font-display text-xl font-extrabold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-lg font-extrabold leading-tight">{h.name}</div>
                      <div className="text-xs text-ink/70">{h.meaning}</div>
                    </div>
                    <div className="flex shrink-0 -space-x-1.5">
                      {h.cards.map((c, k) => (
                        <PlayingCard key={c} card={c} size="sm" dim={k >= h.used} />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <ol className="space-y-3 text-[15px] leading-snug">
              <Step n={1} title="Your cards">
                Everyone gets 2 cards only they can see. Then 5 shared cards are turned face up in the middle: 3 at once, then 1, then 1 more.
              </Step>
              <Step n={2} title="Your hand">
                Make the best 5-card hand from your 2 cards plus the 5 shared ones. See Winning hands for what beats what.
              </Step>
              <Step n={3} title="Your turn">
                <b>Fold</b> to give up the hand. <b>Check</b> to pass if nobody has bet. <b>Call</b> to match a bet.{" "}
                <b>Bet</b> or <b>Raise</b> to put in more.
              </Step>
              <Step n={4} title="Winning the pot">
                Have the best hand when the cards are shown, or be the last one left after everyone else folds. If you win without showing,
                you can choose to show your cards or keep them secret.
              </Step>
              <Step n={5} title="Gloopy table rules">
                The blinds double on the host&apos;s timer, so games keep moving. Miss 3 turns in a row and you&apos;re taken out of the game. Run out
                of chips and you watch until the next game. Last player with chips wins.
              </Step>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-lime font-display font-extrabold">{n}</span>
      <div>
        <div className="font-display text-lg font-extrabold leading-tight">{title}</div>
        <p className="text-ink/80">{children}</p>
      </div>
    </li>
  );
}
