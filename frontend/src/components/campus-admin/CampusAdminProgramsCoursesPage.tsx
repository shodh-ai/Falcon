'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type ProgramRow = {
  program_id: number;
  program_name: string;
  program_code?: string | null;
  duration_years?: number | null;
  school_id?: number | null;
  school_name?: string | null;
  dept_id?: number | null;
  dept_name?: string | null;
  status?: string | null;
  batch_count?: number | null;
  course_count?: number | null;
  campus_name?: string | null;
};

type ProgramDetailResponse = {
  program: ProgramRow & {
    school_code?: string | null;
    campus_id?: number | null;
    campus_code?: string | null;
    dept_code?: string | null;
    hod_name?: string | null;
    hod_email?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  counts: {
    subjects: number;
    courses: number;
    batches: number;
    students: number;
  };
  subjects: Array<{
    subject_id?: number;
    subject_code?: string | null;
    subject_name?: string | null;
    semester?: number | null;
    credits?: number | null;
  }>;
  courses: Array<{
    course_id: string;
    course_code?: string | null;
    course_name?: string | null;
    credits?: number | null;
    is_elective?: boolean | null;
  }>;
  batches: Array<{
    batch_id: number;
    batch_name?: string | null;
    academic_year?: string | null;
    status?: string | null;
  }>;
};

type CourseRow = {
  course_id: string;
  course_name: string;
  course_code?: string | null;
  credits?: number | null;
  is_elective?: boolean | null;
  dept_id?: number | null;
  dept_name?: string | null;
  status?: string | null;
  school_name?: string | null;
  campus_name?: string | null;
  semester?: number | null;
  program_name?: string | null;
};

type CourseDetailResponse = {
  course: CourseRow & {
    dept_code?: string | null;
    school_id?: number | null;
    school_code?: string | null;
    campus_id?: number | null;
    campus_name?: string | null;
    campus_code?: string | null;
    hod_name?: string | null;
    hod_email?: string | null;
    min_attendance?: number | null;
    academic_year?: string | null;
    faculty_name?: string | null;
    faculty_email?: string | null;
  };
  counts: { enrollments: number; timetables: number };
  enrollments: Array<{
    enrollment_id?: string;
    student_name?: string | null;
    student_email?: string | null;
    semester?: number | null;
    status?: string | null;
    grade?: string | null;
    attendance_percent?: number | null;
  }>;
  timetables: Array<{
    timetable_id?: string;
    day_of_week?: number | null;
    start_time?: string | null;
    end_time?: string | null;
    room?: string | null;
  }>;
};

type DepartmentRow = {
  dept_id: number;
  dept_name: string;
  school_id: number;
  school_name: string;
};

function isActive(status?: string | null) {
  return (status ?? 'ACTIVE') === 'ACTIVE';
}

export function CampusAdminProgramsCoursesPage() {
  const api = useAuthedApi();
  const [tab, setTab] = useState('programs');
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [saving, setSaving] = useState(false);

  const [viewProgram, setViewProgram] = useState<ProgramRow | null>(null);
  const [programDetail, setProgramDetail] = useState<ProgramDetailResponse | null>(null);
  const [programDetailLoading, setProgramDetailLoading] = useState(false);
  const [programDetailError, setProgramDetailError] = useState<string | null>(null);
  const [viewCourse, setViewCourse] = useState<CourseRow | null>(null);
  const [courseDetail, setCourseDetail] = useState<CourseDetailResponse | null>(null);
  const [courseDetailLoading, setCourseDetailLoading] = useState(false);
  const [courseDetailError, setCourseDetailError] = useState<string | null>(null);
  const [programForm, setProgramForm] = useState<ProgramRow | 'new' | null>(null);
  const [courseForm, setCourseForm] = useState<CourseRow | 'new' | null>(null);

  const [pName, setPName] = useState('');
  const [pCode, setPCode] = useState('');
  const [pSchool, setPSchool] = useState('');
  const [pDept, setPDept] = useState('');
  const [pDuration, setPDuration] = useState('');
  const [cName, setCName] = useState('');
  const [cCode, setCCode] = useState('');
  const [cDept, setCDept] = useState('');
  const [cCredits, setCCredits] = useState('');
  const [cElective, setCElective] = useState('core');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [programRows, courseRows, deptRows] = await Promise.all([
        api.get<ProgramRow[]>('/api/campus-admin/programs'),
        api.get<CourseRow[]>('/api/campus-admin/courses'),
        api.get<DepartmentRow[]>('/api/campus-admin/departments'),
      ]);
      setPrograms(Array.isArray(programRows) ? programRows : []);
      setCourses(Array.isArray(courseRows) ? courseRows : []);
      setDepartments(Array.isArray(deptRows) ? deptRows : []);
    } catch {
      setPrograms([]);
      setCourses([]);
      setError('Unable to load programs.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!viewProgram) {
      setProgramDetail(null);
      setProgramDetailError(null);
      return;
    }
    let cancelled = false;
    setProgramDetailLoading(true);
    setProgramDetailError(null);
    void api
      .get<ProgramDetailResponse>(`/api/campus-admin/programs/${viewProgram.program_id}`)
      .then((data) => {
        if (!cancelled) setProgramDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setProgramDetail(null);
          setProgramDetailError(
            err instanceof Error ? err.message : 'Unable to load full program details.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setProgramDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, viewProgram]);

  useEffect(() => {
    if (!viewCourse) {
      setCourseDetail(null);
      setCourseDetailError(null);
      return;
    }
    let cancelled = false;
    setCourseDetailLoading(true);
    setCourseDetailError(null);
    void api
      .get<CourseDetailResponse>(`/api/campus-admin/courses/${viewCourse.course_id}`)
      .then((data) => {
        if (!cancelled) setCourseDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setCourseDetail(null);
          setCourseDetailError(
            err instanceof Error ? err.message : 'Unable to load full course details.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCourseDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, viewCourse]);

  const schools = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((row) => map.set(row.school_id, row.school_name));
    programs.forEach((row) => {
      if (row.school_id && row.school_name) map.set(row.school_id, row.school_name);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [departments, programs]);

  const filteredPrograms = useMemo(() => {
    const term = q.trim().toLowerCase();
    return programs.filter((row) => {
      if (term && !`${row.program_name} ${row.program_code ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      if (schoolId && String(row.school_id) !== schoolId) return false;
      return true;
    });
  }, [programs, q, schoolId]);

  const filteredCourses = useMemo(() => {
    const term = q.trim().toLowerCase();
    return courses.filter((row) => {
      if (term && !`${row.course_name} ${row.course_code ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      if (deptId && String(row.dept_id) !== deptId) return false;
      return true;
    });
  }, [courses, deptId, q]);

  const formDepts = departments.filter((row) => !pSchool || String(row.school_id) === pSchool);

  function openProgramForm(row?: ProgramRow) {
    setProgramForm(row ?? 'new');
    setPName(row?.program_name ?? '');
    setPCode(row?.program_code ?? '');
    setPSchool(row?.school_id ? String(row.school_id) : '');
    setPDept(row?.dept_id ? String(row.dept_id) : '');
    setPDuration(row?.duration_years != null ? String(row.duration_years) : '');
  }

  function openCourseForm(row?: CourseRow) {
    setCourseForm(row ?? 'new');
    setCName(row?.course_name ?? '');
    setCCode(row?.course_code ?? '');
    setCDept(row?.dept_id ? String(row.dept_id) : '');
    setCCredits(row?.credits != null ? String(row.credits) : '');
    setCElective(row?.is_elective ? 'elective' : 'core');
  }

  async function saveProgram() {
    if (pName.trim().length < 2 || !pCode.trim() || !pSchool) {
      toast.error('Enter program name, code and school.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        program_name: pName.trim(),
        program_code: pCode.trim(),
        school_id: Number(pSchool),
        dept_id: pDept ? Number(pDept) : null,
        duration_years: pDuration ? Number(pDuration) : null,
      };
      if (programForm && programForm !== 'new') {
        await api.patch(`/api/campus-admin/programs/${programForm.program_id}`, body);
        toast.success('Program updated.');
      } else {
        await api.post('/api/campus-admin/programs', body);
        toast.success('Program created.');
      }
      setProgramForm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save program.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCourse() {
    if (cName.trim().length < 2 || !cCode.trim() || !cDept || cCredits === '') {
      toast.error('Enter course name, code, department and credits.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        course_name: cName.trim(),
        course_code: cCode.trim(),
        credits: Number(cCredits),
        dept_id: Number(cDept),
        is_elective: cElective === 'elective',
      };
      if (courseForm && courseForm !== 'new') {
        await api.patch(`/api/campus-admin/courses/${courseForm.course_id}`, body);
        toast.success('Course updated.');
      } else {
        await api.post('/api/campus-admin/courses', body);
        toast.success('Course created.');
      }
      setCourseForm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save course.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Programs & Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage programs and courses for your campus</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Programs</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{loading ? '—' : programs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Courses</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{loading ? '—' : courses.length}</p>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="space-y-4 p-4 md:p-5">
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setTab(value);
                setQ('');
                setSchoolId('');
                setDeptId('');
              }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <TabsList variant="line" className="h-10">
                  <TabsTrigger value="programs">Programs</TabsTrigger>
                  <TabsTrigger value="courses">Courses</TabsTrigger>
                </TabsList>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:max-w-3xl lg:justify-end">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={tab === 'programs' ? 'Search programs...' : 'Search courses...'}
                      className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                    />
                  </div>
                  {tab === 'programs' ? (
                    <Select
                      value={schoolId}
                      onChange={(e) => setSchoolId(e.target.value)}
                      className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:w-52"
                    >
                      <option value="">All schools</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      value={deptId}
                      onChange={(e) => setDeptId(e.target.value)}
                      className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:w-52"
                    >
                      <option value="">All departments</option>
                      {departments.map((row) => (
                        <option key={row.dept_id} value={row.dept_id}>
                          {row.dept_name}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button className="h-10 shrink-0" onClick={() => (tab === 'programs' ? openProgramForm() : openCourseForm())}>
                    {tab === 'programs' ? 'Add Program' : 'Add Course'}
                  </Button>
                </div>
              </div>

              <TabsContent value="programs" className="mt-4">
                <CompactTable
                  loading={loading}
                  empty="No programs found for this campus."
                  columns={['Program', 'Code', 'School', 'Duration', 'Status', '']}
                >
                  {filteredPrograms.map((row) => (
                    <tr key={row.program_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-3 font-semibold text-sgvu-navy">{row.program_name}</td>
                      <td className="p-3 text-muted-foreground">{row.program_code || '—'}</td>
                      <td className="p-3">{row.school_name || '—'}</td>
                      <td className="p-3">{row.duration_years != null ? `${row.duration_years} yr` : '—'}</td>
                      <td className="p-3">
                        <Badge variant={isActive(row.status) ? 'success' : 'secondary'}>
                          {isActive(row.status) ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <button type="button" className="text-sm font-semibold text-sgvu-navy hover:underline" onClick={() => setViewProgram(row)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </CompactTable>
              </TabsContent>

              <TabsContent value="courses" className="mt-4">
                <CompactTable
                  loading={loading}
                  empty="No courses found for this campus."
                  columns={['Course', 'Code', 'Department', 'Credits', 'Type', '']}
                >
                  {filteredCourses.map((row) => (
                    <tr key={row.course_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-3 font-semibold text-sgvu-navy">{row.course_name}</td>
                      <td className="p-3 text-muted-foreground">{row.course_code || '—'}</td>
                      <td className="p-3">{row.dept_name || '—'}</td>
                      <td className="p-3">{row.credits ?? '—'}</td>
                      <td className="p-3">{row.is_elective ? 'Elective' : 'Core'}</td>
                      <td className="p-3 text-right">
                        <button type="button" className="text-sm font-semibold text-sgvu-navy hover:underline" onClick={() => setViewCourse(row)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </CompactTable>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Sheet open={Boolean(viewProgram)} onOpenChange={(open) => !open && setViewProgram(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          {viewProgram ? (
            <ProgramDetailPanel
              fallback={viewProgram}
              detail={programDetail}
              loading={programDetailLoading}
              error={programDetailError}
              onEdit={() => {
                const row = viewProgram;
                setViewProgram(null);
                openProgramForm(row);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(viewCourse)} onOpenChange={(open) => !open && setViewCourse(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          {viewCourse ? (
            <CourseDetailPanel
              fallback={viewCourse}
              detail={courseDetail}
              loading={courseDetailLoading}
              error={courseDetailError}
              onEdit={() => {
                const row = viewCourse;
                setViewCourse(null);
                openCourseForm(row);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(programForm)} onOpenChange={(open) => !open && setProgramForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{programForm === 'new' ? 'Add Program' : 'Edit Program'}</DialogTitle>
            <DialogDescription>The program is saved to a school on your assigned campus.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FieldInput label="Program Name" value={pName} onChange={setPName} />
            <FieldInput label="Program Code" value={pCode} onChange={setPCode} />
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-sgvu-navy">School</span>
              <Select value={pSchool} onChange={(e) => { setPSchool(e.target.value); setPDept(''); }} className="h-10 rounded-xl border-sgvu-navy/15">
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </Select>
            </label>
            {formDepts.length > 0 && (
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-sgvu-navy">Department (optional)</span>
                <Select value={pDept} onChange={(e) => setPDept(e.target.value)} className="h-10 rounded-xl border-sgvu-navy/15">
                  <option value="">None</option>
                  {formDepts.map((row) => (
                    <option key={row.dept_id} value={row.dept_id}>{row.dept_name}</option>
                  ))}
                </Select>
              </label>
            )}
            <FieldInput label="Duration (years)" value={pDuration} onChange={setPDuration} numeric />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgramForm(null)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void saveProgram()}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(courseForm)} onOpenChange={(open) => !open && setCourseForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{courseForm === 'new' ? 'Add Course' : 'Edit Course'}</DialogTitle>
            <DialogDescription>The course is saved to a department on your assigned campus.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FieldInput label="Course Name" value={cName} onChange={setCName} />
            <FieldInput label="Course Code" value={cCode} onChange={setCCode} />
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-sgvu-navy">Department</span>
              <Select value={cDept} onChange={(e) => setCDept(e.target.value)} className="h-10 rounded-xl border-sgvu-navy/15">
                <option value="">Select department</option>
                {departments.map((row) => (
                  <option key={row.dept_id} value={row.dept_id}>{row.dept_name}</option>
                ))}
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <FieldInput label="Credits" value={cCredits} onChange={setCCredits} numeric />
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-sgvu-navy">Type</span>
                <Select value={cElective} onChange={(e) => setCElective(e.target.value)} className="h-10 rounded-xl border-sgvu-navy/15">
                  <option value="core">Core</option>
                  <option value="elective">Elective</option>
                </Select>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourseForm(null)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void saveCourse()}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CourseDetailPanel({
  fallback,
  detail,
  loading,
  error,
  onEdit,
}: {
  fallback: CourseRow;
  detail: CourseDetailResponse | null;
  loading: boolean;
  error: string | null;
  onEdit: () => void;
}) {
  const course = detail?.course ?? fallback;
  const counts = detail?.counts;
  const initials = (course.course_name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sgvu-navy text-sm font-semibold text-white">
            {initials || 'CR'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Course</p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {course.course_name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {[course.course_code, course.dept_name ?? fallback.dept_name]
                .filter(Boolean)
                .join(' · ') || 'Full course information'}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={isActive(course.status) ? 'success' : 'secondary'}>
                {isActive(course.status) ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant="outline">{course.is_elective ? 'Elective' : 'Core'}</Badge>
              <Button
                type="button"
                size="sm"
                className="h-8 bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
                onClick={onEdit}
              >
                Edit
              </Button>
            </div>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading full course details…
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Overview
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Credits" value={course.credits ?? fallback.credits} />
            <StatCard label="Enrollments" value={counts?.enrollments} />
            <StatCard label="Timetables" value={counts?.timetables} />
            <StatCard
              label="Min attendance"
              value={detail?.course.min_attendance}
            />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Course identity
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField label="Course name" value={course.course_name} />
            <InfoField label="Course code" value={course.course_code} />
            <InfoField
              label="Credits"
              value={course.credits != null ? course.credits : null}
            />
            <InfoField label="Type" value={course.is_elective ? 'Elective' : 'Core'} />
            <InfoField label="Status" value={isActive(course.status) ? 'Active' : 'Inactive'} />
            <InfoField
              label="Min attendance"
              value={
                detail?.course.min_attendance != null
                  ? `${detail.course.min_attendance}%`
                  : null
              }
            />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Organization
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField label="Campus" value={detail?.course.campus_name ?? course.campus_name} />
            <InfoField label="Campus code" value={detail?.course.campus_code} />
            <InfoField label="School" value={detail?.course.school_name ?? course.school_name} />
            <InfoField label="School code" value={detail?.course.school_code} />
            <InfoField label="Department" value={course.dept_name ?? fallback.dept_name} />
            <InfoField label="Department code" value={detail?.course.dept_code} />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Allocation
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField
              label="Program"
              value={detail?.course.program_name ?? course.program_name}
            />
            <InfoField
              label="Semester"
              value={
                detail?.course.semester != null
                  ? detail.course.semester
                  : course.semester != null
                    ? course.semester
                    : null
              }
            />
            <InfoField label="Academic year" value={detail?.course.academic_year} />
            <InfoField label="Faculty" value={detail?.course.faculty_name} />
            <InfoField
              label="Faculty email"
              value={detail?.course.faculty_email}
              href={
                detail?.course.faculty_email
                  ? `mailto:${detail.course.faculty_email}`
                  : undefined
              }
            />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Leadership
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField label="Department HOD" value={detail?.course.hod_name} />
            <InfoField
              label="HOD email"
              value={detail?.course.hod_email}
              href={
                detail?.course.hod_email ? `mailto:${detail.course.hod_email}` : undefined
              }
            />
          </dl>
        </section>

        <ListSection
          title="Recent enrollments"
          empty="No student enrollments for this course."
          rows={(detail?.enrollments ?? []).map((item) => ({
            key: String(item.enrollment_id ?? item.student_email ?? item.student_name),
            primary: item.student_name || item.student_email || 'Student',
            secondary: [
              item.student_email,
              item.semester != null ? `Sem ${item.semester}` : null,
              item.status,
              item.grade ? `Grade ${item.grade}` : null,
              item.attendance_percent != null
                ? `${item.attendance_percent}% attendance`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />

        <ListSection
          title="Timetable"
          empty="No timetable slots for this course."
          rows={(detail?.timetables ?? []).map((item) => {
            const day =
              item.day_of_week != null && item.day_of_week >= 0 && item.day_of_week <= 6
                ? dayNames[item.day_of_week]
                : null;
            return {
              key: String(item.timetable_id ?? `${day}-${item.start_time}-${item.room}`),
              primary: [day, item.start_time && item.end_time ? `${item.start_time}–${item.end_time}` : item.start_time]
                .filter(Boolean)
                .join(' · ') || 'Slot',
              secondary: item.room ? `Room ${item.room}` : undefined,
            };
          })}
        />
      </div>
    </div>
  );
}

function ProgramDetailPanel({
  fallback,
  detail,
  loading,
  error,
  onEdit,
}: {
  fallback: ProgramRow;
  detail: ProgramDetailResponse | null;
  loading: boolean;
  error: string | null;
  onEdit: () => void;
}) {
  const program = detail?.program ?? fallback;
  const counts = detail?.counts;
  const initials = program.program_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sgvu-navy text-sm font-semibold text-white">
            {initials || 'PR'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Program</p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {program.program_name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {[program.program_code, program.school_name].filter(Boolean).join(' · ') ||
                'Full program information'}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={isActive(program.status) ? 'success' : 'secondary'}>
                {isActive(program.status) ? 'Active' : 'Inactive'}
              </Badge>
              <Button
                type="button"
                size="sm"
                className="h-8 bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
                onClick={onEdit}
              >
                Edit
              </Button>
            </div>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading full program details…
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Overview
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Subjects" value={counts?.subjects ?? fallback.course_count} />
            <StatCard label="Courses" value={counts?.courses ?? fallback.course_count} />
            <StatCard label="Batches" value={counts?.batches ?? fallback.batch_count} />
            <StatCard label="Students" value={counts?.students} />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Organization
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField label="Program name" value={program.program_name} />
            <InfoField label="Program code" value={program.program_code} />
            <InfoField
              label="Duration"
              value={
                program.duration_years != null ? `${program.duration_years} years` : null
              }
            />
            <InfoField label="Status" value={isActive(program.status) ? 'Active' : 'Inactive'} />
            <InfoField label="Campus" value={program.campus_name ?? fallback.campus_name} />
            <InfoField label="Campus code" value={detail?.program.campus_code} />
            <InfoField label="School" value={program.school_name} />
            <InfoField label="School code" value={detail?.program.school_code} />
            <InfoField label="Department" value={program.dept_name} />
            <InfoField label="Department code" value={detail?.program.dept_code} />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Leadership
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField label="Department HOD" value={detail?.program.hod_name} />
            <InfoField
              label="HOD email"
              value={detail?.program.hod_email}
              href={
                detail?.program.hod_email ? `mailto:${detail.program.hod_email}` : undefined
              }
            />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Record
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField label="Created" value={formatDate(detail?.program.created_at)} />
            <InfoField label="Updated" value={formatDate(detail?.program.updated_at)} />
          </dl>
        </section>

        <ListSection
          title="Subjects"
          empty="No subjects linked to this program."
          rows={(detail?.subjects ?? []).map((item) => ({
            key: String(item.subject_id ?? item.subject_code ?? item.subject_name),
            primary: item.subject_name || item.subject_code || 'Subject',
            secondary: [
              item.subject_code,
              item.semester != null ? `Sem ${item.semester}` : null,
              item.credits != null ? `${item.credits} credits` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />

        <ListSection
          title="Courses"
          empty="No courses linked to this program."
          rows={(detail?.courses ?? []).map((item) => ({
            key: item.course_id,
            primary: item.course_name || item.course_code || 'Course',
            secondary: [
              item.course_code,
              item.credits != null ? `${item.credits} credits` : null,
              item.is_elective ? 'Elective' : 'Core',
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />

        <ListSection
          title="Batches"
          empty="No batches linked to this program."
          rows={(detail?.batches ?? []).map((item) => ({
            key: String(item.batch_id),
            primary: item.batch_name || `Batch ${item.batch_id}`,
            secondary: [item.academic_year, item.status].filter(Boolean).join(' · '),
          }))}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-sgvu-navy">
        {value == null || Number.isNaN(Number(value))
          ? '—'
          : Number(value).toLocaleString('en-IN')}
      </p>
    </div>
  );
}

function InfoField({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | number | null;
  href?: string;
}) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">
        {href && display !== '—' ? (
          <a href={href} className="underline-offset-2 hover:underline">
            {display}
          </a>
        ) : (
          display
        )}
      </dd>
    </div>
  );
}

function ListSection({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ key: string; primary: string; secondary?: string }>;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sgvu-navy/15 px-3 py-3 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="rounded-lg border border-sgvu-navy/10 bg-white px-3 py-2"
            >
              <p className="text-sm font-semibold text-sgvu-navy">{row.primary}</p>
              {row.secondary ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{row.secondary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function FieldInput({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-sgvu-navy">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numeric ? 'numeric' : undefined}
        className="h-10 rounded-xl border-sgvu-navy/15"
      />
    </label>
  );
}

function CompactTable({
  loading,
  empty,
  columns,
  children,
}: {
  loading: boolean;
  empty: string;
  columns: string[];
  children: ReactNode;
}) {
  const rows = Array.isArray(children) ? children : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((column) => (
              <th key={column || 'actions'} className="p-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </span>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
