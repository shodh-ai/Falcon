'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight, Loader2, Send } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/notifications/falcon-toast';
import { FacultyEmptyState, FacultyPageHeader, FacultyPageShell, FacultyPanel } from '@/components/faculty';
import { isEmptyArray, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoGradeChanges } from '@/lib/mock/faculty-portal-demo';
import { cn } from '@/lib/utils';
import { uniqueFacultyCoursesByCourseId, useFacultyCourses } from '@/components/faculty/useFacultyCourses';

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
  const { courses } = useFacultyCourses();
  const courseOptions = uniqueFacultyCoursesByCourseId(courses);
  const [departmentStudents, setDepartmentStudents] = useState<DepartmentStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [rows, setRows] = useState<GradeChangeRow[]>([]);
  const [studentId, setStudentId] = useState('');
  const [fromG, setFromG] = useState('');
  const [toG, setToG] = useState('');
  const [course, setCourse] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    () =>
      api
        .get<GradeChangeRow[]>('/api/uos/sis/grade-changes')
        .then((data) => setRows(withFacultyDemoFallback(data, facultyDemoGradeChanges(), isEmptyArray)))
        .catch(() => setRows(withFacultyDemoFallback([], facultyDemoGradeChanges(), isEmptyArray)))
        .finally(() => setLoading(false)),
    [api],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!isHod) return;
    let cancelled = false;
    setStudentsLoading(true);
    api
      .get<DepartmentStudent[]>('/api/academics/hod/student-monitor')
      .then((data) => {
        if (!cancelled) setDepartmentStudents(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setDepartmentStudents([]);
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, isHod]);

  async function handleSubmit() {
    if (!studentId.trim()) {
      toast.error('Enter the student user ID');
      return;
    }
    if (!course.trim()) {
      toast.error('Enter the course code');
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
    setSubmitting(true);
    try {
      await api.post('/api/uos/sis/grade-changes', {
        student_user_id: studentId.trim(),
        course_code: course.trim().toUpperCase(),
        from_grade: fromG.trim().toUpperCase(),
        to_grade: toG.trim().toUpperCase(),
        reason: reason.trim(),
      });
      toast.success('Submitted — awaiting HOD approval');
      setStudentId('');
      setCourse('');
      setFromG('');
      setToG('');
      setReason('');
      await reload();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
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
              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">{isHod ? 'Department student' : 'Student user ID'}</span>
                {isHod ? (
                  <Select
                    className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    disabled={studentsLoading}
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
                    placeholder="e.g. student UUID or enrollment ID"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  />
                )}
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">{isHod ? 'Department subject' : 'Your teaching subject'}</span>
                <Select
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                >
                  <option value="">Select a subject you teach</option>
                  {courseOptions.map((item) => (
                    <option key={item.course_id} value={item.course_code}>
                      {item.course_code} · {item.course_name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">From grade</span>
                <Input
                  placeholder="e.g. C"
                  value={fromG}
                  onChange={(e) => setFromG(e.target.value)}
                  className="uppercase"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">To grade</span>
                <Input
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
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Post-final correction after recheck — explain why the grade must change"
                rows={3}
              />
            </label>

            <div className="flex justify-end border-t border-border/40 pt-4">
              <Button onClick={() => void handleSubmit()} disabled={submitting}>
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
          ) : rows.length === 0 ? (
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
