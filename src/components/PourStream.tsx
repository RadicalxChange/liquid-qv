import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { voteColor } from '../lib/voteColor';

/*
 * PourStream — the visible water flow between pool and funnel during a
 * hold-to-pour gesture.
 *
 * Round 6 collapsed the dedicated tap animation into the same `active`
 * mode that covers everything between pointer-down and pointer-up. On
 * release we shift into `fading` mode for a brief opacity decay.
 *
 * Round 13 (color by sign): the stream's funnel-side colour now tracks
 * the *funnel's current vote sign* rather than a fixed water-blue.
 * The pool side stays neutral (uses `--lqv-pool`). During the brief
 * cross-zero moment when the funnel is empty (v = 0), the stream
 * inherits the positive colour by convention — the parent suppresses
 * the stream entirely at exactly v = 0 by passing `visible = false`.
 *
 * Width is constant, matching the constant volumetric rate of the
 * pour. Rate is read off the pool emptying — not the stream's
 * thickness.
 */

export type StreamMode = 'active' | 'fading';

interface Props {
  /** Whether this column should currently be rendering a stream. */
  visible: boolean;
  /** Direction of flow. */
  direction: 'in' | 'out';
  /** Mode controls animation duration. */
  mode: StreamMode;
  /**
   * The funnel's current signed vote level. The funnel-side end of
   * the stream uses `voteColor(voteSign)`; the pool side stays
   * neutral.
   */
  voteSign: number;
}

const STREAM_HEIGHT_PX = 64;
const STREAM_WIDTH = 12;

export const PourStream = ({ visible, direction, mode, voteSign }: Props) => {
  const reduceMotion = useReducedMotion();
  const isOutbound = direction === 'in'; // pool → funnel
  const gradientId = useId();

  // Bezier control points: a slight S-curve so the stream has visible
  // shape rather than reading as a flat rectangle.
  const cx = 50;
  const W = 100;
  const H = STREAM_HEIGHT_PX;
  const top = isOutbound ? 0 : H;
  const bot = isOutbound ? H : 0;
  const path = `M ${cx} ${top}
    C ${cx - 6} ${top + (bot - top) * 0.3}
      ${cx + 6} ${top + (bot - top) * 0.7}
      ${cx} ${bot}`;

  const duration = mode === 'fading' ? 0.15 : reduceMotion ? 0 : 0.18;
  const funnelColor = voteColor(voteSign);

  return (
    <div
      aria-hidden
      className="pointer-events-none relative w-full"
      style={{ height: STREAM_HEIGHT_PX }}
    >
      <AnimatePresence>
        {visible && !reduceMotion && (
          <motion.svg
            key={direction + mode}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: mode === 'fading' ? 0 : 0.95 }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: 'easeOut' }}
          >
            <defs>
              <linearGradient
                id={gradientId}
                x1="0"
                y1="0"
                x2="0"
                y2={H}
                gradientUnits="userSpaceOnUse"
              >
                {/* Pool end stays neutral; funnel end uses the
                    sign-keyed water colour. */}
                {isOutbound ? (
                  <>
                    <stop offset="0%" stopColor="var(--lqv-pool)" />
                    <stop offset="100%" stopColor={funnelColor} />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor={funnelColor} />
                    <stop offset="100%" stopColor="var(--lqv-pool)" />
                  </>
                )}
              </linearGradient>
            </defs>
            <path
              d={path}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={STREAM_WIDTH}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: 'drop-shadow(0 0 6px rgba(0, 0, 0, 0.25))' }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
};
