import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

/*
 * Explainer — three short steps, dismissed once, reopen-able from a (?)
 * button in the page header.
 *
 * The brief is firm on "extremely concise" and "no auto-play tutorial
 * animations". Each step is one sentence + a small static SVG. The
 * dismissal lives in localStorage under a single key so an embed can
 * preset it (or wipe it) without reaching into component internals.
 *
 * Renders nothing on the server-pass / first sync render (we read
 * localStorage on mount), then fades in if not yet dismissed.
 */

const STORAGE_KEY = 'liquid-qv:explainer-dismissed:v1';

export const isExplainerDismissed = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const dismissExplainer = (): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* silently ignore — Safari private mode etc. */
  }
};

export const undoDismissExplainer = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

interface Step {
  title: string;
  body?: string;
  illustration: () => JSX.Element;
}

const FunnelGlyph = ({ fill }: { fill: number }) => {
  // h = fill (0..1) * height. credits visible = h².
  const W = 80;
  const H = 40;
  const cx = W / 2;
  const apexY = H;
  const fullH = H;
  const h = fill * fullH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path
        d={`M ${cx - h} ${apexY - h} L ${cx} ${apexY} L ${cx + h} ${apexY - h} Z`}
        fill="var(--lqv-water)"
      />
      <path
        d={`M ${cx - fullH} 0 L ${cx} ${apexY} L ${cx + fullH} 0`}
        fill="none"
        stroke="var(--lqv-water-dark)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
};

const PoolGlyph = () => (
  <svg viewBox="0 0 80 40" width={80} height={40} aria-hidden="true">
    <rect x="2" y="6" width="76" height="20" rx="6" fill="var(--lqv-pool)" />
    <rect
      x="2"
      y="6"
      width="76"
      height="20"
      rx="6"
      fill="none"
      stroke="var(--lqv-water-dark)"
      strokeWidth={1.5}
    />
  </svg>
);

const SpreadGlyph = () => (
  <svg viewBox="0 0 110 40" width={110} height={40} aria-hidden="true">
    {/* left-shallow funnel */}
    <g transform="translate(0,0)">
      <path d="M 12 28 L 20 36 L 28 28 Z" fill="var(--lqv-water)" />
      <path d="M 0 4 L 20 36 L 40 4" fill="none" stroke="var(--lqv-water-dark)" strokeWidth={1.5} />
    </g>
    {/* right-deep funnel */}
    <g transform="translate(60,0)">
      <path d="M 4 14 L 20 36 L 36 14 Z" fill="var(--lqv-water)" />
      <path d="M 0 4 L 20 36 L 40 4" fill="none" stroke="var(--lqv-water-dark)" strokeWidth={1.5} />
    </g>
  </svg>
);

const STEPS: Step[] = [
  {
    title: 'Each item is a funnel. Your credits are water.',
    body: 'A reservoir at the top holds your budget. The funnels below each show one ballot item.',
    illustration: () => (
      <div className="flex items-center gap-3">
        <PoolGlyph />
        <FunnelGlyph fill={0.4} />
      </div>
    ),
  },
  {
    title: 'Pour to vote. The level rises slower as you pour.',
    illustration: () => (
      <div className="flex items-center gap-3">
        <FunnelGlyph fill={0.25} />
        <FunnelGlyph fill={0.6} />
        <FunnelGlyph fill={0.95} />
      </div>
    ),
  },
  {
    title: 'Spreading credits across funnels is cheap. Concentrating is expensive.',
    illustration: () => <SpreadGlyph />,
  },
];

interface Props {
  open: boolean;
  onDismiss: () => void;
}

export const Explainer = ({ open, onDismiss }: Props) => {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.section
          aria-label="How Liquid QV works"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[1200px] px-4 pt-4 md:px-8 md:pt-6"
        >
          <div
            className="rounded-[16px] border p-4 md:p-6"
            style={{
              borderColor: 'var(--lqv-funnel-wall)',
              background: 'var(--lqv-card)',
            }}
          >
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 className="font-display text-size-2 leading-none">How it works</h2>
              <button
                type="button"
                onClick={onDismiss}
                className="text-size--2 underline"
                style={{ color: 'var(--lqv-water)' }}
              >
                Got it
              </button>
            </div>

            <ol className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
              {STEPS.map((step, i) => (
                <li key={i} className="flex flex-col gap-2">
                  <div className="flex h-12 items-center" aria-hidden="true">
                    <step.illustration />
                  </div>
                  <p className="font-display text-size-0 leading-tight">
                    <span
                      className="mr-2 inline-block tabular-nums"
                      style={{ color: 'var(--lqv-muted)' }}
                    >
                      {i + 1}
                    </span>
                    {step.title}
                  </p>
                  {step.body && (
                    <p className="text-size--2" style={{ color: 'var(--lqv-muted)' }}>
                      {step.body}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};

/** Hook: explainer-open state with localStorage persistence. */
export const useExplainer = (
  initiallyHidden = false,
): {
  open: boolean;
  show: () => void;
  dismiss: () => void;
} => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (initiallyHidden) return;
    if (!isExplainerDismissed()) setOpen(true);
  }, [initiallyHidden]);

  const dismiss = () => {
    setOpen(false);
    dismissExplainer();
  };
  const show = () => setOpen(true);

  return { open, show, dismiss };
};
