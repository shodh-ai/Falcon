'use client';

import { useEffect, useState } from 'react';
import { FileCheck2, FileText, History, Receipt } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentInfoTile } from '@/components/student/StudentInfoTile';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
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
  const [feeDocs, setFeeDocs] = useState<{ title: string; file_url: string; created_at: string }[]>([]);

  useEffect(() => {
    void api.get<Vault>('/api/student/admission-vault').then(setData);
    void api.get<{ documents: { title: string; file_url: string; created_at: string; category: string }[] }>(
      '/api/student/documents',
    ).then((res) => setFeeDocs(res.documents.filter((d) => d.category === 'FEE_RECEIPTS'))).catch(() => setFeeDocs([]));
  }, [api]);

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Admission & Document Vault"
        description="Read-only timeline of how you joined SGVU — application, counseling, entrance exams, and verified documents."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StudentInfoTile label="Admission type" value={data?.profile?.admission_type ?? data?.application?.admission_type} icon={FileText} />
        <StudentInfoTile label="Admission number" value={data?.profile?.admission_number ?? data?.application?.application_no} icon={FileCheck2} />
        <StudentInfoTile label="Migration certificate" value={data?.profile?.migration_certificate_status ?? 'PENDING'} icon={Receipt} />
      </div>

      {data?.timeline && data.timeline.length > 0 && (
        <StudentSectionCard title="Admission timeline" description="Key milestones from application to enrollment" icon={History}>
          <div className="space-y-4">
            {data.timeline.map((item, i) => (
              <div key={i} className="relative flex gap-4 border-l-2 border-sgvu-gold pl-5">
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-sgvu-gold" />
                <div>
                  <p className="text-sm font-semibold text-sgvu-navy">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
                </div>
              </div>
            ))}
          </div>
        </StudentSectionCard>
      )}

      <StudentSectionCard title="Entrance & counseling" description="Exam scores and allotment rounds" icon={FileCheck2}>
        {(data?.entrance_exams ?? []).length === 0 && (data?.counseling_rounds ?? []).length === 0 ? (
          <StudentEmptyState title="No entrance records" description="Entrance exam and counseling records will appear once linked." />
        ) : (
          <div className="space-y-3 text-sm">
            {(data?.entrance_exams ?? []).map((exam, i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-white p-3">
                <p className="font-semibold text-sgvu-navy">{String(exam.exam_name)}</p>
                <p className="text-muted-foreground">
                  Score {String(exam.score ?? '—')} · {String(exam.result_status)}
                </p>
              </div>
            ))}
            {(data?.counseling_rounds ?? []).map((c, i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-white p-3">
                <p className="font-semibold text-sgvu-navy">Round {String(c.round_no)}</p>
                <p className="text-muted-foreground">
                  {String(c.allotted_program)} — {String(c.decision)}
                </p>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>

      <StudentSectionCard title="Admission documents" description="Verified certificates uploaded at the time of admission" icon={FileCheck2}>
        {(data?.documents ?? []).length === 0 ? (
          <StudentEmptyState title="No documents on file" description="Uploaded admission documents will appear here." />
        ) : (
          <div className="space-y-3 text-sm">
            {(data?.documents ?? []).map((doc) => (
              <div key={String(doc.certificate_id)} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-white p-3">
                <span className="font-medium text-sgvu-navy">{String(doc.title)}</span>
                <Badge variant="outline">{String(doc.verification_status)}</Badge>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>

      <StudentSectionCard title="Fee payment receipts" description="Auto-archived to your Document Vault when you pay via Finance" icon={Receipt}>
        {feeDocs.length === 0 && (data?.admission_fee_receipts ?? []).length === 0 ? (
          <StudentEmptyState title="No fee receipts" description="Pay fees in Finance — PDF receipts appear here automatically." />
        ) : (
          <div className="space-y-3 text-sm">
            {feeDocs.map((doc) => (
              <a
                key={doc.file_url}
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-sgvu-gold/30 bg-sgvu-gold/5 p-3 transition hover:shadow-sm"
              >
                <p className="font-medium text-sgvu-navy">{doc.title}</p>
                <p className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleString()}</p>
              </a>
            ))}
            {(data?.admission_fee_receipts ?? []).map((r) => (
              <div key={String(r.demand_id)} className="rounded-2xl border border-border/70 bg-white p-3">
                <p className="font-medium text-sgvu-navy">{String(r.fee_head)}</p>
                <p className="text-muted-foreground">
                  ₹{String(r.paid_amount)} / ₹{String(r.total_amount)} · {String(r.status)}
                </p>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
