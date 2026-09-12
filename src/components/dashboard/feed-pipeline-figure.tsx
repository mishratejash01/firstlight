/**
 * The path from a publisher's feed to a live story, with the two places a
 * switch cuts it.
 *
 * Drawn rather than described because the question people ask about a switch
 * is "what does it stop, and what does it leave alone", and that is a question
 * about position in a pipeline. Everything right of the second cut is shaded:
 * no switch on the feeds page reaches it.
 *
 * Plain SVG in the site's own tokens. It is wider than a phone, so the caller
 * wraps it in a horizontally scrolling container; the numbered walk-through
 * beside it carries the same information for a screen reader.
 */

const INK = "#14161C";
const MUTED = "#5B5F6B";
const HAIRLINE = "#E4E5E8";
const ACCENT = "#1B3B6F";
const PAPER = "#FFFFFF";

type Box = { x: number; title: string; detail: string };

const BOX_W = 132;
const BOX_H = 64;
const Y = 78;

const BOXES: Box[] = [
  { x: 16, title: "Publisher feed", detail: "the outlet's own RSS" },
  { x: 196, title: "Poller", detail: "every 5 minutes" },
  { x: 376, title: "Wire items", detail: "fetched entries" },
  { x: 556, title: "Engine pulse", detail: "every minute" },
  { x: 736, title: "Story events", detail: "clustered, scored" },
  { x: 916, title: "Triage and desk", detail: "verified, written" },
  { x: 1096, title: "Live story", detail: "on the site" },
];

function Switch({ x, label }: { x: number; label: string }) {
  // A break in the line, with the switch mark above it.
  return (
    <g>
      <rect x={x - 22} y={Y + BOX_H / 2 - 12} width={44} height={24} fill={PAPER} />
      <rect
        x={x - 16}
        y={Y + BOX_H / 2 - 7}
        width={32}
        height={14}
        rx={7}
        fill="none"
        stroke={ACCENT}
        strokeWidth={1.5}
      />
      <circle cx={x + 8} cy={Y + BOX_H / 2} r={4.5} fill={ACCENT} />
      <text
        x={x}
        y={Y + BOX_H + 28}
        textAnchor="middle"
        fontSize={12}
        fill={ACCENT}
      >
        {label}
      </text>
    </g>
  );
}

export function FeedPipelineFigure() {
  const first = BOXES[0].x;
  const shadedFrom = BOXES[4].x - 24;
  const last = BOXES[BOXES.length - 1];
  const width = last.x + BOX_W + 16;

  return (
    <svg
      viewBox={`0 0 ${width} 236`}
      width={width}
      height={236}
      role="img"
      aria-labelledby="feed-figure-title"
      fontFamily="inherit"
    >
      <title id="feed-figure-title">
        A feed&rsquo;s entries pass the poller and the engine pulse before becoming
        story events; the switches cut the line at those two points and never
        reach events, triage or live stories.
      </title>

      {/* The part no switch reaches. */}
      <rect
        x={shadedFrom}
        y={Y - 44}
        width={width - shadedFrom - 8}
        height={BOX_H + 88}
        fill="#F7F7F8"
      />
      <text x={shadedFrom + 12} y={Y - 24} fontSize={12} fill={MUTED}>
        No switch on this page reaches anything from here on
      </text>

      {/* The line. */}
      <line
        x1={first + BOX_W}
        y1={Y + BOX_H / 2}
        x2={last.x}
        y2={Y + BOX_H / 2}
        stroke={INK}
        strokeWidth={1.25}
      />

      {BOXES.map((box) => (
        <g key={box.title}>
          <rect
            x={box.x}
            y={Y}
            width={BOX_W}
            height={BOX_H}
            fill={PAPER}
            stroke={HAIRLINE}
            strokeWidth={1.25}
          />
          <text
            x={box.x + BOX_W / 2}
            y={Y + 28}
            textAnchor="middle"
            fontSize={14}
            fontWeight={600}
            fill={INK}
          >
            {box.title}
          </text>
          <text
            x={box.x + BOX_W / 2}
            y={Y + 47}
            textAnchor="middle"
            fontSize={12}
            fill={MUTED}
          >
            {box.detail}
          </text>
        </g>
      ))}

      {/* Both switches cut in the same two places: before the poller reads a
          feed, and before the pulse turns what it fetched into mentions. */}
      <Switch x={(BOXES[0].x + BOX_W + BOXES[1].x) / 2} label="Cut 1: not polled" />
      <Switch x={(BOXES[2].x + BOX_W + BOXES[3].x) / 2} label="Cut 2: not read in" />
    </svg>
  );
}
