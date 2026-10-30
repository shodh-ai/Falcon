'use client';

import { DocumentVaultGrid } from '@/components/hr/DocumentVaultGrid';
import { FacultyPanel } from '@/components/faculty';

export function MyDocumentsPanel({ allowDemoFallback = true }: { allowDemoFallback?: boolean } = {}) {
  return (
    <FacultyPanel title="Document vault" description="Upload and track verification status">
      <DocumentVaultGrid mode="ess" allowDemoFallback={allowDemoFallback} />
    </FacultyPanel>
  );
}
