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
 * v1 polish: votes are whole numbers. The UI snaps to integers on
 * pointer-release, the reducer stores integers, and clampVotesAgainstBudget
 * returns the largest *integer* that fits the remaining pool. Inputs may
 * still arrive fractional from drag positions; floor at the boundary.
 *
 * All functions are pure and clamped at zero — negative votes are out of
 * scope for v1 (see project README for v2 plans).
 */

export const costForVotes = (votes: number): number => {
  if (!Number.isFinite(votes) || votes <= 0) return 0;
  const n = Math.floor(votes);
  return n * n;
};

/**
 * Maximum integer votes a single funnel can hold given the budget.
 * For an integer budget like 100, this is exactly 10 — a single fully
 * loaded funnel drains the pool exactly. For non-square budgets it
 * leaves a small remainder (e.g. budget 50 → cap 7, leaves 1).
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
 * Clamp a proposed vote level (possibly fractional, e.g. from a drag) to
 * the largest *integer* that respects the global pool and the per-funnel
 * cap. Used both as a guard on user input and as the canonical setter
 * inside the reducer.
 */
export const clampVotesAgainstBudget = (
  proposedVotes: number,
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  if (!Number.isFinite(proposedVotes) || proposedVotes <= 0) return 0;
  const cap = maxVotes(budget);
  const target = Math.min(Math.floor(proposedVotes), cap);

  // Credits already locked by other items.
  let othersCost = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (id === itemId) continue;
    othersCost += costForVotes(v);
  }
  const availableForThis = Math.max(0, budget - othersCost);
  // Largest integer v such that v² ≤ availableForThis.
  const ceilingFromBudget = Math.floor(Math.sqrt(availableForThis));

  return Math.max(0, Math.min(target, ceilingFromBudget));
};
