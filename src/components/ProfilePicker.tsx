"use client";
import { useState } from "react";
import { GLOOPS, gloopById } from "@/lib/gloops";
import { Gloop } from "./Gloop";

/** Pick a Gloop and a nickname. */
export function ProfilePicker({
  name,
  avatar,
  onName,
  onAvatar,
}: {
  name: string;
  avatar: string;
  onName: (n: string) => void;
  onAvatar: (a: string) => void;
}) {
  const [bump, setBump] = useState(0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div key={bump} className="wobble">
          <Gloop id={avatar} size={132} />
        </div>
      </div>
      <p className="-mt-2 font-display text-lg font-extrabold">{gloopById(avatar).name}</p>
      <div className="grid grid-cols-9 gap-1.5" role="radiogroup" aria-label="Choose your Gloop">
        {GLOOPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={g.id === avatar}
            aria-label={g.name}
            onClick={() => {
              onAvatar(g.id);
              setBump((b) => b + 1);
            }}
            className={`rounded-full border-[3px] p-0.5 transition ${g.id === avatar ? "border-ink bg-lime" : "border-transparent hover:border-ink/30"}`}
          >
            <Gloop id={g.id} size={30} />
          </button>
        ))}
      </div>
      <label className="w-full">
        <span className="mb-1 block text-sm font-medium">Nickname</span>
        <input
          className="field w-full text-lg"
          value={name}
          maxLength={16}
          placeholder="What should we call you?"
          onChange={(e) => onName(e.target.value)}
          autoComplete="nickname"
        />
      </label>
    </div>
  );
}
