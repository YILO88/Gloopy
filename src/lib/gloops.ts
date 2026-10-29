// Gloop characters, stickers and GIF placeholders, shared by screens and server.

export interface Gloop {
  id: string;
  name: string;
  body: string; // main colour
  shade: string; // darker edge
  accessory: "none" | "cap" | "shades" | "crown" | "headwrap" | "bow" | "headphones";
}

export const GLOOPS: Gloop[] = [
  { id: "lime", name: "Limey", body: "#B6F23A", shade: "#7DBA12", accessory: "none" },
  { id: "berry", name: "Berry", body: "#FF5FA2", shade: "#D13A7C", accessory: "bow" },
  { id: "sky", name: "Skye", body: "#4FC3FF", shade: "#1E8FD0", accessory: "cap" },
  { id: "sun", name: "Sunny", body: "#FFD23F", shade: "#E0A800", accessory: "shades" },
  { id: "coral", name: "Coco", body: "#FF8A5B", shade: "#D9612F", accessory: "headwrap" },
  { id: "grape", name: "Grape", body: "#A77BFF", shade: "#7A4FE0", accessory: "headphones" },
  { id: "mint", name: "Minty", body: "#4FE3B0", shade: "#1FB585", accessory: "crown" },
  { id: "rose", name: "Rosie", body: "#FFB3C7", shade: "#E58AA3", accessory: "shades" },
  { id: "night", name: "Midnight", body: "#5B6CFF", shade: "#3443CC", accessory: "cap" },
];

export const gloopById = (id: string) => GLOOPS.find((g) => g.id === id) ?? GLOOPS[0];
export const isGloop = (id: unknown): id is string => typeof id === "string" && GLOOPS.some((g) => g.id === id);

/** Placeholder stickers: a Gloop pulling a face plus a caption. Swap for real art later. */
export interface Sticker {
  id: string;
  gloop: string;
  face: "laugh" | "cry" | "shock" | "smug" | "angry" | "love" | "sleep" | "cool";
  caption: string;
}

export const STICKERS: Sticker[] = [
  { id: "lol", gloop: "sun", face: "laugh", caption: "LOL" },
  { id: "cry", gloop: "sky", face: "cry", caption: "my chips 😭" },
  { id: "shock", gloop: "berry", face: "shock", caption: "WHAT?!" },
  { id: "allin", gloop: "coral", face: "angry", caption: "ALL IN" },
  { id: "watching", gloop: "grape", face: "smug", caption: "I'm watching you" },
  { id: "bluff", gloop: "lime", face: "smug", caption: "bluffing?" },
  { id: "gg", gloop: "mint", face: "love", caption: "GG" },
  { id: "slow", gloop: "night", face: "sleep", caption: "play o!" },
  { id: "boss", gloop: "rose", face: "cool", caption: "boss move" },
];

/** Placeholder GIFs: animated Gloop scenes drawn in code. Real uploads replace these. */
export interface Gif {
  id: string;
  gloop: string;
  motion: "bounce" | "spin" | "shake" | "rain";
  caption: string;
}

export const GIFS: Gif[] = [
  { id: "dance", gloop: "lime", motion: "bounce", caption: "victory dance" },
  { id: "spin", gloop: "berry", motion: "spin", caption: "dizzy" },
  { id: "rage", gloop: "coral", motion: "shake", caption: "rage quit?" },
  { id: "money", gloop: "sun", motion: "rain", caption: "make it rain" },
];

export const isSticker = (id: string) => STICKERS.some((s) => s.id === id);
export const isGif = (id: string) => GIFS.some((g) => g.id === id);
