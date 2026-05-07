# Round 11 — Measuring stick + integer snap on release

Replaces the gauge from PR #8 with a persistent 0–10 measuring stick, and snaps committed votes to whole numbers on release. The hold-to-pour gesture stays — slowing water during a hold remains the load-bearing pedagogy. Only the *committed* value is integer.

Screenshots couldn't be auto-captured cleanly through the preview tooling for this round; the descriptions below reflect what was verified in the live dev preview, with the relevant DOM snapshots inline.

## State 1 — All funnels at 0

What renders: each funnel shows the persistent 0–10 ruler on its outer right edge — major ticks with labels at `0/2/4/6/8/10`, minor ticks (no labels) at `1/3/5/7/9`. Pool reads `100 / 100 credits`. Each card readout shows `0 votes  0 credits`.

Verified DOM:

```
[
  { label: "Votes for Kamala Harris", aria-valuenow: "0",
    aria-valuetext: "0 votes, 0 credits" },
  { label: "Votes for Gavin Newsom",  aria-valuenow: "0",
    aria-valuetext: "0 votes, 0 credits" },
  ...same for all six funnels
]
```

Pool meter: `aria-valuetext = "100 of 100 credits remaining"`.

## State 2 — Mid-hold (Harris ~1.5 s from empty)

What renders: water rises continuously inside Harris's funnel, slowing as the funnel widens. Other funnels stay at 0. The 0–10 ruler is unchanged on every funnel — no fade, no state-dependent visibility.

The eval probe captured the post-release state below; mid-hold the underlying `votes` is fractional (~2.7) but the displayed under-funnel readout rounds at the boundary, so the user sees `3 votes  9 credits` jump in real time as the rounded value changes.

## State 3 — Post-release: snap to integer

Verified DOM after a ~1.5 s hold:

```
{
  "harrisAriaText":   "3 votes, 9 credits",
  "harrisReadout":    "3 votes 9 credits",
  "harrisVoteValue":  "3",
  "pool":             "91 of 100 credits remaining",
  "poolDisplay":      "91 / 100 credits"
}
```

Conservation: `100 − 9 = 91` ✓. Underlying `liveVotes ≈ √7.5 ≈ 2.74` rounded up to `3`; `clamp(3, cap=10, ⌊√(100 − 0)⌋ = 10) = 3`; reducer commits the integer.

## Snap behaviour summary

`snapVotesToInteger(live, item, votes, budget)` (in `src/math/qv.ts`):

```
committed = clamp(round(live), 0, ⌊√budget⌋, ⌊√(budget − Σ others²)⌋)
```

Tests (in `src/math/qv.test.ts`) pin both round-up paths:

- 9.6 with `b = 5` (others using 25 credits, available = 75) → round = 10 → clamps to `⌊√75⌋ = 8`.
- 9.7 with `b = 4` (others using 16, available = 84) → round = 10 → clamps to `⌊√84⌋ = 9`.

23 math tests + 10 reducer tests, all passing.

## What changed

- `src/math/qv.ts` — added `snapVotesToInteger`; reverted `maxVotes` to return `⌊√budget⌋`; reverted `clampVotesAgainstBudget` to floor any fractional input it sees (defence-in-depth at the reducer).
- `src/math/qv.test.ts` — updated `costForVotes` / `clampVotesAgainstBudget` tests for integer cap behaviour; added a `snapVotesToInteger` block covering both round-up edge cases.
- `src/components/Funnel.tsx` — removed the gauge from PR #8 (live arrow + two reference ticks, `GAUGE_W` reservation, `isAnyPouring` prop). Restored the funnel cavity to its pre-#8 width. Added the persistent 0–10 ruler in extended viewBox space past the V's right edge (the V itself is full size again).
- `src/components/LiquidQV.tsx` — replaced `clampVotesAgainstBudget` with `snapVotesToInteger` in `endPour`. Display formatter `fmt(n)` now returns `Math.round(n).toString()` instead of `toFixed(1)`. Dropped `isAnyPouring={Boolean(activePour)}` from the Funnel props.
- `src/components/CreditPool.tsx` — readout uses integer rounding.

## What stayed the same

The 2D triangle funnel rendering, the hold-to-pour gesture mechanics (constant volumetric rate, water rises smoothly during a hold), the conservation invariant, the pool reservoir, the pour stream, the intro copy, the on-load explainer, the footer disclaimer, and the default ballot.
