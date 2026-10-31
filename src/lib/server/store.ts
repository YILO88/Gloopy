/**
 * Loading and saving rooms. Two implementations:
 *  - SupabaseStore: the real one (server only, uses the secret service key).
 *  - MemoryStore: for tests and for running locally without Supabase.
 * Both use a version number so two moves arriving at once can't overwrite each other.
 */
import { Room } from "@/engine/room";
import { PublicRoom, isExpired, newHoles, toPublic } from "@/lib/ops";

export interface Loaded {
  room: Room;
  version: number;
  /** When anything last happened at this table (ms). */
  updatedAt: number;
}

export interface RoomStore {
  load(code: string): Promise<Loaded | null>;
  create(code: string, room: Room, pub: PublicRoom): Promise<boolean>;
  save(
    code: string,
    expected: number,
    room: Room,
    pub: PublicRoom,
    holes: ReturnType<typeof newHoles>,
  ): Promise<boolean>;
  /** Close a table for good: the link stops working and its cards and chat are deleted. */
  remove(code: string): Promise<void>;
}

/** Load a table, closing it instead if it has expired (idle 24h, finished and abandoned, or empty). */
export async function loadLive(store: RoomStore, code: string, now = Date.now()): Promise<Loaded> {
  const loaded = await store.load(code);
  if (!loaded) throw new NotFoundError("Room not found");
  if (isExpired(loaded.room, loaded.updatedAt, now)) {
    await store.remove(code);
    throw new NotFoundError("Room expired");
  }
  return loaded;
}

export class ConflictError extends Error {}

export interface ChatRow {
  id: number;
  room_code: string;
  sender_id: string;
  sender_name: string;
  avatar: string;
  watching: boolean;
  kind: "text" | "sticker" | "gif";
  body: string;
  created_at: string;
}

/**
 * Load → change → save, retrying if someone else saved first.
 * Skips the write when nothing changed (e.g. a timer check that was too early).
 */
export async function mutateRoom(
  store: RoomStore,
  code: string,
  change: (room: Room, now: number) => Room,
  nowFn: () => number = Date.now,
): Promise<{ room: Room; pub: PublicRoom }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const now = nowFn();
    const loaded = await loadLive(store, code, now);
    const next = change(loaded.room, now);
    if (JSON.stringify(next) === JSON.stringify(loaded.room)) {
      return { room: loaded.room, pub: toPublic(loaded.room, now) };
    }
    const pub = toPublic(next, now);
    if (next.members.length === 0) {
      // Everyone has left: the table closes and its link stops working.
      await store.remove(code);
      return { room: next, pub };
    }
    const ok = await store.save(code, loaded.version, next, pub, newHoles(loaded.room, next));
    if (ok) return { room: next, pub };
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new ConflictError("The table is busy, try again");
}

export class NotFoundError extends Error {}

// ------------------------------------------------------------------ in-memory

export class MemoryStore implements RoomStore {
  rooms = new Map<string, { room: Room; version: number; pub: PublicRoom; updatedAt: number }>();
  holes = new Map<string, { hand_number: number; cards: string[] }>(); // key: code/player
  chat = new Map<string, ChatRow[]>();
  /** Simulate someone else saving between load and save (for tests). */
  interfere?: (code: string) => void;

  async load(code: string) {
    const r = this.rooms.get(code);
    return r ? { room: structuredClone(r.room), version: r.version, updatedAt: r.updatedAt } : null;
  }
  async create(code: string, room: Room, pub: PublicRoom) {
    if (this.rooms.has(code)) return false;
    this.rooms.set(code, { room: structuredClone(room), version: 1, pub, updatedAt: Date.now() });
    return true;
  }
  async save(code: string, expected: number, room: Room, pub: PublicRoom, holes: ReturnType<typeof newHoles>) {
    this.interfere?.(code);
    const r = this.rooms.get(code);
    if (!r || r.version !== expected) return false;
    this.rooms.set(code, { room: structuredClone(room), version: expected + 1, pub, updatedAt: Date.now() });
    for (const h of holes ?? []) this.holes.set(`${code}/${h.player_id}`, { hand_number: h.hand_number, cards: h.cards });
    return true;
  }

  async remove(code: string) {
    this.rooms.delete(code);
    this.chat.delete(code);
    for (const k of [...this.holes.keys()]) if (k.startsWith(code + "/")) this.holes.delete(k);
  }
}
