/**
 * Rooms: the lobby, the waiting room and the host's crown around a poker game.
 * Pure functions, like the game engine.
 */
import { Rng } from "./cards";
import { BotLevel, Entrant, GameError, GameState, Settings, DEFAULT_SETTINGS, createGame, removePlayer, validateSettings } from "./game";

export interface Member extends Entrant {
  /** Set when this person is signed in with a Gloopy account (their @username). */
  username?: string;
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
  /** Players the host removed: they can't rejoin this table. */
  removed?: string[];
}

const clone = <T>(x: T): T => structuredClone(x);

export function createRoom(code: string, host: Entrant & { username?: string }, now: number, settings: Settings = DEFAULT_SETTINGS): Room {
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
/** Names are unique at a table (ignoring case and spaces), so nobody can pose as someone else. */
export function nameTaken(room: Room, name: string, exceptId: string): boolean {
  const key = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return room.members.some((m) => m.id !== exceptId && key(m.name) === key(name));
}

export function joinRoom(room: Room, who: Entrant & { username?: string }, now: number): Room {
  if (room.removed?.includes(who.id)) throw new GameError("The host removed you from this table.");
  if (nameTaken(room, who.name, who.id)) throw new GameError(`"${who.name}" is already at this table. Pick another nickname.`);
  const r = clone(room);
  const existing = r.members.find((m) => m.id === who.id);
  if (existing) {
    existing.connected = true;
    existing.name = who.name;
    existing.avatar = who.avatar;
    if (who.username) existing.username = who.username;
    else delete existing.username;
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
  const players = r.members.filter((m) => m.role === "player" && m.connected && !m.bot && m.id !== r.hostId);
  const oldSeat = seatOf(r.hostId);
  players.sort((a, b) => {
    // seats after the old host's first, wrapping round
    const sa = (seatOf(a.id) - oldSeat + 100) % 100;
    const sb = (seatOf(b.id) - oldSeat + 100) % 100;
    return sa - sb || a.joinedAt - b.joinedAt;
  });
  const next = players[0] ?? waitingQueue(r).find((m) => m.connected && !m.bot && m.id !== r.hostId);
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
  // Fewer seats than players: bots leave first (newest first), then latest arrivals wait (never the host).
  while (r.members.filter((m) => m.role === "player").length > r.settings.maxSeats) {
    const bots = r.members.filter((m) => m.bot).sort((a, b) => b.joinedAt - a.joinedAt);
    if (!bots.length) break;
    r.members = r.members.filter((m) => m.id !== bots[0].id);
  }
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
  if (!seated.some((m) => !m.bot)) throw new GameError("At least one person needs to play");
  r.game = createGame(r.settings, seated.map(({ id, name, avatar, bot }) => (bot ? { id, name, avatar, bot } : { id, name, avatar })), now, rng);
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

/** The host removes someone from the table (lobby, game or waiting room). They can't rejoin. */
export function kickMember(room: Room, by: string, target: string, now: number): Room {
  if (room.hostId !== by) throw new GameError("Only the host can remove players");
  if (target === by) throw new GameError("You can't remove yourself. Use Leave instead.");
  const m = room.members.find((x) => x.id === target);
  if (!m) throw new GameError("That player isn't at this table");
  const r = clone(room);
  if (r.game && r.phase === "playing") r.game = removePlayer(r.game, target, now);
  r.members = r.members.filter((x) => x.id !== target);
  r.removed = [...(r.removed ?? []), target];
  if (r.phase === "lobby" && m.role === "player") promoteWaiting(r);
  return r;
}

// ------------------------------------------------------------------ bots

export const BOT_LEVELS: BotLevel[] = ["easy", "normal", "hard"];
const BOT_NAMES = ["Zippy", "Bloop", "Wobble", "Jelly", "Squish", "Mochi", "Noodle", "Bubbles", "Pudding", "Gummy", "Sprinkle", "Waffle"];
const BOT_AVATARS = ["lime", "berry", "sky", "sun", "coral", "grape", "mint", "rose", "night"];
export const isBotId = (id: string) => id.startsWith("bot-");

/** The host fills empty seats with computer players (lobby only). */
export function addBots(room: Room, by: string, count: number, level: BotLevel, now: number, rng: Rng): Room {
  if (room.hostId !== by) throw new GameError("Only the host can add bots");
  if (room.phase !== "lobby") throw new GameError("Bots can only be added in the lobby");
  if (!BOT_LEVELS.includes(level)) throw new GameError("Pick Easy, Normal or Hard");
  const free = room.settings.maxSeats - seatedCount(room);
  if (!Number.isInteger(count) || count < 1) throw new GameError("Add at least 1 bot");
  if (count > free) throw new GameError(free === 0 ? "No empty seats for bots" : `Only ${free} empty seat${free === 1 ? "" : "s"}`);
  const r = clone(room);
  for (let i = 0; i < count; i++) {
    const names = BOT_NAMES.filter((n) => !nameTaken(r, n, ""));
    const name = names.length ? names[Math.floor(rng() * names.length)] : `Bot ${seatedCount(r) + 1}`;
    const avatar = BOT_AVATARS[Math.floor(rng() * BOT_AVATARS.length)];
    const id = "bot-" + Math.floor(rng() * 36 ** 8).toString(36).padStart(8, "0");
    r.members.push({ id, name, avatar, bot: level, joinedAt: now + i, role: "player", connected: true });
  }
  return r;
}

export function removeBot(room: Room, by: string, id: string): Room {
  if (room.hostId !== by) throw new GameError("Only the host can remove bots");
  if (room.phase !== "lobby") throw new GameError("Bots can only be removed in the lobby");
  if (!room.members.some((m) => m.id === id && m.bot)) throw new GameError("That bot isn't at this table");
  const r = clone(room);
  r.members = r.members.filter((m) => m.id !== id);
  promoteWaiting(r);
  return r;
}
