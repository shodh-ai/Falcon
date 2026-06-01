'use client';

import { WorkspaceScaffold } from '@/components/workspaces/WorkspaceScaffold';
import { examCellPages, parentPages } from '@/lib/gap-workspace-pages';

const pageMaps = {
  parent: parentPages,
  'exam-cell': examCellPages,
};

type PortalKey = keyof typeof pageMaps;

export function GapWorkspaceRoutePage({
  portal,
  page,
}: {
  portal: PortalKey;
  page: string;
}) {
  const config = pageMaps[portal][page as keyof (typeof pageMaps)[PortalKey]];
  return <WorkspaceScaffold config={config} />;
}
