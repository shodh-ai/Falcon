'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import {
  EXEMPTION_REASONS,
  exemptionStatusLabel,
  proofDocHref,
  reasonLabel,
  type AttendanceExemption,
} from '@/lib/attendance-policy';

const PROOF_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx';

function statusVariant(status: AttendanceExemption['status']) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  if (status === 'RECOMMENDED') return 'warning' as const;
  return 'secondary' as const;
}

type UploadResult = { url?: string; path?: string; key?: string };

/** Lets a student raise an attendance exemption when below the minimum attendance bar. */
export function StudentExemptionPanel({ canRequest }: { canRequest: boolean }) {
  const api = useAuthedApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AttendanceExemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('MEDICAL');
  const [description, setDescription] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AttendanceExemption[]>('/api/attendance-policy/exemptions/mine');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasOpen = rows.some((r) => r.status === 'PENDING_HOD' || r.status === 'RECOMMENDED');

  async function submit() {
    if (!description.trim()) {
      toast.error('Please describe your reason');
      return;
    }
    if (!proofFile) {
      toast.error('Upload supporting proof (medical certificate, internship letter, etc.)');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', proofFile);
      const uploaded = await api.post<UploadResult>('/api/uploads/single', formData);
      const proofUrl = uploaded.url ?? uploaded.path ?? uploaded.key;
      if (!proofUrl) {
        throw new Error('Proof upload did not return a file reference');
      }

      await api.post('/api/attendance-policy/exemptions', {
        reason_category: category,
        description: description.trim(),
        supporting_doc_url: proofUrl,
      });
      toast.success('Exemption request sent to your HOD');
      setDescription('');
      setProofFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loading && !canRequest && rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-sgvu-navy">Attendance exemption</p>
          <p className="text-xs text-muted-foreground">
            {canRequest
              ? 'Upload proof for your reason (medical, accident, internship, etc.). Your HOD reviews and approves; once approved you can generate your admit card.'
              : 'Your attendance exemption requests.'}
          </p>
        </div>
        {canRequest && !hasOpen ? (
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : 'Request exemption'}
          </Button>
        ) : null}
      </div>

      {open && canRequest && !hasOpen ? (
        <div className="space-y-2 border-t pt-3">
          <select
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {EXEMPTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            rows={3}
            placeholder="Explain your situation"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="space-y-1">
            <label className="text-xs font-medium text-sgvu-navy">
              Supporting proof <span className="text-destructive">*</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept={PROOF_ACCEPT}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">
              PDF, JPG, PNG, DOC, or DOCX — e.g. medical certificate or internship offer letter.
            </p>
            {proofFile ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {proofFile.name}
              </p>
            ) : null}
          </div>
          <Button size="sm" onClick={() => void submit()} disabled={submitting || !proofFile}>
            {submitting ? 'Submitting…' : 'Submit to HOD'}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      ) : rows.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          {rows.map((r) => (
            <div
              key={r.exemption_id}
              className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <span>
                  {reasonLabel(r.reason_category)} · {Math.round(Number(r.attendance_percent_at_request))}%
                </span>
                {r.supporting_doc_url ? (
                  <a
                    href={proofDocHref(r.supporting_doc_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-primary underline"
                  >
                    View uploaded proof
                  </a>
                ) : null}
              </div>
              <Badge variant={statusVariant(r.status)}>{exemptionStatusLabel(r.status)}</Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
