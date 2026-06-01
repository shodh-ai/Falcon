'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Lock, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type FacultyClass = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  start_time: string;
  end_time: string;
  student_count: number;
};

type Student = {
  student_id: string;
  name: string;
  roll_number: string;
  email: string | null;
};

type UiStatus = 'PRESENT' | 'ABSENT';

type AttendanceState = {
  date: string;
  locked: boolean;
  attendance_data: { student_id: string; status: UiStatus | 'LATE' | 'EXCUSED' }[] | null;
};

type FacultyAssignment = {
  assignment_id: string;
  title: string;
  description: string | null;
  reference_file_path: string | null;
  max_marks: number;
  due_date: string;
  submission_count: number;
  course?: {
    course_code: string;
    course_name: string;
  };
};

type AssignmentSubmission = {
  submission_id: string;
  student_name: string;
  student_email: string | null;
  file_path: string;
  submitted_at: string;
  marks_awarded: string | null;
  faculty_remarks: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function FacultyAcademicsContent() {
  const api = useAuthedApi();
  const params = useSearchParams();
  const initialCourseId = params.get('courseId');
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, UiStatus>>({});
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [attendanceLocked, setAttendanceLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [material, setMaterial] = useState({ title: '', file: null as File | null });
  const [assignments, setAssignments] = useState<FacultyAssignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [assignmentForm, setAssignmentForm] = useState({
    title: '',
    description: '',
    max_marks: '20',
    due_date: '',
    file: null as File | null,
  });
  const [grades, setGrades] = useState<Record<string, { marks_awarded: string; faculty_remarks: string }>>({});

  const selectedClass = useMemo(
    () => classes.find((item) => item.course_id === selectedCourseId) ?? null,
    [classes, selectedCourseId],
  );

  useEffect(() => {
    async function loadClasses() {
      setLoading(true);
      try {
        const data = await api.get<FacultyClass[]>('/api/academics/faculty/timetable/today');
        setClasses(data);
        setSelectedCourseId((current) => current ?? data[0]?.course_id ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load classes');
      } finally {
        setLoading(false);
      }
    }
    void loadClasses();
  }, [api]);

  useEffect(() => {
    if (!selectedCourseId) {
      setAssignments([]);
      setSelectedAssignmentId(null);
      return;
    }
    async function loadAssignments() {
      try {
        const data = await api.get<FacultyAssignment[]>(
          `/api/academics/faculty/assignments?courseId=${selectedCourseId}`,
        );
        setAssignments(data);
        setSelectedAssignmentId((current) => current ?? data[0]?.assignment_id ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load assignments');
      }
    }
    void loadAssignments();
  }, [api, selectedCourseId]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setSubmissions([]);
      return;
    }
    async function loadSubmissions() {
      try {
        const data = await api.get<{ submissions: AssignmentSubmission[] }>(
          `/api/academics/faculty/assignments/${selectedAssignmentId}/submissions`,
        );
        setSubmissions(data.submissions);
        setGrades(
          Object.fromEntries(
            data.submissions.map((submission) => [
              submission.submission_id,
              {
                marks_awarded: submission.marks_awarded ?? '',
                faculty_remarks: submission.faculty_remarks ?? '',
              },
            ]),
          ),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load submissions');
      }
    }
    void loadSubmissions();
  }, [api, selectedAssignmentId]);

  useEffect(() => {
    if (!selectedCourseId) {
      setStudents([]);
      return;
    }
    async function loadStudents() {
      try {
        const [data, savedState] = await Promise.all([
          api.get<Student[]>(`/api/academics/faculty/course/${selectedCourseId}/students`),
          api.get<AttendanceState>(`/api/academics/faculty/course/${selectedCourseId}/attendance?date=${selectedDate}`),
        ]);
        setStudents(data);
        setAttendanceLocked(savedState.locked);
        const saved = new Map(
          (savedState.attendance_data ?? []).map((entry) => [
            entry.student_id,
            entry.status === 'ABSENT' ? 'ABSENT' : 'PRESENT',
          ]),
        );
        setAttendance(
          Object.fromEntries(
            data.map((student) => [
              student.student_id,
              (saved.get(student.student_id) ?? 'PRESENT') as UiStatus,
            ]),
          ),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load students');
      }
    }
    void loadStudents();
  }, [api, selectedCourseId, selectedDate]);

  async function submitAttendance() {
    if (!selectedCourseId) return;
    setSaving(true);
    try {
      await api.post('/api/academics/faculty/attendance', {
        course_id: selectedCourseId,
        date: selectedDate,
        attendance_data: students.map((student) => ({
          student_id: student.student_id,
          status: attendance[student.student_id] ?? 'PRESENT',
        })),
      });
      toast.success('Attendance submitted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit attendance');
    } finally {
      setSaving(false);
    }
  }

  async function uploadMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId || !material.file) {
      toast.error('Select a course and file');
      return;
    }
    const body = new FormData();
    body.append('course_id', selectedCourseId);
    body.append('title', material.title);
    body.append('file', material.file);
    setSaving(true);
    try {
      await api.post('/api/academics/faculty/materials/upload', body);
      toast.success('Course material uploaded');
      setMaterial({ title: '', file: null });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) {
      toast.error('Select a course first');
      return;
    }
    const body = new FormData();
    body.append('course_id', selectedCourseId);
    body.append('title', assignmentForm.title);
    body.append('description', assignmentForm.description);
    body.append('max_marks', assignmentForm.max_marks);
    body.append('due_date', assignmentForm.due_date);
    if (assignmentForm.file) body.append('file', assignmentForm.file);

    setSaving(true);
    try {
      await api.post('/api/academics/faculty/assignments', body);
      toast.success('Digital Assignment created');
      setAssignmentForm({ title: '', description: '', max_marks: '20', due_date: '', file: null });
      const data = await api.get<FacultyAssignment[]>(
        `/api/academics/faculty/assignments?courseId=${selectedCourseId}`,
      );
      setAssignments(data);
      setSelectedAssignmentId(data[0]?.assignment_id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create assignment');
    } finally {
      setSaving(false);
    }
  }

  async function gradeSubmission(submissionId: string) {
    const grade = grades[submissionId];
    if (!grade?.marks_awarded) {
      toast.error('Enter marks before saving');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/academics/faculty/submissions/${submissionId}/grade`, grade);
      toast.success('Marks saved');
      if (selectedAssignmentId) {
        const data = await api.get<{ submissions: AssignmentSubmission[] }>(
          `/api/academics/faculty/assignments/${selectedAssignmentId}/submissions`,
        );
        setSubmissions(data.submissions);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save marks');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Academics</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mark attendance and upload course materials.</p>
      </section>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin" />
          </CardContent>
        </Card>
      )}

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Classes</CardTitle>
              <CardDescription>Choose a class to mark attendance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {classes.map((item) => (
                <button
                  key={item.timetable_id}
                  type="button"
                  onClick={() => setSelectedCourseId(item.course_id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                    selectedCourseId === item.course_id ? 'border-sgvu-gold bg-accent' : ''
                  }`}
                >
                  <p className="font-semibold text-sgvu-navy">{item.course_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.start_time.slice(0, 5)}-{item.end_time.slice(0, 5)} · {item.room ?? 'Room TBA'}
                  </p>
                  <Badge className="mt-2" variant="secondary">{item.student_count} students</Badge>
                </button>
              ))}
              {classes.length === 0 && <p className="text-sm text-muted-foreground">No classes today.</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Mark Attendance</CardTitle>
                  <CardDescription>{selectedClass?.course_name ?? 'Select a class'}</CardDescription>
                </div>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="w-full sm:w-44"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {attendanceLocked && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <Lock className="mt-0.5 h-4 w-4" />
                  <p>Attendance locked. Contact Admin to modify records older than 3 days.</p>
                </div>
              )}
              {students.map((student) => (
                <div key={student.student_id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="font-medium">{student.name}</p>
                    <p className="text-xs text-muted-foreground">{student.roll_number}</p>
                  </div>
                  <Button
                    type="button"
                    variant={attendance[student.student_id] === 'PRESENT' ? 'default' : 'destructive'}
                    disabled={attendanceLocked}
                    onClick={() =>
                      setAttendance((prev) => ({
                        ...prev,
                        [student.student_id]: prev[student.student_id] === 'PRESENT' ? 'ABSENT' : 'PRESENT',
                      }))
                    }
                  >
                    {attendance[student.student_id] ?? 'PRESENT'}
                  </Button>
                </div>
              ))}
              {students.length === 0 && <p className="text-sm text-muted-foreground">No enrolled students found.</p>}
              <Button className="w-full" onClick={submitAttendance} disabled={saving || students.length === 0 || attendanceLocked}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Attendance'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Material</CardTitle>
            <CardDescription>Upload notes, PDFs, or presentations for the selected course.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={uploadMaterial}>
              <Input
                required
                placeholder="Unit 1 Notes"
                value={material.title}
                onChange={(event) => setMaterial((prev) => ({ ...prev, title: event.target.value }))}
              />
              <Input
                required
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(event) => setMaterial((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))}
              />
              <Button type="submit" disabled={saving || !selectedCourseId}>
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-sgvu-gold" />
              Digital Assignments
            </CardTitle>
            <CardDescription>Create DAs, monitor submissions, and publish marks for the selected course.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form className="grid gap-3 lg:grid-cols-[1fr_1fr_120px_180px]" onSubmit={createAssignment}>
              <Input
                required
                placeholder="DA title"
                value={assignmentForm.title}
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <Input
                placeholder="Brief instructions"
                value={assignmentForm.description}
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <Input
                required
                type="number"
                min="1"
                placeholder="Max marks"
                value={assignmentForm.max_marks}
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, max_marks: event.target.value }))}
              />
              <Input
                required
                type="datetime-local"
                value={assignmentForm.due_date}
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, due_date: event.target.value }))}
              />
              <Input
                className="lg:col-span-3"
                type="file"
                accept="application/pdf"
                onChange={(event) => setAssignmentForm((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))}
              />
              <Button type="submit" disabled={saving || !selectedCourseId}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create DA'}
              </Button>
            </form>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <button
                    key={assignment.assignment_id}
                    type="button"
                    onClick={() => setSelectedAssignmentId(assignment.assignment_id)}
                    className={`w-full rounded-xl border p-3 text-left text-sm ${
                      selectedAssignmentId === assignment.assignment_id ? 'border-sgvu-gold bg-accent' : ''
                    }`}
                  >
                    <p className="font-semibold text-sgvu-navy">{assignment.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {new Date(assignment.due_date).toLocaleString()} · {assignment.max_marks} marks
                    </p>
                    <Badge className="mt-2" variant="secondary">
                      {assignment.submission_count} submissions
                    </Badge>
                  </button>
                ))}
                {assignments.length === 0 && (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No Digital Assignments for this course yet.
                  </p>
                )}
              </div>

              <div className="space-y-3 lg:col-span-2">
                {submissions.map((submission) => (
                  <div key={submission.submission_id} className="rounded-xl border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{submission.student_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {submission.student_email} · Submitted {new Date(submission.submitted_at).toLocaleString()}
                        </p>
                        <a
                          href={submission.file_path}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-sgvu-navy underline"
                        >
                          Open submission PDF
                        </a>
                      </div>
                      <Badge variant={submission.marks_awarded ? 'default' : 'outline'}>
                        {submission.marks_awarded ? `${submission.marks_awarded} marks` : 'Ungraded'}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Marks"
                        value={grades[submission.submission_id]?.marks_awarded ?? ''}
                        onChange={(event) =>
                          setGrades((prev) => ({
                            ...prev,
                            [submission.submission_id]: {
                              ...prev[submission.submission_id],
                              marks_awarded: event.target.value,
                            },
                          }))
                        }
                      />
                      <Input
                        placeholder="Faculty remarks"
                        value={grades[submission.submission_id]?.faculty_remarks ?? ''}
                        onChange={(event) =>
                          setGrades((prev) => ({
                            ...prev,
                            [submission.submission_id]: {
                              ...prev[submission.submission_id],
                              faculty_remarks: event.target.value,
                            },
                          }))
                        }
                      />
                      <Button type="button" disabled={saving} onClick={() => gradeSubmission(submission.submission_id)}>
                        Save Marks
                      </Button>
                    </div>
                  </div>
                ))}
                {selectedAssignmentId && submissions.length === 0 && (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No submissions yet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function FacultyAcademicsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading academics...
        </div>
      }
    >
      <FacultyAcademicsContent />
    </Suspense>
  );
}
