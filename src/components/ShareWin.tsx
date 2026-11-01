"use client";
import { useEffect, useRef, useState } from "react";
import { drawWinCard, type WinCardInput } from "@/lib/client/shareCard";
import { Gloop, type Face } from "./Gloop";

type Props = Omit<WinCardInput, "gloopSvg"> & { gloop: string; face: Face; onClose: () => void };

/** "Share your win": shows the picture, then share (phones), copy (paste into Discord) or download. */
export function ShareWin({ gloop, face, onClose, ...card }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const key = JSON.stringify(card);

  useEffect(() => {
    let gone = false;
    let made: string | null = null;
    const svg = holder.current?.querySelector("svg")?.outerHTML ?? "";
    drawWinCard({ ...card, gloopSvg: svg })
      .then((b) => {
        if (gone) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      })
      .catch(() => setNote("Couldn't make the picture"));
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const file = blob ? new File([blob], "gloopy-win.png", { type: "image/png" }) : null;
  const canShare = typeof navigator !== "undefined" && !!file && !!navigator.canShare?.({ files: [file] });
  const canCopy = typeof window !== "undefined" && "ClipboardItem" in window && !!navigator.clipboard?.write;

  const share = async () => {
    if (!file) return;
    try {
      // Picture only: adding a title or text hides apps that only take images (Snapchat, Instagram),
      // and iPhones drop the picture when text comes with it.
      await navigator.share({ files: [file] });
    } catch {}
  };
  const copy = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setNote("Copied. Paste it in Discord");
    } catch {
      setNote("Copy didn't work here. Use Download");
    }
  };
  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "gloopy-win.png";
    a.click();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Share your win" onClick={onClose}>
      <div className="sticker w-full max-w-sm p-4 text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold">Share your win</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-ink bg-white font-bold">
            ✕
          </button>
        </div>
        <div ref={holder} className="hidden" aria-hidden>
          <Gloop id={gloop} face={face} size={100} />
        </div>
        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-mist">
          {url ? <img src={url} alt={`${card.headline}. ${card.detail}`} className="h-full w-full" /> : <div className="grid h-full place-items-center text-sm text-ink/60">Making your picture…</div>}
        </div>
        <div className={`mt-3 grid gap-2 ${canShare ? "grid-cols-2" : canCopy ? "grid-cols-2" : "grid-cols-1"}`}>
          {canShare && (
            <button className="btn bg-lime py-2 text-lg" onClick={share} disabled={!blob}>
              Share
            </button>
          )}
          {!canShare && canCopy && (
            <button className="btn bg-lime py-2 text-lg" onClick={copy} disabled={!blob}>
              Copy picture
            </button>
          )}
          <button className="btn bg-white py-2 text-lg" onClick={download} disabled={!blob}>
            Download
          </button>
        </div>
        {note && <p className="mt-2 text-center text-sm font-semibold">{note}</p>}
      </div>
    </div>
  );
}
