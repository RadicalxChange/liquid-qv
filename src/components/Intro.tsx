/*
 * Intro — the "why" copy block above the "how" explainer.
 *
 * The on-load Explainer below this teaches users *how* to operate the
 * funnels (hold to pour). This block explains *why* Liquid QV exists —
 * the gap between QV's math and its felt experience. The two serve
 * different roles and both stay on the page; the Intro is always
 * visible and never dismissed.
 *
 * Standard body typography, no display font, no card chrome — this
 * reads as prose on the page, not as a labeled section. Italics on
 * "strongly" and "feel" are wrapped in <em> so screen readers convey
 * the emphasis, not just sighted readers.
 */

export const Intro = () => (
  <section
    aria-label="About Liquid QV"
    className="mx-auto w-full max-w-[1200px] px-4 pt-6 md:px-8 md:pt-10"
  >
    <div
      className="font-body max-w-[68ch] space-y-4 md:space-y-5"
      style={{ color: 'var(--lqv-fg)' }}
    >
      <p className="text-size-0 leading-normal">
        Quadratic voting has been used in places like Colorado’s state legislature to capture how{' '}
        <em>strongly</em> people feel, not just what they prefer. Most explanations of it sound
        like math homework. The math isn’t wrong; the <em>feel</em> of it is what’s missing.
      </p>
      <p className="text-size-0 leading-normal">
        Liquid QV turns the math into water. Ballot items become funnels. Hold to pour, and the
        water rises fast at first, then slower as you pour more. That curve — every vote needing
        more water than the last — is what QV is.
      </p>
      <p className="text-size-0 leading-normal">
        Try pouring all your water into one funnel. Then reset and spread it across the field.
        Both are valid votes. They just say different things about what matters to you.
      </p>
    </div>
  </section>
);
