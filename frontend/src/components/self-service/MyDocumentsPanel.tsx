'use client';

import { DocumentVaultGrid } from '@/components/hr/DocumentVaultGrid';

export function MyDocumentsPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload missing documents for HR verification — degree, identity proofs, and onboarding kit.
      </p>
      <DocumentVaultGrid mode="ess" />
    </div>
  );
}
