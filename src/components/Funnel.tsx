import { motion, useReducedMotion } from 'framer-motion';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef } from 'react';

/*
 * Funnel — a 90° inverted right-triangle whose water level *is* the vote
 * count and whose water area *is* the credits spent. Two equations:
 *
 *     votes  = h            (water height in funnel-units)
 *     credits = h²          (water area: ½ · 2h · h)
 *
 * Round 6 (continuous votes): the funnel is purely visual + a keyboard
 * hold target. Only Space and Enter remain — held they pour at the
 * standard rate, released they stop. Every outcome is duration × rate.
 *
 * Round 10 (measuring stick): a calm gauge layer along the *outside*
 * right edge:
 *   - A live indicator (small left-pointing arrow + numeric vote
 *     count, 1 decimal) tracks the water surface whenever votes > 0.
 *     Position updates frame-for-frame during a hold (`instantUpdate`),
 *     and gets the same Framer-Motion settle as the water otherwise.
 *   - Two faint reference ticks at votes = 5 and votes = 10 (half-cap
 *     and cap) frame the range when the funnel is empty *and* nothing
 *     in the grid is being held. The moment any pour starts, ticks
 *     across every funnel cross-fade to zero so the indicator has the
 *     stage; on release they cross-fade back in. No ruler, no grid,
 *     no per-integer markings — the two anchor ticks are the whole
 *     scale.
 *
 * `votes` may be fractional (real-valued) at any time. ARIA reports
 * the one-decimal-rounded value — same number a sighted user reads.
 */

interface FunnelProps {
  /** Real-valued vote level (rest or live). */
  votes: number;
  /** Maximum allowed votes here (= √budget). */
  maxVotes: number;
  /** Visible label for screen readers and the slider's aria-valuetext. */
  label: string;
  /** Begin a continuous pour (Space/Enter held). */
  onPourStart: (direction: 'in' | 'out') => void;
  /** End a continuous pour (Space/Enter released). */
  onPourEnd: () => void;
  /**
   * Disable the water polygon's interpolation animation. Set during an
   * active hold so the water tracks the live value frame-for-frame
   * instead of lagging behind a moving Framer-Motion target.
   */
  instantUpdate?: boolean;
  /**
   * True when *any* funnel in the grid is currently being held (the
   * parent flips this on the first pointerdown / keydown and off on
   * release). Drives the cross-fade of the reference ticks across the
   * grid — they hide during a pour so the live indicator owns the
   * stage, and fade back in on release.
   */
  isAnyPouring?: boolean;
  /** Pixel width of the funnel SVG. Height auto-derives from 45° geometry. */
  size?: number;
  /** Override CSS custom properties on the wrapper. */
  style?: CSSProperties;
}

/** One-decimal rounding used both visually and for ARIA values. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

// Gauge layer constants. Tuned visually against a 220-wide funnel.
const GAUGE_W = 36; // horizontal room reserved past the V's right edge
const ARROW_OFFSET = 4; // gap from the V's right edge to the arrow tip
const ARROW_SIZE = 7; // arrow side length (the left-pointing triangle)
const TICK_LENGTH = 8; // reference tick mark length (horizontal)
const TICK_OFFSET = 4; // gap from the V's right edge to the tick start
const FADE_MS = 250;
const POSITION_MS = 180;
const POSITION_EASE = [0.22, 1, 0.36, 1] as const;

export const Funnel = ({
  votes,
  maxVotes,
  label,
  onPourStart,
  onPourEnd,
  instantUpdate = false,
  isAnyPouring = false,
  size = 220,
  style,
}: FunnelProps) => {
  const reduceMotion = useReducedMotion();
  const sliderId = useId();

  // Track which key is currently driving a hold-pour. Only one hold at a
  // time per funnel — pressing a second key while holding the first is
  // ignored. Release of the original key ends the pour.
  const holdKeyRef = useRef<string | null>(null);

  // SVG layout — width-driven. Funnel cavity = (size − pads − gauge);
  // V height = funnel cavity / 2 (45° walls).
  const PAD_TOP = 14;
  const PAD_LEFT = 14;
  const PAD_RIGHT = 14;
  const PAD_BOTTOM = 18;
  const funnelWidth = size - PAD_LEFT - PAD_RIGHT - GAUGE_W;
  const usableHeight = funnelWidth / 2;
  const viewBoxH = PAD_TOP + usableHeight + PAD_BOTTOM;
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

  // Gauge geometry — anchored just past the V's right edge.
  const rightEdgeX = cx + fullH;
  const indicatorX = rightEdgeX + ARROW_OFFSET;
  const tickX1 = rightEdgeX + TICK_OFFSET;
  const tickX2 = tickX1 + TICK_LENGTH;
  // Reference ticks: half-cap (votes 5) and cap (votes 10 / rim).
  const tickHalfY = apexY - 5 * SCALE;
  const tickFullY = rimY;
  const indicatorY = apexY - h;

  const announcedVotes = round1(votes);
  const showIndicator = announcedVotes > 0;
  const showTicks = announcedVotes <= 0 && !isAnyPouring;

  // Keyboard:
  //   Space / Enter held → continuous pour-in (release ends pour)
  //   Shift + Space/Enter held → continuous pour-out (drain)
  //
  // Arrow keys, Page Up/Dn, Home/End — all gone. There are no tap
  // shortcuts. Every input goes through the same physics.
  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      // Don't restart the pour on OS-level repeat events.
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

  // Defensive: if focus is lost mid-hold, end the pour.
  useEffect(() => {
    const cancel = () => {
      if (!holdKeyRef.current) return;
      holdKeyRef.current = null;
      onPourEnd();
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [onPourEnd]);

  const announcedCredits = round1(votes * votes);
  return (
    <svg
      viewBox={`0 0 ${size} ${viewBoxH}`}
      width="100%"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={round1(maxVotes)}
      aria-valuenow={announcedVotes}
      aria-valuetext={`${announcedVotes.toFixed(1)} votes, ${announcedCredits.toFixed(1)} credits`}
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
          the water tracks the rAF-driven `votes` prop frame-for-frame
          instead of lagging behind a moving target. At rest, the
          motion transition gives released-pour changes a soft settle. */}
      {instantUpdate || reduceMotion ? (
        <path d={waterPath} fill="var(--lqv-water)" style={{ pointerEvents: 'none' }} />
      ) : (
        <motion.path
          d={waterPath}
          initial={false}
          fill="var(--lqv-water)"
          animate={{ d: waterPath }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
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
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
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

      {/* Reference ticks — half-cap and full-cap. The cross-fade
          between ticks ⇆ indicator runs through plain CSS opacity
          transitions instead of Framer Motion: the SVG-attribute path
          framer takes for opacity on <g> didn't reliably re-render
          after `animate` prop changes here, and a CSS transition
          on `style.opacity` handles it cleanly. */}
      <g
        aria-hidden
        style={{
          opacity: showTicks ? 1 : 0,
          transition: reduceMotion ? 'none' : `opacity ${FADE_MS}ms ease-out`,
          pointerEvents: 'none',
        }}
      >
        <line
          x1={tickX1}
          x2={tickX2}
          y1={tickHalfY}
          y2={tickHalfY}
          stroke="var(--lqv-fg)"
          strokeWidth={1}
          strokeOpacity={0.32}
        />
        <line
          x1={tickX1}
          x2={tickX2}
          y1={tickFullY}
          y2={tickFullY}
          stroke="var(--lqv-fg)"
          strokeWidth={1}
          strokeOpacity={0.32}
        />
      </g>

      {/* Live indicator — left-pointing arrow + numeric label, anchored
          at (indicatorX, indicatorY). Position updates instantly during
          a live hold; cross-fades on votes ⇆ 0 via CSS opacity. */}
      <g
        aria-hidden
        style={{
          opacity: showIndicator ? 1 : 0,
          transition: reduceMotion ? 'none' : `opacity ${FADE_MS}ms ease-out`,
          pointerEvents: 'none',
        }}
      >
        {instantUpdate || reduceMotion ? (
          <g transform={`translate(${indicatorX} ${indicatorY})`}>
            <IndicatorContents votes={announcedVotes} />
          </g>
        ) : (
          <motion.g
            initial={false}
            animate={{ x: indicatorX, y: indicatorY }}
            transition={{ duration: POSITION_MS / 1000, ease: POSITION_EASE }}
          >
            <IndicatorContents votes={announcedVotes} />
          </motion.g>
        )}
      </g>
    </svg>
  );
};

const IndicatorContents = ({ votes }: { votes: number }) => (
  <>
    {/* Left-pointing arrow — apex at (0, 0) (the gauge anchor); base
        on the right at (ARROW_SIZE, ±ARROW_SIZE/2). */}
    <path
      d={`M 0 0 L ${ARROW_SIZE} ${-ARROW_SIZE / 2} L ${ARROW_SIZE} ${ARROW_SIZE / 2} Z`}
      fill="var(--lqv-fg)"
      fillOpacity={0.55}
    />
    {/* Numeric label, vertically centered on the gauge anchor. */}
    <text
      x={ARROW_SIZE + 4}
      y={0}
      fontSize={11}
      fontFamily="'Suisse Intl', system-ui, sans-serif"
      fill="var(--lqv-fg)"
      fillOpacity={0.7}
      dominantBaseline="middle"
      textAnchor="start"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {votes.toFixed(1)}
    </text>
  </>
);
