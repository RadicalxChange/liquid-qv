import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { CreditPool } from './CreditPool';
import { Funnel } from './Funnel';
import { TransferIndicator } from './TransferIndicator';
import { costForVotes, maxVotes as capFor, remainingCredits } from '../math/qv';
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
 * so the pool, every funnel, and the transient transfer indicator all
 * derive from the same `votes` map. Polish round 2: votes are integers
 * end-to-end; the UI is stripped to the funnel + pool + a tiny readout.
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

  // Keep the reducer's budget in sync with the prop.
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

  // How many more whole votes this item can absorb without breaking the
  // invariant. Passed to <Funnel> so dragging caps softly at the pool
  // ceiling rather than producing a snap-back.
  const availableForItem = useCallback(
    (id: string): number => {
      const current = state.votes[id] ?? 0;
      const othersCost = Object.entries(state.votes)
        .filter(([k]) => k !== id)
        .reduce((acc, [, v]) => acc + costForVotes(v), 0);
      const availCredits = Math.max(0, state.budget - othersCost);
      const ceilingVotes = Math.min(cap, Math.floor(Math.sqrt(availCredits)));
      return Math.max(0, ceilingVotes - current);
    },
    [state.votes, state.budget, cap],
  );

  const setItemVotes = useCallback(
    (id: string, votes: number) => dispatch({ type: 'set', itemId: id, votes }),
    [],
  );
  const resetItem = useCallback((id: string) => dispatch({ type: 'reset', itemId: id }), []);
  const resetAll = useCallback(() => dispatch({ type: 'reset-all' }), []);
  const clearTransfer = useCallback((id: number) => dispatch({ type: 'clear-transfer', id }), []);

  const cssVars = useMemo(() => themeToCssVars(theme), [theme]);
  const liveAnnouncement = useMemo(() => {
    if (!state.transfer) return '';
    const item = items.find((i) => i.id === state.transfer!.itemId);
    const v = state.votes[state.transfer.itemId] ?? 0;
    const c = costForVotes(v);
    return `${item?.title ?? state.transfer.itemId}: ${v} ${v === 1 ? 'vote' : 'votes'}, ${c} ${c === 1 ? 'credit' : 'credits'}.`;
  }, [state.transfer, state.votes, items]);

  return (
    <section
      className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10"
      style={cssVars as React.CSSProperties}
      aria-label="Liquid QV ballot"
    >
      <header className="mb-4 md:mb-6">
        {heading && (
          <h2 className="font-display text-size-3 md:text-size-4 leading-none mb-2">{heading}</h2>
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
          const available = availableForItem(item.id);
          const canAdd = available > 0;
          const canSubtract = v > 0;
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
                <h3 className="font-display text-size-1 leading-none truncate min-w-0">
                  {item.title}
                  {item.tag ? (
                    <span className="ml-2 align-middle text-size--2 font-body text-[var(--lqv-muted)]">
                      ({item.tag})
                    </span>
                  ) : null}
                </h3>
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
                available={available}
                onChange={(next) => setItemVotes(item.id, next)}
                label={`Votes for ${item.title}`}
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <p
                  className="font-display text-size-1 leading-none tabular-nums"
                  style={{ color: 'var(--lqv-fg)' }}
                  aria-live="off"
                >
                  {v} {v === 1 ? 'vote' : 'votes'}
                  {v > 0 && (
                    <span className="ml-2 text-size--2 font-body text-[var(--lqv-muted)] tabular-nums">
                      {credits} {credits === 1 ? 'credit' : 'credits'}
                    </span>
                  )}
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setItemVotes(item.id, v - 1)}
                    disabled={!canSubtract}
                    aria-label={`Subtract one vote from ${item.title}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border text-size-0 leading-none disabled:opacity-30"
                    style={{
                      borderColor: 'var(--lqv-funnel-wall)',
                      color: 'var(--lqv-fg)',
                      background: 'var(--lqv-funnel-bg)',
                    }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemVotes(item.id, v + 1)}
                    disabled={!canAdd}
                    aria-label={`Add one vote to ${item.title}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border text-size-0 leading-none disabled:opacity-30"
                    style={{
                      borderColor: 'var(--lqv-funnel-wall)',
                      color: 'var(--lqv-fg)',
                      background: 'var(--lqv-funnel-bg)',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
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
