import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { CreditPool } from './CreditPool';
import { Funnel } from './Funnel';
import { TransferIndicator } from './TransferIndicator';
import {
  costForVotes,
  maxVotes as capFor,
  remainingCredits,
  roundVotes,
  votesForCredits,
} from '../math/qv';
import { initialState, reducer } from '../lib/reducer';
import { defaultBallot, BALLOT_PROMPT } from '../data/defaultBallot';
import type { LiquidQVProps, ThemeOverrides } from '../types';

/*
 * LiquidQV — the public component.
 *
 * Owns the global state via `useReducer`. The reducer enforces the
 * conservation invariant
 *
 *     pool + Σ funnel_volumes = budget
 *
 * so we never have to remember to keep the visual layers in sync — the
 * pool, every funnel, and the transient transfer indicator all derive
 * from the same `votes` map.
 *
 * Layout:
 *   <Pool> ─────────────────────────────────────────────  (row 1: budget)
 *   <Transfer> <Transfer> <Transfer> ... per item       (row 2: flow)
 *   <Funnel>  <Funnel>   <Funnel>   ... per item        (row 3: levels)
 */

const themeToCssVars = (theme: ThemeOverrides | undefined): Record<string, string> => {
  if (!theme) return {};
  const out: Record<string, string> = {};
  if (theme.bg) out['--lqv-bg'] = theme.bg;
  if (theme.card) out['--lqv-card'] = theme.card;
  if (theme.fg) out['--lqv-fg'] = theme.fg;
  if (theme.muted) out['--lqv-muted'] = theme.muted;
  if (theme.accent) out['--lqv-accent'] = theme.accent;
  if (theme.water) out['--lqv-water'] = theme.water;
  if (theme.waterDark) out['--lqv-water-dark'] = theme.waterDark;
  if (theme.pool) out['--lqv-pool'] = theme.pool;
  if (theme.funnelWall) out['--lqv-funnel-wall'] = theme.funnelWall;
  if (theme.funnelBg) out['--lqv-funnel-bg'] = theme.funnelBg;
  return out;
};

export const LiquidQV = ({
  ballotItems,
  creditBudget = 100,
  onChange,
  theme,
  heading,
  prompt,
  embedded: _embedded = false,
  hideExplainer: _hideExplainer = false,
}: LiquidQVProps = {}) => {
  const items = ballotItems && ballotItems.length > 0 ? ballotItems : defaultBallot;
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  const [state, dispatch] = useReducer(
    reducer,
    { budget: creditBudget, ids: itemIds },
    ({ budget, ids }) => initialState(budget, ids),
  );

  // Keep the reducer's budget in sync with the prop. Re-clamping is
  // handled inside the reducer so existing votes don't break invariants
  // when a parent shrinks the budget mid-session.
  useEffect(() => {
    if (state.budget !== creditBudget) {
      dispatch({ type: 'set-budget', budget: creditBudget });
    }
  }, [creditBudget, state.budget]);

  // Notify external listeners of vote changes.
  useEffect(() => {
    onChange?.(state.votes);
  }, [state.votes, onChange]);

  const cap = capFor(state.budget);
  const remaining = remainingCredits(state.budget, state.votes);

  // Available votes for an item = how much more it could absorb without
  // breaking the invariant. We pass this to <Funnel> so dragging caps
  // softly at the pool ceiling rather than producing a snap-back.
  const availableForItem = useCallback(
    (id: string): number => {
      const current = state.votes[id] ?? 0;
      const othersCost = Object.entries(state.votes)
        .filter(([k]) => k !== id)
        .reduce((acc, [, v]) => acc + costForVotes(v), 0);
      const availCredits = Math.max(0, state.budget - othersCost);
      const ceilingVotes = Math.min(cap, votesForCredits(availCredits));
      return Math.max(0, ceilingVotes - current);
    },
    [state.votes, state.budget, cap],
  );

  const setItemVotes = useCallback(
    (id: string, votes: number) => dispatch({ type: 'set', itemId: id, votes }),
    [],
  );
  const resetItem = useCallback(
    (id: string) => dispatch({ type: 'reset', itemId: id }),
    [],
  );
  const resetAll = useCallback(() => dispatch({ type: 'reset-all' }), []);
  const clearTransfer = useCallback(
    (id: number) => dispatch({ type: 'clear-transfer', id }),
    [],
  );

  const cssVars = useMemo(() => themeToCssVars(theme), [theme]);
  const liveAnnouncement = useMemo(() => {
    if (!state.transfer) return '';
    const item = items.find((i) => i.id === state.transfer!.itemId);
    const v = state.votes[state.transfer.itemId] ?? 0;
    return `${item?.title ?? state.transfer.itemId}: ${roundVotes(v).toFixed(2)} votes, ${roundVotes(costForVotes(v)).toFixed(2)} credits.`;
  }, [state.transfer, state.votes, items]);

  return (
    <section
      className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10"
      style={cssVars as React.CSSProperties}
      aria-label="Liquid QV ballot"
    >
      <header className="mb-4 md:mb-6">
        {heading && (
          <h2 className="font-display text-size-3 md:text-size-4 leading-none mb-2">
            {heading}
          </h2>
        )}
        {(prompt ?? BALLOT_PROMPT) && (
          <p className="font-body text-size-0 max-w-[60ch]" style={{ color: 'var(--lqv-fg)' }}>
            {prompt ?? BALLOT_PROMPT}
          </p>
        )}
      </header>

      <CreditPool remaining={remaining} budget={state.budget} />

      {/* Live region for screen readers — announces the latest change. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {items.map((item) => {
          const v = state.votes[item.id] ?? 0;
          const credits = costForVotes(v);
          return (
            <div
              key={item.id}
              className="flex flex-col rounded-[14px] border p-3 md:p-4"
              style={{
                borderColor: 'var(--lqv-funnel-wall)',
                background: 'var(--lqv-card)',
              }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-size-1 leading-none truncate">
                    {item.title}
                    {item.tag ? (
                      <span className="ml-2 align-middle text-size--2 font-body text-[var(--lqv-muted)]">
                        ({item.tag})
                      </span>
                    ) : null}
                  </h3>
                  {item.description ? (
                    <p className="text-size--2 text-[var(--lqv-muted)] mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => resetItem(item.id)}
                  disabled={v === 0}
                  className="text-size--3 underline text-[var(--lqv-water)] hover:text-[var(--lqv-water-dark)] disabled:opacity-40 disabled:no-underline"
                  aria-label={`Reset votes on ${item.title}`}
                >
                  reset
                </button>
              </div>

              <TransferIndicator
                itemId={item.id}
                transfer={state.transfer}
                budget={state.budget}
                onComplete={clearTransfer}
              />

              <Funnel
                votes={v}
                maxVotes={cap}
                available={availableForItem(item.id)}
                onChange={(next) => setItemVotes(item.id, next)}
                label={`Votes for ${item.title}`}
              />

              <dl className="mt-2 flex items-baseline justify-between gap-2 text-size--2 font-body">
                <div>
                  <dt className="sr-only">Votes</dt>
                  <dd className="tabular-nums">
                    <span className="text-[var(--lqv-muted)] mr-1">votes</span>
                    <span className="font-medium">{roundVotes(v).toFixed(2)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Credits spent</dt>
                  <dd className="tabular-nums text-[var(--lqv-muted)]">
                    {credits.toFixed(2)} credits
                  </dd>
                </div>
              </dl>
              {/* Marginal-cost cue. (v+1)² − v² = 2v + 1 — the next whole
                  vote costs more than the previous one. Surfacing the
                  number drives the lesson home for users who haven't
                  internalised the slope yet. */}
              {v < cap && (
                <p className="mt-1 text-size--3 text-[var(--lqv-muted)]">
                  Next +1 vote = <span className="tabular-nums">{(2 * v + 1).toFixed(2)}</span> credits
                </p>
              )}

              {/* Numeric input fallback. Submitting recalculates the
                  allocation through the same reducer path. */}
              <label className="mt-2 flex items-center gap-2 text-size--3 text-[var(--lqv-muted)]">
                <span>Set votes</span>
                <input
                  type="number"
                  min={0}
                  max={cap}
                  step={0.1}
                  value={Number.isFinite(v) ? roundVotes(v) : 0}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setItemVotes(item.id, n);
                  }}
                  className="w-20 rounded border bg-white px-2 py-1 font-body text-size--2 tabular-nums"
                  style={{ borderColor: 'var(--lqv-funnel-wall)' }}
                  aria-label={`Numeric vote input for ${item.title}`}
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-size--2 text-[var(--lqv-muted)]">
          Cap per funnel: {cap} votes (= {state.budget} credits if alone).
        </p>
        <button
          type="button"
          onClick={resetAll}
          className="font-body text-size--2 underline text-[var(--lqv-water)] hover:text-[var(--lqv-water-dark)]"
        >
          Reset all
        </button>
      </div>
    </section>
  );
};
