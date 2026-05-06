import { describe, expect, it } from 'vitest';
import {
  clampVotesAgainstBudget,
  costForVotes,
  maxVotes,
  remainingCredits,
  totalCreditsSpent,
} from './qv';

describe('costForVotes', () => {
  it('squares vote count', () => {
    expect(costForVotes(0)).toBe(0);
    expect(costForVotes(1)).toBe(1);
    expect(costForVotes(2)).toBe(4);
    expect(costForVotes(3)).toBe(9);
    expect(costForVotes(10)).toBe(100);
  });

  it('floors fractional inputs to integer votes', () => {
    // v1 polish: votes are whole numbers. A fractional drag position
    // counts as the integer below — the UI snaps on release.
    expect(costForVotes(2.9)).toBe(4);
    expect(costForVotes(3.0001)).toBe(9);
    expect(costForVotes(0.99)).toBe(0);
  });

  it('floors negative and non-finite inputs at zero', () => {
    expect(costForVotes(-3)).toBe(0);
    expect(costForVotes(NaN)).toBe(0);
    expect(costForVotes(Infinity)).toBe(0);
  });
});

describe('maxVotes', () => {
  it('returns floor(√budget)', () => {
    expect(maxVotes(100)).toBe(10);
    expect(maxVotes(81)).toBe(9);
    expect(maxVotes(50)).toBe(7); // floor(√50) — leaves 1 credit at the cap
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
  it('respects the conservation invariant pool = budget - Σ votes²', () => {
    expect(remainingCredits(100, { a: 3, b: 4 })).toBe(100 - 25);
    expect(remainingCredits(100, {})).toBe(100);
  });

  it('floors at zero rather than going negative', () => {
    expect(remainingCredits(10, { a: 5 })).toBe(0);
  });
});

describe('clampVotesAgainstBudget', () => {
  it('returns the proposed value when there is room', () => {
    expect(clampVotesAgainstBudget(2, 'a', {}, 100)).toBe(2);
  });

  it('caps at √budget even when no other items have votes', () => {
    expect(clampVotesAgainstBudget(99, 'a', {}, 100)).toBe(10);
  });

  it('respects credits already locked by other items', () => {
    // Other items already spending 64 credits → 36 left → max 6 votes here.
    expect(clampVotesAgainstBudget(99, 'a', { b: 8 }, 100)).toBe(6);
  });

  it('floors a fractional input to the nearest legal integer', () => {
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
      const out = clampVotesAgainstBudget(v, 'a', {}, 100);
      expect(Number.isInteger(out)).toBe(true);
    }
  });
});
