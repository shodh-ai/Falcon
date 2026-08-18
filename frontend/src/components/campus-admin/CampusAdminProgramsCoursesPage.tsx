'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
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
  const [viewCourse, setViewCourse] = useState<CourseRow | null>(null);
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
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Programs & Courses</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage programs and courses for your campus</p>
          </div>
          <div className="flex gap-6 text-sm">
            <HeaderStat label="Programs" value={loading ? '—' : programs.length} />
            <HeaderStat label="Courses" value={loading ? '—' : courses.length} />
            <HeaderStat
              label="Active Programs"
              value={loading ? '—' : programs.filter((row) => isActive(row.status)).length}
            />
          </div>
        </CardContent>
      </Card>

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
                    <Plus className="h-4 w-4" />
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
                        <button type="button" className="mr-3 text-sm font-semibold text-sgvu-navy hover:underline" onClick={() => setViewProgram(row)}>
                          View
                        </button>
                        <button type="button" className="text-sm font-semibold text-sgvu-navy hover:underline" onClick={() => openProgramForm(row)}>
                          Edit
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
                        <button type="button" className="mr-3 text-sm font-semibold text-sgvu-navy hover:underline" onClick={() => setViewCourse(row)}>
                          View
                        </button>
                        <button type="button" className="text-sm font-semibold text-sgvu-navy hover:underline" onClick={() => openCourseForm(row)}>
                          Edit
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
        <SheetContent side="right" className="w-[min(100vw,26rem)] overflow-y-auto bg-white p-6 text-sgvu-navy">
          <SheetHeader>
            <SheetTitle className="text-sgvu-navy">{viewProgram?.program_name}</SheetTitle>
            <SheetDescription>Program details</SheetDescription>
          </SheetHeader>
          {viewProgram && (
            <div className="mt-5 space-y-3 text-sm">
              <Detail label="Code" value={viewProgram.program_code} />
              <Detail label="School" value={viewProgram.school_name} />
              {viewProgram.dept_name ? <Detail label="Department" value={viewProgram.dept_name} /> : null}
              <Detail label="Duration" value={viewProgram.duration_years != null ? `${viewProgram.duration_years} years` : null} />
              <Detail label="Status" value={isActive(viewProgram.status) ? 'Active' : 'Inactive'} />
              {viewProgram.course_count != null || viewProgram.batch_count != null ? (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="rounded-xl border border-sgvu-navy/10 p-3">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">Courses</p>
                    <p className="mt-1 text-lg font-bold">{viewProgram.course_count ?? '—'}</p>
                  </div>
                  <div className="rounded-xl border border-sgvu-navy/10 p-3">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">Batches</p>
                    <p className="mt-1 text-lg font-bold">{viewProgram.batch_count ?? '—'}</p>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(viewCourse)} onOpenChange={(open) => !open && setViewCourse(null)}>
        <SheetContent side="right" className="w-[min(100vw,26rem)] overflow-y-auto bg-white p-6 text-sgvu-navy">
          <SheetHeader>
            <SheetTitle className="text-sgvu-navy">{viewCourse?.course_name}</SheetTitle>
            <SheetDescription>Course details</SheetDescription>
          </SheetHeader>
          {viewCourse && (
            <div className="mt-5 space-y-3 text-sm">
              <Detail label="Code" value={viewCourse.course_code} />
              <Detail label="Department" value={viewCourse.dept_name} />
              <Detail label="Credits" value={viewCourse.credits} />
              <Detail label="Type" value={viewCourse.is_elective ? 'Elective' : 'Core'} />
              <Detail label="Status" value={isActive(viewCourse.status) ? 'Active' : 'Inactive'} />
            </div>
          )}
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

function HeaderStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-sgvu-navy">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
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
