import { motion, useReducedMotion } from 'framer-motion';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef } from 'react';

/*
 * Funnel — a 90° inverted right-triangle whose water level *is* the vote
 * count and whose water area *is* the credits spent. Two equations:
 *
 *     votes  = h            (water height in funnel-units)
 *     credits = h²          (water area: ½ · 2h · h)
 *
 * Round 11 (measuring stick + integer snap on release): the form is the
 * round-7 2D triangle (the gauge from #8 — live arrow + two reference
 * ticks — is replaced here). On the outer right edge we render a
 * persistent 0–10 ruler with major ticks at 0/2/4/6/8/10 and minor
 * ticks at 1/3/5/7/9. Always visible, no fade behaviour. The ruler is
 * a calm reference, not a control.
 *
 * The vote axis is *linear in height* (votes = water height) so the
 * tick spacing is even. The quadratic lives in the credits readout
 * under the funnel; the ruler counts votes directly.
 *
 * `votes` is an integer at rest and may be fractional during an active
 * hold (the parent passes the live continuous value). The water polygon
 * and surface highlight render directly from it. ARIA reports the
 * integer-rounded value — the same number the under-funnel readout
 * shows.
 */

interface FunnelProps {
  /** Vote level — integer at rest, fractional during a live hold. */
  votes: number;
  /** Maximum allowed votes here (= ⌊√budget⌋, integer cap). */
  maxVotes: number;
  /** Visible label for screen readers and the slider's aria-valuetext. */
  label: string;
  /** Begin a continuous pour (Space/Enter held). */
  onPourStart: (direction: 'in' | 'out') => void;
  /** End a continuous pour (Space/Enter released). */
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

// Ruler layout constants. The funnel cavity stays at its pre-#8
// proportions (size − pads, no GAUGE_W subtraction); the ruler lives
// in extra viewBox width past the V's right edge.
const RULER_GAP = 4; // gap from V's right edge to the ruler's tick anchor
const MAJOR_TICK_W = 10;
const MINOR_TICK_W = 5;
const LABEL_OFFSET = 4;
const LABEL_FONT_SIZE = 10;
const LABEL_RESERVE = 14; // approx pixel room for "10" / "0" labels
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

  // SVG layout — width-driven. Funnel cavity = size − pads (no gauge
  // subtraction); V height = funnel cavity / 2 (45° walls).
  const PAD_TOP = 14;
  const PAD_LEFT = 14;
  const PAD_RIGHT = 14;
  const PAD_BOTTOM = 18;
  const funnelWidth = size - PAD_LEFT - PAD_RIGHT;
  const usableHeight = funnelWidth / 2;
  const cx = PAD_LEFT + funnelWidth / 2;
  const apexY = PAD_TOP + usableHeight;
  const SCALE = maxVotes > 0 ? usableHeight / maxVotes : 1;

  // Water polygon for the current display level. Always emit a valid
  // path (degenerate triangle at h=0) so Framer Motion can interpolate.
  const h = Math.max(0, Math.min(votes, maxVotes)) * SCALE;
  const waterPath = `M ${cx} ${apexY} L ${cx - h} ${apexY - h} L ${cx + h} ${apexY - h} Z`;

  // Funnel outline: left-rim → apex → right-rim.
  const fullH = usableHeight;
  const outlinePath = `M ${cx - fullH} ${apexY - fullH} L ${cx} ${apexY} L ${cx + fullH} ${apexY - fullH}`;
  const rimY = apexY - fullH;

  // Ruler geometry. Tick "axis" is at rulerAxisX; ticks point LEFT
  // (toward the water) so a major tick spans [rulerAxisX − MAJOR_TICK_W,
  // rulerAxisX]. Labels sit just to the right of the axis.
  const rightEdgeX = cx + fullH;
  const rulerAxisX = rightEdgeX + RULER_GAP + MAJOR_TICK_W;
  const labelX = rulerAxisX + LABEL_OFFSET;
  const viewBoxW = labelX + LABEL_RESERVE + RULER_RIGHT_PAD;
  const viewBoxH = PAD_TOP + usableHeight + PAD_BOTTOM;

  // The y-position of vote level v on the ruler is the same as the
  // water-surface y at that vote level — apexY − v × SCALE — so the
  // ruler reads directly off the water.
  const tickY = (voteLevel: number) => apexY - voteLevel * SCALE;

  // 0/2/4/6/8/10 — major. 1/3/5/7/9 — minor.
  const MAJOR_VALUES = [0, 2, 4, 6, 8, 10];
  const MINOR_VALUES = [1, 3, 5, 7, 9];

  // Keyboard:
  //   Space / Enter held → continuous pour-in (release ends pour)
  //   Shift + Space/Enter held → continuous pour-out (drain)
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
  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      width="100%"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={maxVotes}
      aria-valuenow={announcedVotes}
      aria-valuetext={`${announcedVotes} ${announcedVotes === 1 ? 'vote' : 'votes'}, ${announcedCredits} ${announcedCredits === 1 ? 'credit' : 'credits'}`}
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

      {/* Water — the polygon area equals credits = votes². During a
          live hold (instantUpdate), we bypass motion's interpolation so
          the water tracks the rAF-driven `votes` prop frame-for-frame.
          Outside a hold, the motion transition gives the snap-on-
          release a soft settle (~150 ms is roughly Framer's default
          ease for `d` animations at this duration). */}
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

      {/* Subtle highlight at the water surface. */}
      {h > 0 &&
        (instantUpdate || reduceMotion ? (
          <line
            x1={cx - h}
            x2={cx + h}
            y1={apexY - h}
            y2={apexY - h}
            stroke="var(--lqv-water-dark)"
            strokeWidth={1.25}
            strokeOpacity={0.7}
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <motion.line
            x1={cx - h}
            x2={cx + h}
            y1={apexY - h}
            y2={apexY - h}
            initial={false}
            stroke="var(--lqv-water-dark)"
            strokeWidth={1.25}
            strokeOpacity={0.7}
            animate={{ x1: cx - h, x2: cx + h, y1: apexY - h, y2: apexY - h }}
            transition={{ duration: 0.15, ease: POSITION_EASE }}
            style={{ pointerEvents: 'none' }}
          />
        ))}

      {/* Funnel walls drawn last so they sit on top of the water. */}
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

      {/* Measuring stick — persistent 0–10 ruler on the outer right
          edge. Major ticks (with labels) at 0/2/4/6/8/10; minor ticks
          (no labels) at 1/3/5/7/9. Tick lines extend LEFT from
          `rulerAxisX` toward the water; labels sit just right of the
          axis. Always visible — no fade behaviour. */}
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
              {v}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
};
