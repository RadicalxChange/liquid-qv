/**
 * Quadratic Voting math primitives.
 *
 * Two identities anchor the whole tool:
 *
 *   credits = votes²
 *   |votes|  = √credits
 *
 * Geometrically, a 90°-apex funnel with 45° walls turns these into the
 * water-area / water-height correspondence the UI relies on: cross-section
 * width at height h is 2h, so area below height h is h². Pouring water is
 * pouring credits; the visible surface level is the (signed) vote count.
 *
 * Round 12 (negative voting via bidirectional funnels): votes are signed
 * integers in [−⌊√budget⌋, +⌊√budget⌋] at rest. The cost is votes²
 * regardless of sign — supporting an item by 3 votes and opposing it by
 * 3 votes both cost 9 credits. The conservation invariant generalises
 * cleanly:
 *
 *     pool = budget − Σ votes_i²
 *
 * Snap-on-release uses round-half-AWAY-from-zero (so −0.5 → −1 and
 * +0.5 → +1) followed by a signed clamp.
 */

export const costForVotes = (votes: number): number => {
  if (!Number.isFinite(votes)) return 0;
  return votes * votes; // squaring handles sign automatically
};

/**
 * Maximum positive votes a single funnel can hold (per direction):
 * ⌊√budget⌋. For budget = 100 this is exactly 10. The negative cap
 * is the symmetric `−maxVotes`.
 */
export const maxVotes = (budget: number): number => {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.floor(Math.sqrt(budget));
};

/** Symmetric: minimum signed vote = −⌊√budget⌋. */
export const minVotes = (budget: number): number => {
  const m = maxVotes(budget);
  return m === 0 ? 0 : -m;
};

/** Sum of credits spent across all vote allocations (sign drops out). */
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
 * clamp the live water level against the pool. (Signed votes don't
 * change this — cost is votes².)
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
 * Clamp a proposed (possibly signed, possibly fractional) vote level
 * to the largest *signed integer* that respects the per-funnel cap
 * and the remaining pool. Floors |votes| to integer, preserves sign,
 * applies caps in both directions.
 */
export const clampVotesAgainstBudget = (
  proposedVotes: number,
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  if (!Number.isFinite(proposedVotes) || proposedVotes === 0) return 0;
  const sign = Math.sign(proposedVotes);
  const absFloor = Math.floor(Math.abs(proposedVotes));
  const cap = maxVotes(budget);
  const ceilingFromBudget = Math.floor(Math.sqrt(availableCreditsFor(itemId, votes, budget)));
  const maxAbs = Math.max(0, Math.min(cap, ceilingFromBudget));
  const absResult = Math.min(absFloor, maxAbs);
  // Normalise the zero result so we never return -0 (Object.is(-0, 0) is
  // false, which breaks .toBe(0) assertions and signedness semantics).
  return absResult === 0 ? 0 : sign * absResult;
};

/**
 * Snap a live (typically fractional, possibly signed) vote level to
 * the nearest *integer* that fits the cap and the remaining pool.
 *
 *     committed = sign(live) × clamp(round(|live|), 0, cap, ⌊√availableCredits⌋)
 *
 * Rounding uses round-HALF-AWAY-FROM-ZERO so −0.5 → −1 and +0.5 → +1
 * (Math.round in JavaScript rounds toward +∞ — −0.5 would round to 0
 * — so we round |live| and reapply the sign).
 *
 * Clamp is applied AFTER rounding, so a release at +9.6 with others
 * holding the pool to 75 credits rounds to 10, then clamps to
 * ⌊√75⌋ = 8. Same on the negative side: a release at −9.6 in the
 * same conditions snaps to −8.
 */
export const snapVotesToInteger = (
  liveVotes: number,
  itemId: string,
  votes: Record<string, number>,
  budget: number,
): number => {
  if (!Number.isFinite(liveVotes) || liveVotes === 0) return 0;
  const sign = Math.sign(liveVotes);
  const rounded = Math.round(Math.abs(liveVotes)); // round half away from zero
  const cap = maxVotes(budget);
  const ceilingFromBudget = Math.floor(Math.sqrt(availableCreditsFor(itemId, votes, budget)));
  const maxAbs = Math.max(0, Math.min(cap, ceilingFromBudget));
  const absResult = Math.min(rounded, maxAbs);
  return absResult === 0 ? 0 : sign * absResult;
};
