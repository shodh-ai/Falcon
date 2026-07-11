'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Clock, CheckCircle2, AlertTriangle, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import type { StudentAssignmentRow } from '@/lib/api/lms';
import { formatDeadlineCountdown, postMultipart, downloadWithAuth, getBlobUrlWithAuth } from '@/lib/api/lms';
import { PdfDropzone } from './PdfDropzone';

type Props = {
  assignments: StudentAssignmentRow[];
  onSubmitted: () => void;
};

export function StudentAssignmentsTab({ assignments, onSubmitted }: Props) {
  const { token } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  async function handlePreview(assignmentId: string, title: string) {
    if (!token) return;
    try {
      const url = await getBlobUrlWithAuth(`/api/academics/student/assignments/${assignmentId}/download`, token);
      setPreviewTitle(`${title} - Question Paper`);
      setPreviewUrl(url);
    } catch (err) {
      toast.error('Failed to load PDF preview');
    }
  }

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

  const pending = assignments.filter(
    (a) => a.status === 'PENDING' || a.status === 'RETURNED_FOR_REVISION',
  );
  const done = assignments.filter(
    (a) => a.status !== 'PENDING' && a.status !== 'RETURNED_FOR_REVISION',
  );

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Pending</h3>
          {pending.map((row) => {
            const expanded = activeId === row.assignment.assignment_id;
            const returned = row.status === 'RETURNED_FOR_REVISION';
            const pastDue =
              !returned && new Date(row.assignment.due_date).getTime() < Date.now();
            const canUpload = returned ? row.can_resubmit : !pastDue;
            const revisionLabel =
              row.submission?.revision_due_at
                ? formatDeadlineCountdown(row.submission.revision_due_at)
                : null;

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
                        {returned ? (
                          <p className="mt-1 flex items-center gap-1 text-sm text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Returned for revision — {revisionLabel ?? 're-upload window open'}
                          </p>
                        ) : (
                          <p className="mt-1 flex items-center gap-1 text-sm text-amber-800">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDeadlineCountdown(row.assignment.due_date)}
                          </p>
                        )}
                        {returned && row.submission?.faculty_remarks && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Faculty note: {row.submission.faculty_remarks}
                          </p>
                        )}
                      </div>
                      <Badge variant={returned ? 'destructive' : 'secondary'}>
                        {returned ? 'Return for revision' : 'Pending'}
                      </Badge>
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-4 space-y-4">
                      {row.assignment.has_reference_file && (
                        <div>
                          <p className="mb-2 text-sm font-medium text-sgvu-navy">Question Paper</p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => handlePreview(row.assignment.assignment_id, row.assignment.title)}
                            >
                              <Eye className="h-4 w-4" />
                              View PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() =>
                                token &&
                                downloadWithAuth(
                                  `/api/academics/student/assignments/${row.assignment.assignment_id}/download`,
                                  token,
                                  `${row.assignment.title}_Question_Paper.pdf`
                                ).catch((err) => toast.error('Failed to download PDF'))
                              }
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {canUpload ? (
                        <div>
                          <p className="mb-2 text-sm font-medium text-sgvu-navy">
                            {returned ? 'Check and Re-Upload' : 'Upload Solution PDF'}
                          </p>
                          <PdfDropzone
                            disabled={uploading}
                            onFile={(file) => void submit(row.assignment.assignment_id, file)}
                          />
                        </div>
                      ) : (
                        <p className="mt-3 text-sm font-medium text-red-600">Deadline has passed for uploading solutions.</p>
                      )}
                    </div>
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
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
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
                </div>
                {row.assignment.has_reference_file && (
                  <div className="mt-3 flex gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handlePreview(row.assignment.assignment_id, row.assignment.title)}
                    >
                      <Eye className="h-4 w-4" />
                      View PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        token &&
                        downloadWithAuth(
                          `/api/academics/student/assignments/${row.assignment.assignment_id}/download`,
                          token,
                          `${row.assignment.title}_Question_Paper.pdf`
                        ).catch((err) => toast.error('Failed to download PDF'))
                      }
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Dialog open={!!previewUrl} onOpenChange={(open) => {
        if (!open) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }
      }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 bg-muted/50 p-4">
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full rounded-md border bg-white"
                title="PDF Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
