'use client';

import { Suspense } from 'react';
import { FacultyPageShell, FacultyInlineLoading } from '@/components/faculty';
import { FacultyAiWorkspace } from '@/components/faculty/ai/FacultyAiAssistant';

export default function FacultyAiAssistantPage() {
  return (
    <FacultyPageShell className="max-w-none">
      <Suspense fallback={<FacultyInlineLoading label="Loading Faculty AI…" />}>
        <FacultyAiWorkspace />
      </Suspense>
    </FacultyPageShell>
  );
}
