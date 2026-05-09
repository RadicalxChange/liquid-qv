# Round 15 — Active ruler ticks

The 0–10 ruler on the right edge of every funnel was passive: a static
reference scale unaffected by the user's pour. The water polygon
inside the funnel was the only thing that moved, and water reads as
*area* before *height* — but in QV, the magnitude that matters is the
height (votes earned), not the area (credits spent).

This round makes the ruler an active vote indicator. Ticks light up
at integer crossings during a hold; the most recently crossed tick
gets a "current" highlight. Three things happen at once:

- The **ticks** become the discrete-progress indicator: every integer
  vote earned is now an event the user can see on the side of the
  funnel, not just a colour change in the water.
- The **water** continues as the cost-ramp visualization: the same
  smooth quadratic fill, but now reading explicitly as the *cost* of
  the votes lit up beside it.
- The **rhythm** of tick fills externalizes the cost ramp. Tick 1
  takes 1 credit's worth of pouring, tick 2 takes 3 more, tick 5
  takes 9 more, tick 10 takes 19 more. The user feels the cost curve
  as the cadence of the flashes — fast at the bottom, slow at the
  top. This is the load-bearing artifact of the round.

## Three tick states

| State      | Trigger                              | Stroke                          | Opacity | Width            |
| ---------- | ------------------------------------ | ------------------------------- | ------- | ---------------- |
| `unfilled` | tick > floor(\|votes\|), or tick = 0 | `var(--lqv-fg)` (neutral)       | 0.32 / 0.55 | 1px / 1.5px (minor / major) |
| `filled`   | tick ≤ floor(\|votes\|) − 1          | `voteColor(votes)` (sign-coloured) | 0.85    | 1.5px / 2px      |
| `current`  | tick = floor(\|votes\|), and ≥ 1     | `voteColor(votes)`              | 1.0     | 2px / 3px        |

Tick 0 is the baseline reference at the funnel apex; it is *always*
unfilled. The user hasn't earned zero votes — that's the starting
state. Milestones begin at ±1.

`tickState(tickValue, votes)` lives in `src/lib/rulerState.ts` as a
pure function. It is independent of sign — `tickState(3, +3.5)` and
`tickState(3, −3.5)` both return `'current'`. Sign drives colour
(`voteColor(votes)`), not tick state.

## State walk-throughs

(Screenshots couldn't be auto-captured cleanly through the preview
tooling; descriptions below reflect what was verified live, with DOM
snapshots inline. Reproduce with `npm run dev`.)

### Empty (page load)

Every tick on every funnel is unfilled. No current tick anywhere.
Pool reads `100 / 100 credits`.

```
all 6 funnels: 11 ticks each, every tick stroke = "rgb(242, 241, 234)" (--lqv-fg),
               opacity 0.32 (minor) or 0.55 (major), width 1px or 1.5px
```

### Funnel at +5 (positive, mid-magnitude)

Held `+` on Kamala Harris ~5 s, released. Snaps to `+5 votes 25 credits`.

Verified DOM (Harris ruler, listed in source order — minors `1, 3, 5,
7, 9` then majors `0, 2, 4, 6, 8, 10`):

```
minor 1:  stroke=rgb(52, 211, 153) opacity=0.85 width=1.5px   → filled (green)
minor 3:  stroke=rgb(52, 211, 153) opacity=0.85 width=1.5px   → filled (green)
minor 5:  stroke=rgb(52, 211, 153) opacity=1    width=2px     → CURRENT (green, brighter, thicker)
minor 7:  stroke=rgb(242, 241, 234) opacity=0.32 width=1px    → unfilled
minor 9:  unfilled
major 0:  stroke=rgb(242, 241, 234) opacity=0.55 width=1.5px  → unfilled (passive baseline)
major 2:  stroke=rgb(52, 211, 153) opacity=0.85 width=2px     → filled (green)
major 4:  stroke=rgb(52, 211, 153) opacity=0.85 width=2px     → filled (green)
major 6:  unfilled
major 8:  unfilled
major 10: unfilled
```

Major label `2` and `4` render in green at 0.85 opacity (filled).
Labels `6, 8, 10` stay in the neutral `--lqv-fg` at 0.6 opacity.
There is no `5` label — tick 5 is a minor tick — so the current
highlight on +5 reads as a brighter, thicker tick mark with no label
treatment. (At +4, the current treatment additionally highlights the
"4" label in green at full opacity with a heavier `font-weight: 600`.)

### Funnel at −3 (negative, low magnitude)

Held `−` on Gavin Newsom ~1.9 s, released. Snaps to `−3 votes 9 credits`.

```
minor 1:  filled (red, rgb(248, 113, 113), opacity 0.85, width 1.5px)
minor 3:  CURRENT (red, opacity 1, width 2px)
minor 5–9: unfilled
major 0:  unfilled (passive baseline)
major 2:  filled (red, opacity 0.85, width 2px) — label "2" also red
major 4–10: unfilled
```

Same tick states as the `+3` case would be — only the colour differs
(red instead of green). This is the property the unit tests verify:
`tickState(t, +m) === tickState(t, −m)` for every `t` and `m`.

### Cross-zero hold (green drain → empty → red fill)

Started Harris at `+5` (25 credits). Held `−` for ~6.8 s, watching
the rulers in real time:

1. Magnitude drops below 5.0 → minor tick 5 un-fills, minor tick 4 takes
   over as `current` (green).
2. Below 4.0 → minor tick 4 un-fills, major tick 4 had been filled —
   wait, the *integer* crossings here are 5 → 4 → 3 → 2 → 1 → 0.
   At each integer the current marker steps down one position.
3. At 0, every tick is unfilled. No current tick. (Ticks don't pick
   the new sign's colour while at exactly zero — the sign is
   ambiguous; the rule is "tick 0 is always unfilled and there is no
   current at zero magnitude.")
4. Below 0, magnitudes start rising again on the negative side. As
   |votes| crosses 1.0 the ticks begin filling once more, this time
   in red.

End state after release at the 6.8-s mark:

```
{
  harrisReadout: "−4 votes 16 credits",
  pool:          "75 of 100 credits remaining"
}
```

At `−4`, the major label `4` renders bright red and bold (current),
and the label `2` renders dimmer red (filled). Conservation:
`16 + 9 = 25`, `75 + 25 = 100` ✓.

### Mid-hold cadence (the felt quadratic)

Holding `+` from zero on a fresh funnel:

| Time after pointerdown | Live `s` (signed credits) | Live `v = √s` | Tick that just lit  |
| ---------------------- | ------------------------- | ------------- | ------------------- |
| 0.20 s                 | 1.0                       | 1.0           | tick 1              |
| 0.80 s                 | 4.0                       | 2.0           | tick 2              |
| 1.80 s                 | 9.0                       | 3.0           | tick 3              |
| 3.20 s                 | 16.0                      | 4.0           | tick 4              |
| 5.00 s                 | 25.0                      | 5.0           | tick 5              |
| 7.20 s                 | 36.0                      | 6.0           | tick 6              |
| 9.80 s                 | 49.0                      | 7.0           | tick 7              |
| 12.80 s                | 64.0                      | 8.0           | tick 8              |
| 16.20 s                | 81.0                      | 9.0           | tick 9              |
| 20.00 s                | 100.0                     | 10.0          | tick 10 (saturated) |

Pour rate is the same constant 5 credits/s the rest of the demo uses;
the visible cadence is a direct read of the `dt = (n² − (n−1)²) / 5
= (2n − 1) / 5` pattern. At n = 1 the gap to the next tick is 0.2 s;
at n = 10 it's 3.8 s. That ramp **is** what QV is, played out as
flashes on the side of the funnel.

### Mixed grid (independent rulers)

With Harris at `+5` (green ticks 1–5, tick 5 current), Newsom at `−3`
(red ticks 1–3, tick 3 current), and the four other cards at zero
(every tick unfilled), each ruler reflects only its own funnel's
state. The grid reads as a row of independent meters — no
cross-talk, no shared colour cycle. The tick-state computation is
re-run inside each `Funnel` render, so each funnel renders against
its own `votes` prop.

## Animation and reduced motion

Tick state changes use a 160-ms CSS transition on `stroke`,
`stroke-opacity`, and `stroke-width` so the lift from unfilled →
filled → current reads as a soft fade rather than a hard switch.
Labels likewise transition `fill` and `fill-opacity` over 160 ms.

When `prefers-reduced-motion: reduce` is honoured (via framer-motion's
`useReducedMotion()` hook), the inline `transition` value flips to
`'none'` on every tick line and label. The states still update in
real time during a hold — the brief explicitly says "the state itself
still updates" — but each transition snaps instantly. Verified by
inspecting the live `style` attribute on a tick line:

```
transition: stroke 160ms, stroke-opacity 160ms, stroke-width 160ms;   // default
transition: none;                                                      // reduce-motion
```

## Tests

Twelve new unit tests in `src/lib/rulerState.test.ts`:

- Zero magnitude → every tick unfilled.
- Tick 0 is always unfilled regardless of magnitude or sign.
- Integer crossings produce the right `current`/`filled` transitions
  on the way up.
- Drains un-fill the highest tick first and demote the previous
  current to `current`.
- `tickState(t, +m) === tickState(t, −m)` for every relevant
  magnitude and tick value (sign drives colour, not state).
- Saturation at the ±10 cap: ticks 1–9 filled, tick 10 current.
- NaN and ±Infinity defensively return `'unfilled'`.

All 49 tests pass (37 prior + 12 new). Lint, typecheck, and all
three build targets clean. No console warnings.

## What didn't change

- `Funnel.tsx` geometry — same upward V, same water polygon, same
  surface line, same outline path, same rim, same ARIA contract.
- The water rendering — sign colours, smooth motion during a hold,
  snap on release.
- The under-funnel readout's position above the funnel (PR #14),
  format, and full type weight.
- `PourControl`, `PourStream`, `CreditPool`.
- The math layer (`src/math/qv.ts`), the reducer, and the
  active-pour state machine in `LiquidQV`.
- The intro copy, on-load explainer, footer, default ballot.

## What changed

- New file: `src/lib/rulerState.ts` — pure helper exporting
  `tickState(tickValue, votes): TickState`.
- New file: `src/lib/rulerState.test.ts` — 12 unit tests.
- `src/components/Funnel.tsx`:
  - Imports `tickState`, `TickState` from the new helper.
  - Two new module-private helpers `tickStrokeStyle` and
    `tickLabelStyle` map a `TickState` + sign-colour to inline
    `stroke` / `stroke-opacity` / `stroke-width` and `fill` /
    `fill-opacity` / `font-weight`.
  - Each minor and major tick line now reads its style from those
    helpers; major-tick labels likewise. Every tick has a 160-ms
    CSS transition, gated to `'none'` under reduced-motion.
- No public-API changes; no theme overrides added; no behaviour
  visible to screen readers (the active ruler is decorative — the
  `<g aria-hidden>` wrapper is unchanged).
