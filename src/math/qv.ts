/**
 * Quadratic Voting math primitives.
 *
 * Two identities anchor the whole tool:
 *
 *   credits = votes²
 *   votes   = √credits
 *
 * Geometrically, a 90°-apex funnel with 45° walls turns these into the
 * water-area / water-height correspondence the UI relies on: cross-section
 * width at height h is 2h, so area below height h is h². Pouring water is
 * pouring credits; the visible surface level is the vote count.
 *
 * Round 11 (measuring stick + integer snap on release): committed votes
 * are whole numbers. The hold-to-pour gesture remains the load-bearing
 * pedagogy — water rises continuously and slows visibly during a hold —
 * but on release the value snaps to the nearest integer that fits the
 * cap and the remaining pool. Display formatters round at the boundary;
 * conservation math is defined on the committed (integer) state.
 *
 * The live derivation during a hold still works in continuous values
 * (uses Math.sqrt and v*v directly in LiquidQV's `computeLiveVotes`).
 * It doesn't reach for these primitives mid-pour; only at commit.
 */

export const costForVotes = (votes: number): number => {
  if (!Number.isFinite(votes) || votes <= 0) return 0;
  return votes * votes;
};

/**
 * Maximum integer votes a single funnel can hold given the budget.
 * Floor of √budget — for budget 100 this is exactly 10. For non-square
 * budgets (e.g. 50) it leaves a small remainder at the cap.
 */
export const maxVotes = (budget: number): number => {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.floor(Math.sqrt(budget));
};

/** Sum of credits spent across all vote allocations. */
export const totalCreditsSpent = (votes: Record<string, number>): number => {
  let sum = 0;
  for (const v of Object.values(votes)) sum += costForVotes(v);
  return sum;
};

/** Pool invariant: pool = budget − Σ votes². Floored at 0. */
export const remainingCredits = (budget: number, votes: Record<string, number>): number => {
  return Math.max(0, budget - totalCreditsSpent(votes));
};

/**
 * Maximum credits a single funnel can absorb given the rest of the
 * budget already locked elsewhere. Used by the hold-to-pour loop to
 * clamp the live water level against the pool.
 */
export const availableCreditsFor = (
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  let othersCost = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (id === itemId) continue;
    othersCost += costForVotes(v);
  }
  return Math.max(0, budget - othersCost);
};

/**
 * Clamp a proposed vote level to the largest *integer* that respects
 * the per-funnel cap and the remaining pool. Used by the reducer as
 * a safety net for any 'set' dispatch — anything reaching this point
 * gets floored.
 */
export const clampVotesAgainstBudget = (
  proposedVotes: number,
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  if (!Number.isFinite(proposedVotes) || proposedVotes <= 0) return 0;
  const cap = maxVotes(budget);
  const ceilingFromBudget = Math.floor(Math.sqrt(availableCreditsFor(itemId, votes, budget)));
  return Math.max(0, Math.min(Math.floor(proposedVotes), cap, ceilingFromBudget));
};

/**
 * Snap a live (typically fractional) vote level to the nearest *integer*
 * that fits the cap and the remaining pool. This is the "release"
 * commit path: take where the user lifted, round to nearest, then clamp
 * down if that would overdraw.
 *
 *     committed = clamp(round(live), 0, cap, ⌊√availableCredits⌋)
 *
 * Rounding uses Math.round (ties go up: 0.5 → 1, 1.5 → 2, …). Clamp is
 * applied AFTER rounding so that a release at 9.6 rounds to 10 first,
 * then clamps to whatever integer actually fits the pool — matching
 * the spec's "snap-up exceeds cap" / "snap-up would overdraw pool"
 * cases (both fall through to the clamp).
 */
export const snapVotesToInteger = (
  liveVotes: number,
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  if (!Number.isFinite(liveVotes) || liveVotes <= 0) return 0;
  const rounded = Math.round(liveVotes);
  const cap = maxVotes(budget);
  const ceilingFromBudget = Math.floor(Math.sqrt(availableCreditsFor(itemId, votes, budget)));
  return Math.max(0, Math.min(rounded, cap, ceilingFromBudget));
};
