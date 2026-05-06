// Public entry point for the npm library build.
//
// Importers get the LiquidQV component plus the supporting types and
// data they need to drive it from the outside.

export { LiquidQV } from '../components/LiquidQV';
export type { BallotItem, LiquidQVProps, ThemeOverrides, VoteMap } from '../types';
export { defaultBallot, BALLOT_PROMPT, BALLOT_SNAPSHOT_DATE } from '../data/defaultBallot';
export {
  costForVotes,
  votesForCredits,
  marginalCost,
  maxVotes,
  totalCreditsSpent,
  remainingCredits,
} from '../math/qv';
