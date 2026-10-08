'use client';

import { AccountSettingsPage } from '@/components/settings/AccountSettingsPage';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function Page() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Settings"
        description="Manage your account preferences and security."
      />
      <AccountSettingsPage hidePageHeader />
    </FacultyPageShell>
  );
}
