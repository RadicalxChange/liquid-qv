import { describe, expect, it } from 'vitest';
import {
  availableCreditsFor,
  clampVotesAgainstBudget,
  costForVotes,
  maxVotes,
  remainingCredits,
  snapVotesToInteger,
  totalCreditsSpent,
} from './qv';

describe('costForVotes', () => {
  it('squares vote count exactly', () => {
    expect(costForVotes(0)).toBe(0);
    expect(costForVotes(1)).toBe(1);
    expect(costForVotes(2)).toBe(4);
    expect(costForVotes(3)).toBe(9);
    expect(costForVotes(10)).toBe(100);
  });

  it('squares fractional inputs (used by the live derivation during a hold)', () => {
    expect(costForVotes(2.5)).toBeCloseTo(6.25);
    expect(costForVotes(0.5)).toBeCloseTo(0.25);
  });

  it('returns zero for negative or non-finite inputs', () => {
    expect(costForVotes(-3)).toBe(0);
    expect(costForVotes(NaN)).toBe(0);
    expect(costForVotes(Infinity)).toBe(0);
  });
});

describe('maxVotes', () => {
  it('returns ⌊√budget⌋ — integer cap per funnel', () => {
    expect(maxVotes(100)).toBe(10);
    expect(maxVotes(81)).toBe(9);
    expect(maxVotes(50)).toBe(7); // ⌊√50⌋ = 7; leaves 1 credit at the cap
    expect(maxVotes(0)).toBe(0);
  });
});

describe('totalCreditsSpent', () => {
  it('sums squared votes across items', () => {
    expect(totalCreditsSpent({ a: 3, b: 4 })).toBe(9 + 16);
    expect(totalCreditsSpent({})).toBe(0);
  });
});

describe('remainingCredits', () => {
  it('respects the conservation invariant pool = budget − Σ votes²', () => {
    expect(remainingCredits(100, { a: 3, b: 4 })).toBe(100 - 25);
    expect(remainingCredits(100, {})).toBe(100);
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
    expect(availableCreditsFor('a', { a: 5, b: 4 }, 100)).toBe(100 - 16);
  });
});

describe('clampVotesAgainstBudget', () => {
  it('returns the proposed integer when there is room', () => {
    expect(clampVotesAgainstBudget(2, 'a', {}, 100)).toBe(2);
  });

  it('caps at ⌊√budget⌋ when proposing more', () => {
    expect(clampVotesAgainstBudget(99, 'a', {}, 100)).toBe(10);
    expect(clampVotesAgainstBudget(99, 'a', {}, 50)).toBe(7);
  });

  it("respects integer credits already locked by other items", () => {
    // b at 8 → 64 spent → 36 left → max √36 = 6 votes here.
    expect(clampVotesAgainstBudget(99, 'a', { b: 8 }, 100)).toBe(6);
  });

  it('floors any fractional input it receives', () => {
    expect(clampVotesAgainstBudget(3.7, 'a', {}, 100)).toBe(3);
    expect(clampVotesAgainstBudget(0.4, 'a', {}, 100)).toBe(0);
  });

  it('returns zero for invalid input', () => {
    expect(clampVotesAgainstBudget(-1, 'a', {}, 100)).toBe(0);
    expect(clampVotesAgainstBudget(NaN, 'a', {}, 100)).toBe(0);
  });

  it('preserves the conservation invariant after clamping', () => {
    const budget = 100;
    const votes = { a: 6, b: 4, c: 2 }; // 36 + 16 + 4 = 56 spent
    const clamped = clampVotesAgainstBudget(99, 'd', votes, budget);
    const total = costForVotes(clamped) + 36 + 16 + 4;
    expect(total).toBeLessThanOrEqual(budget);
  });

  it('returns an integer for any input', () => {
    for (const v of [0, 1, 2.4, 3.999, 7.5, 9.9, 10, 99]) {
      expect(Number.isInteger(clampVotesAgainstBudget(v, 'a', {}, 100))).toBe(true);
    }
  });
});

describe('snapVotesToInteger', () => {
  it('rounds to the nearest integer when there is room', () => {
    expect(snapVotesToInteger(2.4, 'a', {}, 100)).toBe(2);
    expect(snapVotesToInteger(2.5, 'a', {}, 100)).toBe(3); // ties go up
    expect(snapVotesToInteger(2.6, 'a', {}, 100)).toBe(3);
    expect(snapVotesToInteger(0.49, 'a', {}, 100)).toBe(0);
    expect(snapVotesToInteger(0.5, 'a', {}, 100)).toBe(1);
  });

  it('caps at ⌊√budget⌋', () => {
    // Empty budget pool, live held to 9.9 → rounds to 10, fits.
    expect(snapVotesToInteger(9.9, 'a', {}, 100)).toBe(10);
    // Live held above the cap (e.g. user held past the rim somehow).
    expect(snapVotesToInteger(11, 'a', {}, 100)).toBe(10);
  });

  it('clamps DOWN when round-up would exceed the remaining pool (the brief example)', () => {
    // Others have used 25 credits (e.g. b=5). Available = 75.
    // ⌊√75⌋ = 8. Live ≈ 9.6 → round = 10 → clamps to 8.
    expect(snapVotesToInteger(9.6, 'a', { b: 5 }, 100)).toBe(8);
  });

  it('clamps DOWN when round-up would overdraw a partially-spent pool', () => {
    // Others used 16 (b=4). Available = 84. ⌊√84⌋ = 9.
    // Live held to 9.7 → round = 10 → clamps to 9.
    expect(snapVotesToInteger(9.7, 'a', { b: 4 }, 100)).toBe(9);
  });

  it('returns zero for invalid or non-positive input', () => {
    expect(snapVotesToInteger(0, 'a', {}, 100)).toBe(0);
    expect(snapVotesToInteger(-1, 'a', {}, 100)).toBe(0);
    expect(snapVotesToInteger(NaN, 'a', {}, 100)).toBe(0);
  });

  it('always returns an integer', () => {
    for (const v of [0, 0.5, 1.4, 2.7, 3.0001, 4.99, 5.5, 7.4, 9.99]) {
      expect(Number.isInteger(snapVotesToInteger(v, 'a', {}, 100))).toBe(true);
    }
  });

  it('preserves the conservation invariant across all funnels', () => {
    const budget = 100;
    const votes = { a: 6, b: 4, c: 2 }; // 36 + 16 + 4 = 56 spent
    const snapped = snapVotesToInteger(9.7, 'd', votes, budget);
    const total = costForVotes(snapped) + 36 + 16 + 4;
    expect(total).toBeLessThanOrEqual(budget);
  });
});
