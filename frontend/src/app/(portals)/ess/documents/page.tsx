'use client';

import { DocumentVaultGrid } from '@/components/hr/DocumentVaultGrid';

export default function EssDocumentsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Document Vault</h2>
        <p className="text-sm text-muted-foreground">
          Upload missing documents for HR verification — degree, identity proofs, and onboarding kit.
        </p>
      </section>
      <DocumentVaultGrid mode="ess" />
    </div>
  );
}
