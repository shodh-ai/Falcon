'use client';

import { useEffect, useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Vault = {
  profile: Record<string, unknown> | null;
  application: Record<string, unknown> | null;
  entrance_exams: Record<string, unknown>[];
  counseling_rounds: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  admission_fee_receipts: Record<string, unknown>[];
  timeline: { label: string; date: string }[];
};

export default function StudentAdmissionVaultPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<Vault | null>(null);

  useEffect(() => {
    void api.get<Vault>('/api/student/admission-vault').then(setData);
  }, [api]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Admission & Document Vault"
        description="Read-only timeline of how you joined SGVU — application, counseling, entrance exams, and verified documents."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admission summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Type: {String(data?.profile?.admission_type ?? data?.application?.admission_type ?? '—')}</p>
          <p>Number: {String(data?.profile?.admission_number ?? data?.application?.application_no ?? '—')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Migration certificate:</span>
            <Badge variant="secondary">{String(data?.profile?.migration_certificate_status ?? 'PENDING')}</Badge>
          </div>
        </CardContent>
      </Card>

      {data?.timeline && data.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.timeline.map((item, i) => (
              <div key={i} className="flex gap-3 border-l-2 border-sgvu-gold pl-3">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrance & counseling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {(data?.entrance_exams ?? []).map((exam, i) => (
            <p key={i}>
              {String(exam.exam_name)} — Score {String(exam.score ?? '—')} ({String(exam.result_status)})
            </p>
          ))}
          {(data?.counseling_rounds ?? []).map((c, i) => (
            <p key={i}>
              Round {String(c.round_no)}: {String(c.allotted_program)} — {String(c.decision)}
            </p>
          ))}
          {!data?.entrance_exams?.length && !data?.counseling_rounds?.length && (
            <p className="text-muted-foreground">No entrance/counseling records linked yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents & receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.documents ?? []).map((doc) => (
            <div key={String(doc.certificate_id)} className="flex flex-wrap items-center gap-2">
              <span>{String(doc.title)}</span>
              <Badge variant="outline">{String(doc.verification_status)}</Badge>
            </div>
          ))}
          {(data?.admission_fee_receipts ?? []).map((r) => (
            <p key={String(r.demand_id)}>
              {String(r.fee_head)}: ₹{String(r.paid_amount)} / ₹{String(r.total_amount)} ({String(r.status)})
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
