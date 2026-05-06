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
 * Round 6 (continuous votes): votes and credits are real-valued
 * end-to-end. There is no integer mode and no rounding in the math
 * layer. A single press obeys the same physics as a long hold —
 * transferred credits = duration × rate. Display-time rounding to one
 * decimal lives in the components, never here.
 *
 * All functions are pure and clamped at zero — negative votes are out of
 * scope (see project README for v2 plans).
 */

export const costForVotes = (votes: number): number => {
  if (!Number.isFinite(votes) || votes <= 0) return 0;
  return votes * votes;
};

/**
 * Maximum votes a single funnel can hold given the budget. For an
 * integer budget of 100, this is exactly √100 = 10 — a single
 * fully-loaded funnel drains the pool exactly.
 */
export const maxVotes = (budget: number): number => {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.sqrt(budget);
};

/** Sum of credits spent across all vote allocations (real-valued). */
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
 * Clamp a proposed (real-valued) vote level to the legal range — at
 * most √budget per funnel, and at most √(budget − others' credits).
 * Returns a real number; rounding is the display layer's problem.
 */
export const clampVotesAgainstBudget = (
  proposedVotes: number,
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  if (!Number.isFinite(proposedVotes) || proposedVotes <= 0) return 0;
  const cap = maxVotes(budget);
  const ceilingFromBudget = Math.sqrt(availableCreditsFor(itemId, votes, budget));
  return Math.max(0, Math.min(proposedVotes, cap, ceilingFromBudget));
};
