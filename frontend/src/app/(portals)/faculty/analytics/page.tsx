'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { useFacultyCourses, uniqueFacultyCoursesByCourseId } from '@/components/faculty/useFacultyCourses';
import {
  FacultyStudentReport,
  type FacultyStudentReportData,
} from '@/components/faculty/FacultyStudentReport';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type StudentSearchResult = {
  student_user_id: string;
  name: string;
  official_email: string;
  roll_number: string;
  department: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  internal_avg_percent: string | number;
  assignments_submitted: number;
};

function resultKey(student: StudentSearchResult) {
  return `${student.course_id}:${student.student_user_id}`;
}

function scoreLabel(value: string | number) {
  return `${Math.round(Number(value ?? 0))}%`;
}

export default function FacultyAnalyticsPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const courseOptions = uniqueFacultyCoursesByCourseId(courses);
  const [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<StudentSearchResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [report, setReport] = useState<FacultyStudentReportData | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const effectiveCourseId = courseId || courseOptions[0]?.course_id || '';

  useEffect(() => {
    if (!effectiveCourseId) {
      return;
    }

    let active = true;
    const params = new URLSearchParams({ courseId: effectiveCourseId });
    if (query.trim()) params.set('q', query.trim());

    async function loadStudents() {
      setLoadingStudents(true);
      try {
        const rows = await api.get<StudentSearchResult[]>(
          `/api/academics/faculty/workspaces/analytics/students?${params.toString()}`,
        );
        if (!active) return;
        setStudents(rows);
        setSelectedStudentId((current) => {
          if (current && rows.some((student) => student.student_user_id === current)) return current;
          return rows[0]?.student_user_id ?? '';
        });
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : 'Failed to search students');
        setStudents([]);
        setSelectedStudentId('');
      } finally {
        if (active) setLoadingStudents(false);
      }
    }

    void loadStudents();

    return () => {
      active = false;
    };
  }, [api, effectiveCourseId, query]);

  useEffect(() => {
    if (!effectiveCourseId || !selectedStudentId) {
      return;
    }

    let active = true;
    const params = new URLSearchParams({ courseId: effectiveCourseId });

    async function loadReport() {
      setLoadingReport(true);
      try {
        const data = await api.get<FacultyStudentReportData>(
          `/api/academics/faculty/workspaces/analytics/students/${encodeURIComponent(selectedStudentId)}/report?${params.toString()}`,
        );
        if (active) setReport(data);
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : 'Failed to load student analysis');
        setReport(null);
      } finally {
        if (active) setLoadingReport(false);
      }
    }

    void loadReport();

    return () => {
      active = false;
    };
  }, [api, effectiveCourseId, selectedStudentId]);

  const selectedCourse = courseOptions.find((course) => course.course_id === effectiveCourseId);
  const visibleReport = effectiveCourseId && selectedStudentId ? report : null;

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Search students in a selected subject by roll/student ID, email, or name. This report excludes attendance and focuses on academic signals faculty should act on."
        meta={
          <>
            <FacultyMetricChip label="Subject" value={selectedCourse?.course_code ?? 'Select'} emphasis />
            <FacultyMetricChip label="Students found" value={students.length} />
            <FacultyMetricChip
              label="Selected score"
              value={report ? `${report.summary.internal_avg_percent}%` : 'N/A'}
            />
            <FacultyMetricChip
              label="Pending DA"
              value={report ? report.summary.pending_assignments : 'N/A'}
            />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <FacultyPanel title="Find Student" description="Pick a subject, then search by ID or name.">
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Subject</label>
                <Select
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  value={effectiveCourseId}
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    setSelectedStudentId('');
                    setReport(null);
                  }}
                >
                  {courseOptions.length === 0 ? <option value="">No subjects assigned</option> : null}
                  {courseOptions.map((course) => (
                    <option key={course.course_id} value={course.course_id}>
                      {course.course_code} · {course.course_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Student ID or name</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search roll no, ID, email, or name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={!effectiveCourseId}
                  />
                </div>
              </div>
            </div>
          </FacultyPanel>

          <FacultyPanel title="Subject Students" count={students.length}>
            {loadingStudents ? (
              <FacultyPageLoading label="Searching students..." />
            ) : students.length === 0 ? (
              <FacultyEmptyState
                description={
                  effectiveCourseId
                    ? 'No students match this search in the selected subject.'
                    : 'Select a subject to search enrolled students.'
                }
                className="py-6"
              />
            ) : (
              <div className="space-y-2">
                {students.map((student) => {
                  const selected = selectedStudentId === student.student_user_id;
                  return (
                    <button
                      key={resultKey(student)}
                      type="button"
                      onClick={() => setSelectedStudentId(student.student_user_id)}
                      className={cn(
                        'w-full rounded-xl border p-3 text-left text-sm transition hover:border-sgvu-gold/70 hover:bg-sgvu-gold/5',
                        selected ? 'border-sgvu-gold bg-sgvu-gold/10' : 'border-border/60 bg-background',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-sgvu-navy">{student.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{student.roll_number}</p>
                          <p className="truncate text-xs text-muted-foreground">{student.official_email}</p>
                        </div>
                        <Badge variant={Number(student.internal_avg_percent) < 40 ? 'destructive' : 'secondary'} className="text-[10px]">
                          {scoreLabel(student.internal_avg_percent)}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </FacultyPanel>
        </div>

        <div className="min-w-0">
          {loadingReport ? (
            <FacultyPageLoading label="Preparing student analysis..." />
          ) : visibleReport ? (
            <FacultyStudentReport report={visibleReport} />
          ) : (
            <FacultyPanel title="Student Analysis">
              <FacultyEmptyState
                description="Select a student to view graphical and numerical analysis for the selected subject."
                className="py-12"
              />
            </FacultyPanel>
          )}
        </div>
      </div>
    </FacultyPageShell>
  );
}
