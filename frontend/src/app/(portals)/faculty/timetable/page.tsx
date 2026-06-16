'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
  FacultyEmptyState,
} from '@/components/faculty';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type TimetableRow = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
};

type Adjustment = {
  adjustment_id: string;
  adjustment_type: string;
  status: string;
  course_code: string;
  course_name: string;
  original_date: string | null;
  new_date: string | null;
  reason: string | null;
};

export default function FacultyTimetablePage() {
  const api = useAuthedApi();
  const { courses, loading: coursesLoading, error: coursesError } = useFacultyCourses();
  const [schedule, setSchedule] = useState<TimetableRow[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [form, setForm] = useState({
    course_id: '',
    adjustment_type: 'EXTRA_CLASS',
    new_date: '',
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewAdjustment, setViewAdjustment] = useState<Adjustment | null>(null);

  async function loadAdjustments() {
    setAdjustments(await api.get<Adjustment[]>('/api/academics/faculty/workspaces/adjustments'));
  }

  useEffect(() => {
    void api.get<TimetableRow[]>('/api/academics/faculty/workspaces/timetable').then(setSchedule);
    void loadAdjustments();
  }, [api]);

  const pendingAdjustments = useMemo(
    () => adjustments.filter((a) => a.status.includes('PENDING')),
    [adjustments],
  );

  const courseOptions = useMemo(() => courses, [courses]);

  async function submitAdjustment(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/api/academics/faculty/workspaces/adjustments', form);
      toast.success(
        'Schedule change submitted',
        {
          description:
            'Your request was sent to the HoD for approval. Students will be notified automatically once it is approved.',
        },
      );
      setForm({ course_id: '', adjustment_type: 'EXTRA_CLASS', new_date: '', reason: '' });
      await loadAdjustments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      if (/pending request|pending schedule change/i.test(message)) {
        toast.warning('You already have a pending request', {
          description:
            'This course already has a schedule change waiting for HoD approval. Check "My pending requests" below — you can submit a new request after it is approved or rejected.',
          category: 'ACADEMICS',
          actionLabel: 'View pending requests',
          onAction: () => {
            document.getElementById('falcon-pending-requests')?.scrollIntoView({ behavior: 'smooth' });
          },
        });
      } else {
        toast.error(message, { category: 'ACADEMICS' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Timetable & Extra Classes"
        description="Weekly L-T-P schedule. Request extra classes, cancellations, or substitutions (HoD approval + student alerts)."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <FacultyPanel title="Weekly schedule" count={schedule.length}>
          {schedule.length === 0 ? (
            <FacultyEmptyState description="No timetable rows assigned yet." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {schedule.map((s) => (
                <div
                  key={s.timetable_id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
                >
                  <p className="font-semibold text-sgvu-navy">
                    {DAYS[s.day_of_week]} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                  </p>
                  <p className="mt-0.5 font-medium">{s.course_code}</p>
                  <p className="text-muted-foreground">{s.course_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Room {s.room ?? 'TBA'}</p>
                </div>
              ))}
            </div>
          )}
        </FacultyPanel>

        <FacultyPanel title="Schedule change request" description="Extra class, cancel, or substitute">
          {coursesError && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {coursesError}
            </p>
          )}
          <form className="grid gap-3" onSubmit={submitAdjustment}>
            <select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              required
              disabled={coursesLoading || courseOptions.length === 0}
            >
              <option value="">{coursesLoading ? 'Loading courses…' : 'Select course'}</option>
              {courseOptions.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code} — {c.course_name}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.adjustment_type}
              onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}
            >
              <option value="EXTRA_CLASS">Extra class</option>
              <option value="CANCEL">Cancel class</option>
              <option value="SUBSTITUTE">Substitute</option>
            </select>
            <Input
              type="datetime-local"
              value={form.new_date}
              onChange={(e) => setForm({ ...form, new_date: e.target.value })}
            />
            <Input
              placeholder="Reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <Button type="submit" disabled={isSubmitting || courseOptions.length === 0}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit for HoD approval'}
            </Button>
          </form>
        </FacultyPanel>
      </div>

      <FacultyPanel id="falcon-pending-requests" title="My pending requests" count={pendingAdjustments.length}>
        {pendingAdjustments.length === 0 ? (
          <FacultyEmptyState description="No pending adjustment requests." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Requested date</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">View</th>
                </tr>
              </thead>
              <tbody>
                {pendingAdjustments.map((a) => (
                  <tr key={a.adjustment_id} className="border-b border-border/40">
                    <td className="px-3 py-2.5">
                      {a.new_date ? new Date(a.new_date).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{a.course_code}</td>
                    <td className="px-3 py-2.5">{a.adjustment_type.replace('_', ' ')}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline">{a.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Button size="sm" variant="ghost" onClick={() => setViewAdjustment(a)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FacultyPanel>

      <Dialog open={!!viewAdjustment} onOpenChange={(open) => !open && setViewAdjustment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request details</DialogTitle>
          </DialogHeader>
          {viewAdjustment && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Course:</span> {viewAdjustment.course_code} — {viewAdjustment.course_name}</p>
              <p><span className="font-medium">Type:</span> {viewAdjustment.adjustment_type.replace('_', ' ')}</p>
              <p><span className="font-medium">Status:</span> {viewAdjustment.status}</p>
              <p><span className="font-medium">Original date:</span> {viewAdjustment.original_date ? new Date(viewAdjustment.original_date).toLocaleString() : '—'}</p>
              <p><span className="font-medium">Requested date:</span> {viewAdjustment.new_date ? new Date(viewAdjustment.new_date).toLocaleString() : '—'}</p>
              <p><span className="font-medium">Reason:</span> {viewAdjustment.reason ?? '—'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
