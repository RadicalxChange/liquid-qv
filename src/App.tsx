import { LiquidQV } from './components/LiquidQV';
import { PageChrome } from './components/PageChrome';
import { BALLOT_SNAPSHOT_DATE } from './data/defaultBallot';

export const App = () => {
  return (
    <PageChrome snapshotDate={BALLOT_SNAPSHOT_DATE}>
      <LiquidQV />
    </PageChrome>
  );
};
