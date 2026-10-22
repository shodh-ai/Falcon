'use client';

import { useEffect, useRef, useState } from 'react';
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
import { authHeaders, getApiBaseUrl } from '@/lib/api/client';
import { DEMO_TRANSCRIPTS } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
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
  revision?: number;
  downloadable?: boolean;
  revocation_reason?: string | null;
};
type TranscriptList = { api: ReturnType<typeof useAuthedApi>; revision: number; rows: TranscriptRow[]; error: string | null };

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
  const { token } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<TranscriptList | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const downloadPending = useRef(false);
  const requestScope = useRef(0);

  const current = result?.api === api && result.revision === revision ? result : null;
  const rows = current?.rows ?? [];
  const loading = !current;
  const error = current?.error;

  useEffect(() => {
    let active = true;
    void api.get<TranscriptRow[]>('/api/student/transcripts')
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The server did not return a transcript list.');
        const rows = data.length === 0 && isStudentDemoModeEnabled() ? DEMO_TRANSCRIPTS.map((row) => ({ ...row })) : data;
        if (active) setResult({ api, revision, rows, error: null });
      })
      .catch((e: unknown) => {
        if (active) setResult({ api, revision, rows: [], error: e instanceof Error ? e.message : 'Could not load transcripts' });
      });
    return () => { active = false; requestScope.current += 1; };
  }, [api, revision]);

  const handleDownload = async (row: TranscriptRow) => {
    if (downloadPending.current) return;
    downloadPending.current = true;
    setDownloadingId(row.transcript_id);
    const scope = requestScope.current;
    try {
      if (row.downloadable === false || ['REVOKED', 'SUPERSEDED'].includes(row.status)) throw new Error('This transcript copy is no longer valid. Contact the Examination Cell for its current revision.');
      if (!row.pdf_url || row.pdf_url === '#') {
        throw new Error('The official transcript PDF has not been issued yet.');
      }
      if (/^https?:\/\//i.test(row.pdf_url)) {
        throw new Error('Official transcripts require protected storage. Contact the Examination Cell.');
      }
      if (!token) throw new Error('Please sign in again to download your transcript.');
      const response = await fetch(`${getApiBaseUrl()}/api/uploads/download?path=${encodeURIComponent(row.pdf_url)}`, {
        headers: authHeaders(token),
        cache: 'no-store',
      });
      if (scope !== requestScope.current) return;
      if (!response.ok) throw new Error(`Could not download transcript (HTTP ${response.status}).`);
      const pdf = await response.blob();
      if (scope !== requestScope.current) return;
      if (!pdf.size || !pdf.type.toLowerCase().includes('application/pdf')) {
        throw new Error('The server did not return a transcript PDF.');
      }
      const objectUrl = URL.createObjectURL(pdf);
      try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `SGVU-Transcript-Semester-${row.semester}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      toast.success('Transcript PDF downloaded');
    } catch (e) {
      if (scope !== requestScope.current) return;
      toast.error(
        e instanceof Error ? e.message : 'Could not download transcript',
      );
    } finally {
      downloadPending.current = false;
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
      ) : error ? (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-white p-4 text-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry transcripts</Button>
        </div>
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
                        Revision {row.revision ?? 1} · Issued {formatDate(row.generated_at)}
                      </p>
                      {row.revocation_reason && <p className="mt-1 text-xs text-muted-foreground">{row.revocation_reason}</p>}
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
                        disabled={!!downloadingId || row.downloadable === false || ['REVOKED', 'SUPERSEDED'].includes(row.status)}
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
