# Round 14 — Card layout reorganization

The card was forcing a fragmented reading flow: eye lands on the
funnel, registers the water and color, then has to drop down and to
the right for the precise count, all while the pointer is reaching
for the buttons sharing that same horizontal band. The text arrived
late and competed with the controls.

This round splits each card into a top-to-bottom column where every
element has one job:

```
[ Candidate Name (D)            reset ]   ← identity
[ +5 votes  25 credits                ]   ← status (NEW position)
[                                      ]
[          [ funnel SVG ]              ]   ← visual
[                                      ]
[              [−]   [+]               ]   ← action (NEW position)
```

**identity → status → visual → action**, in that order, every time.

Pure layout refactor. The funnel SVG, sign-keyed colors, pour stream,
math, reducer, conservation, hold-to-pour gesture, ARIA semantics —
all unchanged from PR #13.

## What moved

**Vote readout** (`+5 votes  25 credits`):
- Was: bottom-left of the card, sharing a `flex justify-between` row with the +/− buttons.
- Now: directly under the candidate name, left-aligned, same type weight (`text-size-1 font-display`).
- Same Unicode-minus formatting on negatives, same integer formatting, same "votes" / "credits" labels.

**Plus / minus buttons**:
- Were: bottom-right of the card, packed into the same row as the readout (`gap-1.5`).
- Now: a single centered row beneath the funnel (`flex items-center justify-center gap-3`). The buttons keep PourControl's existing 36 × 36 px circular size — comfortable touch targets that don't overpower the funnel.

**Reset link**:
- Visually unchanged: still pinned to the top-right corner of the card.
- Now sourced last in the JSX (with `absolute top-3 right-3 md:top-4 md:right-4`) so the focusable tab order ends on it rather than starting on it.

## Tab order — verified

For the Harris card, focusable descendants in source / DOM order:

```
[
  { tag: "svg",    role: "slider", aria: "Votes for Kamala Harris" },
  { tag: "BUTTON", role: null,     aria: "Move Kamala Harris's vote down. Hold to continue; release to..." },
  { tag: "BUTTON", role: null,     aria: "Move Kamala Harris's vote up. Hold to continue; release to..." },
  { tag: "BUTTON", role: null,     aria: "Reset votes on Kamala Harris" }
]
```

Funnel slider → − → + → reset. Matches the visual reading order: the user tabs *through* the card the same way they'd read it.

## State walk-throughs

(Screenshots couldn't be auto-captured cleanly through the preview tooling; descriptions below reflect what was verified live, with DOM snapshots inline. Reproduce with `npm run dev`.)

### Empty (page load)

Each card renders the new layout with the readout reading `0 votes 0 credits` immediately under the candidate name, an empty funnel, and centered ±buttons below it. Pool reads `100 / 100 credits`.

```
all six readouts: "0 votes0 credits"
pool: "100 of 100 credits remaining"
```

### Positive vote

Held `+` on Kamala Harris ~1.5 s, released:

```
{
  harrisReadout: "+3 votes9 credits",
  pool:          "91 of 100 credits remaining"
}
```

The readout updates in place above the funnel. Funnel renders green water at level 3 on the unsigned 0–10 ruler. Centered ±buttons remain still.

### Negative vote

Held `−` on Gavin Newsom ~1.5 s from zero, released:

```
{
  newsomReadout: "−3 votes9 credits"
}
```

Same card position, same type treatment, just with the Unicode-minus prefix and red water in the funnel below.

### Mixed-state grid (4 of 6 active)

```
Harris: "+3 votes 9 credits"         (green water, level 3)
Newsom: "−3 votes 9 credits"         (red water, level 3)
AOC:    "+2 votes 4 credits"         (green water, level 2)
Ossoff: "0 votes 0 credits"          (empty)
Rubio:  "−2 votes 4 credits"         (red water, level 2)
Vance:  "0 votes 0 credits"          (empty)
pool:   "74 of 100 credits remaining"  (9+9+4+4 = 26 spent ✓)
```

Across the grid the new layout reads consistently — every card has its name, readout, funnel, and buttons in the same vertical positions. Reset links line up across the row in their absolute-positioned top-right corners.

### Mid-pour with active stream

While `+` is held on Harris (briefly approaching saturation):

```
{
  harrisReadout: "+7 votes45 credits",
  pool:          "55 of 100 credits remaining"
}
```

The readout above the funnel updates live during the hold. The pour stream renders in the gap between the readout and the funnel SVG — visually, the user reads the *number* (readout), sees the *flow* (stream), and watches it land in the *destination* (funnel water rising). The gap occupied by the stream is the same 64-px slot it always reserves; the layout doesn't shift when the stream toggles on or off.

### Cross-zero hold

Started Harris at `+3` (9 credits), held `−` ~2.7 s. Water drained green → empty → red, ending at `−2`:

```
{
  beforeRelease: "+3 votes 9 credits",
  afterCross:    "−2 votes 4 credits",
  pool:          "96 of 100 credits remaining"
}
```

Same card position throughout. The number flips through `+3 → +2 → +1 → 0 → −1 → −2` on the readout above the funnel; the funnel water tracks the matching color. The user's eye doesn't have to relocate — everything they're watching is in one vertical column.

## Mobile (≤ 640 px)

At 375 × 812:
- Cards stack vertically, one per row.
- Within each card, the `name → readout → funnel → buttons` order reads cleanly without any horizontal scrolling.
- The readout still sits left-aligned under the name; the buttons still center under the funnel — the layout is identical at every viewport, just with a single column instead of three.
- Reset link stays in the top-right corner of each card via the same `absolute top-3 right-3` rule.

## What's unchanged

- `Funnel.tsx` — geometry, ruler, water rendering, sign colors, animations.
- `PourStream.tsx` — direction, mode, sign-keyed gradient.
- `PourControl.tsx` — button visuals, hold-to-pour gesture, ARIA labels.
- `CreditPool.tsx` — pool reservoir.
- Math (`src/math/qv.ts`), reducer (`src/lib/reducer.ts`), and the active-pour state machine inside `LiquidQV`.
- The intro copy, on-load explainer, footer, default ballot.
- All 37 tests still pass with no new test cases — the layout change doesn't cross any behavioral boundary.

## What changed

One file: `src/components/LiquidQV.tsx`, only the per-card JSX block inside the `.map()`.

- Removed the `flex justify-between` row that paired the readout and buttons.
- Removed the header `flex` that paired the name and reset.
- Added a `<p>` for the readout under the `<h3>`.
- Added a `flex justify-center` row for the centered ± buttons under the funnel.
- Made the card `relative` and pinned the reset button absolutely to the top-right.
- `<h3>` gained `pr-12` so long candidate names don't run under the absolute reset link.
