'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthedApi } from '@/lib/api';

type Course = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  is_elective: boolean;
};

type Enrollment = {
  enrollment_id: string;
  semester: number;
  status: 'ENROLLED' | 'COMPLETED' | 'FAILED';
  grade: string | null;
  grade_points: number | null;
  attendance_percent: number;
  course: Course;
};

type Metrics = {
  cgpa: number;
  credits_completed: number;
  credits_required: number;
};

type TimetableResponse = {
  timetable_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  faculty_name: string | null;
  start_time: string;
  end_time: string;
};

export default function StudentAcademicsPage() {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [electives, setElectives] = useState<Course[]>([]);
  const [timetable, setTimetable] = useState<TimetableResponse[]>([]);
  const [selectedElectives, setSelectedElectives] = useState<string[]>([]);
  const [selectedSemester, setSelectedSemester] = useState(1);

  async function loadAcademics() {
    setLoading(true);
    try {
      const [metricsData, enrollmentData, electiveData, timetableData] = await Promise.all([
        api.get<Metrics>('/api/academics/dashboard/metrics'),
        api.get<Enrollment[]>('/api/academics/courses/my-enrollments'),
        api.get<Course[]>('/api/academics/courses/available-electives'),
        api.get<TimetableResponse[]>('/api/academics/dashboard/timetable/today'),
      ]);
      setMetrics(metricsData);
      setEnrollments(enrollmentData);
      setElectives(electiveData);
      setTimetable(timetableData);
      setSelectedElectives([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load academics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAcademics();
  }, []);

  const completedBySemester = useMemo(() => {
    return enrollments
      .filter((row) => row.status === 'COMPLETED')
      .reduce<Record<number, Enrollment[]>>((acc, row) => {
        acc[row.semester] = [...(acc[row.semester] ?? []), row];
        return acc;
      }, {});
  }, [enrollments]);

  const enrolledCourses = enrollments.filter((row) => row.status === 'ENROLLED');
  const semesterOptions = Array.from({ length: 8 }, (_, index) => index + 1);
  const selectedSemesterRows = completedBySemester[selectedSemester] ?? [];
  const selectedSemesterCredits = selectedSemesterRows.reduce(
    (sum, row) => sum + row.course.credits,
    0,
  );
  const selectedSemesterSgpa = selectedSemesterCredits > 0
    ? (
        selectedSemesterRows.reduce(
          (sum, row) => sum + (row.grade_points ?? 0) * row.course.credits,
          0,
        ) / selectedSemesterCredits
      ).toFixed(2)
    : null;

  function toggleElective(courseId: string) {
    setSelectedElectives((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : prev.length >= 2
          ? prev
          : [...prev, courseId],
    );
  }

  async function submitRegistration() {
    if (selectedElectives.length === 0) {
      toast.error('Select at least one elective');
      return;
    }
    setRegistering(true);
    try {
      await api.post('/api/academics/courses/register', {
        course_ids: selectedElectives,
      });
      toast.success('Course registration submitted');
      await loadAcademics();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Academics</h2>
        <p className="mt-1 text-sm text-muted-foreground">Grade card, credits, attendance, timetable, and CBCS course registration.</p>
      </section>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin" />
          </CardContent>
        </Card>
      )}

      {!loading && <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Grade Card / Results</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Switch between semesters to view all available marksheets.
                </p>
              </div>
              <select
                className="h-10 rounded-xl border bg-background px-3 text-sm"
                value={selectedSemester}
                onChange={(event) => setSelectedSemester(Number(event.target.value))}
              >
                {semesterOptions.map((semester) => (
                  <option key={semester} value={semester}>
                    Semester {semester}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {semesterOptions.map((semester) => {
                const hasMarks = Boolean(completedBySemester[semester]?.length);
                return (
                  <Button
                    key={semester}
                    type="button"
                    size="sm"
                    variant={selectedSemester === semester ? 'default' : 'outline'}
                    onClick={() => setSelectedSemester(semester)}
                    className={!hasMarks ? 'opacity-70' : undefined}
                  >
                    Sem {semester}
                  </Button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Semester {selectedSemester}</Badge>
              <Badge variant="outline">Credits: {selectedSemesterCredits}</Badge>
              <Badge variant="outline">SGPA: {selectedSemesterSgpa ?? 'Pending'}</Badge>
            </div>
            {selectedSemesterRows.length > 0 ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="pb-2 pr-3">Code</th>
                        <th className="pb-2 pr-3">Subject</th>
                        <th className="pb-2 pr-3">Credits</th>
                        <th className="pb-2 pr-3">Grade</th>
                        <th className="pb-2 pr-3">Grade Points</th>
                        <th className="pb-2 pr-3">Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSemesterRows.map((row) => (
                        <tr key={row.enrollment_id} className="border-t">
                          <td className="py-2 pr-3">{row.course.course_code}</td>
                          <td className="py-2 pr-3">{row.course.course_name}</td>
                          <td className="py-2 pr-3">{row.course.credits}</td>
                          <td className="py-2 pr-3 font-semibold">{row.grade}</td>
                          <td className="py-2 pr-3">{row.grade_points}</td>
                          <td className="py-2 pr-3">{row.attendance_percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <p className="font-medium text-sgvu-navy">No marks published for Semester {selectedSemester}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once the exam cell uploads results for this semester, they will appear here automatically.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CGPA Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current enrolled courses</span>
              <span className="font-semibold">{enrolledCourses.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Overall CGPA</span>
              <span className="font-semibold">{metrics?.cgpa ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credits Earned</span>
              <span className="font-semibold">{metrics?.credits_completed ?? 0}</span>
            </div>
            <Badge variant="secondary">{metrics?.credits_required ?? 160} required for graduation</Badge>
          </CardContent>
        </Card>
      </div>}

      {!loading && <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Enrolled Courses & Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {enrolledCourses.map((row) => (
              <div key={row.enrollment_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{row.course.course_name}</p>
                  <p className="text-xs text-muted-foreground">{row.course.course_code} · Semester {row.semester}</p>
                </div>
                <Badge variant={row.attendance_percent < 75 ? 'destructive' : 'default'}>{row.attendance_percent}%</Badge>
              </div>
            ))}
            {enrolledCourses.length === 0 && <p className="text-sm text-muted-foreground">No active enrollments.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Course Registration (CBCS)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Open Electives for Semester 5. Select up to 2 subjects.</p>
            {electives.map((course) => (
              <label key={course.course_id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedElectives.includes(course.course_id)}
                  onChange={() => toggleElective(course.course_id)}
                  disabled={!selectedElectives.includes(course.course_id) && selectedElectives.length >= 2}
                />
                <span>
                  <span className="block font-medium">{course.course_name}</span>
                  <span className="text-xs text-muted-foreground">{course.course_code} · {course.credits} credits</span>
                </span>
              </label>
            ))}
            {electives.length === 0 && <p className="text-sm text-muted-foreground">No open electives available.</p>}
            <Button className="w-full" onClick={submitRegistration} disabled={registering || selectedElectives.length === 0}>
              {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Registration'}
            </Button>
          </CardContent>
        </Card>
      </div>}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Registered Timetable</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {timetable.map((slot) => (
              <div key={slot.timetable_id} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold text-sgvu-navy">{slot.course_name}</p>
                <p className="text-muted-foreground">{slot.course_code} · {slot.room ?? 'Room TBA'}</p>
                <p className="text-xs text-muted-foreground">
                  {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                  {slot.faculty_name ? ` · ${slot.faculty_name}` : ''}
                </p>
              </div>
            ))}
            {timetable.length === 0 && <p className="text-sm text-muted-foreground">No registered classes today.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
