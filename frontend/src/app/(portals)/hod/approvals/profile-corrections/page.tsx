'use client';

import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';

export default function HodProfileCorrectionsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Student Profile Corrections</h2>
        <p className="text-sm text-muted-foreground">
          Review and resolve student master-data correction requests routed to Academic Admin.
        </p>
      </section>
      <ProfileCorrectionWidget limit={50} />
    </div>
  );
}
