'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Clock, CheckCircle2, AlertTriangle, Download, Eye, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import type { StudentAssignmentRow } from '@/lib/api/lms';
import { formatDeadlineCountdown, postMultipart, downloadWithAuth, getBlobUrlWithAuth } from '@/lib/api/lms';
import { AssignmentFileDropzone } from './AssignmentFileDropzone';

type Props = {
  assignments: StudentAssignmentRow[];
  onSubmitted: () => void;
};
const isPdf = (extension?: string | null) => !extension || extension.toLowerCase() === '.pdf';

export function StudentAssignmentsTab({ assignments, onSubmitted }: Props) {
  const { token } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});
  const [dropzoneKeys, setDropzoneKeys] = useState<Record<string, number>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewKind, setPreviewKind] = useState<'reference' | 'submission'>('reference');
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const previewRequest = useRef(0);

  useEffect(() => () => { previewRequest.current += 1; }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function handlePreview(assignmentId: string, title: string, kind: 'reference' | 'submission' = 'reference') {
    if (!token) {
      toast.error('Please sign in to preview this PDF');
      return;
    }
    const request = ++previewRequest.current;
    setPreviewLoading(`${kind}:${assignmentId}`);
    try {
      const route = kind === 'submission' ? 'submission/download' : 'download';
      const url = await getBlobUrlWithAuth(`/api/academics/student/assignments/${assignmentId}/${route}`, token);
      if (request !== previewRequest.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setPreviewKind(kind);
      setPreviewTitle(`${title} - ${kind === 'submission' ? 'Your Submission' : 'Question Paper'}`);
      setPreviewUrl(url);
    } catch {
      if (request === previewRequest.current)
        toast.error(kind === 'submission' ? 'Could not preview your submission. Please try again.' : 'Failed to load PDF preview');
    } finally {
      if (request === previewRequest.current) setPreviewLoading(null);
    }
  }

  function renderSubmissionPreview(row: StudentAssignmentRow) {
    if (!row.submission) return null;
    if (!isPdf(row.submission.file_extension)) return (
      <Button type="button" variant="outline" className="w-full sm:w-auto"
        onClick={() => token && void downloadWithAuth(
          `/api/academics/student/assignments/${row.assignment.assignment_id}/submission/download`,
          token, `${row.assignment.title}_Submission`,
        ).catch(() => toast.error('Could not download your submission'))}>
        <Download className="h-4 w-4" aria-hidden="true" />
        Download submission
      </Button>
    );
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={previewLoading !== null}
        onClick={() => void handlePreview(row.assignment.assignment_id, row.assignment.title, 'submission')}
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        {previewLoading === `submission:${row.assignment.assignment_id}` ? 'Loading preview…' : 'Preview Submission'}
      </Button>
    );
  }

  function clearSelectedFile(assignmentId: string) {
    setSelectedFiles((prev) => {
      const next = { ...prev };
      delete next[assignmentId];
      return next;
    });
    setDropzoneKeys((prev) => ({
      ...prev,
      [assignmentId]: (prev[assignmentId] ?? 0) + 1,
    }));
  }

  function toggleAssignment(assignmentId: string, expanded: boolean) {
    if (expanded) {
      clearSelectedFile(assignmentId);
    }
    setActiveId(expanded ? null : assignmentId);
  }

  async function submit(assignmentId: string) {
    const file = selectedFiles[assignmentId];
    if (!token || !file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await postMultipart(`/api/academics/assignments/${assignmentId}/submit`, token, form);
      toast.success('Assignment submitted');
      clearSelectedFile(assignmentId);
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
          {pending.map((row) => {
            const expanded = activeId === row.assignment.assignment_id;
            const uploadPanelId = `assignment-upload-${row.assignment.assignment_id}`;
            const uploadRestrictionId = `${uploadPanelId}-restriction`;
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
                <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={uploadPanelId}
                    className="min-w-0 w-full text-left"
                    onClick={() => toggleAssignment(row.assignment.assignment_id, expanded)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-medium">{row.assignment.title}</p>
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
                          <p className="mt-2 break-words text-sm text-muted-foreground">
                            Faculty note: {row.submission.faculty_remarks}
                          </p>
                        )}
                      </div>
                      {returned ? <Badge variant="destructive" className="shrink-0">Return for revision</Badge> : null}
                    </div>
                  </button>
                  <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:max-w-xs sm:items-end">
                    {renderSubmissionPreview(row)}
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={!canUpload || uploading}
                      aria-expanded={expanded}
                      aria-controls={uploadPanelId}
                      aria-describedby={!canUpload ? uploadRestrictionId : undefined}
                      onClick={() => setActiveId(row.assignment.assignment_id)}
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {returned ? 'Re-upload Assignment' : 'Upload Assignment'}
                    </Button>
                    {!canUpload ? (
                      <p id={uploadRestrictionId} className="text-sm font-medium text-red-600">
                        {returned ? 'The re-upload window is closed.' : 'Deadline has passed for uploading solutions.'}
                      </p>
                    ) : null}
                  </div>
                  {expanded && (
                    <div id={uploadPanelId} className="min-w-0 space-y-4 border-t pt-4 sm:col-span-2">
                      {row.assignment.has_reference_file && (
                        <div>
                          <p className="mb-2 text-sm font-medium text-sgvu-navy">Question Paper</p>
                          <div className="flex gap-2">
                            {isPdf(row.assignment.reference_file_extension) && <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              disabled={previewLoading !== null}
                              onClick={() => handlePreview(row.assignment.assignment_id, row.assignment.title)}
                            >
                              <Eye className="h-4 w-4" />
                              View PDF
                            </Button>}
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => {
                                if (!token) {
                                  toast.error('Please sign in to download the question paper');
                                  return;
                                }

                                void downloadWithAuth(
                                  `/api/academics/student/assignments/${row.assignment.assignment_id}/download`,
                                  token,
                                  `${row.assignment.title}_Question_Paper`
                                ).catch(() => toast.error('Failed to download assignment attachment'));
                              }}
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
                            {returned ? 'Check and Re-Upload' : 'Upload solution file'}
                          </p>
                          <AssignmentFileDropzone
                            key={dropzoneKeys[row.assignment.assignment_id] ?? 0}
                            disabled={uploading}
                            onFile={(file) =>
                              setSelectedFiles((prev) => ({
                                ...prev,
                                [row.assignment.assignment_id]: file,
                              }))
                            }
                          />
                          {selectedFiles[row.assignment.assignment_id] && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                disabled={uploading}
                                onClick={() => void submit(row.assignment.assignment_id)}
                              >
                                {uploading ? 'Submitting…' : 'Submit assignment'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={uploading}
                                onClick={() => clearSelectedFile(row.assignment.assignment_id)}
                              >
                                Clear file
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Review your file, then click Submit.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : null}
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{row.assignment.title}</p>
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
                  <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
                    {row.status !== 'GRADED' && (row.status !== 'SUBMITTED' || !row.submission) ? (
                      <Badge
                        variant={
                          row.status === 'SUBMITTED' ? 'secondary' : 'outline'
                        }
                      >
                        {row.status}
                      </Badge>
                    ) : null}
                    {renderSubmissionPreview(row)}
                  </div>
                </div>
                {row.assignment.has_reference_file && (
                  <div className="mt-3 flex gap-2 border-t pt-3">
                    {isPdf(row.assignment.reference_file_extension) && <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={previewLoading !== null}
                      onClick={() => handlePreview(row.assignment.assignment_id, row.assignment.title)}
                    >
                      <Eye className="h-4 w-4" />
                      View PDF
                    </Button>}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        token &&
                        downloadWithAuth(
                          `/api/academics/student/assignments/${row.assignment.assignment_id}/download`,
                          token,
                          `${row.assignment.title}_Question_Paper`
                        ).catch(() => toast.error('Failed to download assignment attachment'))
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
          previewRequest.current += 1;
          setPreviewLoading(null);
          setPreviewUrl(null);
        }
      }}>
        <DialogContent className="flex h-[85dvh] min-h-0 max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14 text-left">
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>
              {previewKind === 'submission' ? 'Your uploaded assignment PDF. Previewing does not change your submission.' : 'Faculty question paper or assignment reference PDF.'}
            </DialogDescription>
            {previewUrl ? <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-sgvu-navy underline">Open PDF in new tab</a> : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-muted/50 p-4">
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full rounded-md border bg-white"
                title={previewKind === 'submission' ? 'Submitted assignment PDF' : 'PDF Preview'}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
