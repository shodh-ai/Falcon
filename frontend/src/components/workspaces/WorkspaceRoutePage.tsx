'use client';

import { WorkspaceScaffold } from '@/components/workspaces/WorkspaceScaffold';
import { financePages, hodPages, iqacPages, presidentPages } from '@/lib/workspace-pages';

const pageMaps = {
  hod: hodPages,
  finance: financePages,
  iqac: iqacPages,
  president: presidentPages,
};

type PortalKey = keyof typeof pageMaps;

export function WorkspaceRoutePage({
  portal,
  page,
}: {
  portal: PortalKey;
  page: string;
}) {
  const config = pageMaps[portal][page as keyof (typeof pageMaps)[PortalKey]];
  return <WorkspaceScaffold config={config} />;
}
