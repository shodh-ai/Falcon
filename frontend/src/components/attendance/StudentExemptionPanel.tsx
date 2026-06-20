'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import {
  EXEMPTION_REASONS,
  exemptionStatusLabel,
  reasonLabel,
  type AttendanceExemption,
} from '@/lib/attendance-policy';

function statusVariant(status: AttendanceExemption['status']) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  if (status === 'RECOMMENDED') return 'warning' as const;
  return 'secondary' as const;
}

/** Lets a student raise an attendance exemption (medical/accident/internship) when blocked. */
export function StudentExemptionPanel() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AttendanceExemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('MEDICAL');
  const [description, setDescription] = useState('');
  const [docUrl, setDocUrl] = useState('');
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
    setSubmitting(true);
    try {
      await api.post('/api/attendance-policy/exemptions', {
        reason_category: category,
        description: description.trim(),
        supporting_doc_url: docUrl.trim() || undefined,
      });
      toast.success('Exemption request sent to your HOD');
      setDescription('');
      setDocUrl('');
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-sgvu-navy">Attendance exemption</p>
          <p className="text-xs text-muted-foreground">
            Low attendance for a genuine reason (medical, accident, internship)? Request an exemption — HOD recommends and Dean / Exam Cell approves.
          </p>
        </div>
        {!hasOpen ? (
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : 'Request exemption'}
          </Button>
        ) : null}
      </div>

      {open && !hasOpen ? (
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
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="Supporting document URL (optional)"
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
          />
          <Button size="sm" onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit request'}
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
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
            >
              <span>
                {reasonLabel(r.reason_category)} · {Math.round(Number(r.attendance_percent_at_request))}%
              </span>
              <Badge variant={statusVariant(r.status)}>{exemptionStatusLabel(r.status)}</Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
