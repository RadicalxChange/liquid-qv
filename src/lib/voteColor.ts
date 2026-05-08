/**
 * Round-13 sign-to-color mapping for the funnel water and the pour
 * stream. Lives here so the mapping is in one place — components
 * import the helpers rather than embedding the CSS variable strings.
 *
 * Vote semantics:
 *   v > 0 → positive (support)  → green water
 *   v < 0 → negative (oppose)   → red water
 *   v = 0 → no water rendered;  the colour returned for sign 0 is
 *           the positive variant by default (the funnel renders a
 *           degenerate point so the colour is invisible anyway, but
 *           callers expect a string back).
 *
 * The actual colour values live as CSS variables in `styles/index.css`
 * (and can be overridden through the `theme` prop on `<LiquidQV />`).
 * These helpers just return the right `var(...)` reference.
 */

export type VoteSign = -1 | 0 | 1;

/** Normalise any signed numeric input down to {-1, 0, 1}. */
export const voteSign = (v: number): VoteSign => {
  if (!Number.isFinite(v) || v === 0) return 0;
  return v > 0 ? 1 : -1;
};

/** Base water colour for a given vote (or vote sign). */
export const voteColor = (v: number): string => {
  const s = voteSign(v);
  return s < 0 ? 'var(--lqv-vote-negative)' : 'var(--lqv-vote-positive)';
};

/** Darker variant for surface highlights / accents. */
export const voteColorDark = (v: number): string => {
  const s = voteSign(v);
  return s < 0 ? 'var(--lqv-vote-negative-dark)' : 'var(--lqv-vote-positive-dark)';
};
