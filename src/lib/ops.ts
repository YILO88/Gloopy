/**
 * Every change to a room goes through `applyOp`. It checks who is asking and what
 * they're allowed to do, runs the engine, then catches up any timers.
 * Pure: easy to test, and the API route just loads → applyOp → saves.
 */
import { Rng } from "@/engine/cards";
import { Action, GameError, PublicGame, Settings, act, advance, holeCards, publicView } from "@/engine/game";
import {
  Member,
  Room,
  backToLobby,
  createRoom,
  joinRoom,
  leaveRoom,
  startGame,
  syncPhase,
  updateSettings,
} from "@/engine/room";
import { isGloop } from "./gloops";

export type Op =
  | { op: "join"; name: string; avatar: string }
  | { op: "leave" }
  | { op: "settings"; settings: Settings }
  | { op: "start" }
  | { op: "act"; action: Action }
  | { op: "tick" }
  | { op: "again" };

export interface PublicMember {
  id: string;
  name: string;
  avatar: string;
  role: Member["role"];
  connected: boolean;
  joinedAt: number;
}

/** What every browser in the room may see. */
export interface PublicRoom {
  code: string;
  hostId: string;
  phase: Room["phase"];
  settings: Settings;
  members: PublicMember[];
  gameNumber: number;
  game: PublicGame | null;
  savedAt: number;
}

export function cleanName(name: unknown): string {
  if (typeof name !== "string") throw new GameError("Pick a nickname");
  const n = name.replace(/\s+/g, " ").trim().slice(0, 16);
  if (!n) throw new GameError("Pick a nickname");
  return n;
}

export function cleanAvatar(avatar: unknown): string {
  if (!isGloop(avatar)) throw new GameError("Pick a Gloop");
  return avatar;
}

export function newRoom(code: string, userId: string, name: unknown, avatar: unknown, now: number): Room {
  return createRoom(code, { id: userId, name: cleanName(name), avatar: cleanAvatar(avatar) }, now);
}

function requireMember(room: Room, userId: string) {
  if (!room.members.some((m) => m.id === userId)) throw new GameError("Join the room first");
}

export function applyOp(room: Room, userId: string, op: Op, now: number, rng: Rng): Room {
  let r = room;
  // Catch up timers first, so a move is judged against the real current state.
  if (r.game) r = { ...r, game: advance(r.game, now, rng) };
  r = syncPhase(r);

  switch (op.op) {
    case "join":
      r = joinRoom(r, { id: userId, name: cleanName(op.name), avatar: cleanAvatar(op.avatar) }, now);
      break;
    case "leave":
      requireMember(r, userId);
      r = leaveRoom(r, userId);
      break;
    case "settings":
      r = updateSettings(r, userId, op.settings);
      break;
    case "start":
      r = startGame(r, userId, now, rng);
      break;
    case "act":
      requireMember(r, userId);
      if (r.phase !== "playing" || !r.game) throw new GameError("No game in progress");
      r = { ...r, game: act(r.game, userId, op.action, now) };
      break;
    case "tick":
      break;
    case "again":
      requireMember(r, userId);
      r = backToLobby(r);
      break;
    default:
      throw new GameError("Unknown request");
  }
  return syncPhase(r);
}

export function toPublic(room: Room, now: number): PublicRoom {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    members: room.members.map(({ id, name, avatar, role, connected, joinedAt }) => ({ id, name, avatar, role, connected, joinedAt })),
    gameNumber: room.gameNumber,
    game: room.game ? publicView(room.game) : null,
    savedAt: now,
  };
}

/** Newly dealt cards to store privately, or null if no new hand was dealt. */
export function newHoles(before: Room | null, after: Room): { player_id: string; hand_number: number; cards: string[] }[] | null {
  const g = after.game;
  if (!g?.hand) return null;
  const same = before?.game && before.gameNumber === after.gameNumber && before.game.handNumber === g.handNumber;
  if (same) return null;
  return g.hand.order.map((id) => ({ player_id: id, hand_number: g.handNumber, cards: holeCards(g, id) }));
}
