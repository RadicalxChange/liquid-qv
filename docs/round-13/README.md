# Round 13 — Color by sign: revert to upward V

The diamond from round 12 had two problems. First, at rest the funnel reads as an hourglass — most cards on first load are at zero and the visual that dominates the page is two stacked V's meeting in the middle, not a single funnel. Second, asking water to fill the lower V violates the gravity model the rest of the demo relies on; the surface still falls toward the apex, but the apex is now at the *bottom*, so water visually drains downward into a point. Two regressions for one affordance is a bad trade.

Round 13 keeps every piece of the signed-vote *math* — `s = sign(v) × v²`, monotonic cross-zero accumulation, signed `aria-valuenow`, the unicode-minus readout — and pulls all of the sign communication into **water color**:

- `votes > 0` → green (`--lqv-vote-positive`)
- `votes < 0` → red (`--lqv-vote-negative`)
- `votes = 0` → no water at all

The funnel returns to the round-11 single-V geometry. The pool retunes to a neutral gray-blue so it doesn't pre-emptively bias toward either side. The pour stream's funnel-side end picks up the funnel's sign-keyed color; the pool side stays neutral. The ruler reverts to unsigned `0…10` magnitude — sign is conveyed by hue, not by negative ruler labels.

Screenshots couldn't be auto-captured cleanly through the preview tooling for this round (same situation as round 12); the descriptions below reflect what was verified in the live dev preview, with the relevant DOM snapshots inline. Reviewers can reproduce all states with `npm run dev`.

## State 1 — Empty (all funnels at 0)

What renders: each card shows a single upward V outlined in `--lqv-water-dark`, with **no water**. The unsigned ruler `0/2/4/6/8/10` runs along the right edge. Each readout reads `0 votes  0 credits`. Pool reads `100 / 100 credits` with the new neutral gray-blue gradient (`--lqv-pool` → `--lqv-pool-dark`).

Verified DOM (pool meter):

```
aria-valuetext = "100 of 100 credits remaining"
```

Verified DOM (each funnel readout, x6):

```
"0 votes0 credits"
```

## State 2 — Positive vote (green water)

Held `+` on Kamala Harris ~600 ms from zero, released. Harris settles at `+2` votes, `4` credits. Pool drops to `96 / 100`.

Verified DOM:

```
{
  "harrisReadout":  "+2 votes4 credits",
  "pool":           "96 of 100 credits remaining"
}
```

Visual: water fills the upward V from the apex up to about the `2` ruler tick. The water fill is `var(--lqv-vote-positive)` (resolves to `rgb(52, 211, 153)` in dark mode); the surface line is `var(--lqv-vote-positive-dark)`. The funnel walls themselves stay neutral (`--lqv-water-dark`) — only the water and surface line change with sign.

Verified path-fill computed style (Harris):

```
{ raw: "var(--lqv-vote-positive)", computed: "rgb(52, 211, 153)" }
```

## State 3 — Negative vote (red water)

Held `−` on Gavin Newsom ~600 ms from zero, released. Newsom settles at `−2` votes, `4` credits.

Verified DOM:

```
{
  "newsomReadout":  "−2 votes4 credits",
  "newsomAriaValueNow": "-2"
}
```

Visual: water still fills the upward V from the apex up — same gravity model as the positive case — but rendered in `var(--lqv-vote-negative)` (`rgb(248, 113, 113)` in dark mode). The unicode-minus prefix (`U+2212`) on the readout matches the round-11/12 contract.

Verified path-fill computed style (Newsom):

```
{ raw: "var(--lqv-vote-negative)", computed: "rgb(248, 113, 113)" }
```

## State 4 — Mixed-sign grid (conservation under both signs)

With Harris at `+2` (4 credits) and Newsom at `−2` (4 credits), the pool reports `92 of 100 credits remaining`. Cost is `votes²` regardless of sign, so symmetric magnitudes spend symmetric credits. Visually the row reads as **green funnel beside red funnel beside empty funnels**, all in the same upward-V shape.

```
{ harris: "+2 votes 4 credits", newsom: "−2 votes 4 credits", others: "0 votes 0 credits" × 4 }
pool: "92 of 100 credits remaining"
```

## State 5 — Cross-zero hold (green drain → empty → red fill)

Starting from the State 4 layout, held `−` on Harris ~1.7 s. The hold runs continuously through the apex:

1. From `+2`, signed credits `s = +4` decrease at a constant 5 credits/sec.
2. At `s = 0` (water level reaches the funnel apex), the funnel is briefly empty — **no water shown**.
3. As `s` continues past zero into negative territory, water begins refilling the same upward V, now in red.

Final state after release: Harris at `−3`, `9` credits.

Verified DOM (after release):

```
{
  "harrisReadout":  "−3 votes9 credits",
  "harrisAriaValueNow": "-3",
  "pool":           "87 of 100 credits remaining"
}
```

Conservation: `9 + 4 = 13`, `87 + 13 = 100` ✓.

The pour stream's funnel-side end follows the funnel color throughout. While Harris is still positive, the stream is green-tinted on the funnel end (draining green water). When v hits exactly 0, `LiquidQV` suppresses the stream entirely (`visible = stream.visible && Math.abs(v) > 1e-9`) so there's no flash of the wrong color at the transition. Once v < 0, the stream returns with a red-tinted funnel end.

## How sign and color get wired together

The whole sign-to-color mapping lives in one helper:

```ts
// src/lib/voteColor.ts
export const voteSign = (v: number): VoteSign => {
  if (!Number.isFinite(v) || v === 0) return 0;
  return v > 0 ? 1 : -1;
};

export const voteColor = (v: number): string => {
  const s = voteSign(v);
  return s < 0 ? 'var(--lqv-vote-negative)' : 'var(--lqv-vote-positive)';
};

export const voteColorDark = (v: number): string => {
  const s = voteSign(v);
  return s < 0 ? 'var(--lqv-vote-negative-dark)' : 'var(--lqv-vote-positive-dark)';
};
```

`Funnel` consumes this for the water fill and surface stroke. `PourStream` takes a `voteSign` prop and routes it through the same helper for the funnel-side gradient stop. The pool side of the gradient stays at `var(--lqv-pool)` (neutral) — the pool doesn't pick a side, because the pool is shared budget.

At `votes = 0` the helper defaults to positive green by convention (since `voteSign(0) === 0` and we route 0 to the positive branch), but `Funnel` only renders water when `|votes| > 0`, so the empty-state color never visibly resolves. This keeps `voteColor` total without forcing the caller to special-case zero.

## What didn't change

- **Math layer** (`src/math/qv.ts`): unchanged. Same `costForVotes`, same signed `clampVotesAgainstBudget`, same round-half-away-from-zero `snapVotesToInteger`.
- **Reducer** (`src/lib/reducer.ts`): unchanged. Same signed-integer-at-rest contract.
- **Active-pour state machine** (`src/components/LiquidQV.tsx`): unchanged. The `s = sign(v) × v²` accumulation that makes cross-zero one continuous gesture is the round-12 implementation.
- **All 37 tests still pass** with no new test cases — color and rendering changes don't cross the math/reducer boundary.

## Theme overrides

`ThemeOverrides` gained four new fields so embeds can rebrand sign colors without losing the new wiring:

```ts
votePositive?:     string;  // → --lqv-vote-positive
votePositiveDark?: string;  // → --lqv-vote-positive-dark
voteNegative?:     string;  // → --lqv-vote-negative
voteNegativeDark?: string;  // → --lqv-vote-negative-dark
poolDark?:         string;  // → --lqv-pool-dark   (for the new pool gradient)
```

Legacy `water` / `waterDark` overrides still flow through (used for the focus ring and the funnel walls); they no longer affect funnel-water color since the funnel now sources from the sign-keyed tokens.

## Explainer

Step 1's funnel glyph now uses the positive-water green so the colors used in the explainer match what the user will see in the tool. A fourth step joins the sequence:

> 4. Or vote against. Press the − button. The water turns red.

Its illustration is a side-by-side green-funnel/red-funnel pair drawn in the same static-SVG style as the existing three glyphs. The grid steps up to `lg:grid-cols-4` on wide screens (and falls back to `md:grid-cols-2` then `grid-cols-1` for narrower viewports).
