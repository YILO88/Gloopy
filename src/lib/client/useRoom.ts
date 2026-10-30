"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "@/engine/game";
import type { Settings } from "@/engine/game";
import type { PublicRoom } from "@/lib/ops";
import { ApiError, DEV, RoomResponse, api, identity, supabase } from "./api";

export interface ChatMessage {
  id: number;
  sender_id: string;
  sender_name: string;
  avatar: string;
  watching: boolean;
  kind: "text" | "sticker" | "gif";
  body: string;
  created_at: string;
}

export function useRoom(code: string) {
  const [me, setMe] = useState<string | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [cards, setCards] = useState<{ hand: number; cards: string[] }>({ hand: -1, cards: [] });
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<Set<string> | null>(null); // who has the game open right now
  const offset = useRef(0); // server clock minus my clock
  const roomRef = useRef<PublicRoom | null>(null);

  const accept = useCallback((res: RoomResponse) => {
    offset.current = res.serverNow - Date.now();
    const cur = roomRef.current;
    if (!cur || res.room.savedAt >= cur.savedAt) {
      roomRef.current = res.room;
      setRoom(res.room);
    }
    const hand = res.room.game?.handNumber ?? -1;
    if (res.myCards.length) setCards({ hand, cards: res.myCards });
  }, []);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  // ---------------------------------------------------------- initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { id } = await identity();
        if (!alive) return;
        setMe(id);
        accept(await api(`/api/rooms/${code}`));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, accept]);

  // ---------------------------------------------------------- live updates
  useEffect(() => {
    if (!me) return;
    if (DEV) {
      // Test mode: poll.
      const t = setInterval(async () => {
        try {
          accept(await api(`/api/rooms/${code}`));
          const c = await api<{ messages: ChatMessage[] }>(`/api/rooms/${code}/chat`);
          setChat(c.messages);
        } catch {}
      }, 700);
      return () => clearInterval(t);
    }
    const sb = supabase();
    let cancelled = false;
    sb.from("chat_messages")
      .select("*")
      .eq("room_code", code)
      .order("id", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled && data) setChat((data as ChatMessage[]).reverse());
      });
    const ch = sb
      .channel(`room:${code}`, { config: { presence: { key: me } } })
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, (p) => {
        const state = (p.new as { state?: PublicRoom }).state;
        if (!state) return;
        const cur = roomRef.current;
        if (!cur || state.savedAt >= cur.savedAt) {
          roomRef.current = state;
          setRoom(state);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "hole_cards", filter: `room_code=eq.${code}` }, (p) => {
        const row = p.new as { player_id?: string; hand_number?: number; cards?: string[] };
        if (row.player_id === me && row.cards) setCards({ hand: row.hand_number!, cards: row.cards });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_code=eq.${code}` }, (p) => {
        setChat((c) => [...c.slice(-99), p.new as ChatMessage]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
      });
    // If the phone was asleep, catch up when it wakes.
    const wake = () => {
      if (document.visibilityState === "visible") api(`/api/rooms/${code}`).then(accept).catch(() => {});
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", wake);
      sb.removeChannel(ch);
    };
  }, [me, code, accept]);

  // ---------------------------------------------------------- lazy timers
  // When a turn deadline or the next deal is due, ask the server to catch up.
  const deadline = room?.game?.toAct ? room.game.deadline : null;
  const nextHand = room?.phase === "playing" ? room.game?.nextHandAt ?? null : null;
  useEffect(() => {
    const target = Math.min(deadline ?? Infinity, nextHand ?? Infinity);
    if (!isFinite(target)) return;
    const wait = Math.max(0, target - serverNow()) + 250 + Math.random() * 400;
    const t = setTimeout(() => {
      api(`/api/rooms/${code}`, { op: "tick" }).then(accept).catch(() => {});
    }, wait);
    return () => clearTimeout(t);
  }, [deadline, nextHand, code, accept, serverNow]);

  // ---------------------------------------------------------- actions
  const send = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        accept(await api(`/api/rooms/${code}`, body));
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [code, accept],
  );

  const sendChat = useCallback(
    async (kind: ChatMessage["kind"], body: string) => {
      try {
        await api(`/api/rooms/${code}/chat`, { kind, body });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [code],
  );

  const myCards = room?.game && cards.hand === room.game.handNumber ? cards.cards : [];
  // Test mode has no presence: fall back to who hasn't left.
  const isOnline = (id: string) =>
    online ? online.has(id) : !!room?.members.find((m) => m.id === id && m.connected);

  return {
    me,
    room,
    myCards,
    chat,
    error,
    setError,
    notFound,
    busy,
    serverNow,
    isOnline,
    join: (name: string, avatar: string) => send({ op: "join", name, avatar }),
    leave: () => send({ op: "leave" }),
    start: () => send({ op: "start" }),
    again: () => send({ op: "again" }),
    updateSettings: (settings: Settings) => send({ op: "settings", settings }),
    act: (action: Action) => send({ op: "act", action }),
    sendChat,
  };
}
