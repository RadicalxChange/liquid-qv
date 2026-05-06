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
} from '../math/qv';
import { initialState, reducer } from '../lib/reducer';
import { defaultBallot, BALLOT_PROMPT } from '../data/defaultBallot';
import type { LiquidQVProps, ThemeOverrides, VoteMap } from '../types';

/*
 * LiquidQV — the public component, reworked in round 6 around continuous
 * real-valued votes and a pure hold-only physics: every interaction
 * (brief press, long hold, keyboard hold) obeys the same rule —
 * transferred credits = duration × rate. There is no integer mode and
 * no tap-as-+1 shortcut.
 *
 * Architecture
 * ------------
 * The reducer stores real-valued votes per item; the conservation
 * invariant `pool + Σ votes² = budget` holds at every committed state
 * for any reals. While a hold is in flight, an `activePour` transient
 * lets us derive the live water level without dispatching every frame
 * (would otherwise spam the live region announcement). On release we
 * clamp the live continuous value against the cap and the remaining
 * pool, then dispatch — no rounding to integer.
 *
 * Reduced motion: the same physics still applies. A press transfers
 * credits proportional to duration. The visible stream and per-frame
 * value updates are suppressed; the state simply jumps from pre-press
 * to post-press values without animation.
 */

const POUR_RATE = 5; // credits per second
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

/** Round to one decimal — display-only, never used in conservation math. */
const fmt = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

/**
 * Compute the live (in-flight) vote count for the active item at a
 * given absolute time, plus the pool that follows from it. Other items
 * stay at their committed values.
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
  let creditsForThis: number;
  if (pour.direction === 'in') {
    creditsForThis = Math.min(pour.startCredits + transferred, budgetForThis, budget);
  } else {
    creditsForThis = Math.max(pour.startCredits - transferred, 0);
  }
  const activeVotes = Math.sqrt(creditsForThis);
  const liveVotes: VoteMap = { ...votes, [pour.itemId]: activeVotes };
  const pool = remainingCredits(budget, liveVotes);
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

  // Notify external listeners only of *committed* vote changes — the
  // live continuous values during a hold are an internal detail.
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
  // Pour control handlers — hold-only. There is no tap shortcut: a
  // brief press transfers a small amount of water; a long hold transfers
  // proportionally more. Same physics in both cases.
  // ---------------------------------------------------------------------
  const startPour = useCallback(
    (itemId: string, direction: 'in' | 'out') => {
      // Don't start a pour that can't move (already at 0 draining or at cap pouring).
      const startVotes = state.votes[itemId] ?? 0;
      if (direction === 'out' && startVotes <= 0) return;
      const ceiling = clampVotesAgainstBudget(cap, itemId, state.votes, state.budget);
      if (direction === 'in' && startVotes >= ceiling - 1e-9) return;
      setActivePour({
        itemId,
        direction,
        startedAt: performance.now(),
        startCredits: startVotes * startVotes,
      });
    },
    [cap, state.votes, state.budget],
  );

  const endPour = useCallback(() => {
    const pour = activePourRef.current;
    if (!pour) return;
    const startVotes = state.votes[pour.itemId] ?? 0;

    // Use the live continuous value at the moment of release. No
    // rounding to integer — the value is what duration × rate produced.
    const liveAtRelease = computeLiveVotes(
      pour,
      state.votes,
      state.budget,
      performance.now(),
    );
    const finalVotes = clampVotesAgainstBudget(
      liveAtRelease.activeVotes,
      pour.itemId,
      state.votes,
      state.budget,
    );

    setActivePour(null);
    setFadeStream({
      itemId: pour.itemId,
      direction: pour.direction,
      durationMs: FADE_VISUAL_MS,
    });

    if (Math.abs(finalVotes - startVotes) > 1e-9) {
      dispatch({ type: 'set', itemId: pour.itemId, votes: finalVotes });
    }
  }, [state.votes, state.budget]);

  // Stable callbacks per item.
  const itemHandlers = useMemo(() => {
    const map: Record<
      string,
      { startPourIn: () => void; startPourOut: () => void; end: () => void }
    > = {};
    for (const item of items) {
      map[item.id] = {
        startPourIn: () => startPour(item.id, 'in'),
        startPourOut: () => startPour(item.id, 'out'),
        end: endPour,
      };
    }
    return map;
  }, [items, startPour, endPour]);

  const resetItem = useCallback((id: string) => dispatch({ type: 'reset', itemId: id }), []);
  const resetAll = useCallback(() => dispatch({ type: 'reset-all' }), []);
  const cssVars = useMemo(() => themeToCssVars(theme), [theme]);

  // Live region announces committed state changes (one-decimal
  // rounded). The reducer's `transfer` field fires once per dispatch,
  // so this only announces on release, not during a hold.
  const liveAnnouncement = useMemo(() => {
    if (!state.transfer) return '';
    const item = items.find((i) => i.id === state.transfer!.itemId);
    const v = state.votes[state.transfer.itemId] ?? 0;
    const c = costForVotes(v);
    return `${item?.title ?? state.transfer.itemId}: ${fmt(v)} votes, ${fmt(c)} credits.`;
  }, [state.transfer, state.votes, items]);

  const streamFor = (
    itemId: string,
  ): { visible: boolean; direction: 'in' | 'out'; mode: StreamMode } => {
    if (activePour && activePour.itemId === itemId) {
      return { visible: !reduceMotion, direction: activePour.direction, mode: 'active' };
    }
    if (fadeStream && fadeStream.itemId === itemId) {
      return { visible: !reduceMotion, direction: fadeStream.direction, mode: 'fading' };
    }
    return { visible: false, direction: 'in', mode: 'active' };
  };

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

      <CreditPool remaining={livePool} budget={state.budget} readout={fmt(livePool)} />

      {/* Live region for screen readers — announces only at-rest changes. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {items.map((item) => {
          const v = liveVotes[item.id] ?? 0;
          const isActive = activePour?.itemId === item.id;
          const credits = v * v; // real-valued, no flooring
          const stream = streamFor(item.id);
          const handlers = itemHandlers[item.id];
          const startVotes = state.votes[item.id] ?? 0;
          const ceiling = clampVotesAgainstBudget(cap, item.id, state.votes, state.budget);
          const canPour = startVotes < ceiling - 1e-9;
          const canDrain = startVotes > 1e-9;
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
                  disabled={!canDrain}
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
                  {fmt(v)} votes
                  <span className="ml-2 text-size--2 font-body text-[var(--lqv-muted)] tabular-nums">
                    {fmt(credits)} credits
                  </span>
                </p>

                <div className="flex items-center gap-1.5">
                  <PourControl
                    direction="out"
                    disabled={!canDrain}
                    ariaLabel={`Drain ${item.title}. Hold to drain — release to stop.`}
                    onPourStart={handlers.startPourOut}
                    onPourEnd={handlers.end}
                  />
                  <PourControl
                    direction="in"
                    disabled={!canPour}
                    ariaLabel={`Pour into ${item.title}. Hold to pour — release to stop.`}
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
