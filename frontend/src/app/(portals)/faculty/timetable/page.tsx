'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      toast.success('Request sent to HoD for approval. Students will be notified after approval.');
      setForm({ course_id: '', adjustment_type: 'EXTRA_CLASS', new_date: '', reason: '' });
      await loadAdjustments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Timetable & Extra Classes"
        description="Weekly L-T-P schedule. Request extra classes, cancellations, or substitutions (HoD approval + student alerts)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {schedule.map((s) => (
            <div key={s.timetable_id} className="rounded-xl border p-3 text-sm">
              <p className="font-semibold text-sgvu-navy">
                {DAYS[s.day_of_week]} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
              </p>
              <p>
                {s.course_code} — {s.course_name}
              </p>
              <p className="text-muted-foreground">Room {s.room ?? 'TBA'}</p>
            </div>
          ))}
          {schedule.length === 0 ? <p className="text-sm text-muted-foreground">No timetable rows assigned yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule extra / cancel / substitute</CardTitle>
        </CardHeader>
        <CardContent>
          {coursesError && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {coursesError}
            </p>
          )}
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submitAdjustment}>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
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
              className="rounded-md border bg-background px-3 py-2 text-sm"
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
            <Button
              type="submit"
              className="md:col-span-2"
              disabled={isSubmitting || courseOptions.length === 0}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit for HoD approval'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Pending Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingAdjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending adjustment requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Requested Date</th>
                    <th className="py-2 pr-3">Course</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">View</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingAdjustments.map((a) => (
                    <tr key={a.adjustment_id} className="border-b">
                      <td className="py-2 pr-3">
                        {a.new_date ? new Date(a.new_date).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-3">{a.course_code}</td>
                      <td className="py-2 pr-3">{a.adjustment_type.replace('_', ' ')}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{a.status}</Badge>
                      </td>
                      <td className="py-2">
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
        </CardContent>
      </Card>

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
    </div>
  );
}
