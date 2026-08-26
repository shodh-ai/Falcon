'use client';

import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';
import { Card, CardContent } from '@/components/ui/card';

export default function AdminProfileCorrectionsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-2 p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
            Registrar Desk
          </p>
          <h1 className="text-2xl font-bold text-sgvu-navy">Student profile corrections</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Approve or reject student requests to edit their profile. Approved requests unlock a
            15-minute edit window for the student.
          </p>
        </CardContent>
      </Card>
      <ProfileCorrectionWidget limit={100} />
    </div>
  );
}
