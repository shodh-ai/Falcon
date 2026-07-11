'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { Scale } from 'lucide-react';

export default function HodStudentDisciplinePage() {
  const router = useRouter();

  useEffect(() => {
    // HOD uses same incident logger as faculty; DC reviews after submission.
  }, []);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Student Disciplinary Actions"
        description="Log misconduct incidents against students in your department. Cases route to the Disciplinary Committee (DC) for review."
      />
      <div className="rounded-xl border border-slate-100 bg-white p-6 space-y-4 max-w-2xl">
        <div className="flex items-start gap-3">
          <Scale className="h-8 w-8 text-sgvu-gold shrink-0" />
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-sgvu-navy">Pipeline:</strong> HOD/Faculty logs incident → DC queue reviews → Student discipline record created.</p>
            <p>Attach evidence (photos, documents). Students can view outcomes on their helpdesk profile.</p>
          </div>
        </div>
        <Button onClick={() => router.push('/faculty/discipline/incidents')}>
          Log disciplinary incident
        </Button>
      </div>
    </HodPageFrame>
  );
}
