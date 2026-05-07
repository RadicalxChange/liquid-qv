# Round 10 — Measuring-stick gauge

This directory documents the visual states the gauge layer adds to each funnel. Screenshots couldn't be auto-captured cleanly through the preview tooling for this round; the descriptions below reflect what was verified in the live dev preview, with the relevant DOM snapshots inline. Reviewers can reproduce all three states with `npm run dev`.

## State 1 — All funnels at 0, no active pour

What the page renders: each funnel has two faint reference ticks on its outer right edge, at the half-cap line (votes = 5) and the rim level (votes = 10). The live indicator is hidden.

Verified via DOM:

```
[
  { label: "Votes for Kamala Harris", valueNow: "0",
    tickStyleOpacity: "1", indicatorStyleOpacity: "0" },
  ...same for all six funnels
]
```

## State 2 — One funnel mid-hold, others at 0

What the page renders: the held funnel shows the live indicator (left-pointing arrow + numeric vote count to one decimal) sliding along the right edge as the water rises. **Reference ticks fade to opacity 0 across the entire grid** — the indicator owns the stage. Other funnels still showing zero votes appear with neither indicator nor ticks during this phase.

Verified during a live hold via the funnel's `isAnyPouring` prop driving CSS opacity:

```
[
  { label: "Votes for Kamala Harris", valueNow: "5.9",
    tickStyleOpacity: "0", indicatorStyleOpacity: "1" },
  { label: "Votes for Gavin Newsom", valueNow: "0",
    tickStyleOpacity: "0", indicatorStyleOpacity: "0" },
  ...
]
```

The indicator's vertical position is `apexY − h` where `h = votes × SCALE` — exactly the water-surface y. Position updates frame-for-frame during a hold (`instantUpdate` path bypasses Framer Motion's interpolation, same as the water polygon).

## State 3 — Post-release, mixed state

What the page renders: the funnel where votes were just committed keeps its live indicator (votes > 0 ⇒ visible). Empty funnels' reference ticks fade back in over ~250 ms (the global `isAnyPouring` flag is now false).

Verified post-release:

```
[
  { label: "Votes for Kamala Harris", valueNow: "3.2",
    tickStyleOpacity: "0", indicatorStyleOpacity: "1" },
  { label: "Votes for Gavin Newsom", valueNow: "0",
    tickStyleOpacity: "1", indicatorStyleOpacity: "0" },
  ...
]
```

## Implementation notes

### Layout

Reserved 36 px of horizontal room past the V's right edge (`GAUGE_W = 36`) for the gauge anchor. The funnel cavity is correspondingly narrower; everything else (rim line, water polygon, surface highlight, ARIA, keyboard handling, prop interface) is unchanged.

### Cross-fade

Opacity uses plain CSS transitions (`transition: opacity 250ms ease-out`) on the wrapping `<g aria-hidden>` instead of Framer Motion's `animate={{ opacity }}`. Framer's SVG-attribute opacity path didn't reliably re-render after `animate` prop changes here — the attribute value stuck on the initial-mount value. CSS transitions handle the cross-fade cleanly with no extra runtime cost.

### Reduced motion

When `prefers-reduced-motion: reduce` is set, opacity transitions are removed (`transition: 'none'`); state changes snap. The indicator's vertical position still updates in real time during a hold (input feedback, not decoration).
