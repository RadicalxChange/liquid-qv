import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';
import type { Transfer } from '../lib/reducer';

/*
 * TransferIndicator — the visible "flow" between pool and funnel.
 *
 * Per the brief, this is the load-bearing piece of pedagogy: when a
 * voter pours, the *amount of water in flight* must reflect the credits
 * transferred (= |Δvotes²|), not the vote-count delta. So we render a
 * vertical streak between the pool's bottom edge and the funnel, whose
 * **height** scales with `credits` (capped against `maxCreditsHint` so
 * a maxed-out pour fills the full strip rather than overflowing).
 *
 * Animation: the streak fades in, slides toward the funnel for ~360ms,
 * and fades out. AnimatePresence keys on transfer.id so back-to-back
 * pours each trigger a fresh animation rather than reusing the prior
 * one. Honors prefers-reduced-motion (snap, no slide).
 *
 * One indicator is rendered per funnel column; it only animates when
 * the active transfer is for that column.
 */

interface Props {
  itemId: string;
  transfer: Transfer | null;
  /** The credit budget — used to scale streak height. */
  budget: number;
  /** Called once the indicator's animation completes so the parent can
   *  clear the transient transfer state from the reducer. */
  onComplete: (id: number) => void;
}

const STREAK_HEIGHT_PX = 64;

export const TransferIndicator = ({ itemId, transfer, budget, onComplete }: Props) => {
  const reduceMotion = useReducedMotion();
  const active = transfer && transfer.itemId === itemId ? transfer : null;

  // Notify the parent so it can clear the transfer record from state.
  // Use the transfer id as the cleanup token to avoid races.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(
      () => onComplete(active.id),
      reduceMotion ? 60 : 480,
    );
    return () => window.clearTimeout(t);
  }, [active, onComplete, reduceMotion]);

  // Scale streak length to credits transferred. Cap at "this pour
  // could drain the pool" → whole-strip height. Below that, height is
  // linear in credits, so a 9-credit pour visually dwarfs a 1-credit
  // pour by a factor of 9 — exactly the lesson.
  const heightFraction = active ? Math.min(1, active.credits / budget) : 0;
  const streakHeight = heightFraction * STREAK_HEIGHT_PX;
  const isOutbound = active?.direction === 'pool-to-funnel';

  return (
    <div
      aria-hidden
      className="pointer-events-none relative w-full"
      style={{ height: STREAK_HEIGHT_PX }}
    >
      <AnimatePresence>
        {active && streakHeight > 0 && (
          <motion.div
            key={active.id}
            initial={{
              opacity: 0,
              y: isOutbound ? -8 : 8,
              height: streakHeight,
            }}
            animate={{
              opacity: [0, 0.95, 0.95, 0],
              y: isOutbound ? [(-8), 0, 6, 14] : [8, 0, -6, -14],
              height: streakHeight,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0.001 : 0.42,
              ease: 'easeOut',
              times: [0, 0.2, 0.7, 1],
            }}
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-full"
            style={{
              width: 14,
              background: isOutbound
                ? 'linear-gradient(180deg, var(--lqv-pool) 0%, var(--lqv-water) 100%)'
                : 'linear-gradient(0deg, var(--lqv-pool) 0%, var(--lqv-water) 100%)',
              boxShadow: '0 0 12px rgba(23, 115, 181, 0.35)',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
