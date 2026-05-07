# Round 12 — Negative voting via bidirectional funnels

Each ballot item is now a **vertical diamond** — two 90°-apex V-troughs meeting at a midline at vote = 0. Holding "+" moves the water level UP (more positive) regardless of where it currently is; holding "−" moves it DOWN. Crossing the midline is a smooth continuation of the same gesture; cost is `votes²` regardless of sign.

Screenshots couldn't be auto-captured cleanly through the preview tooling for this round; the descriptions below reflect what was verified in the live dev preview, with the relevant DOM snapshots inline. Reviewers can reproduce all states with `npm run dev`.

## State 1 — All funnels at 0

What renders: each diamond has both V's outlined, a faint midline through the apex (slightly brighter at v = 0 so the rest state reads), and the persistent ruler from −10 to +10 on the outer right edge. Major ticks (with labels) at every even integer; minor ticks at the odd integers between. Pool reads `100 / 100 credits`. Each card readout reads `0 votes  0 credits`.

Verified DOM:

```
[
  { label: "Votes for Kamala Harris",
    aria-valuenow: "0", aria-valuetext: "0 votes, 0 credits" },
  ...same for all six funnels
]
```

Pool meter: `aria-valuetext = "100 of 100 credits remaining"`.

## State 2 — Pour up: water in the upper V

Held "+" on Harris ~1.5 s from zero, released:

```
{
  "harrisAria":          "+3 votes, 9 credits",
  "harrisAriaValueNow":  "3",
  "harrisReadout":       "+3 votes  9 credits",
  "pool":                "91 of 100 credits remaining"
}
```

Water fills the **upper V** from the midline up to a level around `+3` on the ruler. Conservation: `100 − 9 = 91` ✓.

## State 3 — Pour down: water in the lower V

Reset, then held "−" on Harris ~1.5 s from zero, released:

```
{
  "harrisAria":          "−3 votes, 9 credits",
  "harrisAriaValueNow":  "-3",
  "harrisReadout":       "−3 votes  9 credits",
  "pool":                "91 of 100 credits remaining"
}
```

Water fills the **lower V** from the midline down to a level around `−3` on the ruler. Same cost (9 credits) as +3 — sign drops out of the squaring. The under-funnel readout uses the real Unicode minus (U+2212), not a hyphen.

## How the cross-zero hold works

The brief's hardest move: hold "−" while the funnel is at +3. The water in the upper V drains back toward the midline; once the level reaches zero, the same gesture continues filling the lower V. The user feels one continuous motion.

Implementation: during a hold we track *signed credits* `s = sign(v) × v²` rather than v directly. `s` changes monotonically — `+POUR_RATE` per second when "+" is held, `−POUR_RATE` per second when "−" is held — so crossing v = 0 is just `s` passing through zero. The active vote count comes back as `v = sign(s) × √|s|`.

This means the pour stream visual flips direction naturally: while v > 0 and "−" is held, the stream goes funnel → pool (s falling toward 0); once v < 0, the stream flips to pool → funnel (|s| growing on the negative side). One state machine, no special case at the apex.

## Snap-on-release with signs

`snapVotesToInteger(live, item, votes, budget)` (in `src/math/qv.ts`):

```
committed = sign(live) × clamp(round(|live|), 0, ⌊√budget⌋, ⌊√(budget − Σ others²)⌋)
```

Round-half-AWAY-from-zero (so −0.5 → −1 and +0.5 → +1; JavaScript's `Math.round` rounds toward +∞, which would map −0.5 to 0, so we round `|live|` and reapply the sign). Both round-up clamp-down edge cases from PR #9 are pinned by tests on the negative side too.

## Conservation invariant

`pool = budget − Σ votes_i²` — same equation, signs drop out via the squaring. Tests verify this across mixed-sign committed states (Harris = +6, Newsom = −4, Vance = +2 → pool = 100 − 36 − 16 − 4 = 44).

## What changed

- `src/math/qv.ts` —
    - `costForVotes` now accepts negative input (the early `<= 0` return is gone; squaring already handles sign).
    - New `minVotes(budget)` returning the symmetric negative cap.
    - `clampVotesAgainstBudget` is signed-aware: floors |v|, preserves sign, applies caps in both directions, normalises `-0` to `0`.
    - `snapVotesToInteger` is signed-aware: round-half-away-from-zero, then symmetric clamp.
- `src/math/qv.test.ts` — 4 new tests (37 total): negative-input cases for `costForVotes` / `totalCreditsSpent` / `remainingCredits` / `availableCreditsFor`; ties at ±0.5 in the snap; mixed-sign clamp.
- `src/components/Funnel.tsx` — full rewrite of the SVG geometry. The cavity is now twice as tall (upper V + lower V), the water polygon is a unified path covering both Vs (`M cx midY L (cx − h) surfaceY L (cx + h) surfaceY Z` with `h = |v| × SCALE` and `surfaceY = midY − sign(v) × h`), the midline is rendered as a faint horizontal line that brightens at v = 0, and the ruler spans −10 to +10 with signed labels.
- `src/components/LiquidQV.tsx` —
    - `ActivePour.startCredits` → `ActivePour.startSigned` (= `sign(v0) × v0²`).
    - `computeLiveVotes` operates on signed credits with monotonic accumulation per direction; the cap is symmetric (`|s| ≤ availableCreditsFor`).
    - `startPour` early-exit checks `±ceilingAbs` in both directions.
    - `canPour` / `canDrain` split: `canPour = startVotes < +ceilingAbs`, `canDrain = startVotes > −ceilingAbs`. The "reset" button enables whenever `votes !== 0`.
    - Display: signed `fmtVotes` (`+3` / `0` / `−4`) for the under-funnel readout; `fmtCredits` (always non-negative integer) for the credits half.
    - PourControl aria labels updated for the directional semantics ("Move ${title}'s vote down/up. Hold to continue; release to stop. Crosses zero into negative/positive votes.").

## What stayed the same

- The hold-to-pour gesture mechanics (constant volumetric rate, smooth water motion during a hold, snap-on-release).
- Integer commits at rest. Continuous (now signed) values during a live hold.
- The pool reservoir, pour stream visual, intro copy, on-load explainer, footer disclaimer, default ballot.
- The reducer (no shape change — already accepts signed integer values via `clampVotesAgainstBudget`).
