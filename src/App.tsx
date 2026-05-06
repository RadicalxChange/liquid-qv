import { LiquidQV } from './components/LiquidQV';
import { PageChrome } from './components/PageChrome';
import { Explainer, useExplainer } from './components/Explainer';
import { Intro } from './components/Intro';
import { BALLOT_SNAPSHOT_DATE } from './data/defaultBallot';

export const App = () => {
  const explainer = useExplainer();

  return (
    <PageChrome snapshotDate={BALLOT_SNAPSHOT_DATE} onShowExplainer={explainer.show}>
      {/* Order: header (in PageChrome) → Intro (why) → Explainer (how) →
          framing question + tool (in LiquidQV). */}
      <Intro />
      <Explainer open={explainer.open} onDismiss={explainer.dismiss} />
      <LiquidQV />
    </PageChrome>
  );
};
