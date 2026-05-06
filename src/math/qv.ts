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
 * Round 5 (hold-to-pour): votes are whole numbers at rest, but a "live"
 * pour gesture (hold + or −) flows credits at a constant volumetric rate
 * and renders fractional votes during the hold so the quadratic is *felt*
 * (constant input rate, decreasing rise rate as the funnel widens). The
 * reducer still stores integers; fractional values exist only in derived
 * UI state during an active pour, and snap to the nearest integer on
 * release. The integer math primitives below stay canonical; the UI
 * computes its live quantities directly with v*v / Math.sqrt and reaches
 * for `costForVotes` / `clampVotesAgainstBudget` only at commit time.
 *
 * All functions are pure and clamped at zero — negative votes are out of
 * scope (see project README for v2 plans).
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
 * Continuous version of `remainingCredits` — uses raw v*v (no flooring)
 * so it stays consistent with a pour-in-progress where one item's vote
 * count is a real value.
 */
export const remainingCreditsContinuous = (
  budget: number,
  votes: Record<string, number>,
): number => {
  let sum = 0;
  for (const v of Object.values(votes)) {
    if (Number.isFinite(v) && v > 0) sum += v * v;
  }
  return Math.max(0, budget - sum);
};

/**
 * Maximum continuous credits a single funnel can absorb given the rest
 * of the budget already locked elsewhere — i.e. the largest c such that
 * other_costs + c ≤ budget. Used by the hold-to-pour loop to clamp the
 * live water level against the pool.
 */
export const availableCreditsFor = (
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  let othersCost = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (id === itemId) continue;
    if (Number.isFinite(v) && v > 0) othersCost += v * v;
  }
  return Math.max(0, budget - othersCost);
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
