import { motion, useReducedMotion } from 'framer-motion';
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
} from 'react';

/*
 * Funnel — a 90° inverted right-triangle whose water level *is* the vote
 * count and whose water area *is* the credits spent. Two equations:
 *
 *     votes  = h            (water height in funnel-units)
 *     credits = h²          (water area: ½ · 2h · h)
 *
 * Round 5 (hold-to-pour): the funnel is purely a visual. Interaction
 * lives on the +/− PourControls and the keyboard slider role here. The
 * older drag-the-water-surface gesture was removed — it conflicted with
 * the volumetric pour model (one canonical way to pour beats two).
 *
 * `votes` may be fractional during an active hold (the parent passes
 * the live continuous value); the water polygon and surface line render
 * directly from it for smoothness. ARIA reports the integer-rounded
 * value so screen readers get a stable announcement at rest.
 */

interface FunnelProps {
  /** Display vote level — integer at rest, fractional during a hold. */
  votes: number;
  /** Maximum allowed votes here (= floor(√budget)). */
  maxVotes: number;
  /** Visible label for screen readers and the slider's aria-valuetext. */
  label: string;
  /** Tap-step a single vote (used by arrow keys). */
  onTapStep: (delta: number) => void;
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
  /** Pixel width of the funnel SVG. Height auto-derives from 45° geometry. */
  size?: number;
  /** Override CSS custom properties on the wrapper. */
  style?: CSSProperties;
}

export const Funnel = ({
  votes,
  maxVotes,
  label,
  onTapStep,
  onPourStart,
  onPourEnd,
  instantUpdate = false,
  size = 220,
  style,
}: FunnelProps) => {
  const reduceMotion = useReducedMotion();
  const sliderId = useId();

  // Track which key (if any) is currently driving a hold-pour. Only one
  // hold at a time per funnel — pressing a second key while holding the
  // first is ignored. Release of the original key ends the pour.
  const holdKeyRef = useRef<string | null>(null);

  // SVG layout — width-driven. Funnel height = funnel width / 2 (45° walls).
  const PAD_TOP = 14;
  const PAD_LEFT = 14;
  const PAD_RIGHT = 14;
  const PAD_BOTTOM = 18;
  const funnelWidth = size - PAD_LEFT - PAD_RIGHT;
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

  // Keyboard:
  //   Space / Enter held → continuous pour-in (release ends pour)
  //   Shift + Space/Enter held → continuous pour-out (drain)
  //   Arrow keys → tap ±1
  //   PageUp/Dn → tap ±5
  //   Home / End → tap to 0 / cap (discrete events; we step in the parent)
  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      // Don't restart the pour on OS-level repeat events.
      if (e.repeat || holdKeyRef.current) return;
      e.preventDefault();
      holdKeyRef.current = e.key;
      onPourStart(e.shiftKey ? 'out' : 'in');
      return;
    }
    let delta = 0;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        delta = e.shiftKey ? 5 : 1;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        delta = e.shiftKey ? -5 : -1;
        break;
      case 'PageUp':
        delta = 5;
        break;
      case 'PageDown':
        delta = -5;
        break;
      case 'Home':
        // Treat as a multi-step decrement to zero.
        delta = -maxVotes;
        break;
      case 'End':
        delta = maxVotes;
        break;
      default:
        return;
    }
    e.preventDefault();
    onTapStep(delta);
  };

  const handleKeyUp = (e: KeyboardEvent<SVGSVGElement>) => {
    if (holdKeyRef.current && e.key === holdKeyRef.current) {
      holdKeyRef.current = null;
      onPourEnd();
    }
  };

  // Defensive: if focus is lost mid-hold, end the pour so we don't
  // leak the active state.
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
      viewBox={`0 0 ${size} ${viewBoxH}`}
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
          the water tracks the rAF-driven `votes` prop frame-for-frame
          instead of lagging behind a moving target. At rest, the
          motion transition gives ± changes a soft "settle" feel. */}
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
            animate={{
              x1: cx - h,
              x2: cx + h,
              y1: apexY - h,
              y2: apexY - h,
            }}
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

      {/* Rim — short horizontal at the cap. Water hitting this line
          communicates "this funnel is full" without a separate label. */}
      <line
        x1={cx - fullH}
        x2={cx + fullH}
        y1={rimY}
        y2={rimY}
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
};
