import { describe, expect, it } from 'vitest';
import {
  availableCreditsFor,
  clampVotesAgainstBudget,
  costForVotes,
  maxVotes,
  minVotes,
  remainingCredits,
  snapVotesToInteger,
  totalCreditsSpent,
} from './qv';

describe('costForVotes', () => {
  it('squares positive vote count', () => {
    expect(costForVotes(0)).toBe(0);
    expect(costForVotes(1)).toBe(1);
    expect(costForVotes(2)).toBe(4);
    expect(costForVotes(3)).toBe(9);
    expect(costForVotes(10)).toBe(100);
  });

  it('squares negative vote count (sign drops out — 3 against costs the same as 3 for)', () => {
    expect(costForVotes(-1)).toBe(1);
    expect(costForVotes(-2)).toBe(4);
    expect(costForVotes(-3)).toBe(9);
    expect(costForVotes(-10)).toBe(100);
  });

  it('squares fractional inputs (live derivation during a hold)', () => {
    expect(costForVotes(2.5)).toBeCloseTo(6.25);
    expect(costForVotes(-2.5)).toBeCloseTo(6.25);
    expect(costForVotes(0.5)).toBeCloseTo(0.25);
  });

  it('returns zero for non-finite inputs', () => {
    expect(costForVotes(NaN)).toBe(0);
    expect(costForVotes(Infinity)).toBe(0);
    expect(costForVotes(-Infinity)).toBe(0);
  });
});

describe('maxVotes / minVotes', () => {
  it('returns ⌊√budget⌋ — integer cap per direction', () => {
    expect(maxVotes(100)).toBe(10);
    expect(maxVotes(81)).toBe(9);
    expect(maxVotes(50)).toBe(7);
    expect(maxVotes(0)).toBe(0);
  });

  it('minVotes is the symmetric negative cap', () => {
    expect(minVotes(100)).toBe(-10);
    expect(minVotes(81)).toBe(-9);
    expect(minVotes(50)).toBe(-7);
    expect(minVotes(0)).toBe(0); // normalised — never returns -0
  });
});

describe('totalCreditsSpent', () => {
  it('sums squared votes (signs drop out)', () => {
    expect(totalCreditsSpent({ a: 3, b: 4 })).toBe(9 + 16);
    expect(totalCreditsSpent({ a: -3, b: 4 })).toBe(9 + 16); // mixed sign, same cost
    expect(totalCreditsSpent({ a: -3, b: -4 })).toBe(9 + 16); // both negative
    expect(totalCreditsSpent({})).toBe(0);
  });
});

describe('remainingCredits', () => {
  it('respects pool = budget − Σ votes² across signed states', () => {
    expect(remainingCredits(100, { a: 3, b: 4 })).toBe(75);
    expect(remainingCredits(100, { a: -3, b: 4 })).toBe(75);
    expect(remainingCredits(100, { a: -5, b: -3 })).toBe(100 - 25 - 9);
    expect(remainingCredits(100, {})).toBe(100);
  });

  it('floors at zero rather than going negative', () => {
    expect(remainingCredits(10, { a: -5 })).toBe(0); // 25 > 10
  });
});

describe('availableCreditsFor', () => {
  it('returns budget minus other items, never less than zero', () => {
    expect(availableCreditsFor('a', { a: 0, b: 4 }, 100)).toBe(100 - 16);
    expect(availableCreditsFor('a', { a: 0, b: -4 }, 100)).toBe(100 - 16);
    expect(availableCreditsFor('a', { a: 999, b: 999 }, 5)).toBeGreaterThanOrEqual(0);
  });

  it('ignores the item being asked about', () => {
    expect(availableCreditsFor('a', { a: 5, b: 4 }, 100)).toBe(100 - 16);
    expect(availableCreditsFor('a', { a: -5, b: 4 }, 100)).toBe(100 - 16);
  });
});

describe('clampVotesAgainstBudget', () => {
  it('returns the proposed signed integer when there is room', () => {
    expect(clampVotesAgainstBudget(2, 'a', {}, 100)).toBe(2);
    expect(clampVotesAgainstBudget(-2, 'a', {}, 100)).toBe(-2);
  });

  it('caps at ±⌊√budget⌋ when proposing more', () => {
    expect(clampVotesAgainstBudget(99, 'a', {}, 100)).toBe(10);
    expect(clampVotesAgainstBudget(-99, 'a', {}, 100)).toBe(-10);
    expect(clampVotesAgainstBudget(99, 'a', {}, 50)).toBe(7);
    expect(clampVotesAgainstBudget(-99, 'a', {}, 50)).toBe(-7);
  });

  it('respects integer credits already locked by other items (mixed sign)', () => {
    // b at +8 → 64 spent → 36 left → max |votes| = 6 here.
    expect(clampVotesAgainstBudget(99, 'a', { b: 8 }, 100)).toBe(6);
    expect(clampVotesAgainstBudget(-99, 'a', { b: 8 }, 100)).toBe(-6);
    // Same cap when the other item is negative — cost is squared.
    expect(clampVotesAgainstBudget(99, 'a', { b: -8 }, 100)).toBe(6);
  });

  it('floors any fractional input it receives, preserving sign', () => {
    expect(clampVotesAgainstBudget(3.7, 'a', {}, 100)).toBe(3);
    expect(clampVotesAgainstBudget(-3.7, 'a', {}, 100)).toBe(-3);
    expect(clampVotesAgainstBudget(0.4, 'a', {}, 100)).toBe(0);
    expect(clampVotesAgainstBudget(-0.4, 'a', {}, 100)).toBe(0);
  });

  it('returns zero for invalid input or zero', () => {
    expect(clampVotesAgainstBudget(0, 'a', {}, 100)).toBe(0);
    expect(clampVotesAgainstBudget(NaN, 'a', {}, 100)).toBe(0);
  });

  it('preserves the conservation invariant after clamping (mixed sign)', () => {
    const budget = 100;
    const votes = { a: 6, b: -4, c: 2 }; // 36 + 16 + 4 = 56 spent
    const clamped = clampVotesAgainstBudget(-99, 'd', votes, budget);
    const total = costForVotes(clamped) + 36 + 16 + 4;
    expect(total).toBeLessThanOrEqual(budget);
  });

  it('returns an integer for any input', () => {
    for (const v of [-99, -7.5, -2.4, 0, 2.4, 3.999, 7.5, 99]) {
      expect(Number.isInteger(clampVotesAgainstBudget(v, 'a', {}, 100))).toBe(true);
    }
  });
});

describe('snapVotesToInteger', () => {
  it('rounds toward the nearest integer when there is room', () => {
    expect(snapVotesToInteger(2.4, 'a', {}, 100)).toBe(2);
    expect(snapVotesToInteger(2.6, 'a', {}, 100)).toBe(3);
    expect(snapVotesToInteger(-2.4, 'a', {}, 100)).toBe(-2);
    expect(snapVotesToInteger(-2.6, 'a', {}, 100)).toBe(-3);
  });

  it('rounds half AWAY from zero (the bidirectional convention)', () => {
    // The brief calls this out explicitly: ties go away from zero so
    // -0.5 → -1 and +0.5 → +1. JS's Math.round rounds toward +∞, which
    // would give -0 for -0.5; we round |live| and re-apply the sign.
    expect(snapVotesToInteger(0.5, 'a', {}, 100)).toBe(1);
    expect(snapVotesToInteger(-0.5, 'a', {}, 100)).toBe(-1);
    expect(snapVotesToInteger(1.5, 'a', {}, 100)).toBe(2);
    expect(snapVotesToInteger(-1.5, 'a', {}, 100)).toBe(-2);
  });

  it('caps at ±⌊√budget⌋', () => {
    expect(snapVotesToInteger(9.9, 'a', {}, 100)).toBe(10);
    expect(snapVotesToInteger(-9.9, 'a', {}, 100)).toBe(-10);
    // Past the cap.
    expect(snapVotesToInteger(11, 'a', {}, 100)).toBe(10);
    expect(snapVotesToInteger(-11, 'a', {}, 100)).toBe(-10);
  });

  it('clamps DOWN when round-up would overdraw the pool (positive)', () => {
    // Others have used 25 credits (b=5). Available = 75. ⌊√75⌋ = 8.
    // Live ≈ 9.6 → round = 10 → clamps to 8.
    expect(snapVotesToInteger(9.6, 'a', { b: 5 }, 100)).toBe(8);
  });

  it('clamps DOWN when round-up would overdraw the pool (negative)', () => {
    // Symmetric on the other side: live ≈ −9.6, others use 25 → snap to −8.
    expect(snapVotesToInteger(-9.6, 'a', { b: 5 }, 100)).toBe(-8);
  });

  it("clamps DOWN regardless of others' sign — cost is squared", () => {
    // Others use 25 via a negative vote (b=−5). Same available, same clamp.
    expect(snapVotesToInteger(9.6, 'a', { b: -5 }, 100)).toBe(8);
  });

  it('returns zero for invalid or zero input', () => {
    expect(snapVotesToInteger(0, 'a', {}, 100)).toBe(0);
    expect(snapVotesToInteger(NaN, 'a', {}, 100)).toBe(0);
  });

  it('always returns a signed integer', () => {
    for (const v of [-9.99, -5.5, -1.4, -0.5, 0, 0.5, 2.7, 4.99, 9.99]) {
      expect(Number.isInteger(snapVotesToInteger(v, 'a', {}, 100))).toBe(true);
    }
  });

  it('preserves the conservation invariant across mixed-sign committed states', () => {
    const budget = 100;
    const votes = { a: 6, b: -4, c: 2 }; // 36 + 16 + 4 = 56 spent
    const snapped = snapVotesToInteger(-9.7, 'd', votes, budget);
    const total = costForVotes(snapped) + 36 + 16 + 4;
    expect(total).toBeLessThanOrEqual(budget);
  });
});
