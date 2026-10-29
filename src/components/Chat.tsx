"use client";
import { useEffect, useRef, useState } from "react";
import { GIFS, STICKERS } from "@/lib/gloops";
import type { ChatMessage } from "@/lib/client/useRoom";
import { Gloop } from "./Gloop";
import { GifArt, StickerArt } from "./Sticker";

type Mood = "lobby" | "table";

export function Chat({
  messages,
  me,
  onSend,
  mood,
  className = "",
  autoFocus = false,
}: {
  messages: ChatMessage[];
  me: string | null;
  onSend: (kind: ChatMessage["kind"], body: string) => void;
  mood: Mood;
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<null | "sticker" | "gif">(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, picker]);

  const t = mood === "table";
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    onSend("text", v);
    setText("");
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.length === 0 && (
          <p className={`py-6 text-center text-sm ${t ? "text-dim" : "text-ink/60"}`}>No messages yet. Say hello.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Gloop id={m.avatar} size={26} />
              <div className={`max-w-[78%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
                <span className={`text-[11px] ${t ? "text-dim" : "text-ink/60"}`}>
                  {m.sender_name}
                  {m.watching && " (watching)"}
                </span>
                {m.kind === "text" && (
                  <span
                    className={`inline-block break-words rounded-2xl px-3 py-1.5 text-sm ${
                      t ? (mine ? "bg-felt text-chalk" : "bg-white/10 text-chalk") : mine ? "bg-lime text-ink" : "bg-mist text-ink"
                    }`}
                  >
                    {m.body}
                  </span>
                )}
                {m.kind === "sticker" && <StickerArt id={m.body} size={84} />}
                {m.kind === "gif" && <GifArt id={m.body} size={150} />}
              </div>
            </div>
          );
        })}
      </div>

      {picker && (
        <div className={`grid max-h-56 gap-2 overflow-y-auto p-3 ${picker === "sticker" ? "grid-cols-4" : "grid-cols-2"} ${t ? "border-t border-white/10 bg-black/20" : "border-t-[3px] border-ink bg-mist"}`}>
          {picker === "sticker"
            ? STICKERS.map((s) => (
                <button
                  key={s.id}
                  className="flex justify-center rounded-xl p-1 hover:bg-white/20"
                  onClick={() => {
                    onSend("sticker", s.id);
                    setPicker(null);
                  }}
                  aria-label={`Send sticker: ${s.caption}`}
                >
                  <StickerArt id={s.id} size={64} />
                </button>
              ))
            : GIFS.map((g) => (
                <button
                  key={g.id}
                  className="flex justify-center rounded-xl p-1 hover:bg-white/20"
                  onClick={() => {
                    onSend("gif", g.id);
                    setPicker(null);
                  }}
                  aria-label={`Send GIF: ${g.caption}`}
                >
                  <GifArt id={g.id} size={130} />
                </button>
              ))}
        </div>
      )}

      <div className={`flex items-center gap-2 p-2 ${t ? "border-t border-white/10" : "border-t-[3px] border-ink"}`}>
        <button
          className={`shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold ${picker === "sticker" ? (t ? "bg-white/20 text-chalk" : "bg-lime") : t ? "text-dim" : ""}`}
          onClick={() => setPicker(picker === "sticker" ? null : "sticker")}
          aria-pressed={picker === "sticker"}
        >
          Stickers
        </button>
        <button
          className={`shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold ${picker === "gif" ? (t ? "bg-white/20 text-chalk" : "bg-lime") : t ? "text-dim" : ""}`}
          onClick={() => setPicker(picker === "gif" ? null : "gif")}
          aria-pressed={picker === "gif"}
        >
          GIFs
        </button>
        <input
          className={
            t
              ? "min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-chalk placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-brass"
              : "field min-w-0 flex-1 py-1.5 text-sm"
          }
          placeholder="Say hello…"
          value={text}
          maxLength={200}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label="Chat message"
        />
        <button
          className={t ? "tbtn shrink-0 bg-felt px-3 py-2 text-sm text-chalk" : "btn shrink-0 bg-lime px-3 py-1 text-base"}
          onClick={submit}
        >
          Send
        </button>
      </div>
    </div>
  );
}
