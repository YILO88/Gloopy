import { describe, expect, it } from "vitest";
import { seededRng } from "@/engine/cards";
import { FINISHED_LIMIT_MS, IDLE_LIMIT_MS, applyOp, isExpired, newRoom, toPublic } from "./ops";
import { MemoryStore, loadLive, mutateRoom } from "./server/store";

const rng = seededRng(7);
const T0 = 2_000_000;

async function setup(n: number) {
  const store = new MemoryStore();
  const room = newRoom("GLOOP", "u0", "Host", "lime", T0);
  await store.create("GLOOP", room, toPublic(room, T0));
  for (let i = 1; i < n; i++) {
    await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, `u${i}`, { op: "join", name: `P${i}`, avatar: "berry" }, now, rng), () => T0 + i);
  }
  return store;
}

describe("room operations through the store", () => {
  it("starts a game and stores each player's new cards privately", async () => {
    const store = await setup(3);
    const { room, pub } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u0", { op: "start" }, now, rng), () => T0 + 100);
    expect(pub.phase).toBe("playing");
    for (const id of ["u0", "u1", "u2"]) {
      expect(store.holes.get(`GLOOP/${id}`)?.cards).toEqual(room.game!.hand!.seats[id].hole);
    }
    // Public state never includes anyone's face-down cards.
    const json = JSON.stringify(store.rooms.get("GLOOP")!.pub);
    for (const id of ["u0", "u1", "u2"]) for (const c of room.game!.hand!.seats[id].hole) expect(json).not.toContain(`"${c}"`);
  });

  it("refuses names and avatars that aren't allowed", async () => {
    const store = await setup(1);
    await expect(
      mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "x", { op: "join", name: "   ", avatar: "lime" }, now, rng)),
    ).rejects.toThrow(/nickname/);
    await expect(
      mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "x", { op: "join", name: "Bob", avatar: "<script>" }, now, rng)),
    ).rejects.toThrow(/Gloop/);
  });

  it("people who aren't in the room can't play", async () => {
    const store = await setup(2);
    await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u0", { op: "start" }, now, rng), () => T0 + 100);
    await expect(
      mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "stranger", { op: "act", action: { type: "fold" } }, now, rng)),
    ).rejects.toThrow(/Join the room/);
  });

  it("retries when two moves land at once, without losing either", async () => {
    const store = await setup(2);
    let interfered = false;
    store.interfere = (code) => {
      if (interfered) return;
      interfered = true;
      // Someone else's join lands between our load and save.
      const cur = store.rooms.get(code)!;
      const other = applyOp(cur.room, "sneaky", { op: "join", name: "Sneaky", avatar: "sky" }, T0 + 50, rng);
      store.rooms.set(code, { room: other, version: cur.version + 1, pub: toPublic(other, T0 + 50), updatedAt: Date.now() });
    };
    const { pub } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "late", { op: "join", name: "Late", avatar: "sun" }, now, rng), () => T0 + 60);
    expect(pub.members.map((m) => m.id)).toEqual(["u0", "u1", "sneaky", "late"]);
  });

  it("an early timer check changes nothing and doesn't write", async () => {
    const store = await setup(2);
    await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u0", { op: "start" }, now, rng), () => T0 + 100);
    const v = store.rooms.get("GLOOP")!.version;
    await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u1", { op: "tick" }, now, rng), () => T0 + 200);
    expect(store.rooms.get("GLOOP")!.version).toBe(v);
  });

  it("a timer check after the deadline auto-folds and moves on", async () => {
    const store = await setup(3);
    const { room } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u0", { op: "start" }, now, rng), () => T0 + 100);
    const deadline = room.game!.hand!.deadline!;
    const who = room.game!.hand!.toAct!;
    const { pub } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u2", { op: "tick" }, now, rng), () => deadline + 1);
    expect(pub.game!.seats.find((s) => s.id === who)!.folded).toBe(true);
    expect(pub.game!.toAct).not.toBe(who);
  });

  it("a full game played through the store, then play again", async () => {
    const store = await setup(4);
    let t = T0 + 100;
    let { room } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u0", { op: "start" }, now, rng), () => t);
    for (let i = 0; i < 3000 && room.phase === "playing"; i++) {
      t += 500;
      const h = room.game!.hand!;
      if (h.toAct) {
        ({ room } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, h.toAct!, { op: "act", action: { type: "allin" } }, now, rng), () => t));
      } else {
        t = Math.max(t, room.game!.nextHandAt ?? t);
        ({ room } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u1", { op: "tick" }, now, rng), () => t));
      }
    }
    expect(room.phase).toBe("results");
    expect(room.game!.ranking).toHaveLength(4);
    ({ room } = await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u3", { op: "again" }, now, rng), () => t + 1));
    expect(room.phase).toBe("lobby");
    expect(room.game).toBeNull();
  });

  it("tables expire: idle 24 hours, 15 minutes after a game ends, or once everyone has left", async () => {
    const room = newRoom("OLDIE", "u0", "Host", "lime", T0);
    expect(isExpired(room, T0, T0 + IDLE_LIMIT_MS - 1)).toBe(false);
    expect(isExpired(room, T0, T0 + IDLE_LIMIT_MS + 1)).toBe(true);
    const finished = { ...room, phase: "results" as const };
    expect(isExpired(finished, T0, T0 + FINISHED_LIMIT_MS - 1)).toBe(false);
    expect(isExpired(finished, T0, T0 + FINISHED_LIMIT_MS + 1)).toBe(true);
    expect(isExpired({ ...room, members: [] }, T0, T0)).toBe(true);

    // An expired table is deleted on the next visit, and its link stops working.
    const store = new MemoryStore();
    await store.create("OLDIE", room, toPublic(room, T0));
    store.rooms.get("OLDIE")!.updatedAt = Date.now() - IDLE_LIMIT_MS - 1000;
    await expect(loadLive(store, "OLDIE")).rejects.toThrow(/expired/);
    expect(store.rooms.has("OLDIE")).toBe(false);
  });

  it("the table closes as soon as the last person leaves the lobby", async () => {
    const store = await setup(2);
    await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u1", { op: "leave" }, now, rng), () => T0 + 10);
    expect(store.rooms.has("GLOOP")).toBe(true);
    await mutateRoom(store, "GLOOP", (r, now) => applyOp(r, "u0", { op: "leave" }, now, rng), () => T0 + 20);
    expect(store.rooms.has("GLOOP")).toBe(false);
  });
});
