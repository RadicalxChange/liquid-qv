import type { ReactNode } from 'react';

/*
 * Page-level chrome for the standalone Liquid QV demo.
 *
 * - Header: RxC logomark + tool name + (?) button to reopen the explainer.
 * - Footer: required compliance disclaimer (visible body text, not
 *   collapsed under a click) + a link back to radicalxchange.org.
 *
 * The disclaimer wording is locked by the project brief and must not be
 * shortened or buried. Substitute [DATE] with the snapshot date the
 * default ballot was last reviewed (passed in as a prop so it stays in
 * sync with src/data/defaultBallot.ts).
 *
 * When the LiquidQV component is imported as a library or Web Component
 * in another host, this chrome is *not* mounted — embeds get just the
 * widget. The disclaimer in that case is the embedder's responsibility,
 * documented in the README.
 */

interface Props {
  children: ReactNode;
  snapshotDate: string;
  onShowExplainer?: () => void;
}

const RxCMark = () => (
  // A simplified mark — single solid disc with a triangular wedge cut,
  // an abstract nod to RxC's circular brand glyph without lifting the
  // exact artwork. Big enough to read at 24px; sized fluid in the header.
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="var(--lqv-fg)" />
    <path d="M12 6 L18 17 L6 17 Z" fill="var(--lqv-accent)" />
  </svg>
);

export const PageChrome = ({ children, snapshotDate, onShowExplainer }: Props) => {
  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: 'var(--lqv-bg)', color: 'var(--lqv-fg)' }}
    >
      <header className="border-b" style={{ borderColor: 'var(--lqv-funnel-wall)' }}>
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-4 py-3 md:px-8 md:py-4">
          <a
            href="https://www.radicalxchange.org/"
            className="flex items-center gap-2 no-underline"
            style={{ color: 'var(--lqv-fg)' }}
            aria-label="RadicalxChange home"
          >
            <RxCMark />
            <span className="font-display text-size-1 leading-none">Liquid QV</span>
          </a>
          {onShowExplainer && (
            <button
              type="button"
              onClick={onShowExplainer}
              className="flex h-9 w-9 items-center justify-center rounded-full border text-size--1"
              style={{
                borderColor: 'var(--lqv-funnel-wall)',
                color: 'var(--lqv-fg)',
                background: 'var(--lqv-card)',
              }}
              aria-label="Show how Liquid QV works"
            >
              ?
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t" style={{ borderColor: 'var(--lqv-funnel-wall)' }}>
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
          <p className="font-body text-size--2 max-w-[80ch]" style={{ color: 'var(--lqv-fg)' }}>
            Liquid QV is a mechanism-design demonstration. The default ballot lists the top six
            eligible 2028 US presidential candidates by Polymarket and Kalshi prediction-market odds
            (overall presidential winner markets) as of {snapshotDate}. None has formally announced
            a campaign. RadicalxChange Foundation is a 501(c)(3) nonprofit and does not support or
            oppose any candidate for public office; the list is illustrative of how Quadratic Voting
            captures preference intensity, not an endorsement of any candidate or party.
          </p>
          <p className="mt-4 text-size--3" style={{ color: 'var(--lqv-muted)' }}>
            Built by{' '}
            <a
              href="https://www.radicalxchange.org/"
              style={{ color: 'var(--lqv-water)' }}
              className="underline"
            >
              RadicalxChange
            </a>
            . Source on{' '}
            <a
              href="https://github.com/RadicalxChange/liquid-qv"
              style={{ color: 'var(--lqv-water)' }}
              className="underline"
            >
              GitHub
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
};
