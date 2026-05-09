/*
 * Ruler tick-state derivation (round 15).
 *
 * Each ruler tick on a Funnel has one of three visual states:
 *
 *   - 'unfilled'  the water hasn't reached this milestone yet
 *   - 'filled'    the water has passed this milestone
 *   - 'current'   the highest milestone the water has reached;
 *                 visually highlighted as a "you just hit this"
 *                 marker during a live hold
 *
 * The state is a pure function of the integer-floor of |votes|.
 * Sign of `votes` does NOT affect tick state — only color, which
 * is computed separately by `voteColor` (so a +3 funnel and a −3
 * funnel light the same ticks; they just light them in different
 * colours).
 *
 * Tick 0 is the baseline reference at the funnel apex. It is
 * always 'unfilled' — the user hasn't *earned* zero votes; that's
 * the starting state. Milestones begin at ±1.
 */

export type TickState = 'unfilled' | 'filled' | 'current';

export const tickState = (tickValue: number, votes: number): TickState => {
  // Tick 0 is a passive baseline, never lit.
  if (tickValue < 1) return 'unfilled';

  // Defensive against NaN / ±Infinity from upstream interpolation
  // glitches; treat anything non-finite as zero magnitude.
  const mag = Math.abs(votes);
  if (!Number.isFinite(mag)) return 'unfilled';

  const floored = Math.floor(mag);
  if (floored < 1) return 'unfilled';
  if (tickValue > floored) return 'unfilled';
  if (tickValue === floored) return 'current';
  return 'filled';
};
