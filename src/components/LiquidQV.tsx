import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CreditPool } from './CreditPool';
import { Funnel } from './Funnel';
import { PourStream, type StreamMode } from './PourStream';
import { PourControl } from './PourControl';
import {
  availableCreditsFor,
  clampVotesAgainstBudget,
  costForVotes,
  maxVotes as capFor,
  remainingCredits,
  remainingCreditsContinuous,
} from '../math/qv';
import { initialState, reducer } from '../lib/reducer';
import { defaultBallot, BALLOT_PROMPT } from '../data/defaultBallot';
import type { LiquidQVProps, ThemeOverrides, VoteMap } from '../types';

/*
 * LiquidQV — the public component, reworked in round 5 around a
 * volumetric "hold to pour" gesture instead of discrete +/− steps.
 *
 * Architecture
 * ------------
 * Two layers of state:
 *
 *   1. Reducer (canonical):  integer votes per ballot item. The
 *      conservation invariant `pool + Σ votes² = budget` holds at every
 *      committed state.
 *
 *   2. Active pour (transient):  while a +/− is held (or Space/Enter
 *      on a focused funnel), this component tracks an `activePour` of
 *      shape { itemId, direction, startedAt, startCredits }. A rAF
 *      loop drives re-renders; on each render we derive a *continuous*
 *      live state where the active item has a fractional vote count
 *      and the pool tracks it accordingly. The reducer is untouched
 *      until release, when we round and dispatch.
 *
 * The continuous live state is what gives the gesture its pedagogy:
 * water leaves the pool at a constant volumetric rate (`POUR_RATE`
 * credits/sec), but the water height in the funnel rises by √credits,
 * so the same hold duration produces less and less rise as the funnel
 * fills. The user *feels* the quadratic.
 *
 * Tap vs hold: every pour starts as an `activePour` on pointer-down /
 * keydown. On release, if elapsed < TAP_THRESHOLD_MS we treat it as a
 * single-vote step (forced ±1, animated as a brief 250 ms pour); above
 * the threshold we round the live continuous votes to the nearest
 * integer.
 *
 * Reduced motion: when prefers-reduced-motion is set, holds collapse
 * to single-step taps (one vote per press), the rAF loop stays idle,
 * and the visible stream is suppressed. The state model is unchanged.
 */

const POUR_RATE = 5; // credits per second
const TAP_THRESHOLD_MS = 150;
const TAP_VISUAL_MS = 250;
const FADE_VISUAL_MS = 150;

interface ActivePour {
  itemId: string;
  direction: 'in' | 'out';
  startedAt: number; // performance.now()
  startCredits: number; // (startVotes)²
}

interface FadeStream {
  itemId: string;
  direction: 'in' | 'out';
  mode: 'fading' | 'tapAnim';
  durationMs: number;
}

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

/**
 * Compute the continuous live vote count for the active item at a given
 * absolute time, plus the pool that follows from it. The other items
 * stay at their committed integer values.
 */
const computeLiveVotes = (
  pour: ActivePour,
  votes: VoteMap,
  budget: number,
  now: number,
): { votes: VoteMap; pool: number; activeVotes: number } => {
  const elapsed = Math.max(0, (now - pour.startedAt) / 1000);
  const transferred = elapsed * POUR_RATE;
  const budgetForThis = availableCreditsFor(pour.itemId, votes, budget);
  let creditsForThis;
  if (pour.direction === 'in') {
    creditsForThis = Math.min(pour.startCredits + transferred, budgetForThis, budget);
  } else {
    creditsForThis = Math.max(pour.startCredits - transferred, 0);
  }
  const activeVotes = Math.sqrt(creditsForThis);
  const liveVotes: VoteMap = { ...votes, [pour.itemId]: activeVotes };
  const pool = remainingCreditsContinuous(budget, liveVotes);
  return { votes: liveVotes, pool, activeVotes };
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
  const reduceMotion = useReducedMotion();

  const [state, dispatch] = useReducer(
    reducer,
    { budget: creditBudget, ids: itemIds },
    ({ budget, ids }) => initialState(budget, ids),
  );

  // ---------------------------------------------------------------------
  // Active pour + stream-fade state machine
  // ---------------------------------------------------------------------
  const [activePour, setActivePour] = useState<ActivePour | null>(null);
  const [fadeStream, setFadeStream] = useState<FadeStream | null>(null);
  // `tick` doesn't drive logic — it only forces a re-render so the
  // live derivation reads a fresh `performance.now()` each frame.
  const [, setTick] = useState(0);
  // Hold a stable ref to activePour for handlers that fire after state
  // changes have already been queued (e.g. the rAF loop).
  const activePourRef = useRef<ActivePour | null>(null);
  activePourRef.current = activePour;

  // rAF loop while either an active pour or a fade is in flight.
  useEffect(() => {
    if (!activePour && !fadeStream) return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activePour, fadeStream]);

  // Auto-clear fade once its timer expires.
  useEffect(() => {
    if (!fadeStream) return;
    const t = window.setTimeout(() => setFadeStream(null), fadeStream.durationMs);
    return () => window.clearTimeout(t);
  }, [fadeStream]);

  // Keep the reducer's budget in sync with the prop.
  useEffect(() => {
    if (state.budget !== creditBudget) {
      dispatch({ type: 'set-budget', budget: creditBudget });
    }
  }, [creditBudget, state.budget]);

  // Notify external listeners only of *committed* (integer) vote
  // changes. Live continuous changes during a hold are an internal
  // detail.
  useEffect(() => {
    onChange?.(state.votes);
  }, [state.votes, onChange]);

  const cap = capFor(state.budget);

  // ---------------------------------------------------------------------
  // Live derivation — runs every render. During a pour, this drives the
  // funnel's water level, the pool's drain, and both numeric readouts.
  // ---------------------------------------------------------------------
  const live = activePour
    ? computeLiveVotes(activePour, state.votes, state.budget, performance.now())
    : null;
  const liveVotes = live ? live.votes : state.votes;
  const livePool = live ? live.pool : remainingCredits(state.budget, state.votes);

  // ---------------------------------------------------------------------
  // Pour control handlers
  // ---------------------------------------------------------------------
  const tapStep = useCallback(
    (itemId: string, delta: number, mode: 'tap' = 'tap') => {
      const cur = state.votes[itemId] ?? 0;
      const target = clampVotesAgainstBudget(cur + delta, itemId, state.votes, state.budget);
      if (target === cur) return;
      // Brief stream visual so a tap reads the same way a hold does.
      if (mode === 'tap') {
        setFadeStream({
          itemId,
          direction: delta > 0 ? 'in' : 'out',
          mode: 'tapAnim',
          durationMs: TAP_VISUAL_MS,
        });
      }
      dispatch({ type: 'set', itemId, votes: target });
    },
    [state.votes, state.budget],
  );

  const startPour = useCallback(
    (itemId: string, direction: 'in' | 'out') => {
      // Reduced motion: collapse the gesture to one tap step. The state
      // model is identical to a hold released after exactly one vote
      // crossed; users still get correct behavior, just without the
      // continuous animation.
      if (reduceMotion) {
        tapStep(itemId, direction === 'in' ? 1 : -1);
        return;
      }
      // Don't start a pour that can't move (already at 0 draining or at cap pouring).
      const startVotes = state.votes[itemId] ?? 0;
      if (direction === 'out' && startVotes <= 0) return;
      const ceiling = clampVotesAgainstBudget(cap, itemId, state.votes, state.budget);
      if (direction === 'in' && startVotes >= ceiling) return;
      setActivePour({
        itemId,
        direction,
        startedAt: performance.now(),
        startCredits: startVotes * startVotes,
      });
    },
    [reduceMotion, tapStep, cap, state.votes, state.budget],
  );

  const endPour = useCallback(() => {
    const pour = activePourRef.current;
    if (!pour) return;
    const elapsed = performance.now() - pour.startedAt;
    const startVotes = state.votes[pour.itemId] ?? 0;

    let finalVotes: number;
    let mode: StreamMode;
    if (elapsed < TAP_THRESHOLD_MS) {
      // Tap: forced ±1 from the start position.
      finalVotes = startVotes + (pour.direction === 'in' ? 1 : -1);
      mode = 'tapAnim';
    } else {
      // Hold: round the live continuous value to the nearest integer.
      const liveAtRelease = computeLiveVotes(
        pour,
        state.votes,
        state.budget,
        performance.now(),
      );
      finalVotes = Math.round(liveAtRelease.activeVotes);
      mode = 'fading';
    }

    finalVotes = clampVotesAgainstBudget(finalVotes, pour.itemId, state.votes, state.budget);

    setActivePour(null);
    setFadeStream({
      itemId: pour.itemId,
      direction: pour.direction,
      mode,
      durationMs: mode === 'tapAnim' ? TAP_VISUAL_MS : FADE_VISUAL_MS,
    });

    if (finalVotes !== startVotes) {
      dispatch({ type: 'set', itemId: pour.itemId, votes: finalVotes });
    }
  }, [state.votes, state.budget]);

  // Stable callbacks per item — created lazily via lookup in render.
  const itemHandlers = useMemo(() => {
    const map: Record<
      string,
      {
        startPourIn: () => void;
        startPourOut: () => void;
        end: () => void;
        tap: (delta: number) => void;
      }
    > = {};
    for (const item of items) {
      map[item.id] = {
        startPourIn: () => startPour(item.id, 'in'),
        startPourOut: () => startPour(item.id, 'out'),
        end: endPour,
        tap: (delta: number) => tapStep(item.id, delta),
      };
    }
    return map;
  }, [items, startPour, endPour, tapStep]);

  const resetItem = useCallback((id: string) => dispatch({ type: 'reset', itemId: id }), []);
  const resetAll = useCallback(() => dispatch({ type: 'reset-all' }), []);
  const cssVars = useMemo(() => themeToCssVars(theme), [theme]);

  // Live region announces only at-rest state changes (the reducer's
  // transfer field fires on each commit). During a hold we don't
  // announce intermediate values — too noisy for screen readers.
  const liveAnnouncement = useMemo(() => {
    if (!state.transfer) return '';
    const item = items.find((i) => i.id === state.transfer!.itemId);
    const v = state.votes[state.transfer.itemId] ?? 0;
    const c = costForVotes(v);
    return `${item?.title ?? state.transfer.itemId}: ${v} ${v === 1 ? 'vote' : 'votes'}, ${c} ${c === 1 ? 'credit' : 'credits'}.`;
  }, [state.transfer, state.votes, items]);

  // Stream visibility per item: while activePour matches, always visible.
  // Otherwise, fade state may be visible briefly.
  const streamFor = (
    itemId: string,
  ): { visible: boolean; direction: 'in' | 'out'; mode: StreamMode } => {
    if (activePour && activePour.itemId === itemId) {
      return { visible: !reduceMotion, direction: activePour.direction, mode: 'active' };
    }
    if (fadeStream && fadeStream.itemId === itemId) {
      return { visible: !reduceMotion, direction: fadeStream.direction, mode: fadeStream.mode };
    }
    return { visible: false, direction: 'in', mode: 'active' };
  };

  // Pool readout: integer at rest, one decimal during an active pour.
  const poolDisplay = activePour
    ? livePool.toFixed(1)
    : Math.round(livePool).toString();

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

      <CreditPool
        remaining={livePool}
        budget={state.budget}
        readout={poolDisplay}
      />

      {/* Live region for screen readers — announces only at-rest changes. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {items.map((item) => {
          const v = liveVotes[item.id] ?? 0;
          const isActive = activePour?.itemId === item.id;
          const credits = isActive ? v * v : costForVotes(v);
          const stream = streamFor(item.id);
          const handlers = itemHandlers[item.id];
          const startVotes = state.votes[item.id] ?? 0;
          const ceiling = clampVotesAgainstBudget(cap, item.id, state.votes, state.budget);
          const canPour = startVotes < ceiling;
          const canDrain = startVotes > 0;
          // Format the readout — decimals only during a live hold.
          const votesText = isActive ? v.toFixed(1) : Math.round(v).toString();
          const creditsText = isActive ? credits.toFixed(1) : Math.round(credits).toString();
          const isVotesPlural = isActive ? Number(votesText) !== 1 : Math.round(v) !== 1;
          const isCreditsPlural = isActive
            ? Number(creditsText) !== 1
            : Math.round(credits) !== 1;
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
                  disabled={startVotes === 0}
                  className="text-size--3 underline text-[var(--lqv-water)] hover:text-[var(--lqv-water-dark)] disabled:opacity-40 disabled:no-underline"
                  aria-label={`Reset votes on ${item.title}`}
                >
                  reset
                </button>
              </div>

              <PourStream
                visible={stream.visible}
                direction={stream.direction}
                mode={stream.mode}
              />

              <Funnel
                votes={v}
                maxVotes={cap}
                label={`Votes for ${item.title}`}
                instantUpdate={isActive}
                onTapStep={(delta) => handlers.tap(delta)}
                onPourStart={(direction) =>
                  direction === 'in' ? handlers.startPourIn() : handlers.startPourOut()
                }
                onPourEnd={handlers.end}
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <p
                  className="font-display text-size-1 leading-none tabular-nums"
                  style={{ color: 'var(--lqv-fg)' }}
                  aria-live="off"
                >
                  {votesText} {isVotesPlural ? 'votes' : 'vote'}
                  {(isActive || credits > 0) && (
                    <span className="ml-2 text-size--2 font-body text-[var(--lqv-muted)] tabular-nums">
                      {creditsText} {isCreditsPlural ? 'credits' : 'credit'}
                    </span>
                  )}
                </p>

                <div className="flex items-center gap-1.5">
                  <PourControl
                    direction="out"
                    disabled={!canDrain}
                    ariaLabel={`Drain votes from ${item.title}. Hold to drain continuously, tap for a single vote.`}
                    onPourStart={handlers.startPourOut}
                    onPourEnd={handlers.end}
                  />
                  <PourControl
                    direction="in"
                    disabled={!canPour}
                    ariaLabel={`Pour votes into ${item.title}. Hold to pour continuously, tap for a single vote.`}
                    onPourStart={handlers.startPourIn}
                    onPourEnd={handlers.end}
                  />
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
