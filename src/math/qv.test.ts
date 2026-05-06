import { describe, expect, it } from 'vitest';
import {
  availableCreditsFor,
  clampVotesAgainstBudget,
  costForVotes,
  maxVotes,
  remainingCredits,
  totalCreditsSpent,
} from './qv';

describe('costForVotes', () => {
  it('squares vote count exactly (no flooring)', () => {
    expect(costForVotes(0)).toBe(0);
    expect(costForVotes(1)).toBe(1);
    expect(costForVotes(2)).toBe(4);
    expect(costForVotes(3)).toBe(9);
    expect(costForVotes(10)).toBe(100);
  });

  it('passes fractional inputs through unchanged', () => {
    expect(costForVotes(2.5)).toBeCloseTo(6.25);
    expect(costForVotes(2.9)).toBeCloseTo(8.41);
    expect(costForVotes(0.5)).toBeCloseTo(0.25);
    expect(costForVotes(0.1)).toBeCloseTo(0.01);
  });

  it('returns zero for negative or non-finite inputs', () => {
    expect(costForVotes(-3)).toBe(0);
    expect(costForVotes(NaN)).toBe(0);
    expect(costForVotes(Infinity)).toBe(0);
  });
});

describe('maxVotes', () => {
  it('returns √budget without flooring', () => {
    expect(maxVotes(100)).toBe(10);
    expect(maxVotes(81)).toBe(9);
    expect(maxVotes(50)).toBeCloseTo(7.0710678);
    expect(maxVotes(0)).toBe(0);
  });
});

describe('totalCreditsSpent', () => {
  it('sums squared real-valued votes across items', () => {
    expect(totalCreditsSpent({ a: 3, b: 4 })).toBe(9 + 16);
    expect(totalCreditsSpent({ a: 2.5, b: 1.5 })).toBeCloseTo(6.25 + 2.25);
    expect(totalCreditsSpent({})).toBe(0);
  });
});

describe('remainingCredits', () => {
  it('respects the conservation invariant pool = budget − Σ votes²', () => {
    expect(remainingCredits(100, { a: 3, b: 4 })).toBe(100 - 25);
    expect(remainingCredits(100, {})).toBe(100);
  });

  it('handles fractional votes correctly', () => {
    // a=2.6 (6.76), b=4.1 (16.81), c=1.7 (2.89) → spent 26.46
    expect(remainingCredits(100, { a: 2.6, b: 4.1, c: 1.7 })).toBeCloseTo(73.54);
  });

  it('floors at zero rather than going negative', () => {
    expect(remainingCredits(10, { a: 5 })).toBe(0);
  });
});

describe('availableCreditsFor', () => {
  it('returns budget minus other items, never less than zero', () => {
    expect(availableCreditsFor('a', { a: 0, b: 4 }, 100)).toBe(100 - 16);
    expect(availableCreditsFor('a', { a: 999, b: 999 }, 5)).toBeGreaterThanOrEqual(0);
  });

  it('ignores the item being asked about', () => {
    // a's own contribution is excluded — the function answers
    // "if a's slot were empty, how many credits would be left?"
    expect(availableCreditsFor('a', { a: 2.5, b: 4 }, 100)).toBe(100 - 16);
  });
});

describe('clampVotesAgainstBudget', () => {
  it('returns the proposed value when there is room (and stays fractional)', () => {
    expect(clampVotesAgainstBudget(2, 'a', {}, 100)).toBe(2);
    expect(clampVotesAgainstBudget(3.7, 'a', {}, 100)).toBeCloseTo(3.7);
    expect(clampVotesAgainstBudget(0.4, 'a', {}, 100)).toBeCloseTo(0.4);
  });

  it('caps at √budget when proposing more', () => {
    expect(clampVotesAgainstBudget(99, 'a', {}, 100)).toBe(10);
    expect(clampVotesAgainstBudget(99, 'a', {}, 50)).toBeCloseTo(Math.sqrt(50));
  });

  it('respects fractional credits already locked by other items', () => {
    // b at 2.5 → 6.25 spent → 93.75 left → max √93.75 ≈ 9.6824 votes here.
    expect(clampVotesAgainstBudget(99, 'a', { b: 2.5 }, 100)).toBeCloseTo(Math.sqrt(93.75));
  });

  it('respects integer-cap-equivalent when other items use whole credits', () => {
    // b at 8 → 64 spent → 36 left → max √36 = 6 votes here.
    expect(clampVotesAgainstBudget(99, 'a', { b: 8 }, 100)).toBe(6);
  });

  it('returns zero for invalid input', () => {
    expect(clampVotesAgainstBudget(-1, 'a', {}, 100)).toBe(0);
    expect(clampVotesAgainstBudget(NaN, 'a', {}, 100)).toBe(0);
  });

  it('preserves the conservation invariant after clamping (real-valued)', () => {
    const budget = 100;
    const votes = { a: 6.2, b: 3.8, c: 2.1 }; // 38.44 + 14.44 + 4.41 = 57.29 spent
    const clamped = clampVotesAgainstBudget(99, 'd', votes, budget);
    const total =
      costForVotes(clamped) + costForVotes(6.2) + costForVotes(3.8) + costForVotes(2.1);
    expect(total).toBeLessThanOrEqual(budget + 1e-9);
  });
});

describe('press duration physics', () => {
  // The hold-only interaction model: transferred credits = duration × rate,
  // applied to the funnel via votes = √(startCredits + transferred). These
  // tests pin the math the UI relies on, not any UI behaviour itself.
  const RATE = 5; // credits per second — must match LiquidQV's POUR_RATE

  it('a 200 ms press from empty transfers ~1 credit, ~1 vote', () => {
    const transferred = 0.2 * RATE; // 1 credit
    const votes = Math.sqrt(0 + transferred);
    expect(transferred).toBeCloseTo(1);
    expect(votes).toBeCloseTo(1);
  });

  it('a 1.4 s press from empty lands near 2.65 votes, 7 credits', () => {
    const transferred = 1.4 * RATE; // 7 credits
    const votes = Math.sqrt(0 + transferred);
    expect(transferred).toBeCloseTo(7);
    expect(votes).toBeCloseTo(2.6457513);
  });

  it('the same hold duration yields a smaller delta as the funnel fills', () => {
    // From empty: 1.4 s of pour → √7 ≈ 2.65 votes (delta from 0 ≈ 2.65)
    const fromEmpty = Math.sqrt(0 + 1.4 * RATE);
    // From 2.6 votes (6.76 credits): another 1.4 s → √(6.76 + 7) ≈ 3.71
    const fromMid = Math.sqrt(6.76 + 1.4 * RATE);
    expect(fromEmpty).toBeCloseTo(2.6457513);
    expect(fromMid).toBeCloseTo(3.71, 1);
    expect(fromMid - 2.6).toBeLessThan(fromEmpty - 0); // delta shrinks
  });
});
