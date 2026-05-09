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
  snapVotesToInteger,
} from '../math/qv';
import { initialState, reducer } from '../lib/reducer';
import { defaultBallot, BALLOT_PROMPT } from '../data/defaultBallot';
import type { LiquidQVProps, ThemeOverrides, VoteMap } from '../types';

/*
 * LiquidQV — the public component.
 *
 * Round 12 (negative voting): each funnel is a vertical *diamond* —
 * upper V for support, lower V for opposition, both meeting at the
 * midline at vote = 0. Hold "+" to move the water level UP regardless
 * of where it currently is; hold "−" to move it DOWN. Crossing zero
 * is a smooth continuation; cost is votes² in either direction.
 *
 * Architecture
 * ------------
 * The reducer stores signed integer votes ∈ [−cap, +cap] at rest. The
 * conservation invariant `pool + Σ votes² = budget` holds at every
 * committed state. While a hold is in flight, an `activePour`
 * transient tracks the *signed credits* — `s = sign(v) × v²` — which
 * is monotonic during a hold (+R per second when "+" is held, −R per
 * second when "−" is held). At any moment v = sign(s) × √|s|. This
 * lets the water cross v=0 without any special case: the user holds
 * "−" all the way through the upper V, past the apex, and into the
 * lower V; ds/dt stays at −R the whole time and the rendering stays
 * continuous.
 *
 * On release we round the live |votes| half-AWAY-from-zero, reapply
 * the sign, and clamp against ±cap and the remaining pool — the
 * `snapVotesToInteger` helper does this in one call.
 *
 * Reduced motion: same physics applies; the visible stream and per-
 * frame value updates are suppressed.
 */

const POUR_RATE = 5; // credits per second
const FADE_VISUAL_MS = 150;

interface ActivePour {
  itemId: string;
  /** "in" = "+" = move v UP. "out" = "−" = move v DOWN. */
  direction: 'in' | 'out';
  startedAt: number; // performance.now()
  /** Signed credits at the moment the hold started: sign(v0) × v0². */
  startSigned: number;
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
  if (theme.poolDark) out['--lqv-pool-dark'] = theme.poolDark;
  if (theme.votePositive) out['--lqv-vote-positive'] = theme.votePositive;
  if (theme.votePositiveDark) out['--lqv-vote-positive-dark'] = theme.votePositiveDark;
  if (theme.voteNegative) out['--lqv-vote-negative'] = theme.voteNegative;
  if (theme.voteNegativeDark) out['--lqv-vote-negative-dark'] = theme.voteNegativeDark;
  if (theme.funnelWall) out['--lqv-funnel-wall'] = theme.funnelWall;
  if (theme.funnelBg) out['--lqv-funnel-bg'] = theme.funnelBg;
  return out;
};

/** Display formatter for signed votes — rounded integer with sign on
 *  non-zero values. Uses the real Unicode minus (U+2212) so the digit
 *  width matches the plus and "−4" doesn't look like a hyphen. State
 *  may still be fractional during a hold; this rounds at the boundary. */
const fmtVotes = (n: number): string => {
  const r = Math.round(n);
  if (r === 0) return '0';
  if (r > 0) return `+${r}`;
  return `−${Math.abs(r)}`;
};

/** Display formatter for credits — non-negative integer. Cost is
 *  votes², so the sign of v drops out before we get here. */
const fmtCredits = (n: number): string => Math.round(Math.abs(n)).toString();

/**
 * Compute the live (in-flight) signed vote count for the active item
 * at a given absolute time, plus the pool that follows from it.
 *
 * We track *signed credits* `s = sign(v) × v²` rather than v directly:
 * during any hold s changes monotonically (+R per second when "+" is
 * held, −R per second when "−" is held), so the user crossing the
 * midline (v = 0) is just s passing through 0 — no special case.
 *
 * The clamp is symmetric: |s| ≤ availableCreditsFor (the budget left
 * after other items' costs). The active vote count comes back out as
 *
 *     v = sign(s) × √|s|
 */
const computeLiveVotes = (
  pour: ActivePour,
  votes: VoteMap,
  budget: number,
  now: number,
): { votes: VoteMap; pool: number; activeVotes: number } => {
  const elapsed = Math.max(0, (now - pour.startedAt) / 1000);
  const transferred = elapsed * POUR_RATE;
  const dir = pour.direction === 'in' ? 1 : -1; // "+" moves s UP, "−" moves s DOWN
  const proposedSigned = pour.startSigned + dir * transferred;
  // Clamp |s| ≤ availableCreditsFor (which is also ≤ budget).
  const maxAbsSigned = availableCreditsFor(pour.itemId, votes, budget);
  const clampedSigned = Math.max(-maxAbsSigned, Math.min(proposedSigned, maxAbsSigned));
  const activeVotes =
    clampedSigned === 0 ? 0 : Math.sign(clampedSigned) * Math.sqrt(Math.abs(clampedSigned));
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
      // Don't start a pour that can't move:
      //   "+" held but already at +cap (water can't go higher)
      //   "−" held but already at −cap (water can't go lower)
      // Otherwise the pour begins; crossing v=0 is allowed.
      const startVotes = state.votes[itemId] ?? 0;
      const ceilingAbs = Math.abs(
        clampVotesAgainstBudget(cap, itemId, state.votes, state.budget),
      );
      if (direction === 'in' && startVotes >= ceilingAbs - 1e-9) return;
      if (direction === 'out' && startVotes <= -ceilingAbs + 1e-9) return;
      const startSigned =
        startVotes === 0 ? 0 : Math.sign(startVotes) * startVotes * startVotes;
      setActivePour({
        itemId,
        direction,
        startedAt: performance.now(),
        startSigned,
      });
    },
    [cap, state.votes, state.budget],
  );

  const endPour = useCallback(() => {
    const pour = activePourRef.current;
    if (!pour) return;
    const startVotes = state.votes[pour.itemId] ?? 0;

    // Snap to the nearest integer that fits the cap and the remaining
    // pool. Round-half-up via Math.round, then clamp DOWN if the
    // rounded value would overdraw — see the brief's edge cases:
    // a release at 9.6 with others holding the pool to 75 credits
    // rounds to 10, then clamps to ⌊√75⌋ = 8.
    const liveAtRelease = computeLiveVotes(
      pour,
      state.votes,
      state.budget,
      performance.now(),
    );
    const finalVotes = snapVotesToInteger(
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

  // Live region announces committed state changes. The reducer's
  // `transfer` field fires once per dispatch, so this only announces
  // on release, not during a hold. Signed voting: "+3 votes for X"
  // and "−3 votes for X" both cost 9 credits, communicated separately.
  const liveAnnouncement = useMemo(() => {
    if (!state.transfer) return '';
    const item = items.find((i) => i.id === state.transfer!.itemId);
    const v = Math.round(state.votes[state.transfer.itemId] ?? 0);
    const c = costForVotes(v);
    const voteWord = Math.abs(v) === 1 ? 'vote' : 'votes';
    const creditWord = c === 1 ? 'credit' : 'credits';
    return `${item?.title ?? state.transfer.itemId}: ${fmtVotes(v)} ${voteWord}, ${c} ${creditWord}.`;
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

      <CreditPool
        remaining={livePool}
        budget={state.budget}
        readout={Math.round(livePool).toString()}
      />

      {/* Live region for screen readers — announces only at-rest changes. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {items.map((item) => {
          const v = liveVotes[item.id] ?? 0;
          const isActive = activePour?.itemId === item.id;
          const credits = v * v; // squaring handles sign — cost is always ≥ 0
          const stream = streamFor(item.id);
          const handlers = itemHandlers[item.id];
          const startVotes = state.votes[item.id] ?? 0;
          // "+" enabled when v can move UP, "−" when v can move DOWN.
          // The available signed range is [−ceilingAbs, +ceilingAbs] given
          // the rest of the pool's draw.
          const ceilingAbs = Math.abs(
            clampVotesAgainstBudget(cap, item.id, state.votes, state.budget),
          );
          const canPour = startVotes < ceilingAbs - 1e-9;
          const canDrain = startVotes > -ceilingAbs + 1e-9;
          const canReset = startVotes !== 0;
          const displayedVotes = Math.round(v);
          const displayedCredits = Math.round(credits);
          const voteWord = Math.abs(displayedVotes) === 1 ? 'vote' : 'votes';
          const creditWord = displayedCredits === 1 ? 'credit' : 'credits';
          return (
            <div
              key={item.id}
              className="relative flex flex-col rounded-[14px] border p-3 md:p-4"
              style={{
                borderColor: 'var(--lqv-funnel-wall)',
                background: 'var(--lqv-card)',
              }}
            >
              {/* 1. Identity — candidate name + party.
                  pr-12 reserves space for the absolutely-positioned
                  reset link in the top-right corner. */}
              <h3 className="font-display text-size-1 leading-none truncate min-w-0 pr-12">
                {item.title}
                {item.tag ? (
                  <span className="ml-2 align-middle text-size--2 font-body text-[var(--lqv-muted)]">
                    ({item.tag})
                  </span>
                ) : null}
              </h3>

              {/* 2. Status readout — sits as a header for the funnel
                  below. Same type weight as before; it now anchors
                  the card's text column rather than competing with
                  the controls beside it. */}
              <p
                className="mt-1.5 font-display text-size-1 leading-none tabular-nums"
                style={{ color: 'var(--lqv-fg)' }}
                aria-live="off"
              >
                {fmtVotes(displayedVotes)} {voteWord}
                <span className="ml-2 text-size--2 font-body text-[var(--lqv-muted)] tabular-nums">
                  {fmtCredits(displayedCredits)} {creditWord}
                </span>
              </p>

              {/* 3. Visual — pour stream sits in the gap above the funnel,
                  reserving its 64-px slot whether or not it's flowing. */}
              <PourStream
                visible={stream.visible && Math.abs(v) > 1e-9}
                direction={stream.direction}
                mode={stream.mode}
                voteSign={v}
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

              {/* 4. Action — pour controls centered below the funnel. */}
              <div className="mt-3 flex items-center justify-center gap-3">
                <PourControl
                  direction="out"
                  disabled={!canDrain}
                  ariaLabel={`Move ${item.title}'s vote down. Hold to continue; release to stop. Crosses zero into negative votes.`}
                  onPourStart={handlers.startPourOut}
                  onPourEnd={handlers.end}
                />
                <PourControl
                  direction="in"
                  disabled={!canPour}
                  ariaLabel={`Move ${item.title}'s vote up. Hold to continue; release to stop. Crosses zero into positive votes.`}
                  onPourStart={handlers.startPourIn}
                  onPourEnd={handlers.end}
                />
              </div>

              {/* Reset link — visually pinned to the top-right, sourced
                  last so the tab order is name → funnel → − → + → reset
                  rather than reset coming first. */}
              <button
                type="button"
                onClick={() => resetItem(item.id)}
                disabled={!canReset}
                className="absolute top-3 right-3 md:top-4 md:right-4 text-size--3 underline text-[var(--lqv-water)] hover:text-[var(--lqv-water-dark)] disabled:opacity-40 disabled:no-underline"
                aria-label={`Reset votes on ${item.title}`}
              >
                reset
              </button>
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
