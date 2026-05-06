import { motion, useReducedMotion } from 'framer-motion';

/*
 * CreditPool — the shared reservoir at the top of the screen.
 *
 * The pool is *linear* in credits (unlike the funnels, which are
 * quadratic in vote count by virtue of their geometry). Pool height
 * shrinks in lockstep with credits spent across all funnels, which
 * means the volume of water leaving the pool during any pour exactly
 * equals the credit cost of that pour — `volume_transferred = Δcredits`,
 * not `Δvotes`. That asymmetry between linear pool and quadratic funnel
 * is the load-bearing piece of the demo.
 *
 * For the conservation invariant to read at a glance, we draw the pool
 * with two layers:
 *   - background: outline of the full pool when fully filled (= budget)
 *   - foreground: animated water at the current remaining level
 */

interface Props {
  remaining: number;
  budget: number;
  /** Optional pixel height of the pool. Defaults to a fluid-ish value. */
  height?: number;
}

export const CreditPool = ({ remaining, budget, height = 84 }: Props) => {
  const reduceMotion = useReducedMotion();
  const fillRatio = budget > 0 ? Math.max(0, Math.min(1, remaining / budget)) : 0;

  return (
    <div
      className="relative w-full"
      role="meter"
      aria-label="Credits remaining in the pool"
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={Math.round(remaining * 100) / 100}
      aria-valuetext={`${Math.round(remaining * 100) / 100} of ${budget} credits remaining`}
    >
      <div
        className="relative w-full overflow-hidden rounded-[14px]"
        style={{
          height,
          background: 'var(--lqv-funnel-bg)',
          border: '1px solid var(--lqv-funnel-wall)',
          boxShadow: 'inset 0 1px 0 var(--lqv-shadow)',
        }}
      >
        {/* Filled water — animates between widths/heights. We use width
            instead of height so the pool drains horizontally as well as
            vertically (more visible at low fill levels). */}
        <motion.div
          className="absolute inset-y-0 left-0"
          initial={false}
          animate={{ width: `${fillRatio * 100}%` }}
          transition={{
            duration: reduceMotion ? 0 : 0.32,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{
            background: 'linear-gradient(180deg, var(--lqv-pool) 0%, var(--lqv-water) 100%)',
            boxShadow: 'inset 0 -2px 6px rgba(255, 255, 255, 0.18)',
          }}
        />

        {/* Tick lines at quarter marks — a faint scale across the pool. */}
        <div className="pointer-events-none absolute inset-0 flex">
          {[0.25, 0.5, 0.75].map((frac) => (
            <span
              key={frac}
              className="absolute top-0 bottom-0 w-px"
              style={{ left: `${frac * 100}%`, background: 'rgba(0, 0, 0, 0.06)' }}
              aria-hidden
            />
          ))}
        </div>

        {/* Numeric label, layered above the water. Stacks tight on narrow
            viewports where the wide reservoir squeezes horizontal room. */}
        <div className="relative flex h-full items-center justify-between gap-3 px-4 md:px-6">
          <span className="font-display text-size-1 md:text-size-2 leading-none text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.25)] tabular-nums">
            {(Math.round(remaining * 100) / 100).toFixed(2)}
          </span>
          <span className="text-size--3 md:text-size--2 font-body text-white/85 tracking-wide uppercase text-right leading-tight">
            of {budget}
            <br className="md:hidden" /> credits remaining
          </span>
        </div>
      </div>
    </div>
  );
};
