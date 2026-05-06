import { motion, useReducedMotion } from 'framer-motion';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import { roundVotes } from '../math/qv';

/*
 * Funnel — a 90° inverted right-triangle whose water level *is* the vote
 * count, and whose water area *is* the credits spent. The whole point of
 * the tool flows out of two equations:
 *
 *     votes  = h            (water height in funnel-units)
 *     credits = h²          (water area: ½ · 2h · h)
 *
 * The funnel walls meet at 45° at the apex. Width at height h is 2h, so
 * adding the next sliver of water needs more credits than the last —
 * that's diminishing returns made geometric.
 *
 * SVG coordinate system note:
 *   We render with +y going *down* (standard SVG), and place the apex at
 *   the *bottom* of the drawn region. Water height h is measured upward
 *   from the apex toward the rim. Internally we flip: the water polygon
 *   for level `votes` is drawn with vertices at
 *
 *     (cx, APEX_Y)
 *     (cx - votes·SCALE, APEX_Y - votes·SCALE)
 *     (cx + votes·SCALE, APEX_Y - votes·SCALE)
 *
 *   where SCALE = (drawable height in px) / maxVotes. SCALE collapses
 *   the abstract vote-units into pixels but does not change the
 *   `credits = votes²` relationship one bit.
 */

interface FunnelProps {
  /** Current vote level on this funnel (in vote units, fractional). */
  votes: number;
  /** Maximum allowed votes here, capped at √budget. */
  maxVotes: number;
  /** Whether dragging is allowed against the global pool. */
  available: number; // votes that could still be added before pool empties
  /** Called continuously while the user drags or steps the level. */
  onChange: (votes: number) => void;
  /** Called once at pointer-up — useful for animating the transfer flow. */
  onCommit?: (votes: number) => void;
  /** Visible label for screen readers and the drag handle aria-valuetext. */
  label: string;
  /** Pixel-size of the drawable square area. Default 220. */
  size?: number;
  /** Override CSS custom properties on the wrapper. */
  style?: CSSProperties;
}

export const Funnel = ({
  votes,
  maxVotes,
  available,
  onChange,
  onCommit,
  label,
  size = 220,
  style,
}: FunnelProps) => {
  const reduceMotion = useReducedMotion();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const sliderId = useId();

  // SVG layout. We give the funnel a 1:1 box and a small padding for
  // the rim and tick labels. The funnel apex sits at the bottom-centre
  // of the drawable area; the walls reach the rim at the top corners
  // when level == maxVotes.
  const PAD_TOP = 14; // headroom above the rim for ticks
  const PAD_X = 18;
  const PAD_BOTTOM = 18;
  const drawHeight = size - PAD_TOP - PAD_BOTTOM;
  const drawWidth = size - 2 * PAD_X;
  // For 45° walls, drawHeight should equal drawWidth/2. Force it.
  const usableHeight = Math.min(drawHeight, drawWidth / 2);
  const cx = size / 2;
  const apexY = PAD_TOP + usableHeight; // bottom of the funnel triangle
  // Convert vote-units to pixels.
  const SCALE = maxVotes > 0 ? usableHeight / maxVotes : 1;

  // Water polygon for the current level.
  const h = Math.max(0, Math.min(votes, maxVotes)) * SCALE;
  const waterPath = h > 0 ? `M ${cx} ${apexY} L ${cx - h} ${apexY - h} L ${cx + h} ${apexY - h} Z` : '';

  // Container outline (the funnel itself, drawn at maxVotes).
  const fullH = usableHeight;
  const outlinePath = `M ${cx} ${apexY} L ${cx - fullH} ${apexY - fullH} L ${cx + fullH} ${apexY - fullH}`;
  // Optional rim flourish — short horizontal at the top suggesting capacity.
  const rimY = apexY - fullH;

  // Convert a pointer Y position to a vote level. Above the rim → maxVotes.
  // Below the apex → 0. Linear in between.
  const yToVotes = useCallback(
    (clientY: number): number => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return votes;
      // Position within the SVG viewBox (in px relative to the rendered size).
      // The viewBox is `size`, and the SVG renders at width `rect.width`.
      const localY = ((clientY - rect.top) / rect.height) * size;
      // Distance from apex upward.
      const upward = apexY - localY;
      const proposed = upward / SCALE;
      // Clamp to [0, min(maxVotes, votes + available)] — caller is the
      // source of truth, but we prevent useless drag noise past the cap.
      const ceiling = Math.min(maxVotes, votes + Math.max(0, available));
      return Math.max(0, Math.min(proposed, ceiling));
    },
    [votes, maxVotes, available, apexY, SCALE, size],
  );

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onChange(yToVotes(e.clientY));
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    onChange(yToVotes(e.clientY));
  };

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    onCommit?.(votes);
  };

  // Keyboard accessibility: arrow keys nudge in 0.1-vote increments,
  // Shift+arrow in 1-vote increments. PageUp/PageDn jump to ±maxVotes.
  // Home/End set the funnel to 0 / max.
  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const small = 0.1;
    const big = 1;
    let target = votes;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        target = votes + (e.shiftKey ? big : small);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        target = votes - (e.shiftKey ? big : small);
        break;
      case 'PageUp':
        target = votes + big * 5;
        break;
      case 'PageDown':
        target = votes - big * 5;
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
    onChange(target);
    onCommit?.(target);
  };

  // Cancel drag if pointer leaves the window without an up event.
  useEffect(() => {
    const cancel = () => {
      draggingRef.current = false;
    };
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  // Tick marks along the side: 0, 25%, 50%, 75%, 100% of capacity.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    frac,
    y: apexY - frac * fullH,
    votes: roundVotes(frac * maxVotes),
  }));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={roundVotes(maxVotes)}
      aria-valuenow={roundVotes(votes)}
      aria-valuetext={`${roundVotes(votes)} votes, ${roundVotes(votes * votes)} credits`}
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
        x={PAD_X - 6}
        y={PAD_TOP - 6}
        width={drawWidth + 12}
        height={drawHeight + 12}
        rx={10}
        fill="var(--lqv-funnel-bg)"
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1}
      />

      {/* Tick marks for vote scale. Drawn before the funnel so they sit
          behind the walls. */}
      <g aria-hidden="true">
        {ticks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={cx + fullH + 4}
              x2={cx + fullH + 10}
              y1={t.y}
              y2={t.y}
              stroke="var(--lqv-muted)"
              strokeWidth={1}
            />
            <text
              x={cx + fullH + 14}
              y={t.y + 3}
              fontSize={10}
              fill="var(--lqv-muted)"
              fontFamily="'Suisse Intl', system-ui, sans-serif"
            >
              {t.votes}
            </text>
          </g>
        ))}
      </g>

      {/* Water — animated. The polygon area equals credits = votes². */}
      <motion.path
        d={waterPath}
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

      {/* Rim flourish — a short horizontal at the top of the funnel
          marking the maxVotes capacity. */}
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
