import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/*
 * PourStream — the visible water flow between pool and funnel during a
 * hold-to-pour gesture.
 *
 * Round 6 drops the dedicated tap animation: every interaction is a
 * hold (a press is just a short hold), so the same `active` mode covers
 * everything between pointer-down and pointer-up. On release we shift
 * into `fading` mode for a brief opacity decay, then unmount.
 *
 * Width is *constant*, matching the constant volumetric rate of the
 * pour. Rate is read off the pool emptying — not the stream's
 * thickness. The stream's job is to make the connection visible.
 *
 * Layout: lives inside each funnel card column, spanning the strip
 * between the card's top edge (which abuts the pool) and the funnel
 * rim. A gentle vertical bezier curve makes the source-and-destination
 * directionality obvious without needing labels.
 */

export type StreamMode = 'active' | 'fading';

interface Props {
  /** Whether this column should currently be rendering a stream. */
  visible: boolean;
  /** Direction of flow. */
  direction: 'in' | 'out';
  /** Mode controls animation duration. */
  mode: StreamMode;
}

const STREAM_HEIGHT_PX = 64;
const STREAM_WIDTH = 12;

export const PourStream = ({ visible, direction, mode }: Props) => {
  const reduceMotion = useReducedMotion();
  const isOutbound = direction === 'in'; // pool → funnel

  // Bezier control points: a slight S-curve so the stream has visible
  // shape rather than reading as a flat rectangle.
  const cx = 50;
  const W = 100;
  const H = STREAM_HEIGHT_PX;
  const top = isOutbound ? 0 : H;
  const bot = isOutbound ? H : 0;
  // Slight horizontal offset on control points → gentle bend.
  const path = `M ${cx} ${top}
    C ${cx - 6} ${top + (bot - top) * 0.3}
      ${cx + 6} ${top + (bot - top) * 0.7}
      ${cx} ${bot}`;

  const duration = mode === 'fading' ? 0.15 : reduceMotion ? 0 : 0.18;

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
                id={`pour-${direction}-${mode}`}
                x1="0"
                y1="0"
                x2="0"
                y2={H}
                gradientUnits="userSpaceOnUse"
              >
                {isOutbound ? (
                  <>
                    <stop offset="0%" stopColor="var(--lqv-pool)" />
                    <stop offset="100%" stopColor="var(--lqv-water)" />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="var(--lqv-water)" />
                    <stop offset="100%" stopColor="var(--lqv-pool)" />
                  </>
                )}
              </linearGradient>
            </defs>
            <path
              d={path}
              fill="none"
              stroke={`url(#pour-${direction}-${mode})`}
              strokeWidth={STREAM_WIDTH}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: 'drop-shadow(0 0 6px rgba(23, 115, 181, 0.35))' }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
};
