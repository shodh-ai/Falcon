'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';

type QueueItem = {
  session_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  semester: number;
  submitted_marks: number;
  entry_status: string;
};
type Review = {
  session_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  max_marks: number;
  input_hash: string;
  decision: 'APPROVED' | 'REJECTED' | null;
  marks: Array<{
    student_user_id: string;
    student_name: string;
    roll_number: string;
    marks_obtained: string;
    max_marks: string;
  }>;
};

export default function HodEndTermResultsPage() {
  const api = useAuthedApi();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setQueue(await api.get<QueueItem[]>('/api/hod/end-term-results'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load end-semester reviews');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function open(sessionId: string) {
    setBusy(true);
    try {
      setReview(await api.get<Review>(`/api/hod/end-term-results/${sessionId}`));
      setComment('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the mark sheet');
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (!review || busy) return;
    if (decision === 'REJECTED' && !comment.trim()) {
      toast.error('Explain why the marks are rejected');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/hod/end-term-results/${review.session_id}/decision`, {
        decision,
        expected_input_hash: review.input_hash,
        comment: comment.trim() || undefined,
      });
      toast.success(decision === 'APPROVED'
        ? 'Approved for Exam Cell release. Students cannot see these marks yet.'
        : 'Rejected. Exam Cell must reopen entry for correction.');
      await open(review.session_id);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Review failed; refresh the mark sheet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader title="End-semester marks review" description="Check the submitted mark sheet for your department. Your approval sends it to Exam Cell; it does not publish to students." />
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader><CardTitle>Department mark sheets</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p>Loading…</p> : queue.length === 0 ? <p>No submitted end-semester marks in your department.</p> : queue.map((item) => (
              <button key={item.session_id} type="button" className="w-full rounded-lg border p-3 text-left hover:bg-muted" onClick={() => void open(item.session_id)}>
                <span className="block font-medium">{item.course_code} · {item.exam_type}</span>
                <span className="block text-sm text-muted-foreground">{item.course_name} · Semester {item.semester} · {item.submitted_marks} submitted</span>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{review ? `${review.course_code} · submitted mark sheet` : 'Select a course'}</CardTitle></CardHeader>
          <CardContent>
            {!review ? <p className="text-sm text-muted-foreground">Only courses owned by your department appear here.</p> : (
              <div className="space-y-4">
                <p className="text-sm">Maximum: {review.max_marks} · Students: {review.marks.length} · Current decision: {review.decision ?? 'Pending'}</p>
                <div className="max-h-[30rem] overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted"><th className="p-2 text-left">Roll number</th><th className="p-2 text-left">Student</th><th className="p-2 text-right">Marks</th></tr></thead>
                    <tbody>{review.marks.map((mark) => (
                      <tr key={mark.student_user_id} className="border-b"><td className="p-2">{mark.roll_number}</td><td className="p-2">{mark.student_name}</td><td className="p-2 text-right">{mark.marks_obtained}/{mark.max_marks}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <label className="block text-sm">Review comment
                  <textarea className="mt-1 w-full rounded-lg border p-2" rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Required if rejecting" />
                </label>
                <div className="flex gap-2">
                  <Button disabled={busy || review.marks.length === 0 || review.decision === 'APPROVED'} onClick={() => void decide('APPROVED')}>Approve for Exam Cell</Button>
                  <Button variant="outline" disabled={busy || review.marks.length === 0} onClick={() => void decide('REJECTED')}>Reject for correction</Button>
                  <Button variant="outline" disabled={busy} onClick={() => void open(review.session_id)}>Refresh</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </HodPageFrame>
  );
}
