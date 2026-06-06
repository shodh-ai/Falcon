'use client';

import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';
import { WorkspaceRoutePage } from '@/components/workspaces/WorkspaceRoutePage';

export default function HodDashboardPage() {
  return (
    <div className="space-y-6">
      <WorkspaceRoutePage portal="hod" page="dashboard" />
      <div className="mx-auto max-w-6xl px-4 pb-6 md:px-6">
        <ProfileCorrectionWidget reviewHref="/hod/approvals/profile-corrections" />
      </div>
    </div>
  );
}
