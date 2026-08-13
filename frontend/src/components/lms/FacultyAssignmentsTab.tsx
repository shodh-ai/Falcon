'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ChevronRight, Edit3, Plus, X } from 'lucide-react';
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
import { downloadWithAuth, patchMultipart, postMultipart } from '@/lib/api/lms';
import {
  isEmptyArray,
  isFacultyDemoEntityId,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import {
  facultyDemoAssignments,
  getFacultyPortalDemoPack,
  studentsForCourse,
} from '@/lib/mock/faculty-portal-demo';

type Props = {
  courseId: string;
};

function buildDemoAssignmentRoster(
  assignmentId: string,
  courseId: string,
  maxMarks: number,
): AssignmentRosterRow[] {
  const pack = getFacultyPortalDemoPack();
  const subs = pack.submissions.filter((s) => s.assignment_id === assignmentId);
  if (subs.length > 0) {
    return subs.map((s) => ({
      student_user_id: s.student_id,
      student_name: s.student_name,
      submitted: s.status !== 'PENDING',
      submission_id: s.submission_id,
      marks_awarded: s.marks != null ? String(s.marks) : null,
      status:
        s.status === 'GRADED'
          ? 'GRADED'
          : s.status === 'RETURNED'
            ? 'RETURNED_FOR_REVISION'
            : s.status === 'PENDING'
              ? 'NOT_SUBMITTED'
              : 'SUBMITTED',
      faculty_remarks: s.feedback,
    }));
  }
  return studentsForCourse(courseId)
    .slice(0, 24)
    .map((s, i) => ({
      student_user_id: s.user_id,
      student_name: s.name,
      submitted: i % 5 !== 0,
      submission_id: i % 5 !== 0 ? `demo-sub-${assignmentId}-${i}` : null,
      marks_awarded: i % 5 !== 0 ? String(Math.round((s.assignment_score / 100) * maxMarks)) : null,
      status: i % 5 === 0 ? 'NOT_SUBMITTED' : i % 3 === 0 ? 'GRADED' : 'SUBMITTED',
    }));
}

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
  const [publishAt, setPublishAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [daTitle, setDaTitle] = useState('');
  const [daDescription, setDaDescription] = useState('');
  const [semester, setSemester] = useState('');
  const [sectionCode, setSectionCode] = useState('');
  const [refFile, setRefFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<FacultyAssignment | null>(null);
  const [editStartAt, setEditStartAt] = useState('');
  const [editDueAt, setEditDueAt] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [gradeMarks, setGradeMarks] = useState<Record<string, string>>({});
  const [returnRemarks, setReturnRemarks] = useState<Record<string, string>>({});
  const [returningId, setReturningId] = useState<string | null>(null);

  function loadAssignments() {
    void api
      .get<FacultyAssignment[]>(`/api/academics/faculty/assignments?courseId=${courseId}`)
      .then((rows) =>
        setAssignments(
          withFacultyDemoFallback(
            rows,
            facultyDemoAssignments(courseId) as unknown as FacultyAssignment[],
            isEmptyArray,
          ),
        ),
      )
      .catch(() =>
        setAssignments(
          withFacultyDemoFallback(
            [],
            facultyDemoAssignments(courseId) as unknown as FacultyAssignment[],
            isEmptyArray,
          ),
        ),
      );
  }

  useEffect(() => {
    loadAssignments();
  }, [api, courseId]);

  async function openRoster(assignmentId: string, title: string, maxMarks: number) {
    setSelectedId(assignmentId);
    setSelectedTitle(title);
    setSelectedMaxMarks(maxMarks);
    try {
      const data = await api.get<{ roster: AssignmentRosterRow[] }>(
        `/api/academics/faculty/assignments/${assignmentId}/roster`,
      );
      const demoRoster = buildDemoAssignmentRoster(assignmentId, courseId, maxMarks);
      const rosterResolved = withFacultyDemoFallback(data.roster, demoRoster, isEmptyArray);
      setRoster(rosterResolved);
      const marks: Record<string, string> = {};
      rosterResolved.forEach((r) => {
        if (r.marks_awarded) marks[r.submission_id ?? ''] = String(r.marks_awarded);
      });
      setGradeMarks(marks);
    } catch {
      const demoRoster = buildDemoAssignmentRoster(assignmentId, courseId, maxMarks);
      setRoster(withFacultyDemoFallback([], demoRoster, isEmptyArray));
      const marks: Record<string, string> = {};
      demoRoster.forEach((r) => {
        if (r.marks_awarded) marks[r.submission_id ?? ''] = String(r.marks_awarded);
      });
      setGradeMarks(marks);
    }
  }

  async function createDa(e: FormEvent) {
    e.preventDefault();
    if (!token || !daTitle.trim() || !dueAt) return;
    if (isFacultyDemoEntityId(courseId)) {
      toast.success('Assignment published successfully (demo)');
      setCreateOpen(false);
      setDaTitle('');
      setDaDescription('');
      setSemester('');
      setSectionCode('');
      setPublishAt('');
      setDueAt('');
      setRefFile(null);
      return;
    }
    const form = new FormData();
    form.append('course_id', courseId);
    form.append('title', daTitle.trim());
    if (daDescription.trim()) form.append('description', daDescription.trim());
    form.append('max_marks', maxMarks);
    form.append('start_date', publishAt ? new Date(publishAt).toISOString() : new Date().toISOString());
    form.append('due_date', new Date(dueAt).toISOString());
    if (semester.trim()) form.append('semester', semester.trim());
    if (sectionCode.trim()) form.append('section_code', sectionCode.trim().toUpperCase());
    if (refFile) form.append('file', refFile);
    try {
      const created = (await postMultipart(
        '/api/academics/faculty/assignments',
        token,
        form,
      )) as { notified_count?: number } | null;
      const notified = Number(created?.notified_count ?? 0);
      const publishImmediate = !publishAt || new Date(publishAt).getTime() <= Date.now();
      if (publishImmediate) {
        toast.success(
          `Assignment published successfully. Notifications sent to ${notified} student${notified === 1 ? '' : 's'}.`,
        );
      } else {
        toast.success(
          'Assignment scheduled. Students will be notified when it becomes visible.',
        );
      }
      setCreateOpen(false);
      setDaTitle('');
      setDaDescription('');
      setSemester('');
      setSectionCode('');
      setPublishAt('');
      setDueAt('');
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
    if (isFacultyDemoSmokeId(submissionId)) {
      toast.success('Marks saved (demo)');
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

  async function returnRow(submissionId: string) {
    const remarks = returnRemarks[submissionId]?.trim();
    if (!remarks) {
      toast.error('Enter remarks explaining what the student must fix');
      return;
    }
    if (isFacultyDemoSmokeId(submissionId)) {
      toast.success('Returned to student for revision (demo)');
      return;
    }
    setReturningId(submissionId);
    try {
      await api.post(`/api/academics/faculty/submissions/${submissionId}/return`, {
        faculty_remarks: remarks,
        revision_days: 3,
      });
      toast.success('Returned to student for revision');
      if (selectedId) void openRoster(selectedId, selectedTitle, selectedMaxMarks);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Return failed');
    } finally {
      setReturningId(null);
    }
  }

  function toDateTimeLocal(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  function openEdit(assignment: FacultyAssignment) {
    setEditing(assignment);
    setEditStartAt(toDateTimeLocal(assignment.start_date));
    setEditDueAt(toDateTimeLocal(assignment.due_date));
    setEditFile(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editing) return;
    if (isFacultyDemoSmokeId(editing.assignment_id)) {
      toast.success('Assignment updated (demo)');
      setEditing(null);
      return;
    }
    const form = new FormData();
    form.append('start_date', new Date(editStartAt).toISOString());
    form.append('due_date', new Date(editDueAt).toISOString());
    if (editFile) form.append('file', editFile);
    try {
      await patchMultipart(`/api/academics/faculty/assignments/${editing.assignment_id}`, token, form);
      toast.success('Assignment updated');
      setEditing(null);
      loadAssignments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  const now = Date.now();
  const scheduledAssignments = assignments.filter((a) => new Date(a.start_date).getTime() > now);
  const activeAssignments = assignments.filter(
    (a) => new Date(a.start_date).getTime() <= now && new Date(a.due_date).getTime() >= now,
  );
  const closedAssignments = assignments.filter((a) => new Date(a.due_date).getTime() < now);

  function AssignmentSection({
    title,
    description,
    rows,
  }: {
    title: string;
    description: string;
    rows: FacultyAssignment[];
  }) {
    return (
      <FacultyPanel title={title} count={rows.length} description={description}>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments in this section.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((a) => (
              <div
                key={a.assignment_id}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-4 text-left shadow-sm transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => void openRoster(a.assignment_id, a.title, a.max_marks)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-semibold text-sgvu-navy">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Publishes {new Date(a.start_date).toLocaleString()} · Due {new Date(a.due_date).toLocaleString()} · Max {a.max_marks}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{a.submission_count ?? 0} submitted</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(a)}
                    className="gap-1.5"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-sgvu-navy" />
                </div>
              </div>
            ))}
          </div>
        )}
      </FacultyPanel>
    );
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
                        <Badge
                          variant={
                            row.status === 'RETURNED_FOR_REVISION' ? 'destructive' : 'secondary'
                          }
                        >
                          {row.status}
                        </Badge>
                      ) : (
                        <span className="font-medium text-red-600">Not submitted</span>
                      )}
                      {row.faculty_remarks && row.status === 'RETURNED_FOR_REVISION' && (
                        <p className="mt-1 text-xs text-muted-foreground">{row.faculty_remarks}</p>
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
                        <div className="flex flex-col gap-2">
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
                            {row.status !== 'RETURNED_FOR_REVISION' && (
                              <Button
                                size="sm"
                                onClick={() => void gradeRow(row.submission_id!, selectedMaxMarks)}
                              >
                                Save marks
                              </Button>
                            )}
                          </div>
                          {row.status !== 'GRADED' && (
                            <div className="flex flex-wrap items-end gap-2">
                              <Input
                                className="h-8 min-w-[200px] flex-1"
                                placeholder="Return remarks (required)"
                                value={returnRemarks[row.submission_id] ?? ''}
                                onChange={(e) =>
                                  setReturnRemarks((prev) => ({
                                    ...prev,
                                    [row.submission_id!]: e.target.value,
                                  }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={returningId === row.submission_id}
                                onClick={() => void returnRow(row.submission_id!)}
                              >
                                Return
                              </Button>
                            </div>
                          )}
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
        <div className="space-y-4">
          <AssignmentSection
            title="Scheduled / Archived"
            description="Future publish date. Students cannot see these yet."
            rows={scheduledAssignments}
          />
          <AssignmentSection
            title="Active"
            description="Visible to students now and still before deadline."
            rows={activeAssignments}
          />
          <AssignmentSection
            title="Closed"
            description="Deadline has passed. Faculty can still edit dates or the reference PDF."
            rows={closedAssignments}
          />
        </div>
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
                <label className="text-xs font-medium text-muted-foreground">Assignment title</label>
                <Input
                  placeholder="e.g. Linked List Implementation"
                  value={daTitle}
                  onChange={(e) => setDaTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description / instructions</label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Instructions for students (optional)"
                  value={daDescription}
                  onChange={(e) => setDaDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Semester (optional)</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 3"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Section (optional)</label>
                  <Input
                    placeholder="e.g. A"
                    value={sectionCode}
                    onChange={(e) => setSectionCode(e.target.value)}
                    maxLength={10}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave semester/section blank to notify all students enrolled in this course.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Total marks</label>
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
                <label className="text-xs font-medium text-muted-foreground">Publish date (visible to students)</label>
                <Input
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Due date</label>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Attachment (optional PDF)</label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">PDF only · Max 5MB</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit">Publish Assignment</Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-5 py-4">
              <div>
                <p className="text-sm font-bold text-sgvu-navy">Edit digital assignment</p>
                <p className="text-xs text-muted-foreground">{editing.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-sgvu-navy"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={saveEdit} className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Publish Date (Visible to Students)</label>
                <Input
                  type="datetime-local"
                  value={editStartAt}
                  onChange={(e) => setEditStartAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Strict deadline</label>
                <Input
                  type="datetime-local"
                  value={editDueAt}
                  onChange={(e) => setEditDueAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Replace question paper (optional)</label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">PDF only · Max 5MB</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit">Save changes</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
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
