import { describe, expect, it } from 'vitest';
import { initialState, poolFromState, reducer, type State } from './reducer';

const setup = (budget = 100, ids = ['a', 'b', 'c']): State => initialState(budget, ids);

describe('reducer — set', () => {
  it('updates votes and emits a pool-to-funnel transfer', () => {
    const next = reducer(setup(), { type: 'set', itemId: 'a', votes: 3 });
    expect(next.votes.a).toBe(3);
    expect(next.transfer).toMatchObject({
      itemId: 'a',
      direction: 'pool-to-funnel',
    });
    // 3² − 0² = 9
    expect(next.transfer?.credits).toBe(9);
    expect(poolFromState(next)).toBe(91);
  });

  it('emits a funnel-to-pool transfer when reducing votes', () => {
    let s = reducer(setup(), { type: 'set', itemId: 'a', votes: 5 });
    s = reducer(s, { type: 'set', itemId: 'a', votes: 2 });
    // 5² − 2² = 21 freed, going back to the pool
    expect(s.transfer).toMatchObject({ direction: 'funnel-to-pool' });
    expect(s.transfer?.credits).toBe(21);
    expect(poolFromState(s)).toBe(96);
  });

  it('clamps against the global pool — never breaks conservation', () => {
    let s = reducer(setup(100), { type: 'set', itemId: 'a', votes: 8 }); // 64 spent
    s = reducer(s, { type: 'set', itemId: 'b', votes: 99 }); // ask for absurd
    // 100 − 64 = 36 left → max 6 votes on b
    expect(s.votes.b).toBe(6);
    expect(poolFromState(s)).toBe(0);
  });

  it('caps any single funnel at √budget', () => {
    const next = reducer(setup(100), {
      type: 'set',
      itemId: 'a',
      votes: 9999,
    });
    expect(next.votes.a).toBe(10);
    expect(poolFromState(next)).toBe(0);
  });

  it('is idempotent on no-op', () => {
    const start = setup();
    const next = reducer(start, { type: 'set', itemId: 'a', votes: 0 });
    expect(next).toBe(start);
  });

  it('seq increases monotonically and id matches transfer', () => {
    let s = setup();
    s = reducer(s, { type: 'set', itemId: 'a', votes: 2 });
    expect(s.seq).toBe(1);
    expect(s.transfer?.id).toBe(1);
    s = reducer(s, { type: 'set', itemId: 'b', votes: 3 });
    expect(s.seq).toBe(2);
    expect(s.transfer?.id).toBe(2);
  });
});

describe('reducer — reset', () => {
  it('resets a single funnel and emits a return-to-pool transfer', () => {
    let s = setup();
    s = reducer(s, { type: 'set', itemId: 'a', votes: 4 });
    s = reducer(s, { type: 'reset', itemId: 'a' });
    expect(s.votes.a).toBe(0);
    expect(s.transfer).toMatchObject({
      itemId: 'a',
      direction: 'funnel-to-pool',
    });
    expect(s.transfer?.credits).toBe(16);
    expect(poolFromState(s)).toBe(100);
  });

  it('reset-all zeroes every funnel', () => {
    let s = setup();
    s = reducer(s, { type: 'set', itemId: 'a', votes: 3 });
    s = reducer(s, { type: 'set', itemId: 'b', votes: 4 });
    s = reducer(s, { type: 'reset-all' });
    expect(s.votes).toEqual({ a: 0, b: 0, c: 0 });
    expect(poolFromState(s)).toBe(100);
  });
});

describe('reducer — clear-transfer', () => {
  it('clears only the specified transfer', () => {
    let s = setup();
    s = reducer(s, { type: 'set', itemId: 'a', votes: 2 });
    const transferId = s.transfer!.id;
    // A stale "clear" with a different id is a no-op.
    const stale = reducer(s, { type: 'clear-transfer', id: 999 });
    expect(stale.transfer).not.toBeNull();
    // The matching id clears.
    const cleared = reducer(s, { type: 'clear-transfer', id: transferId });
    expect(cleared.transfer).toBeNull();
  });
});

describe('reducer — set-budget', () => {
  it('re-clamps existing votes when budget shrinks', () => {
    let s = setup(100);
    s = reducer(s, { type: 'set', itemId: 'a', votes: 8 });
    s = reducer(s, { type: 'set', itemId: 'b', votes: 6 });
    s = reducer(s, { type: 'set-budget', budget: 25 });
    // budget 25 → cap √25 = 5 per funnel
    for (const v of Object.values(s.votes)) expect(v).toBeLessThanOrEqual(5);
    expect(poolFromState(s)).toBeGreaterThanOrEqual(0);
  });
});
