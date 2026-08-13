'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyPhdScholarsPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="PhD Students"
        description="Verify guide acceptance and support scholars through the research lifecycle."
      />
      <PhdReviewQueue
        embedded
        title="PhD Students"
        description="Guide queue for scholar lifecycle actions."
        listPath="/api/phd-lifecycle/guide/scholars"
        role="Faculty"
      />
    </FacultyPageShell>
  );
}
