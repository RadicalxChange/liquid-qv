/**
 * Quadratic Voting math primitives.
 *
 * The whole tool turns on these three identities:
 *
 *   credits  = votes²                (cost is quadratic in vote count)
 *   votes    = √credits              (vote count is sqrt of credits spent)
 *   d/dv c   = 2v                    (marginal cost rises linearly)
 *
 * Geometry maps these onto a 90° inverted-triangle funnel with apex down.
 * If h is the water height (= votes) and the walls are at 45°, the
 * cross-section at height h has width 2h, so the area below height h is
 *
 *   A(h) = ½ · 2h · h = h²
 *
 * which matches credits = votes² *by construction*. Pouring water is
 * pouring credits; the surface level you see is the vote count counted.
 *
 * All functions are pure and clamped at zero — negative votes are out of
 * scope for v1 (see project README for v2 plans).
 */

export const costForVotes = (votes: number): number => {
  if (!Number.isFinite(votes) || votes <= 0) return 0;
  return votes * votes;
};

export const votesForCredits = (credits: number): number => {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.sqrt(credits);
};

export const marginalCost = (votes: number): number => {
  if (!Number.isFinite(votes) || votes <= 0) return 0;
  return 2 * votes;
};

/**
 * Maximum votes a single funnel can hold given the budget.
 * If you cap at √budget, a single fully-loaded funnel drains the pool
 * exactly — anchoring the "all eggs in one basket" cost visually.
 */
export const maxVotes = (budget: number): number => {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.sqrt(budget);
};

/** Sum of credits spent across all vote allocations. */
export const totalCreditsSpent = (votes: Record<string, number>): number => {
  let sum = 0;
  for (const v of Object.values(votes)) sum += costForVotes(v);
  return sum;
};

/** Pool invariant: pool = budget − Σ votes². Floored at 0. */
export const remainingCredits = (
  budget: number,
  votes: Record<string, number>,
): number => {
  return Math.max(0, budget - totalCreditsSpent(votes));
};

/**
 * Clamp a proposed new vote level on a single item against the global
 * pool. Returns the largest legal `proposedVotes` value given the spend
 * already committed to *other* items.
 */
export const clampVotesAgainstBudget = (
  proposedVotes: number,
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  if (!Number.isFinite(proposedVotes) || proposedVotes <= 0) return 0;
  const cap = maxVotes(budget);
  const target = Math.min(proposedVotes, cap);

  // Credits already locked by other items.
  let othersCost = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (id === itemId) continue;
    othersCost += costForVotes(v);
  }
  const availableForThis = Math.max(0, budget - othersCost);
  const ceilingFromBudget = votesForCredits(availableForThis);

  return Math.min(target, ceilingFromBudget);
};

/** Round a vote level to 2 decimals — UI display precision. */
export const roundVotes = (votes: number): number => {
  return Math.round(votes * 100) / 100;
};
