import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  snapshotDate: string;
}

// Minimal page-level chrome — header, content, disclaimer footer.
// Filled in fully in Phase 4.
export const PageChrome = ({ children, snapshotDate: _snapshotDate }: Props) => {
  return <div className="min-h-dvh">{children}</div>;
};
