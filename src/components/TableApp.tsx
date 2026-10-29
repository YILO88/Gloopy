"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/client/useRoom";
import { loadProfile, saveProfile } from "@/lib/client/api";
import { sounds } from "@/lib/client/sound";
import { GLOOPS } from "@/lib/gloops";
import { Gloop } from "./Gloop";
import { Lobby } from "./Lobby";
import { ProfilePicker } from "./ProfilePicker";
import { Results } from "./Results";
import { Table } from "./Table";

export function TableApp({ code }: { code: string }) {
  const router = useRouter();
  const r = useRoom(code);
  const { room, me } = r;

  const leave = async () => {
    await r.leave();
    router.push("/");
  };

  if (r.notFound)
    return (
      <Centered>
        <Gloop id="sky" face="shock" size={110} />
        <h1 className="font-display text-3xl font-extrabold">No table called {code}</h1>
        <p>It may have closed, or the code has a typo.</p>
        <Link href="/" className="btn mt-2 inline-block bg-lime px-5 py-2 text-xl">
          Back to start
        </Link>
      </Centered>
    );

  if (!room || !me)
    return (
      <Centered>
        <Gloop id="lime" face="happy" size={90} className="wobble" />
        <p className="font-display text-2xl font-extrabold">{r.error ?? "Finding the table…"}</p>
      </Centered>
    );

  const member = room.members.find((m) => m.id === me);
  if (!member) return <JoinScreen room={room} busy={r.busy} error={r.error} onJoin={r.join} />;

  if (room.phase === "lobby")
    return (
      <Lobby
        room={room}
        me={me}
        chat={r.chat}
        busy={r.busy}
        onStart={() => {
          sounds.unlock();
          r.start();
        }}
        onLeave={leave}
        onSettings={r.updateSettings}
        onChat={r.sendChat}
      />
    );

  return (
    <Table
      room={room}
      me={me}
      myCards={r.myCards}
      chat={r.chat}
      busy={r.busy}
      error={r.error}
      serverNow={r.serverNow}
      onAct={r.act}
      onChat={r.sendChat}
      onLeave={leave}
    >
      {room.phase === "results" && <Results room={room} me={me} busy={r.busy} onAgain={r.again} onLeave={leave} />}
    </Table>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="sticker flex max-w-sm flex-col items-center gap-2 p-6 text-center">{children}</div>
    </main>
  );
}

function JoinScreen({
  room,
  busy,
  error,
  onJoin,
}: {
  room: NonNullable<ReturnType<typeof useRoom>["room"]>;
  busy: boolean;
  error: string | null;
  onJoin: (name: string, avatar: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(GLOOPS[0].id);
  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setName(p.name);
      setAvatar(p.avatar);
    } else setAvatar(GLOOPS[Math.floor(Math.random() * GLOOPS.length)].id);
  }, []);
  const host = room.members.find((m) => m.id === room.hostId);
  const seated = room.members.filter((m) => m.role === "player").length;
  const willWait = room.phase !== "lobby" || seated >= room.settings.maxSeats;

  return (
    <main className="min-h-dvh px-4 py-8">
      <h1 className="mb-6 text-center font-display text-5xl font-extrabold text-lime [text-shadow:0_4px_0_#1c1b3a]">gloopy</h1>
      <section className="sticker mx-auto max-w-md p-5">
        <h2 className="mb-1 text-center font-display text-2xl font-extrabold">Join {host?.name ?? "the"}&apos;s table</h2>
        <p className="mb-4 text-center text-sm text-ink/70">
          {willWait
            ? room.phase !== "lobby"
              ? "A game is in progress. You'll watch and get a seat in the next game."
              : "The table is full. You'll wait and watch, and get the next free seat."
            : `${seated} of ${room.settings.maxSeats} seats taken.`}
        </p>
        <ProfilePicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
        <button
          className="btn mt-5 w-full bg-lime py-3 text-2xl"
          disabled={busy || !name.trim()}
          onClick={() => {
            sounds.unlock();
            saveProfile({ name: name.trim(), avatar });
            onJoin(name.trim(), avatar);
          }}
        >
          {willWait ? "Join and watch" : "Take a seat"}
        </button>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-[#ffe1e1] px-3 py-2 font-medium text-[#a1122a]">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
