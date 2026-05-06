/**
 * Conservation reducer for Liquid QV.
 *
 * The whole tool is one global invariant:
 *
 *     pool_volume + Σ funnel_volumes  =  total_budget
 *
 *     pool_volume       = budget − Σ votes[i]²
 *     funnel_volume[i]  = votes[i]²       (water area in the funnel)
 *
 * The reducer is the single point that mutates the vote map. It clamps
 * every change against:
 *   1. Per-funnel cap of √budget (so any one funnel can drain the pool
 *      exactly, anchoring the all-eggs-in-one-basket cost).
 *   2. The remaining pool, given credits already locked elsewhere.
 *
 * Side note on "transfers": the reducer also carries a tiny transient
 * piece of state for the visible pool→funnel flow: { itemId, credits,
 * direction, ts }. It's *not* part of the conservation invariant — it's
 * just there so the view can react to "you spent N credits on item X
 * just now" and animate accordingly. The transfer field self-clears
 * after the animation runs (see LiquidQV).
 */

import { clampVotesAgainstBudget, costForVotes, remainingCredits } from '../math/qv';
import type { VoteMap } from '../types';

export interface Transfer {
  itemId: string;
  /** Always non-negative; direction tells you the sign. */
  credits: number;
  direction: 'pool-to-funnel' | 'funnel-to-pool';
  /** Monotonic id so AnimatePresence can re-mount even on identical deltas. */
  id: number;
}

export interface State {
  budget: number;
  votes: VoteMap;
  transfer: Transfer | null;
  /** Sequence number for transfers — bumped per dispatched change. */
  seq: number;
}

export type Action =
  | { type: 'set'; itemId: string; votes: number }
  | { type: 'reset'; itemId: string }
  | { type: 'reset-all' }
  | { type: 'clear-transfer'; id: number }
  | { type: 'set-budget'; budget: number };

export const initialState = (budget: number, itemIds: string[], initial: VoteMap = {}): State => {
  const votes: VoteMap = {};
  for (const id of itemIds) votes[id] = initial[id] ?? 0;
  return { budget, votes, transfer: null, seq: 0 };
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'set': {
      const target = clampVotesAgainstBudget(
        action.votes,
        action.itemId,
        state.votes,
        state.budget,
      );
      const prev = state.votes[action.itemId] ?? 0;
      if (target === prev) return state;
      const next = { ...state.votes, [action.itemId]: target };
      const creditsDelta = costForVotes(target) - costForVotes(prev);
      const seq = state.seq + 1;
      const transfer: Transfer | null =
        Math.abs(creditsDelta) < 1e-6
          ? null
          : {
              itemId: action.itemId,
              credits: Math.abs(creditsDelta),
              direction: creditsDelta > 0 ? 'pool-to-funnel' : 'funnel-to-pool',
              id: seq,
            };
      return { ...state, votes: next, transfer, seq };
    }

    case 'reset': {
      if ((state.votes[action.itemId] ?? 0) === 0) return state;
      const prev = state.votes[action.itemId] ?? 0;
      const next = { ...state.votes, [action.itemId]: 0 };
      const seq = state.seq + 1;
      return {
        ...state,
        votes: next,
        seq,
        transfer: {
          itemId: action.itemId,
          credits: costForVotes(prev),
          direction: 'funnel-to-pool',
          id: seq,
        },
      };
    }

    case 'reset-all': {
      const next: VoteMap = {};
      for (const id of Object.keys(state.votes)) next[id] = 0;
      return { ...state, votes: next, transfer: null, seq: state.seq + 1 };
    }

    case 'clear-transfer': {
      // Only clear if this is the same transfer we kicked off.
      if (state.transfer && state.transfer.id === action.id) {
        return { ...state, transfer: null };
      }
      return state;
    }

    case 'set-budget': {
      // Resetting the budget is rare (only on prop change). Re-clamp.
      const budget = Math.max(0, action.budget);
      const next: VoteMap = {};
      for (const id of Object.keys(state.votes)) {
        next[id] = clampVotesAgainstBudget(state.votes[id] ?? 0, id, state.votes, budget);
      }
      return { ...state, budget, votes: next };
    }
  }
};

/** Convenience: derived view of the current pool. */
export const poolFromState = (state: State): number => remainingCredits(state.budget, state.votes);
