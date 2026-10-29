/**
 * Rooms: the lobby, the waiting room and the host's crown around a poker game.
 * Pure functions, like the game engine.
 */
import { Rng } from "./cards";
import { Entrant, GameError, GameState, Settings, DEFAULT_SETTINGS, createGame, validateSettings } from "./game";

export interface Member extends Entrant {
  joinedAt: number;
  /** "player" = has a seat for the current or next game; "waiting" = watching, queued for the next game. */
  role: "player" | "waiting";
  connected: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  settings: Settings;
  members: Member[];
  phase: "lobby" | "playing" | "results";
  game: GameState | null;
  gameNumber: number;
}

const clone = <T>(x: T): T => structuredClone(x);

export function createRoom(code: string, host: Entrant, now: number, settings: Settings = DEFAULT_SETTINGS): Room {
  return {
    code,
    hostId: host.id,
    settings: clone(settings),
    members: [{ ...host, joinedAt: now, role: "player", connected: true }],
    phase: "lobby",
    game: null,
    gameNumber: 0,
  };
}

export function seatedCount(room: Room) {
  return room.members.filter((m) => m.role === "player").length;
}

/** Waiting-room queue, first come first served. */
export function waitingQueue(room: Room): Member[] {
  return room.members.filter((m) => m.role === "waiting").sort((a, b) => a.joinedAt - b.joinedAt);
}

/** Joining the lobby takes a seat if one is free; otherwise (or once the game has started) you wait and watch. */
export function joinRoom(room: Room, who: Entrant, now: number): Room {
  const r = clone(room);
  const existing = r.members.find((m) => m.id === who.id);
  if (existing) {
    existing.connected = true;
    existing.name = who.name;
    existing.avatar = who.avatar;
    return r;
  }
  const seatFree = r.phase === "lobby" && seatedCount(r) < r.settings.maxSeats;
  r.members.push({ ...who, joinedAt: now, role: seatFree ? "player" : "waiting", connected: true });
  return r;
}

export function setConnected(room: Room, id: string, connected: boolean): Room {
  const r = clone(room);
  const m = r.members.find((x) => x.id === id);
  if (m) m.connected = connected;
  if (!connected && r.hostId === id) passCrown(r);
  return r;
}

/** Leaving: in the lobby you're removed; during a game your seat stays and missed turns take over. */
export function leaveRoom(room: Room, id: string): Room {
  const r = clone(room);
  const m = r.members.find((x) => x.id === id);
  if (!m) return r;
  if (r.phase === "playing" && m.role === "player") {
    m.connected = false;
  } else {
    r.members = r.members.filter((x) => x.id !== id);
    if (r.phase === "lobby" && m.role === "player") promoteWaiting(r);
  }
  if (r.hostId === id) passCrown(r);
  return r;
}

/** Crown goes to the next connected player in seat order (or join order in the lobby), then to watchers. */
function passCrown(r: Room) {
  const seatOf = (id: string) => r.game?.players.find((p) => p.id === id)?.seat ?? 99;
  const players = r.members.filter((m) => m.role === "player" && m.connected && m.id !== r.hostId);
  const oldSeat = seatOf(r.hostId);
  players.sort((a, b) => {
    // seats after the old host's first, wrapping round
    const sa = (seatOf(a.id) - oldSeat + 100) % 100;
    const sb = (seatOf(b.id) - oldSeat + 100) % 100;
    return sa - sb || a.joinedAt - b.joinedAt;
  });
  const next = players[0] ?? waitingQueue(r).find((m) => m.connected && m.id !== r.hostId);
  if (next) r.hostId = next.id;
}

function promoteWaiting(r: Room) {
  for (const m of waitingQueue(r)) {
    if (seatedCount(r) >= r.settings.maxSeats) break;
    m.role = "player";
  }
}

export function updateSettings(room: Room, by: string, settings: Settings): Room {
  if (room.hostId !== by) throw new GameError("Only the host can change the table settings");
  if (room.phase !== "lobby") throw new GameError("Settings can only change in the lobby");
  const err = validateSettings(settings);
  if (err) throw new GameError(err);
  const r = clone(room);
  r.settings = clone(settings);
  // Fewer seats than players: latest arrivals move to the waiting room (never the host).
  const seated = r.members.filter((m) => m.role === "player").sort((a, b) => a.joinedAt - b.joinedAt);
  while (seated.length > r.settings.maxSeats) {
    const idx = [...seated].reverse().findIndex((m) => m.id !== r.hostId);
    const victim = seated.splice(seated.length - 1 - idx, 1)[0];
    victim.role = "waiting";
  }
  promoteWaiting(r);
  return r;
}

/** Host presses Start: seats don't need to be full, just 2 or more players. */
export function startGame(room: Room, by: string, now: number, rng: Rng): Room {
  if (room.hostId !== by) throw new GameError("Only the host can start the game");
  if (room.phase !== "lobby") throw new GameError("The game has already started");
  const r = clone(room);
  // Players who wandered off in the lobby lose their seat to people waiting.
  const seated = r.members.filter((m) => m.role === "player" && m.connected).sort((a, b) => a.joinedAt - b.joinedAt);
  if (seated.length < 2) throw new GameError("You need at least 2 players to start");
  r.game = createGame(r.settings, seated.map(({ id, name, avatar }) => ({ id, name, avatar })), now, rng);
  r.phase = "playing";
  r.gameNumber += 1;
  return r;
}

/** Call after any game update: moves the room to the results screen when the game ends. */
export function syncPhase(room: Room): Room {
  if (room.phase === "playing" && room.game?.status === "finished") {
    const r = clone(room);
    r.phase = "results";
    return r;
  }
  return room;
}

/** Play again: everyone back to the lobby with chips reset; the waiting queue fills open seats in order. */
export function backToLobby(room: Room): Room {
  if (room.phase !== "results") throw new GameError("The game hasn't finished yet");
  const r = clone(room);
  r.phase = "lobby";
  r.game = null;
  // Disconnected members are dropped; everyone else keeps or queues for a seat.
  r.members = r.members.filter((m) => m.connected);
  const players = r.members.filter((m) => m.role === "player");
  if (players.length > r.settings.maxSeats) {
    players.sort((a, b) => a.joinedAt - b.joinedAt).slice(r.settings.maxSeats).forEach((m) => (m.role = "waiting"));
  }
  promoteWaiting(r);
  if (!r.members.some((m) => m.id === r.hostId)) passCrown(r);
  return r;
}

/** Short, easy-to-type room codes (no 0/O/1/I confusion). */
export function makeRoomCode(rng: Rng, length = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < length; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
  return s;
}
