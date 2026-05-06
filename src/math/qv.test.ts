import { describe, expect, it } from 'vitest';
import {
  clampVotesAgainstBudget,
  costForVotes,
  marginalCost,
  maxVotes,
  remainingCredits,
  roundVotes,
  totalCreditsSpent,
  votesForCredits,
} from './qv';

describe('costForVotes', () => {
  it('squares vote count', () => {
    expect(costForVotes(0)).toBe(0);
    expect(costForVotes(1)).toBe(1);
    expect(costForVotes(2)).toBe(4);
    expect(costForVotes(3)).toBe(9);
    expect(costForVotes(10)).toBe(100);
  });

  it('handles fractional votes', () => {
    expect(costForVotes(0.5)).toBeCloseTo(0.25);
    expect(costForVotes(2.5)).toBeCloseTo(6.25);
  });

  it('floors negative and non-finite inputs at zero', () => {
    expect(costForVotes(-3)).toBe(0);
    expect(costForVotes(NaN)).toBe(0);
    expect(costForVotes(Infinity)).toBe(0);
  });
});

describe('votesForCredits', () => {
  it('inverts costForVotes', () => {
    for (const v of [0, 0.5, 1, 2.5, 7]) {
      expect(votesForCredits(costForVotes(v))).toBeCloseTo(v);
    }
  });

  it('returns zero for negative or non-finite credits', () => {
    expect(votesForCredits(-1)).toBe(0);
    expect(votesForCredits(NaN)).toBe(0);
  });
});

describe('marginalCost', () => {
  it('matches d/dv (v²) = 2v', () => {
    expect(marginalCost(0)).toBe(0);
    expect(marginalCost(1)).toBe(2);
    expect(marginalCost(2.5)).toBeCloseTo(5);
  });
});

describe('maxVotes', () => {
  it('caps a single funnel at √budget so it can drain the pool exactly', () => {
    expect(maxVotes(100)).toBe(10);
    expect(maxVotes(81)).toBe(9);
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

  it("respects credits already locked by other items", () => {
    // Other items already spending 64 credits → 36 left → max 6 votes here.
    expect(clampVotesAgainstBudget(99, 'a', { b: 8 }, 100)).toBeCloseTo(6);
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
    expect(total).toBeLessThanOrEqual(budget + 1e-9);
  });
});

describe('roundVotes', () => {
  it('rounds to 2 decimal places for display', () => {
    expect(roundVotes(2.4142)).toBe(2.41);
    expect(roundVotes(2.4159)).toBe(2.42);
    expect(roundVotes(0)).toBe(0);
  });
});
