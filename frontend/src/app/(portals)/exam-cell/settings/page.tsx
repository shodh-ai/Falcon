'use client';

import { AccountSettingsPage } from '@/components/settings/AccountSettingsPage';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';

export default function ExamCellSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="settings" />
      <AccountSettingsPage />
    </div>
  );
}
