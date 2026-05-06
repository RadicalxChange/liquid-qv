import { motion, useReducedMotion } from 'framer-motion';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

/*
 * Funnel — a 90° inverted right-triangle whose water level *is* the vote
 * count, and whose water area *is* the credits spent. Two equations and
 * the rest follows:
 *
 *     votes  = h            (water height in funnel-units)
 *     credits = h²          (water area: ½ · 2h · h)
 *
 * The funnel walls meet at 45° at the apex. Width at height h is 2h, so
 * adding the next sliver of water needs more credits than the last.
 *
 * Polish round 2: votes are whole numbers. The drag still feels smooth —
 * we render the fractional pointer position locally during a drag — but
 * commits to the parent reducer always go through Math.round, and the
 * water snaps to the integer level when the finger lifts. The vote-scale
 * tick labels were stripped (math-y noise; the geometry already conveys
 * height), and the funnel rim is the visual cap.
 *
 * SVG coordinate system: +y goes down, apex sits at the bottom of the
 * drawn region, water height is measured upward from the apex toward
 * the rim.
 */

interface FunnelProps {
  /** Current vote level on this funnel (committed integer). */
  votes: number;
  /** Maximum allowed votes here (= floor(√budget)). */
  maxVotes: number;
  /** Votes that could still be added before the pool empties. */
  available: number;
  /** Called once at pointer-up (or keyboard step) with the new integer. */
  onChange: (votes: number) => void;
  /** Visible label for screen readers and the slider's aria-valuetext. */
  label: string;
  /** Pixel width of the funnel SVG (height auto-derives from 45° geometry). */
  size?: number;
  /** Override CSS custom properties on the wrapper. */
  style?: CSSProperties;
}

export const Funnel = ({
  votes,
  maxVotes,
  available,
  onChange,
  label,
  size = 220,
  style,
}: FunnelProps) => {
  const reduceMotion = useReducedMotion();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const sliderId = useId();

  // Live (fractional) vote level shown during a drag for smoothness. While
  // null, the funnel renders from the committed `votes` prop. Set on
  // pointerdown/move; cleared on pointerup, where we commit Math.round.
  const [liveLevel, setLiveLevel] = useState<number | null>(null);
  const displayVotes = liveLevel ?? votes;

  // SVG layout — width-driven. Funnel height = funnel width / 2 (45° walls).
  // We reserve a small right-side strip even though we no longer render
  // tick labels there, so the centred rim doesn't kiss the right edge.
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

  // Water polygon for the current display level. We always emit a valid
  // path (a degenerate triangle collapsed at the apex when h=0) so
  // Framer Motion can interpolate between empty and filled states
  // without warning that "" isn't an animatable value.
  const h = Math.max(0, Math.min(displayVotes, maxVotes)) * SCALE;
  const waterPath = `M ${cx} ${apexY} L ${cx - h} ${apexY - h} L ${cx + h} ${apexY - h} Z`;

  // Funnel outline: left-rim → apex → right-rim. The horizontal rim is
  // drawn separately so the missing-wall bug from v1 (path fell back to
  // an implicit close that wasn't drawn) can't recur.
  const fullH = usableHeight;
  const outlinePath = `M ${cx - fullH} ${apexY - fullH} L ${cx} ${apexY} L ${cx + fullH} ${apexY - fullH}`;
  const rimY = apexY - fullH;

  // Pointer Y → fractional vote level. Above the rim → cap; below the
  // apex → 0.
  const yToVotes = useCallback(
    (clientY: number): number => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return votes;
      const localY = ((clientY - rect.top) / rect.height) * viewBoxH;
      const upward = apexY - localY;
      const proposed = upward / SCALE;
      const ceiling = Math.min(maxVotes, votes + Math.max(0, available));
      return Math.max(0, Math.min(proposed, ceiling));
    },
    [votes, maxVotes, available, apexY, SCALE, viewBoxH],
  );

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setLiveLevel(yToVotes(e.clientY));
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    setLiveLevel(yToVotes(e.clientY));
  };

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const final = liveLevel != null ? Math.round(liveLevel) : votes;
    setLiveLevel(null);
    if (final !== votes) onChange(final);
  };

  // Keyboard accessibility (integer steps).
  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    let target = votes;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        target = votes + (e.shiftKey ? 5 : 1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        target = votes - (e.shiftKey ? 5 : 1);
        break;
      case 'PageUp':
        target = votes + 5;
        break;
      case 'PageDown':
        target = votes - 5;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = maxVotes;
        break;
      default:
        return;
    }
    e.preventDefault();
    const ceiling = Math.min(maxVotes, votes + Math.max(0, available));
    target = Math.max(0, Math.min(target, ceiling));
    if (target !== votes) onChange(target);
  };

  // Cancel drag if the pointer leaves the window without an up event.
  useEffect(() => {
    const cancel = () => {
      draggingRef.current = false;
      setLiveLevel(null);
    };
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  const announcedVotes = Math.round(displayVotes);
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${size} ${viewBoxH}`}
      width="100%"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={maxVotes}
      aria-valuenow={announcedVotes}
      aria-valuetext={`${announcedVotes} ${announcedVotes === 1 ? 'vote' : 'votes'}, ${announcedVotes * announcedVotes} ${announcedVotes * announcedVotes === 1 ? 'credit' : 'credits'}`}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      style={{
        touchAction: 'none',
        cursor: draggingRef.current ? 'grabbing' : 'grab',
        userSelect: 'none',
        ...style,
      }}
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

      {/* Water — animated. The polygon area equals credits = votes². */}
      <motion.path
        d={waterPath}
        initial={false}
        fill="var(--lqv-water)"
        animate={{ d: waterPath }}
        transition={{
          duration: reduceMotion ? 0 : 0.28,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{ pointerEvents: 'none' }}
      />

      {/* Subtle highlight at the water surface (the visible "level"). */}
      {h > 0 && (
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
          transition={{
            duration: reduceMotion ? 0 : 0.28,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Funnel walls drawn last so they sit on top of the water. */}
      <path
        d={outlinePath}
        fill="none"
        stroke="var(--lqv-water-dark)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Rim — short horizontal at the top of the funnel marking the cap.
          Water hitting this line communicates "this funnel is full" without
          a separate label. */}
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
