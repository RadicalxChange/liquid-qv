import { motion, useReducedMotion } from 'framer-motion';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef } from 'react';
import { type TickState, tickState } from '../lib/rulerState';
import { voteColor, voteColorDark } from '../lib/voteColor';

/*
 * Funnel — a single upward-opening V whose water level *is* the |vote|
 * count and whose water area *is* the credits spent. Two equations:
 *
 *     |votes|  = h            (water height in funnel-units)
 *     credits  = h²           (water area: ½ · 2h · h)
 *
 * Round 13 (color by sign): the diamond from PR #10 is gone. The
 * funnel always opens upward and water always rises with gravity. The
 * SIGN of the vote is conveyed by *color* — green for support, red
 * for opposition — and by the under-funnel readout's explicit sign.
 *
 * The state and math layers from PR #10 stay: votes are signed
 * integers at rest, the reducer's conservation invariant is
 * `pool + Σ votes_i² = budget`, and a "−" hold from a positive funnel
 * still drains through zero and refills on the negative side. What
 * the user sees flip during that move is only the water's *color*:
 * green draining → empty → red filling. Geometry doesn't move.
 *
 * `votes` may be a signed real during a live hold (the parent passes
 * the live continuous value); the water polygon and surface line
 * render directly from `|votes|`. ARIA reports the integer-rounded
 * signed value to match the under-funnel readout.
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

// Ruler layout constants — unsigned 0–10 magnitude scale.
const RULER_GAP = 4;
const MAJOR_TICK_W = 10;
const MINOR_TICK_W = 5;
const LABEL_OFFSET = 4;
const LABEL_FONT_SIZE = 10;
const LABEL_RESERVE = 14;
const RULER_RIGHT_PAD = 4;
const POSITION_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Round 15: map a tick's `TickState` to its stroke style. Unfilled
 * ticks keep the muted neutral look from earlier rounds; filled and
 * current ticks pick up the sign colour. The `current` tick gets a
 * thicker stroke and full opacity so it reads as the milestone the
 * user just reached without needing a separate halo element.
 */
const tickStrokeStyle = (
  state: TickState,
  filledColor: string,
  isMajor: boolean,
): { stroke: string; strokeOpacity: number; strokeWidth: number } => {
  if (state === 'unfilled') {
    return {
      stroke: 'var(--lqv-fg)',
      strokeOpacity: isMajor ? 0.55 : 0.32,
      strokeWidth: isMajor ? 1.5 : 1,
    };
  }
  if (state === 'filled') {
    return {
      stroke: filledColor,
      strokeOpacity: 0.85,
      strokeWidth: isMajor ? 2 : 1.5,
    };
  }
  // current — slightly heavier and fully opaque
  return {
    stroke: filledColor,
    strokeOpacity: 1,
    strokeWidth: isMajor ? 3 : 2,
  };
};

/** Round 15: label style follows the tick state. Current label
 *  also gets a slightly heavier weight so it reads as a peak. */
const tickLabelStyle = (
  state: TickState,
  filledColor: string,
): { fill: string; fillOpacity: number; fontWeight: number } => {
  if (state === 'unfilled') {
    return { fill: 'var(--lqv-fg)', fillOpacity: 0.6, fontWeight: 400 };
  }
  if (state === 'filled') {
    return { fill: filledColor, fillOpacity: 0.85, fontWeight: 400 };
  }
  return { fill: filledColor, fillOpacity: 1, fontWeight: 600 };
};

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

  // SVG layout — width-driven. Funnel cavity = size − pads; V height
  // = funnel cavity / 2 (45° walls). Single upward V again — same
  // proportions as PR #11.
  const PAD_TOP = 14;
  const PAD_LEFT = 14;
  const PAD_RIGHT = 14;
  const PAD_BOTTOM = 18;
  const funnelWidth = size - PAD_LEFT - PAD_RIGHT;
  const usableHeight = funnelWidth / 2;
  const cx = PAD_LEFT + funnelWidth / 2;
  const apexY = PAD_TOP + usableHeight;
  const SCALE = maxVotes > 0 ? usableHeight / maxVotes : 1;

  // Water polygon — based on |votes| only. Height grows upward from
  // the apex. Always emit a valid path (degenerate triangle at h=0)
  // so Framer Motion can interpolate.
  const absVotes = Math.min(Math.abs(votes), maxVotes);
  const h = absVotes * SCALE;
  const waterPath = `M ${cx} ${apexY} L ${cx - h} ${apexY - h} L ${cx + h} ${apexY - h} Z`;
  const surfaceY = apexY - h;
  const waterFill = voteColor(votes);
  const waterSurfaceStroke = voteColorDark(votes);

  // Funnel outline: left-rim → apex → right-rim.
  const fullH = usableHeight;
  const outlinePath = `M ${cx - fullH} ${apexY - fullH} L ${cx} ${apexY} L ${cx + fullH} ${apexY - fullH}`;
  const rimY = apexY - fullH;

  // Ruler geometry — unsigned 0–10 magnitude scale.
  const rightEdgeX = cx + fullH;
  const rulerAxisX = rightEdgeX + RULER_GAP + MAJOR_TICK_W;
  const labelX = rulerAxisX + LABEL_OFFSET;
  const viewBoxW = labelX + LABEL_RESERVE + RULER_RIGHT_PAD;
  const viewBoxH = PAD_TOP + usableHeight + PAD_BOTTOM;

  const tickY = (voteLevel: number) => apexY - voteLevel * SCALE;
  // 0/2/4/6/8/10 — major; 1/3/5/7/9 — minor.
  const MAJOR_VALUES = [0, 2, 4, 6, 8, 10];
  const MINOR_VALUES = [1, 3, 5, 7, 9];

  // Keyboard:
  //   Space / Enter held → "+" (move v UP, release ends pour)
  //   Shift + Space/Enter held → "−" (move v DOWN)
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

  // ARIA — match the under-funnel readout exactly. Signed votes,
  // non-negative credits.
  const announcedVotes = Math.round(votes);
  const announcedCredits = announcedVotes * announcedVotes;
  const ariaVoteText =
    announcedVotes === 0
      ? '0 votes'
      : `${announcedVotes > 0 ? '+' : '−'}${Math.abs(announcedVotes)} ${
          Math.abs(announcedVotes) === 1 ? 'vote' : 'votes'
        }`;
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
      {/* Background card — soft surface inside the funnel cavity. */}
      <rect
        x={PAD_LEFT - 6}
        y={PAD_TOP - 6}
        width={funnelWidth + 12}
        height={usableHeight + 12}
        rx={10}
        fill="var(--lqv-funnel-bg)"
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1}
      />

      {/* Water — colour reflects the SIGN of the current vote. Polygon
          area = h² = credits regardless of sign. */}
      {instantUpdate || reduceMotion ? (
        <path d={waterPath} fill={waterFill} style={{ pointerEvents: 'none' }} />
      ) : (
        <motion.path
          d={waterPath}
          initial={false}
          fill={waterFill}
          animate={{ d: waterPath }}
          transition={{ duration: 0.15, ease: POSITION_EASE }}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Subtle highlight at the water surface (hidden at v = 0). */}
      {h > 0 &&
        (instantUpdate || reduceMotion ? (
          <line
            x1={cx - h}
            x2={cx + h}
            y1={surfaceY}
            y2={surfaceY}
            stroke={waterSurfaceStroke}
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
            stroke={waterSurfaceStroke}
            strokeWidth={1.25}
            strokeOpacity={0.7}
            animate={{ x1: cx - h, x2: cx + h, y1: surfaceY, y2: surfaceY }}
            transition={{ duration: 0.15, ease: POSITION_EASE }}
            style={{ pointerEvents: 'none' }}
          />
        ))}

      {/* Funnel walls drawn last so they sit on top of the water. The
          wall colour stays neutral (uses the structural `--lqv-water-dark`
          token) — the funnel itself is the same vessel regardless of
          which way the user is voting. */}
      <path
        d={outlinePath}
        fill="none"
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Rim — short horizontal at the cap. */}
      <line
        x1={cx - fullH}
        x2={cx + fullH}
        y1={rimY}
        y2={rimY}
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Measuring stick — unsigned 0 to 10 magnitude. Direction is
          conveyed by water colour and the under-funnel readout's sign,
          not by the ruler.
          Round 15: ticks become an active vote indicator. Each tick
          fills in the sign-colour at its integer milestone; the most
          recently crossed tick is highlighted as `current`. The state
          is purely a function of `Math.floor(|votes|)` — see
          `src/lib/rulerState.ts`. Tick 0 is always passive; it's the
          baseline reference, not a milestone the user reaches. */}
      <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
        {MINOR_VALUES.map((v) => {
          const ts = tickState(v, votes);
          const ts0 = tickStrokeStyle(ts, voteColor(votes), false);
          return (
            <line
              key={`minor-${v}`}
              x1={rulerAxisX - MINOR_TICK_W}
              x2={rulerAxisX}
              y1={tickY(v)}
              y2={tickY(v)}
              style={{
                ...ts0,
                transition: reduceMotion
                  ? 'none'
                  : 'stroke 160ms ease, stroke-opacity 160ms ease, stroke-width 160ms ease',
              }}
            />
          );
        })}
        {MAJOR_VALUES.map((v) => {
          const ts = tickState(v, votes);
          const tsLine = tickStrokeStyle(ts, voteColor(votes), true);
          const tsLabel = tickLabelStyle(ts, voteColor(votes));
          return (
            <g key={`major-${v}`}>
              <line
                x1={rulerAxisX - MAJOR_TICK_W}
                x2={rulerAxisX}
                y1={tickY(v)}
                y2={tickY(v)}
                style={{
                  ...tsLine,
                  transition: reduceMotion
                    ? 'none'
                    : 'stroke 160ms ease, stroke-opacity 160ms ease, stroke-width 160ms ease',
                }}
              />
              <text
                x={labelX}
                y={tickY(v)}
                fontSize={LABEL_FONT_SIZE}
                fontFamily="'Suisse Intl', system-ui, sans-serif"
                dominantBaseline="middle"
                textAnchor="start"
                style={{
                  ...tsLabel,
                  fontVariantNumeric: 'tabular-nums',
                  transition: reduceMotion
                    ? 'none'
                    : 'fill 160ms ease, fill-opacity 160ms ease',
                }}
              >
                {v}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};
