import { LiquidQV } from './components/LiquidQV';
import { PageChrome } from './components/PageChrome';
import { Explainer, useExplainer } from './components/Explainer';
import { BALLOT_SNAPSHOT_DATE } from './data/defaultBallot';

export const App = () => {
  const explainer = useExplainer();

  return (
    <PageChrome snapshotDate={BALLOT_SNAPSHOT_DATE} onShowExplainer={explainer.show}>
      <Explainer open={explainer.open} onDismiss={explainer.dismiss} />
      <LiquidQV />
    </PageChrome>
  );
};
