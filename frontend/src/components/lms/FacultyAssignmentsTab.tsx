'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ChevronRight, Plus, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPanel,
  FacultyEmptyState,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { AssignmentRosterRow, FacultyAssignment } from '@/lib/api/lms';
import { downloadWithAuth, postMultipart } from '@/lib/api/lms';

type Props = {
  courseId: string;
};

export function FacultyAssignmentsTab({ courseId }: Props) {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [assignments, setAssignments] = useState<FacultyAssignment[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<AssignmentRosterRow[]>([]);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [selectedMaxMarks, setSelectedMaxMarks] = useState(10);
  const [maxMarks, setMaxMarks] = useState('10');
  const [dueAt, setDueAt] = useState('');
  const [daTitle, setDaTitle] = useState('');
  const [refFile, setRefFile] = useState<File | null>(null);
  const [gradeMarks, setGradeMarks] = useState<Record<string, string>>({});

  function loadAssignments() {
    void api
      .get<FacultyAssignment[]>(`/api/academics/faculty/assignments?courseId=${courseId}`)
      .then(setAssignments);
  }

  useEffect(() => {
    loadAssignments();
  }, [api, courseId]);

  async function openRoster(assignmentId: string, title: string, maxMarks: number) {
    setSelectedId(assignmentId);
    setSelectedTitle(title);
    setSelectedMaxMarks(maxMarks);
    const data = await api.get<{ roster: AssignmentRosterRow[] }>(
      `/api/academics/faculty/assignments/${assignmentId}/roster`,
    );
    setRoster(data.roster);
    const marks: Record<string, string> = {};
    data.roster.forEach((r) => {
      if (r.marks_awarded) marks[r.submission_id ?? ''] = String(r.marks_awarded);
    });
    setGradeMarks(marks);
  }

  async function createDa(e: FormEvent) {
    e.preventDefault();
    if (!token || !daTitle.trim() || !dueAt) return;
    const form = new FormData();
    form.append('course_id', courseId);
    form.append('title', daTitle.trim());
    form.append('max_marks', maxMarks);
    form.append('due_date', new Date(dueAt).toISOString());
    if (refFile) form.append('file', refFile);
    try {
      await postMultipart('/api/academics/faculty/assignments', token, form);
      toast.success('Digital assignment created');
      setCreateOpen(false);
      setDaTitle('');
      setRefFile(null);
      loadAssignments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function gradeRow(submissionId: string, max: number) {
    const raw = gradeMarks[submissionId];
    if (raw === undefined || raw === '') {
      toast.error('Enter marks first');
      return;
    }
    try {
      await api.post(`/api/academics/faculty/submissions/${submissionId}/grade`, {
        marks_awarded: Number(raw),
      });
      toast.success('Marks saved');
      if (selectedId) void openRoster(selectedId, selectedTitle, selectedMaxMarks);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Grading failed');
    }
  }

  if (selectedId) {
    const submittedCount = roster.filter((r) => r.submitted).length;

    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedId(null)} className="gap-1.5">
          ← Back to assignments
        </Button>
        <FacultyPanel
          title={selectedTitle}
          description="Grade submissions and download student PDFs"
          count={submittedCount}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Marks</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((row) => (
                  <tr key={row.student_user_id} className="border-b border-border/40">
                    <td className="py-3 pr-4 font-medium text-sgvu-navy">{row.student_name}</td>
                    <td className="py-3 pr-4">
                      {row.submitted ? (
                        <Badge variant="secondary">{row.status}</Badge>
                      ) : (
                        <span className="font-medium text-red-600">Not submitted</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {row.submission_id ? (
                        <Input
                          type="number"
                          className="h-8 w-20"
                          min={0}
                          max={selectedMaxMarks}
                          value={gradeMarks[row.submission_id] ?? ''}
                          onChange={(e) =>
                            setGradeMarks((prev) => ({
                              ...prev,
                              [row.submission_id!]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3">
                      {row.submission_id && token ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void downloadWithAuth(
                                `/api/academics/faculty/submissions/${row.submission_id}/download`,
                                token,
                                `${row.student_name}-da.pdf`,
                              ).catch((e) => toast.error(String(e)))
                            }
                          >
                            Download PDF
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void gradeRow(row.submission_id!, selectedMaxMarks)}
                          >
                            Save marks
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FacultyPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Create DA
        </Button>
      </div>

      {assignments.length === 0 ? (
        <FacultyEmptyState
          title="No digital assignments yet"
          description="Create a DA to collect PDF submissions from enrolled students with a strict deadline."
        />
      ) : (
        <FacultyPanel
          title="Digital assignments"
          count={assignments.length}
          description="Click an assignment to view submissions and grade"
        >
          <div className="space-y-2">
            {assignments.map((a) => (
              <button
                key={a.assignment_id}
                type="button"
                onClick={() => void openRoster(a.assignment_id, a.title, a.max_marks)}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-4 text-left shadow-sm transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5 hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sgvu-navy">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Max {a.max_marks} marks · Due {new Date(a.due_date).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{a.submission_count ?? 0} submitted</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-sgvu-navy" />
                </div>
              </button>
            ))}
          </div>
        </FacultyPanel>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-5 py-4">
              <p className="text-sm font-bold text-sgvu-navy">Create digital assignment</p>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-sgvu-navy"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={createDa} className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  placeholder="e.g. DA-1: Thermodynamics"
                  value={daTitle}
                  onChange={(e) => setDaTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Max marks</label>
                <Input
                  type="number"
                  min={1}
                  placeholder="10"
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Strict deadline</label>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Question paper (optional)</label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">PDF only · Max 5MB</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit">Create</Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
