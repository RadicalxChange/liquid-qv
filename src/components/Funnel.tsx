import { motion, useReducedMotion } from 'framer-motion';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef } from 'react';

/*
 * Funnel — a vertical *diamond* in round 12. Two 90°-apex V-troughs
 * meet at a horizontal midline at vote = 0. The upper V holds water
 * for support (votes > 0); the lower V holds water for opposition
 * (votes < 0). The shape is exactly symmetric — pouring a vote
 * against costs the same as pouring it for, and the slowdown is
 * symmetric too.
 *
 *     +10  ─────────────────────  upper rim
 *           \                  /
 *            \      v > 0     /   (water in upper V)
 *             \              /
 *      0  ────●──────────────●────  midline (apex of both Vs)
 *             /              \
 *            /      v < 0     \    (water in lower V)
 *           /                  \
 *     −10  ─────────────────────  lower rim
 *
 * Two equations:
 *
 *     |votes|  = h           (water height from midline, in funnel-units)
 *     credits  = h²          (water area: ½ · 2h · h)
 *
 * Sign comes from which V the water sits in. The conservation
 * invariant generalises cleanly — sign drops out of the squaring.
 *
 * `votes` is a signed integer at rest and may be a signed real during
 * an active hold. The water polygon, midline, and outline render
 * directly from it. ARIA reports the integer-rounded signed value
 * (the same number the under-funnel readout shows).
 */

interface FunnelProps {
  /** Signed vote level (real during a hold, integer at rest). */
  votes: number;
  /** Per-direction maximum (positive integer cap = ⌊√budget⌋). */
  maxVotes: number;
  /** Visible label for screen readers and the slider's aria-valuetext. */
  label: string;
  /** Begin a continuous pour. "in" = move v UP; "out" = move v DOWN. */
  onPourStart: (direction: 'in' | 'out') => void;
  /** End a continuous pour. */
  onPourEnd: () => void;
  /**
   * Disable the water polygon's interpolation animation. Set during an
   * active hold so the water tracks the live `votes` prop frame-for-
   * frame; off otherwise so the snap-on-release transition gets a soft
   * settle.
   */
  instantUpdate?: boolean;
  /** Pixel width of the funnel SVG. Height auto-derives from 45° geometry. */
  size?: number;
  /** Override CSS custom properties on the wrapper. */
  style?: CSSProperties;
}

// Ruler layout constants — same shape as the unipolar 0–10 ruler, just
// extended to span both Vs.
const RULER_GAP = 4;
const MAJOR_TICK_W = 10;
const MINOR_TICK_W = 5;
const LABEL_OFFSET = 4;
const LABEL_FONT_SIZE = 10;
const LABEL_RESERVE = 22; // approx room for "−10" / "+10" — wider than 0–10
const RULER_RIGHT_PAD = 4;
const POSITION_EASE = [0.22, 1, 0.36, 1] as const;

export const Funnel = ({
  votes,
  maxVotes,
  label,
  onPourStart,
  onPourEnd,
  instantUpdate = false,
  size = 220,
  style,
}: FunnelProps) => {
  const reduceMotion = useReducedMotion();
  const sliderId = useId();

  const holdKeyRef = useRef<string | null>(null);

  // SVG layout — width-driven. Funnel cavity = size − pads; per-V
  // height = funnel cavity / 2 (45° walls). The diamond is twice as
  // tall as the unipolar funnel was (upper V + lower V around midline).
  const PAD_TOP = 14;
  const PAD_LEFT = 14;
  const PAD_RIGHT = 14;
  const PAD_BOTTOM = 18;
  const funnelWidth = size - PAD_LEFT - PAD_RIGHT;
  const usableHeight = funnelWidth / 2; // height per V
  const cx = PAD_LEFT + funnelWidth / 2;
  const midY = PAD_TOP + usableHeight; // y-coord of the midline (vote = 0)
  // Linear vote-to-y mapping: y(v) = midY − v × SCALE.
  // For v = +cap → y = midY − usableHeight (upper rim).
  // For v = −cap → y = midY + usableHeight (lower rim).
  const SCALE = maxVotes > 0 ? usableHeight / maxVotes : 1;

  // Diamond outline geometry.
  const upperRimY = midY - usableHeight;
  const lowerRimY = midY + usableHeight;
  const leftX = cx - usableHeight;
  const rightX = cx + usableHeight;

  // Water polygon — unified for both Vs. h = |v| × SCALE; surface y is
  // midY − sign(v) × h. At v = 0 the path collapses to a single point
  // at the apex (still emits a valid `M L L Z` so Framer Motion can
  // interpolate without warning).
  const h = Math.min(Math.abs(votes), maxVotes) * SCALE;
  const surfaceY = midY - Math.sign(votes) * h;
  const waterPath = `M ${cx} ${midY} L ${cx - h} ${surfaceY} L ${cx + h} ${surfaceY} Z`;

  // Diamond outline as two V paths (upper opens UP, lower opens DOWN —
  // both have apex at the midline). Drawn separately from the rim
  // lines so we can give the rims a flatter cap stroke.
  const upperOutline = `M ${leftX} ${upperRimY} L ${cx} ${midY} L ${rightX} ${upperRimY}`;
  const lowerOutline = `M ${leftX} ${lowerRimY} L ${cx} ${midY} L ${rightX} ${lowerRimY}`;

  // Ruler geometry. Tick "axis" is at rulerAxisX; ticks point LEFT
  // toward the water; labels sit just to the right of the axis.
  const rulerAxisX = rightX + RULER_GAP + MAJOR_TICK_W;
  const labelX = rulerAxisX + LABEL_OFFSET;
  const viewBoxW = labelX + LABEL_RESERVE + RULER_RIGHT_PAD;
  const viewBoxH = PAD_TOP + 2 * usableHeight + PAD_BOTTOM;

  const tickY = (voteLevel: number) => midY - voteLevel * SCALE;

  // Major ticks at every even integer including 0; minor ticks at the
  // odd integers between. Range −10 to +10 (assuming integer cap of 10).
  const MAJOR_VALUES = [10, 8, 6, 4, 2, 0, -2, -4, -6, -8, -10];
  const MINOR_VALUES = [9, 7, 5, 3, 1, -1, -3, -5, -7, -9];

  // Sign-aware label formatter — Unicode minus on negatives, "+" on
  // positives, plain "0" on zero. Matches the under-funnel readout.
  const fmtTickLabel = (n: number): string => {
    if (n === 0) return '0';
    if (n > 0) return `+${n}`;
    return `−${Math.abs(n)}`;
  };

  // Keyboard:
  //   Space / Enter held → "+" (move v up; release ends pour)
  //   Shift + Space/Enter held → "−" (move v down)
  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      if (e.repeat || holdKeyRef.current) return;
      e.preventDefault();
      holdKeyRef.current = e.key;
      onPourStart(e.shiftKey ? 'out' : 'in');
    }
  };
  const handleKeyUp = (e: KeyboardEvent<SVGSVGElement>) => {
    if (holdKeyRef.current && e.key === holdKeyRef.current) {
      holdKeyRef.current = null;
      onPourEnd();
    }
  };
  useEffect(() => {
    const cancel = () => {
      if (!holdKeyRef.current) return;
      holdKeyRef.current = null;
      onPourEnd();
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [onPourEnd]);

  const announcedVotes = Math.round(votes);
  const announcedCredits = announcedVotes * announcedVotes;
  const ariaVoteText =
    announcedVotes === 0
      ? '0 votes'
      : `${fmtTickLabel(announcedVotes)} ${Math.abs(announcedVotes) === 1 ? 'vote' : 'votes'}`;
  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      width="100%"
      role="slider"
      aria-label={label}
      aria-valuemin={-maxVotes}
      aria-valuemax={maxVotes}
      aria-valuenow={announcedVotes}
      aria-valuetext={`${ariaVoteText}, ${announcedCredits} ${announcedCredits === 1 ? 'credit' : 'credits'}`}
      aria-orientation="vertical"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      style={{ userSelect: 'none', ...style }}
      className="block"
      data-funnel-id={sliderId}
    >
      {/* Background card — soft surface inside the diamond's bounding box. */}
      <rect
        x={PAD_LEFT - 6}
        y={upperRimY - 6}
        width={funnelWidth + 12}
        height={2 * usableHeight + 12}
        rx={10}
        fill="var(--lqv-funnel-bg)"
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1}
      />

      {/* Water — unified path covering both Vs. Polygon area equals
          credits = votes² regardless of sign. instantUpdate skips
          motion's interpolation so the rAF-driven `votes` prop renders
          frame-for-frame during a live hold. */}
      {instantUpdate || reduceMotion ? (
        <path d={waterPath} fill="var(--lqv-water)" style={{ pointerEvents: 'none' }} />
      ) : (
        <motion.path
          d={waterPath}
          initial={false}
          fill="var(--lqv-water)"
          animate={{ d: waterPath }}
          transition={{ duration: 0.15, ease: POSITION_EASE }}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Subtle highlight at the water surface (skipped at v = 0 — no
          surface). */}
      {h > 0 &&
        (instantUpdate || reduceMotion ? (
          <line
            x1={cx - h}
            x2={cx + h}
            y1={surfaceY}
            y2={surfaceY}
            stroke="var(--lqv-water-dark)"
            strokeWidth={1.25}
            strokeOpacity={0.7}
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <motion.line
            x1={cx - h}
            x2={cx + h}
            y1={surfaceY}
            y2={surfaceY}
            initial={false}
            stroke="var(--lqv-water-dark)"
            strokeWidth={1.25}
            strokeOpacity={0.7}
            animate={{ x1: cx - h, x2: cx + h, y1: surfaceY, y2: surfaceY }}
            transition={{ duration: 0.15, ease: POSITION_EASE }}
            style={{ pointerEvents: 'none' }}
          />
        ))}

      {/* Diamond outline — both Vs sharing an apex at the midline. Drawn
          last so the walls sit on top of the water. */}
      <path
        d={upperOutline}
        fill="none"
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={lowerOutline}
        fill="none"
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Upper and lower rims — short horizontals at the ±cap levels. */}
      <line
        x1={leftX}
        x2={rightX}
        y1={upperRimY}
        y2={upperRimY}
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <line
        x1={leftX}
        x2={rightX}
        y1={lowerRimY}
        y2={lowerRimY}
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Midline — the resting state at vote = 0. Faint by default; a
          touch brighter when v = 0 so the rest state reads clearly. */}
      <line
        x1={leftX}
        x2={rightX}
        y1={midY}
        y2={midY}
        stroke="var(--lqv-fg)"
        strokeWidth={1}
        strokeOpacity={announcedVotes === 0 ? 0.4 : 0.18}
      />

      {/* Measuring stick — −cap to +cap. Major ticks at every even
          integer including 0, with signed labels. Minor ticks at odd
          integers, no labels. Tick marks point LEFT toward the water;
          labels sit just right of the axis. Always visible. */}
      <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
        {MINOR_VALUES.map((v) => (
          <line
            key={`minor-${v}`}
            x1={rulerAxisX - MINOR_TICK_W}
            x2={rulerAxisX}
            y1={tickY(v)}
            y2={tickY(v)}
            stroke="var(--lqv-fg)"
            strokeWidth={1}
            strokeOpacity={0.32}
          />
        ))}
        {MAJOR_VALUES.map((v) => (
          <g key={`major-${v}`}>
            <line
              x1={rulerAxisX - MAJOR_TICK_W}
              x2={rulerAxisX}
              y1={tickY(v)}
              y2={tickY(v)}
              stroke="var(--lqv-fg)"
              strokeWidth={1.5}
              strokeOpacity={0.55}
            />
            <text
              x={labelX}
              y={tickY(v)}
              fontSize={LABEL_FONT_SIZE}
              fontFamily="'Suisse Intl', system-ui, sans-serif"
              fill="var(--lqv-fg)"
              fillOpacity={0.6}
              dominantBaseline="middle"
              textAnchor="start"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmtTickLabel(v)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
};
