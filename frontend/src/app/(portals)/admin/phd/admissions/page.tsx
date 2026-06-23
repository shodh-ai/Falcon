'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function RegistrarPhdAdmissionsPage() {
  return (
    <PhdReviewQueue
      title="Registrar — Ph.D. Admissions & Awards"
      description="Verify documents, issue admission certificates, and award degrees."
      listPath="/api/phd-lifecycle/registrar/candidates"
      role="Registrar"
    />
  );
}
