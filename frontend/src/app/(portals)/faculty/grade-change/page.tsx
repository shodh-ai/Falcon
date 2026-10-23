'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight, Loader2, Send } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/notifications/falcon-toast';
import { FacultyEmptyState, FacultyErrorBanner, FacultyPageHeader, FacultyPageShell, FacultyPanel } from '@/components/faculty';
import { isEmptyArray, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoGradeChanges } from '@/lib/mock/faculty-portal-demo';
import { cn } from '@/lib/utils';
import { uniqueFacultyCoursesByCourseId, useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { FacultyAccountScope } from '@/components/faculty/FacultyAccountScope';

type GradeChangeRow = {
  change_id?: string;
  request_id?: string;
  student_user_id: string;
  student_name?: string | null;
  course_code: string;
  from_grade: string;
  to_grade: string;
  reason?: string | null;
  status?: string;
  dofa_status?: string | null;
  dofa_awaiting_role?: string | null;
};

type DepartmentStudent = {
  user_id: string;
  name: string;
  enrollment_number?: string | null;
  enrollment_no?: string | null;
  admission_number?: string | null;
};

function gradeStatusLabel(row: { status?: string; dofa_awaiting_role?: string | null; dofa_status?: string | null }) {
  if (row.status === 'APPLIED') return 'Applied';
  if (row.status === 'REJECTED') return 'Rejected';
  if (row.status === 'AWAITING_COE') return 'Awaiting Exam Cell (COE)';
  if (row.dofa_awaiting_role) {
    return `Awaiting ${row.dofa_awaiting_role}`;
  }
  if (row.status === 'PENDING_DOFA') return 'Awaiting HOD';
  return row.status ?? 'Unknown';
}

function statusBadgeClass(row: { status?: string; dofa_awaiting_role?: string | null }) {
  if (row.status === 'APPLIED') {
    return 'border-green-200 bg-green-50 text-green-700';
  }
  if (row.status === 'REJECTED') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  if (row.status === 'AWAITING_COE') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  return 'border-sky-200 bg-sky-50 text-sky-800';
}

export default function GradeChangePage() {
  const api = useAuthedApi();
  const pathname = usePathname();
  const isHod = pathname.startsWith('/hod/');
  const scope = useMemo(() => ({ api, isHod }), [api, isHod]);
  return <FacultyAccountScope scope={scope}><GradeChangeContent api={api} isHod={isHod} /></FacultyAccountScope>;
}

function GradeChangeContent({ api, isHod }: { api: ReturnType<typeof useAuthedApi>; isHod: boolean }) {
  const {
    courses,
    loading: coursesLoading,
    error: coursesError,
  } = useFacultyCourses();
  const courseOptions = uniqueFacultyCoursesByCourseId(courses);
  const courseLoadError = coursesError && coursesError !== 'No courses allocated to your timetable yet.'
    ? coursesError
    : null;
  const coursesUnavailable = coursesLoading || Boolean(courseLoadError) || courseOptions.length === 0;
  const [departmentStudents, setDepartmentStudents] = useState<DepartmentStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [studentRetry, setStudentRetry] = useState(0);
  const [rows, setRows] = useState<GradeChangeRow[]>([]);
  const [studentId, setStudentId] = useState('');
  const [fromG, setFromG] = useState('');
  const [toG, setToG] = useState('');
  const [course, setCourse] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const reading = useRef(0);
  const submittingLock = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reading.current += 1; };
  }, []);

  const reload = useCallback(
    (afterSubmit = false) => {
      const requestId = ++reading.current;
      return api
        .get<GradeChangeRow[]>('/api/uos/sis/grade-changes')
        .then((data) => {
          if (!mounted.current || requestId !== reading.current) return;
          if (!Array.isArray(data)) throw new Error('Could not read grade change requests');
          setError(null);
          setRows(withFacultyDemoFallback(data, facultyDemoGradeChanges(), isEmptyArray));
        })
        .catch((err: unknown) => {
          if (!mounted.current || requestId !== reading.current) return;
          const fallback = withFacultyDemoFallback([], facultyDemoGradeChanges(), isEmptyArray);
          if (!afterSubmit || fallback.length) setRows(fallback);
          if (fallback.length === 0) {
            const message = err instanceof Error ? err.message : 'Failed to load grade change requests';
            setError(afterSubmit ? `Request submitted, but the list could not be refreshed. ${message}` : message);
          }
        })
        .finally(() => { if (mounted.current && requestId === reading.current) setLoading(false); });
    },
    [api, setLoading],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!isHod) return;
    let cancelled = false;
    // The HOD roster is an external request; block student selection until this account's load finishes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudentsLoading(true);
    setStudentsError(null);
    api
      .get<DepartmentStudent[]>('/api/academics/hod/student-monitor')
      .then((data) => {
        if (!cancelled) setDepartmentStudents(Array.isArray(data) ? data : []);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setDepartmentStudents([]);
          setStudentsError(failure instanceof Error ? failure.message : 'Could not load department students');
        }
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, isHod, studentRetry]);

  async function handleSubmit() {
    if (submittingLock.current || coursesUnavailable || (isHod && (studentsLoading || studentsError))) return;
    if (!studentId.trim()) {
      toast.error('Enter the student user ID');
      return;
    }
    if (!courseOptions.some((item) => item.course_code === course)) {
      toast.error('Select a subject you teach');
      return;
    }
    if (isHod && !departmentStudents.some((student) => student.user_id === studentId)) {
      toast.error('Select a student in your department');
      return;
    }
    if (!fromG.trim() || !toG.trim()) {
      toast.error('Enter both from and to grades');
      return;
    }
    if (!reason.trim()) {
      toast.error('Enter a reason for the grade change');
      return;
    }

    if (isFacultyDemoSmokeId(studentId.trim())) {
      setRows((prev) => [
        {
          request_id: `gc-${Date.now()}`,
          student_user_id: studentId.trim(),
          course_code: course.trim().toUpperCase(),
          from_grade: fromG.trim().toUpperCase(),
          to_grade: toG.trim().toUpperCase(),
          reason: reason.trim(),
          status: 'PENDING',
          dofa_awaiting_role: 'HOD',
        },
        ...prev,
      ]);
      toast.success('Submitted — awaiting HOD approval (demo)');
      setStudentId('');
      setCourse('');
      setFromG('');
      setToG('');
      setReason('');
      return;
    }
    submittingLock.current = true;
    setSubmitting(true);
    try {
      await api.post('/api/uos/sis/grade-changes', {
        student_user_id: studentId.trim(),
        course_code: course.trim().toUpperCase(),
        from_grade: fromG.trim().toUpperCase(),
        to_grade: toG.trim().toUpperCase(),
        reason: reason.trim(),
      });
      if (!mounted.current) return;
      toast.success('Submitted — awaiting HOD approval');
      setStudentId('');
      setCourse('');
      setFromG('');
      setToG('');
      setReason('');
      setLoading(true);
      await reload(true);
    } catch (error: unknown) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      submittingLock.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title={isHod ? 'Department Grade Change Requests' : 'Grade Change DOFA'}
        description={isHod
          ? 'Submit a correction for an enrolled student in your department. Requests route through DOFA and Exam Cell.'
          : 'Faculty submits → HOD approves → Exam Cell (COE) applies. You cannot approve your own request.'}
        meta={
          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded-md border border-sgvu-gold/40 bg-sgvu-gold/10 px-2.5 py-1 text-sgvu-navy">
              1. You submit
            </span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1">2. HOD approves</span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1">
              3. Exam Cell (COE) applies
            </span>
          </div>
        }
      />

      <div className="w-full space-y-6">
        <FacultyPanel
          title="Submit request"
          description={isHod
            ? 'Only students and subjects within your department are available.'
            : 'Requests are allowed only for students enrolled in a subject you currently teach.'}
          className="w-full"
        >
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="text-sm">
                <label htmlFor="grade-request-student" className="mb-1.5 block font-medium text-sgvu-navy">{isHod ? 'Department student' : 'Student user ID'}</label>
                {isHod ? (
                  <Select
                    id="grade-request-student"
                    className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    disabled={studentsLoading || submitting || Boolean(studentsError)}
                  >
                    <option value="">{studentsLoading ? 'Loading students…' : 'Select a student'}</option>
                    {departmentStudents.map((student) => (
                      <option key={student.user_id} value={student.user_id}>
                        {student.name} · {student.enrollment_number ?? student.enrollment_no ?? student.admission_number ?? student.user_id}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id="grade-request-student"
                    disabled={submitting}
                    placeholder="Student user UUID"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  />
                )}
                {isHod && studentsError ? <div role="alert" className="mt-2 space-y-2 text-destructive"><p>{studentsError}</p><Button variant="outline" disabled={submitting} onClick={() => setStudentRetry((value) => value + 1)}>Retry department students</Button></div> : null}
              </div>

              <label className="text-sm" htmlFor="grade-change-course">
                <span className="mb-1.5 block font-medium text-sgvu-navy">{isHod ? 'Department subject' : 'Your teaching subject'}</span>
                <Select
                  id="grade-change-course"
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  disabled={coursesUnavailable || submitting}
                >
                  <option value="">
                    {coursesLoading
                      ? 'Loading subjects…'
                      : courseLoadError
                        ? 'Unable to load subjects'
                        : courseOptions.length === 0
                          ? 'No subjects assigned'
                          : isHod ? 'Select a department subject' : 'Select a subject you teach'}
                  </option>
                  {courseOptions.map((item) => (
                    <option key={item.course_id} value={item.course_code}>
                      {item.course_code} · {item.course_name}
                    </option>
                  ))}
                </Select>
                {!coursesLoading && courseLoadError ? (
                  <p role="alert" className="mt-1.5 text-sm text-destructive">
                    {courseLoadError} Refresh the page to try again.
                  </p>
                ) : !coursesLoading && courseOptions.length === 0 ? (
                  <p role="status" className="mt-1.5 text-xs text-muted-foreground">
                    {isHod
                      ? 'No subjects are available in your department.'
                      : 'No teaching subjects are assigned yet. Contact your HOD if you expected a teaching assignment.'}
                  </p>
                ) : null}
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">From grade</span>
                <Input
                  disabled={submitting}
                  placeholder="e.g. C"
                  value={fromG}
                  onChange={(e) => setFromG(e.target.value)}
                  className="uppercase"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">To grade</span>
                <Input
                  disabled={submitting}
                  placeholder="e.g. B"
                  value={toG}
                  onChange={(e) => setToG(e.target.value)}
                  className="uppercase"
                />
              </label>
            </div>

            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-sgvu-navy">Reason for change</span>
              <Textarea
                disabled={submitting}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Post-final correction after recheck — explain why the grade must change"
                rows={3}
              />
            </label>

            <div className="flex justify-end border-t border-border/40 pt-4">
              <Button
                onClick={() => void handleSubmit()}
                disabled={submitting || coursesUnavailable || !studentId.trim() || !fromG.trim() || !toG.trim() || !reason.trim() || !courseOptions.some((item) => item.course_code === course) || (isHod && (studentsLoading || Boolean(studentsError) || !departmentStudents.some((student) => student.user_id === studentId)))}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Request grade change
              </Button>
            </div>
          </div>
        </FacultyPanel>

        <FacultyPanel
          title="Your requests"
          description="Track approval status for grade changes you submitted"
          count={rows.length || undefined}
          className="w-full"
        >
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? <div role="alert" className="space-y-3"><FacultyErrorBanner message={error} /><Button variant="outline" disabled={submitting} onClick={() => { setLoading(true); void reload(); }}>Retry requests</Button></div> : rows.length === 0 ? (
            <FacultyEmptyState
              title="No requests yet"
              description="Submitted grade change requests will appear here."
            />
          ) : (
            <div className="grid w-full grid-cols-1 gap-3">
              {rows.map((r) => {
                const status = gradeStatusLabel(r);
                return (
                  <div
                    key={r.change_id ?? r.request_id}
                    className="box-border grid w-full gap-3 rounded-xl border border-border/60 bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sgvu-navy">{r.course_code}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-semibold text-sgvu-navy">
                          {r.from_grade}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          {r.to_grade}
                        </span>
                      </div>
                      {r.student_name ? <p className="truncate text-sm text-sgvu-navy">{r.student_name}</p> : null}
                      {r.reason ? <p className="text-xs leading-relaxed text-muted-foreground">{r.reason}</p> : null}
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        'h-8 w-fit shrink-0 justify-center px-3 text-xs font-semibold',
                        statusBadgeClass(r),
                      )}
                    >
                      {status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </FacultyPanel>
      </div>
    </FacultyPageShell>
  );
}
