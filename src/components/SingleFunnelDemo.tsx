import { useState } from 'react';
import { Funnel } from './Funnel';
import { costForVotes, maxVotes as capFor, roundVotes } from '../math/qv';

/*
 * Phase 1 sandbox — a single funnel against a fixed budget so the
 * geometry, drag interaction, and animation can be exercised in
 * isolation. Phase 2 introduces the credit pool and multi-funnel
 * conservation; this view is kept around as a development aid and
 * mounted on the main app page when no `ballotItems` are configured.
 */
export const SingleFunnelDemo = ({ budget = 100 }: { budget?: number }) => {
  const [votes, setVotes] = useState(0);
  const cap = capFor(budget);
  const credits = costForVotes(votes);
  const remaining = Math.max(0, budget - credits);
  // Available to add right now is whatever credits could take v from
  // its current value to cap, expressed as a vote delta.
  const available = cap - votes;

  return (
    <div className="mx-auto max-w-md p-6">
      <p className="text-size--2 text-gray uppercase tracking-wide">Phase 1 sandbox</p>
      <h2 className="font-display text-size-3 mb-4">A single funnel</h2>

      <Funnel
        votes={votes}
        maxVotes={cap}
        available={available}
        onChange={setVotes}
        label="Demo item votes"
        size={280}
      />

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-size--1 font-body">
        <dt className="text-gray">Votes</dt>
        <dd className="text-right tabular-nums">{roundVotes(votes).toFixed(2)}</dd>

        <dt className="text-gray">Credits spent</dt>
        <dd className="text-right tabular-nums">{credits.toFixed(2)}</dd>

        <dt className="text-gray">Credits remaining</dt>
        <dd className="text-right tabular-nums">{remaining.toFixed(2)}</dd>

        <dt className="text-gray">Cap (√budget)</dt>
        <dd className="text-right tabular-nums">{cap}</dd>
      </dl>

      <button
        type="button"
        className="mt-4 text-size--2 underline text-water-700 hover:text-water-900"
        onClick={() => setVotes(0)}
      >
        Reset to 0
      </button>
    </div>
  );
};
