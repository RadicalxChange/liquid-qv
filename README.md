# Liquid QV

Liquid QV is a visual-first demonstration of [Quadratic Voting](https://beta.radicalxchange.org/tools/plural-voting/) by [RadicalxChange](https://www.radicalxchange.org/). Each ballot item is a funnel; your credits are water; pour into the funnels you care about and feel the quadratic cost relationship rise as you concentrate.

> ![screenshot placeholder](docs/screenshot.png)

## Why funnels?

QV's defining property — `credits = votes²` — is invisible in every existing interface. You see a credit counter tick down and the math is somewhere else, in your head.

A 90° inverted-triangle funnel with 45° walls makes the relationship geometric. Cross-section width at height `h` is `2h`, so water area below height `h` is `h²` — water volume **is** credits, water height **is** votes counted, and `credits = votes²` holds by construction. As you pour, the level rises slower with every unit of water — the diminishing returns of concentration become visceral instead of arithmetic.

A shared credit pool above the funnels carries the second half of the lesson: the volume of water flowing pool→funnel during a pour is proportional to credits transferred, not vote count. Pouring vote 1 into an empty funnel drains the pool slowly; pouring vote 4 into a 3-vote funnel drains it ~7× faster. Same gesture, dramatically different visible cost. That asymmetry is the lesson.

## Scope

This is **Quadratic Voting** — a single voter, with a fixed credit budget, allocating across items. RxC's broader **Plural Voting** mechanism layers correlation discounts on top of QV at the tally stage; correlation discounts are out of scope for this demo. Liquid QV is the foundation, made legible.

## Quick start

```bash
nvm use            # Node 20
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build       # static SPA → dist/
npm run build:lib   # npm package → dist-lib/
npm run build:wc    # web component → dist-wc/
npm run preview     # preview the production build
npm run test        # run Vitest suite once
npm run lint
npm run typecheck
```

## Embedding

### As a React component

```bash
npm install @radicalxchange/liquid-qv
```

```tsx
import { LiquidQV } from '@radicalxchange/liquid-qv';
import '@radicalxchange/liquid-qv/style.css';

const items = [
  { id: 'a', title: 'Option A', description: 'Lorem ipsum' },
  { id: 'b', title: 'Option B' },
];

<LiquidQV
  ballotItems={items}
  creditBudget={100}
  onChange={(votes) => console.log(votes)}
  embedded
/>;
```

### As a Web Component

```html
<script type="module" src="https://unpkg.com/@radicalxchange/liquid-qv/dist-wc/liquid-qv.wc.js"></script>

<liquid-qv
  credit-budget="100"
  ballot-items='[{"id":"a","title":"Option A"},{"id":"b","title":"Option B"}]'
></liquid-qv>
```

The Web Component bundle is fully self-contained — React and CSS are inlined. The host page does not need React.

A working example is at [`examples/wc.html`](examples/wc.html).

## Configuration

| Prop / Attribute | Type | Default | Notes |
| --- | --- | --- | --- |
| `ballotItems` | `BallotItem[]` | top-six 2028 candidates | `{ id, title, description?, tag? }` |
| `creditBudget` | `number` | `100` | Total credits per voter |
| `onChange` | `(votes) => void` | – | Fires on every allocation change |
| `theme` | `ThemeOverrides` | – | Override CSS custom properties |
| `heading` | `string` | – | Optional title above the ballot |
| `prompt` | `string` | snapshot prompt | Question above the ballot |
| `hideExplainer` | `boolean` | `false` | Skip the on-load explainer |
| `embedded` | `boolean` | `false` | Hide page-level chrome |

For the Web Component, kebab-case the attributes (`credit-budget`, `hide-explainer`, etc.) and pass `ballot-items` / `theme` as JSON strings.

## Deployment

### Netlify (primary)

The repo ships with a `netlify.toml` configured for `npm run build` → `dist/` with Node 20 and SPA fallback. Either:

- Connect the GitHub repo in the Netlify dashboard (auto-deploy on merge to `main`), or
- `netlify deploy --prod` from a local checkout.

Set `VITE_BASE_PATH` in the Netlify build environment if the site lives at a subpath (e.g. `/tools/liquid-qv/`). Default is `/`.

### GitHub Pages (backup)

`.github/workflows/deploy.yml` builds with `VITE_BASE_PATH=/liquid-qv/` and publishes to Pages on every push to `main`. Enable Pages in the repo settings under "GitHub Actions" as the source.

### Vercel

```bash
vercel --prod
```

Vercel auto-detects Vite. Set `VITE_BASE_PATH` if needed.

### Any static host

`npm run build` produces a fully static `dist/` directory. Serve it with any static host; ensure SPA fallback (`/* → /index.html`) is configured if the host doesn't infer it.

## Maintenance: refreshing the default ballot

The default ballot in [`src/data/defaultBallot.ts`](src/data/defaultBallot.ts) is a snapshot of [Polymarket's "Presidential Election Winner 2028"](https://polymarket.com/event/presidential-election-winner-2028) and Kalshi's `kxpresperson-28` markets. **Re-pull quarterly through 2027**, apply the same eligibility filter (exclude any candidate constitutionally barred from running), update the `BALLOT_SNAPSHOT_DATE` constant, and update `defaultBallot`.

**Once formal 2028 candidates begin filing with the FEC**, replace the candidate ballot with a non-candidate default (a policy-priorities ballot, historic figures, or any neutral non-candidate ballot). The legal and reputational risk profile shifts substantially once the cycle activates and the demo should not look like a survey of declared candidates.

The disclaimer in the page footer (and the in-tool footer for the deployed app) must remain visible — not collapsed behind a click — and must reflect the current snapshot date.

## Compliance

Liquid QV is a mechanism-design demonstration. The default ballot is illustrative — RadicalxChange Foundation is a 501(c)(3) nonprofit and does not support or oppose any candidate for public office. See the in-app footer for the full disclaimer.

**If you embed Liquid QV** (as a React component or Web Component) on a page that uses the default 2028 candidate ballot, you must also surface the disclaimer text yourself in your embedding context — the deployed standalone app puts it in the page footer; library and Web Component embeds do not include the page chrome. The exact wording is in [`src/components/PageChrome.tsx`](src/components/PageChrome.tsx) and must remain in legible body text, not collapsed behind a click. If you supply a custom `ballotItems` prop and remove the candidate list, the disclaimer requirement falls away.

## License

MIT — see [LICENSE](LICENSE).

> **Note for reviewers:** RxC's `www` repo uses CC BY-NC 2.0, but Creative Commons licenses are not designed for software (not OSI-approved, "NonCommercial" terms get ambiguous in a software context). MIT is the standard choice for a small, embeddable React component meant for reuse. Happy to swap to a different license if the team prefers org-wide consistency — that's a one-line change in [LICENSE](LICENSE) and [`package.json`](package.json).
