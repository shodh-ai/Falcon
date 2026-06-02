'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
          ← Back to assignments
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedTitle} — Submissions</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Marks</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((row) => (
                  <tr key={row.student_user_id} className="border-b">
                    <td className="py-3 pr-4 font-medium">{row.student_name}</td>
                    <td className="py-3 pr-4">
                      {row.submitted ? (
                        <Badge variant="secondary">{row.status}</Badge>
                      ) : (
                        <span className="font-medium text-red-600">Not Submitted</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {row.submission_id ? (
                        <Input
                          type="number"
                          className="h-8 w-20"
                          min={0}
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setCreateOpen(true)}>+ Create DA</Button>

      {assignments.map((a) => (
        <Card
          key={a.assignment_id}
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => void openRoster(a.assignment_id, a.title, a.max_marks)}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">
                Max {a.max_marks} marks · Due {new Date(a.due_date).toLocaleString()}
              </p>
            </div>
            <Badge variant="outline">{a.submission_count ?? 0} submitted</Badge>
          </CardContent>
        </Card>
      ))}

      {!assignments.length && (
        <p className="text-sm text-muted-foreground">No digital assignments for this course yet.</p>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Create digital assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createDa} className="space-y-3">
                <Input
                  placeholder="Title (e.g. DA-1: Thermodynamics)"
                  value={daTitle}
                  onChange={(e) => setDaTitle(e.target.value)}
                  required
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Max marks"
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(e.target.value)}
                  required
                />
                <label className="block text-sm">
                  Strict deadline
                  <Input
                    type="datetime-local"
                    className="mt-1"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    required
                  />
                </label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Optional question paper PDF (max 5MB)</p>
                <div className="flex gap-2">
                  <Button type="submit">Create</Button>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
