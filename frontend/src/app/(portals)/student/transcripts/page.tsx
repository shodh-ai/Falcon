'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
  DEMO_STUDENT,
  DEMO_TRANSCRIPTS,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { downloadVaultPdf } from '@/lib/student/vault-pdf';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type TranscriptRow = {
  transcript_id: string;
  semester: number;
  status: string;
  verification_code?: string | null;
  pdf_url?: string | null;
  generated_at?: string | null;
  archived_at?: string | null;
};

const actionBtn =
  'border-sgvu-navy/20 bg-sgvu-navy text-white shadow-none hover:bg-[#123A6D] hover:text-white active:bg-sgvu-gold active:text-sgvu-navy active:border-sgvu-gold';

const actionBtnActive =
  'bg-sgvu-gold text-sgvu-navy border-sgvu-gold hover:bg-sgvu-gold-hover hover:text-sgvu-navy';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'outline' | 'secondary' {
  const s = status.toUpperCase();
  if (s === 'ARCHIVED' || s === 'ISSUED' || s === 'VERIFIED') return 'success';
  if (s === 'PENDING') return 'warning';
  return 'outline';
}

export default function StudentTranscriptsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<TranscriptRow[]>('/api/student/transcripts');
      const live = Array.isArray(data) ? data : [];
      if (live.length > 0) {
        setRows(live);
      } else if (isStudentDemoModeEnabled()) {
        setRows(DEMO_TRANSCRIPTS.map((r) => ({ ...r })));
      } else {
        setRows([]);
      }
    } catch {
      setRows(
        isStudentDemoModeEnabled()
          ? DEMO_TRANSCRIPTS.map((r) => ({ ...r }))
          : [],
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async (row: TranscriptRow) => {
    if (downloadingId) return;
    setDownloadingId(row.transcript_id);
    try {
      if (row.pdf_url && row.pdf_url !== '#') {
        window.open(row.pdf_url, '_blank', 'noopener,noreferrer');
        toast.success('Transcript download started');
        return;
      }

      await downloadVaultPdf({
        kind: 'document',
        title: `Official Transcript — Semester ${row.semester}`,
        status: row.status,
        fields: [
          { label: 'Semester', value: String(row.semester) },
          { label: 'Status', value: row.status },
          {
            label: 'Verification code',
            value: row.verification_code || '—',
          },
          { label: 'Issued', value: formatDate(row.generated_at) },
          { label: 'Archived', value: formatDate(row.archived_at) },
        ],
        student: {
          name: user?.name || DEMO_STUDENT.name,
          enrollmentNo: DEMO_STUDENT.enrollment_no,
          program: DEMO_STUDENT.program,
        },
      });
      toast.success('Transcript PDF downloaded');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not download transcript',
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Transcripts"
        description="Download archived official transcripts issued by the Examination Cell."
      />
      {loading ? (
        <StudentLoadingState label="Loading transcripts…" />
      ) : rows.length === 0 ? (
        <StudentEmptyState
          title="No official transcripts yet"
          description="Transcripts appear here after the Examination Cell issues and archives them."
        />
      ) : (
        <StudentSectionCard
          title="Official transcripts"
          description="Semester-wise copies issued by the Examination Cell"
        >
          <div className="overflow-hidden rounded-xl border border-border/70">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_6.5rem] gap-3 border-b border-border/70 bg-slate-50/90 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Transcript</span>
              <span>Verification</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/60">
              {rows.map((row) => {
                const busy = downloadingId === row.transcript_id;
                return (
                  <li
                    key={row.transcript_id}
                    className={cn(
                      'grid grid-cols-1 gap-2 px-4 py-3.5 transition hover:bg-sgvu-gold/5',
                      'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_6.5rem] sm:items-center sm:gap-3',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sgvu-navy">
                        Semester {row.semester}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Issued {formatDate(row.generated_at)}
                      </p>
                    </div>
                    <p className="min-w-0 truncate text-sm text-muted-foreground">
                      {row.verification_code || 'Pending issuance'}
                    </p>
                    <div className="sm:justify-self-start">
                      <Badge variant={statusVariant(row.status)}>
                        {row.status}
                      </Badge>
                    </div>
                    <div className="flex justify-start sm:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        className={cn(
                          'h-8 px-3',
                          actionBtn,
                          busy && actionBtnActive,
                        )}
                        disabled={busy}
                        onClick={() => void handleDownload(row)}
                      >
                        {busy ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Preparing…
                          </>
                        ) : (
                          'Download'
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </StudentSectionCard>
      )}
    </StudentPageShell>
  );
}
