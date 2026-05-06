/**
 * Default ballot for Liquid QV: top six eligible 2028 US presidential
 * candidates by implied probability on the overall presidential winner
 * markets at Polymarket and Kalshi.
 *
 * Sources:
 *   - Polymarket "Presidential Election Winner 2028"
 *     https://polymarket.com/event/presidential-election-winner-2028
 *   - Kalshi `kxpresperson-28` equivalent market
 *
 * Snapshot date: 2026-05-05
 *
 * Eligibility note: Donald Trump is excluded under the 22nd Amendment's
 * two-term limit. This is an eligibility filter, not a curatorial choice.
 * The 4 D / 2 R split reflects market state — the Republican field is
 * concentrated on Vance and Rubio, the Democratic field is spread across
 * more contenders — and is not a curatorial choice either.
 *
 * Items are listed alphabetically by surname to avoid implied ranking.
 *
 * Maintenance: re-pull from Polymarket and Kalshi quarterly through 2027,
 * applying the same eligibility filter, and update this file. Once formal
 * 2028 candidates begin filing with the FEC, replace this candidate
 * ballot with a non-candidate default (policy priorities, historic
 * figures, etc.) — see README "Maintenance" section for details.
 */

import type { BallotItem } from '../types';

export const BALLOT_SNAPSHOT_DATE = '2026-05-05';

export const BALLOT_PROMPT = 'Allocate your credits across the 2028 presidential field.';

export const defaultBallot: BallotItem[] = [
  {
    id: 'harris',
    title: 'Kamala Harris',
    tag: 'D',
    description: 'Former Vice President of the United States',
  },
  {
    id: 'newsom',
    title: 'Gavin Newsom',
    tag: 'D',
    description: 'Governor of California',
  },
  {
    id: 'aoc',
    title: 'Alexandria Ocasio-Cortez',
    tag: 'D',
    description: "U.S. Representative for New York's 14th district",
  },
  {
    id: 'ossoff',
    title: 'Jon Ossoff',
    tag: 'D',
    description: 'U.S. Senator from Georgia',
  },
  {
    id: 'rubio',
    title: 'Marco Rubio',
    tag: 'R',
    description: 'U.S. Secretary of State',
  },
  {
    id: 'vance',
    title: 'JD Vance',
    tag: 'R',
    description: 'Vice President of the United States',
  },
];
