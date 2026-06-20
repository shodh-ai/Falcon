'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';

type DemeritIncident = {
  incident_id: string;
  student_name: string;
  enrollment_number: string | null;
  faculty_name: string;
  department_name: string | null;
  course_code: string;
  course_name: string;
  category: string;
  points: number;
  description: string;
  evidence_urls: string[];
  current_demerit_points: number;
  projected_demerit_points: number;
  threshold_warning: boolean;
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  PLAGIARISM: 'Plagiarism',
  BEHAVIORAL: 'Behavioral',
  ATTENDANCE: 'Attendance',
  EXAM_MALPRACTICE: 'Exam Malpractice',
};

export default function DisciplinaryCommitteeQueuePage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<DemeritIncident[]>([]);
  const [selected, setSelected] = useState<DemeritIncident | null>(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshQueue = useCallback(async () => {
    const pending = await api.get<DemeritIncident[]>('/api/demerits/pending');
    setRows(pending ?? []);
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = await api.get<DemeritIncident[]>('/api/demerits/pending');
        if (!cancelled) setRows(pending ?? []);
      } catch {
        if (!cancelled) toast.error('Could not load disciplinary queue');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function review(status: 'APPROVED_BY_DC' | 'REJECTED_BY_DC') {
    if (!selected) return;
    if (remarks.trim().length < 5) {
      toast.error('Enter DC committee remarks (minimum 5 characters)');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/demerits/review/${selected.incident_id}`, {
        status,
        dc_committee_remarks: remarks.trim(),
      });
      toast.success(status === 'APPROVED_BY_DC' ? 'Demerit approved' : 'Case dismissed');
      setSelected(null);
      setRemarks('');
      await refreshQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Disciplinary Committee</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Disciplinary Queue</h1>
        <p className="text-sm text-muted-foreground">
          Pending faculty incident reports awaiting DC verification and decision.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rows.length} pending incident(s)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No incidents awaiting review.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">Faculty</th>
                  <th className="px-3 py-2 text-left">Student</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-right">Points</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.incident_id} className="border-t">
                    <td className="px-3 py-2">{row.faculty_name}</td>
                    <td className="px-3 py-2">{row.student_name}</td>
                    <td className="px-3 py-2">{row.department_name ?? '—'}</td>
                    <td className="px-3 py-2">{row.course_code}</td>
                    <td className="px-3 py-2 text-right font-medium">{row.points}</td>
                    <td className="px-3 py-2">{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => { setSelected(row); setRemarks(''); }}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.student_name} · {selected.course_code}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{CATEGORY_LABELS[selected.category] ?? selected.category}</Badge>
                  <Badge>{selected.points} point(s) requested</Badge>
                  {selected.threshold_warning ? (
                    <Badge variant="destructive">Approval will trigger Subject Back</Badge>
                  ) : null}
                </div>
                <p>
                  <span className="font-medium">Submitted by:</span> {selected.faculty_name}
                </p>
                <p>
                  <span className="font-medium">Subject:</span> {selected.course_name}
                </p>
                <p>{selected.description}</p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p>
                    Current demerit total: <strong>{selected.current_demerit_points}</strong>
                  </p>
                  <p>
                    If approved: <strong>{selected.projected_demerit_points}</strong>
                  </p>
                </div>
                {selected.evidence_urls?.length ? (
                  <div>
                    <p className="mb-2 font-medium">Evidence</p>
                    <ul className="space-y-1">
                      {selected.evidence_urls.map((url) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noreferrer" className="text-sgvu-navy underline">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No evidence files attached.</p>
                )}
                {selected.threshold_warning ? (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Approving this case will reach 6 cumulative points and automatically apply Subject Back.</p>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    DC Committee Remarks (required)
                  </label>
                  <Input
                    placeholder="Official decision summary"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => void review('REJECTED_BY_DC')}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject & Dismiss Case
                  </Button>
                  <Button
                    disabled={busy}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => void review('APPROVED_BY_DC')}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Approve Demerit
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
