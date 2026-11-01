"use client";
// Draws a "Share your win" picture (1080 × 1080 PNG) in the browser. No server needed.
// Shared Gloopy look: works for any game in the house; poker passes its cards in.

export interface WinCardInput {
  kind: "winner" | "hand";
  /** The player's Gloop as SVG markup (taken from the on-screen <Gloop>). */
  gloopSvg: string;
  tag: string; // "WINNER", "FLUSH!"
  headline: string; // "Kofi took it all"
  detail: string; // "40,000 chips · beat 5 friends · 47 hands"
  cards?: string[]; // e.g. ["Ah", "5h", ...]
  footer: string; // "Table ZK4P · gloopy-one.vercel.app"
}

const INK = "#1c1b3a";
const SUIT: Record<string, { sym: string; red: boolean }> = {
  s: { sym: "♠", red: false },
  h: { sym: "♥", red: true },
  d: { sym: "♦", red: true },
  c: { sym: "♣", red: false },
};

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function loadSvg(svg: string, size: number): Promise<HTMLImageElement> {
  const withSize = svg.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`);
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(withSize.includes("xmlns") ? withSize : withSize.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'));
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = bad;
    img.src = src;
  });
}

/** Shrinks the font until the text fits the width. */
function fitText(c: CanvasRenderingContext2D, text: string, weight: number, family: string, size: number, maxW: number) {
  let s = size;
  do {
    c.font = `${weight} ${s}px ${family}`;
    s -= 2;
  } while (c.measureText(text).width > maxW && s > 20);
}

export async function drawWinCard(input: WinCardInput): Promise<Blob> {
  const S = 1080;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const c = cv.getContext("2d")!;
  const DISPLAY = '"Baloo 2", "Rubik", sans-serif';
  const BODY = '"Rubik", sans-serif';
  await Promise.all([
    document.fonts.load(`800 60px "Baloo 2"`),
    document.fonts.load(`500 40px "Rubik"`),
    document.fonts.load(`700 40px "Rubik"`),
  ]).catch(() => {});

  const winner = input.kind === "winner";
  const bg = winner ? "#2e5bff" : "#b6f23a";
  const fg = winner ? "#ffffff" : INK;

  // page + sticker card with its hard shadow
  c.fillStyle = "#fff7e8";
  c.fillRect(0, 0, S, S);
  const m = 44;
  c.fillStyle = INK;
  roundRect(c, m + 18, m + 18, S - 2 * m - 18, S - 2 * m - 18, 72);
  c.fill();
  c.fillStyle = bg;
  roundRect(c, m, m, S - 2 * m - 18, S - 2 * m - 18, 72);
  c.fill();
  c.lineWidth = 12;
  c.strokeStyle = INK;
  c.stroke();
  const W = S - 2 * m - 18; // card width
  const cx = m + W / 2;

  // brand
  c.fillStyle = fg;
  c.font = `800 66px ${DISPLAY}`;
  c.textBaseline = "alphabetic";
  c.textAlign = "left";
  c.fillText("Gloopy", m + 54, m + 104);

  // tag pill, tilted
  c.save();
  c.font = `800 40px ${DISPLAY}`;
  const tw = c.measureText(input.tag).width + 56;
  c.translate(m + W - 50 - tw / 2, m + 86);
  c.rotate((4 * Math.PI) / 180);
  c.fillStyle = "#fff";
  roundRect(c, -tw / 2, -34, tw, 68, 34);
  c.fill();
  c.lineWidth = 8;
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = INK;
  c.textAlign = "center";
  c.fillText(input.tag, 0, 14);
  c.restore();

  // sparkles for the game winner
  if (winner) {
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.font = `700 56px ${BODY}`;
    c.fillText("✦", m + 150, m + 300);
    c.fillText("✦", m + W - 160, m + 330);
    c.font = `700 40px ${BODY}`;
    c.fillText("✧", m + 130, m + 540);
    c.fillText("✧", m + W - 130, m + 520);
  }

  // the Gloop
  const hasCards = !!input.cards?.length;
  const gSize = hasCards ? 300 : 420;
  try {
    const img = await loadSvg(input.gloopSvg, gSize);
    c.drawImage(img, cx - gSize / 2, hasCards ? m + 140 : m + 170, gSize, gSize);
  } catch {}

  // words
  c.fillStyle = fg;
  c.textAlign = "center";
  const headY = hasCards ? m + 520 : m + 680;
  fitText(c, input.headline, 800, DISPLAY, hasCards ? 92 : 104, W - 120);
  c.fillText(input.headline, cx, headY);
  fitText(c, input.detail, 500, BODY, 44, W - 120);
  c.fillText(input.detail, cx, headY + 64);

  // cards
  if (hasCards) {
    const cards = input.cards!.slice(0, 5);
    const cw = 136,
      ch = 190,
      gap = 18;
    const total = cards.length * cw + (cards.length - 1) * gap;
    let x = cx - total / 2;
    const y = headY + 110;
    for (const card of cards) {
      const suit = SUIT[card[1]];
      c.fillStyle = "#fff";
      roundRect(c, x, y, cw, ch, 16);
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = INK;
      c.stroke();
      c.fillStyle = suit.red ? "#d6293b" : "#151515";
      c.font = `700 64px ${BODY}`;
      c.fillText(card[0] === "T" ? "10" : card[0], x + cw / 2, y + 84);
      c.font = `700 60px ${BODY}`;
      c.fillText(suit.sym, x + cw / 2, y + 160);
      x += cw + gap;
    }
  }

  // footer
  c.fillStyle = fg;
  c.globalAlpha = 0.85;
  c.font = `500 34px ${BODY}`;
  c.fillText(input.footer, cx, m + W - 44);
  c.globalAlpha = 1;

  return new Promise((ok, bad) => cv.toBlob((b) => (b ? ok(b) : bad(new Error("no image"))), "image/png"));
}
