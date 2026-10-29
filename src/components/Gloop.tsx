import { gloopById } from "@/lib/gloops";

export type Face = "happy" | "laugh" | "cry" | "shock" | "smug" | "angry" | "love" | "sleep" | "cool" | "sad";

/** An original Gloop: a jelly blob with a face and an accessory, drawn in SVG. */
export function Gloop({
  id,
  face = "happy",
  size = 64,
  className = "",
  title,
}: {
  id: string;
  face?: Face;
  size?: number;
  className?: string;
  title?: string;
}) {
  const g = gloopById(id);
  const ink = "#1c1b3a";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={title ?? g.name}>
      {/* body */}
      <path
        d="M50 12c22 0 38 15 39 38 1 21-9 38-21 40-6 1-9-4-18-4s-12 5-18 4C20 88 10 71 11 50c1-23 17-38 39-38z"
        fill={g.body}
        stroke={ink}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M24 70c6 10 15 14 26 14s20-4 26-14c-4 12-14 18-26 18S28 82 24 70z" fill={g.shade} opacity="0.55" />
      <ellipse cx="33" cy="30" rx="8" ry="5" fill="#fff" opacity="0.55" transform="rotate(-25 33 30)" />
      <Eyes face={face} />
      <Mouth face={face} />
      <Accessory kind={g.accessory} />
    </svg>
  );
}

function Eyes({ face }: { face: Face }) {
  const ink = "#1c1b3a";
  if (face === "laugh" || face === "love")
    return face === "love" ? (
      <g fill="#ff3d7f" stroke={ink} strokeWidth="2">
        <path d="M33 44c-3-5-10-2-8 3 1 3 8 7 8 7s7-4 8-7c2-5-5-8-8-3z" />
        <path d="M65 44c-3-5-10-2-8 3 1 3 8 7 8 7s7-4 8-7c2-5-5-8-8-3z" />
      </g>
    ) : (
      <g fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round">
        <path d="M27 48q6-7 12 0" />
        <path d="M59 48q6-7 12 0" />
      </g>
    );
  if (face === "sleep")
    return (
      <g fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round">
        <path d="M27 47q6 5 12 0" />
        <path d="M59 47q6 5 12 0" />
      </g>
    );
  if (face === "cool")
    return (
      <g>
        <rect x="22" y="40" width="22" height="13" rx="5" fill={ink} />
        <rect x="54" y="40" width="22" height="13" rx="5" fill={ink} />
        <path d="M44 45h10" stroke={ink} strokeWidth="4" />
        <path d="M27 43l6 0" stroke="#fff" strokeWidth="2" opacity="0.6" />
      </g>
    );
  const big = face === "shock";
  const look = face === "smug" ? 3 : 0;
  return (
    <g>
      <ellipse cx="34" cy="47" rx={big ? 9 : 7.5} ry={big ? 11 : 9} fill="#fff" stroke={ink} strokeWidth="3" />
      <ellipse cx="66" cy="47" rx={big ? 9 : 7.5} ry={big ? 11 : 9} fill="#fff" stroke={ink} strokeWidth="3" />
      <circle cx={35 + look} cy="49" r={big ? 3 : 4} fill={ink} />
      <circle cx={67 + look} cy="49" r={big ? 3 : 4} fill={ink} />
      {face === "smug" && <path d="M25 40h18M57 40h18" stroke={ink} strokeWidth="4" strokeLinecap="round" />}
      {face === "angry" && <path d="M25 36l17 6M75 36l-17 6" stroke={ink} strokeWidth="4" strokeLinecap="round" />}
      {(face === "cry" || face === "sad") && <path d="M26 38l15-3M74 38l-15-3" stroke={ink} strokeWidth="3" strokeLinecap="round" />}
      {face === "cry" && (
        <g fill="#7fd3ff" stroke={ink} strokeWidth="2">
          <path d="M28 58c-2 5-2 9 1 10s5-3 3-10l-2-4z" />
          <path d="M70 58c-2 5-2 9 1 10s5-3 3-10l-2-4z" />
        </g>
      )}
    </g>
  );
}

function Mouth({ face }: { face: Face }) {
  const ink = "#1c1b3a";
  switch (face) {
    case "laugh":
      return <path d="M36 62q14 18 28 0z" fill={ink} stroke={ink} strokeWidth="3" strokeLinejoin="round" />;
    case "shock":
      return <ellipse cx="50" cy="68" rx="6" ry="8" fill={ink} />;
    case "cry":
    case "sad":
      return <path d="M40 70q10-8 20 0" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />;
    case "angry":
      return <path d="M38 68h24" stroke={ink} strokeWidth="4" strokeLinecap="round" />;
    case "smug":
      return <path d="M40 66q12 6 20-4" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />;
    case "sleep":
      return <ellipse cx="50" cy="67" rx="4" ry="3" fill={ink} />;
    default:
      return <path d="M39 63q11 10 22 0" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />;
  }
}

function Accessory({ kind }: { kind: string }) {
  const ink = "#1c1b3a";
  switch (kind) {
    case "cap":
      return (
        <g stroke={ink} strokeWidth="3" strokeLinejoin="round">
          <path d="M24 26c4-12 16-18 28-17 12 1 21 8 23 17z" fill="#ff5fa2" />
          <path d="M70 26c8 0 17 2 20 5-6 2-14 2-22 0z" fill="#ff5fa2" />
        </g>
      );
    case "shades":
      return (
        <g transform="translate(0 -14)">
          <path d="M30 26l40 0" stroke={ink} strokeWidth="3" />
          <rect x="30" y="20" width="16" height="9" rx="4" fill={ink} />
          <rect x="54" y="20" width="16" height="9" rx="4" fill={ink} />
        </g>
      );
    case "crown":
      return (
        <path
          d="M34 22l-3-14 10 8 9-12 9 12 10-8-3 14z"
          fill="#ffd23f"
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      );
    case "headwrap":
      return (
        <g stroke={ink} strokeWidth="3" strokeLinejoin="round">
          <path d="M18 34c2-16 16-26 32-26s30 10 32 26c-10-6-20-8-32-8s-22 2-32 8z" fill="#ffb000" />
          <path d="M60 10c8-6 18-4 18 4-4 4-12 2-18-4z" fill="#ff5fa2" />
          <path d="M30 22c8-3 16-4 22-4M50 14c10 0 18 3 24 8" fill="none" stroke="#1c1b3a" strokeWidth="2" opacity="0.5" />
        </g>
      );
    case "bow":
      return (
        <g stroke={ink} strokeWidth="3" strokeLinejoin="round" fill="#ffd23f">
          <path d="M62 16l-14-8v16z" />
          <path d="M62 16l14-8v16z" />
          <circle cx="62" cy="16" r="4" />
        </g>
      );
    case "headphones":
      return (
        <g stroke={ink} strokeWidth="3" fill="#ffd23f">
          <path d="M16 46c0-26 16-38 34-38s34 12 34 38" fill="none" strokeWidth="5" />
          <rect x="8" y="40" width="12" height="20" rx="5" />
          <rect x="80" y="40" width="12" height="20" rx="5" />
        </g>
      );
    default:
      return null;
  }
}
