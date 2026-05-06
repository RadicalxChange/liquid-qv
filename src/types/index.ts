export interface BallotItem {
  id: string;
  title: string;
  description?: string;
  /** Optional party / category tag, rendered next to the title. */
  tag?: string;
}

export interface ThemeOverrides {
  bg?: string;
  fg?: string;
  muted?: string;
  accent?: string;
  water?: string;
  waterDark?: string;
  pool?: string;
  funnelWall?: string;
  funnelBg?: string;
}

export interface LiquidQVProps {
  /** The items voters allocate credits across. */
  ballotItems?: BallotItem[];
  /** Total credit budget. Defaults to 100. */
  creditBudget?: number;
  /** Called whenever vote allocations change. */
  onChange?: (votes: Record<string, number>) => void;
  /** Override CSS custom properties at the component root. */
  theme?: ThemeOverrides;
  /** Optional title above the ballot. */
  heading?: string;
  /** Optional question / framing prompt above the ballot. */
  prompt?: string;
  /** Hide the on-load explainer entirely (useful for embeds). */
  hideExplainer?: boolean;
  /** Hide the page-level header/footer chrome (for embeds). */
  embedded?: boolean;
}

/** Internal: vote state keyed by ballot item id. */
export type VoteMap = Record<string, number>;
