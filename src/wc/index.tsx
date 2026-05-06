/*
 * Web Component build entry.
 *
 * Wraps the React <LiquidQV /> as a custom element so non-React hosts
 * (plain HTML pages, Eleventy templates, Webflow embeds, etc.) can drop
 * the tool in via:
 *
 *     <script type="module" src=".../liquid-qv.wc.js"></script>
 *     <liquid-qv credit-budget="100"></liquid-qv>
 *
 * This bundle is fully self-contained (React + DOM + CSS), built in
 * 'wc' mode in vite.config.ts. No peer-dep React is needed on the host.
 *
 * Attributes:
 *   credit-budget         number (default 100)
 *   ballot-items          JSON string of BallotItem[] (overrides default)
 *   heading               string
 *   prompt                string
 *   theme                 JSON string of ThemeOverrides
 *   hide-explainer        boolean ("true"/"false")
 *   embedded              boolean ("true"/"false")
 *
 * @r2wc handles the kebab → camelCase mapping. We coerce the JSON-ish
 * attributes inline before passing through.
 */

import r2wc from '@r2wc/react-to-web-component';
import { LiquidQV } from '../components/LiquidQV';
import type { BallotItem, LiquidQVProps, ThemeOverrides } from '../types';
import liquidQVStyles from '../styles/index.css?inline';

interface WCProps extends Omit<LiquidQVProps, 'ballotItems' | 'theme'> {
  ballotItems?: string | BallotItem[];
  theme?: string | ThemeOverrides;
}

const tryParseJson = <T,>(input: unknown): T | undefined => {
  if (typeof input !== 'string') return input as T | undefined;
  if (input.trim() === '') return undefined;
  try {
    return JSON.parse(input) as T;
  } catch {
    console.warn('[liquid-qv] attribute is not valid JSON, ignoring');
    return undefined;
  }
};

// We wrap LiquidQV in a tiny shim so the host can pass JSON-string
// attributes (`ballot-items='[...]'`) and we still call the React
// component with parsed objects. Also injects the bundled stylesheet
// so the WC carries its own styling.
const LiquidQVWC = (props: WCProps) => {
  const ballotItems =
    typeof props.ballotItems === 'string'
      ? tryParseJson<BallotItem[]>(props.ballotItems)
      : props.ballotItems;
  const theme =
    typeof props.theme === 'string' ? tryParseJson<ThemeOverrides>(props.theme) : props.theme;

  return (
    <>
      <style>{liquidQVStyles}</style>
      <LiquidQV
        ballotItems={ballotItems}
        creditBudget={props.creditBudget}
        onChange={props.onChange}
        theme={theme}
        heading={props.heading}
        prompt={props.prompt}
        hideExplainer={props.hideExplainer}
        embedded={props.embedded ?? true}
      />
    </>
  );
};

const Element = r2wc(LiquidQVWC, {
  props: {
    creditBudget: 'number',
    ballotItems: 'string',
    theme: 'string',
    heading: 'string',
    prompt: 'string',
    hideExplainer: 'boolean',
    embedded: 'boolean',
    onChange: 'function',
  },
});

if (typeof window !== 'undefined' && !customElements.get('liquid-qv')) {
  customElements.define('liquid-qv', Element);
}

export { Element as LiquidQVElement };
