'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import type { StudentAssignmentRow } from '@/lib/api/lms';
import { formatDeadlineCountdown, postMultipart } from '@/lib/api/lms';
import { PdfDropzone } from './PdfDropzone';

type Props = {
  assignments: StudentAssignmentRow[];
  onSubmitted: () => void;
};

export function StudentAssignmentsTab({ assignments, onSubmitted }: Props) {
  const { token } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit(assignmentId: string, file: File) {
    if (!token) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await postMultipart(`/api/academics/assignments/${assignmentId}/submit`, token, form);
      toast.success('Assignment submitted');
      setActiveId(null);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setUploading(false);
    }
  }

  if (!assignments.length) {
    return <p className="text-sm text-muted-foreground">No digital assignments for this course.</p>;
  }

  const pending = assignments.filter((a) => a.status === 'PENDING');
  const done = assignments.filter((a) => a.status !== 'PENDING');

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Pending</h3>
          {pending.map((row) => {
            const expanded = activeId === row.assignment.assignment_id;
            const pastDue = new Date(row.assignment.due_date).getTime() < Date.now();
            return (
              <Card key={row.assignment.assignment_id}>
                <CardContent className="p-4">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() =>
                      setActiveId(expanded ? null : row.assignment.assignment_id)
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{row.assignment.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Max marks: {row.assignment.max_marks}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-amber-800">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDeadlineCountdown(row.assignment.due_date)}
                        </p>
                      </div>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                  </button>
                  {expanded && !pastDue && (
                    <div className="mt-4">
                      <PdfDropzone
                        disabled={uploading}
                        onFile={(file) => void submit(row.assignment.assignment_id, file)}
                      />
                    </div>
                  )}
                  {expanded && pastDue && (
                    <p className="mt-3 text-sm font-medium text-red-600">Deadline has passed.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Submitted & graded</h3>
          {done.map((row) => (
            <Card key={row.assignment.assignment_id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{row.assignment.title}</p>
                  {row.status === 'GRADED' && row.submission?.marks_awarded != null ? (
                    <p className="mt-1 text-sm font-semibold text-emerald-700">
                      Marks scored: {row.submission.marks_awarded}/{row.assignment.max_marks}
                    </p>
                  ) : row.submission ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Submitted {new Date(row.submission.submitted_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-red-600">Not submitted (overdue)</p>
                  )}
                </div>
                <Badge
                  variant={
                    row.status === 'GRADED'
                      ? 'default'
                      : row.status === 'SUBMITTED'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {row.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
