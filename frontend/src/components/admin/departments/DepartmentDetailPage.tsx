'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import { AssignHodDialog } from '@/components/admin/departments/AssignHodDialog';
import { DepartmentFormDialog } from '@/components/admin/departments/DepartmentFormDialog';
import {
  displayCount,
  displayValue,
  type DepartmentDetail,
  type DepartmentLookups,
} from '@/components/admin/departments/department-types';
import { REG_BRAND_BTN, REG_OUTLINE_BTN } from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

function canManageDepartments(user?: { roles?: string[]; role?: string; primaryRole?: string } | null) {
  const roles = [
    ...(user?.roles ?? []),
    user?.primaryRole ?? '',
    user?.role ?? '',
  ].filter(Boolean);
  return roles.some((role) =>
    ['registrar', 'superadmin'].includes(role.trim().toLowerCase()),
  );
}

function activityLabel(action: string, resourceType: string) {
  const key = `${action}:${resourceType}`.toLowerCase();
  if (key.includes('create:department')) return 'Department created';
  if (key.includes('update:department')) return 'Department updated';
  if (key.includes('deactivate:department') || key.includes('delete:department')) {
    return 'Department status changed';
  }
  if (key.includes('activate:department')) return 'Department activated';
  if (key.includes('assign:hod')) return 'HOD assigned';
  if (key.includes('unassign:hod')) return 'HOD removed';
  return `${action} ${resourceType}`.replaceAll('_', ' ');
}

export function DepartmentDetailPage() {
  const params = useParams<{ id: string }>();
  const deptId = Number(params.id);
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canManageDepartments(user);
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [lookups, setLookups] = useState<DepartmentLookups>({ campuses: [], schools: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [hodOpen, setHodOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(deptId) || deptId <= 0) {
      setError('Department information is unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<DepartmentDetail>(`/api/admin-control/departments/${deptId}`);
      if (!data?.department) {
        setDetail(null);
        setError('Department information is unavailable.');
      } else {
        setDetail(data);
      }
    } catch {
      setDetail(null);
      setError('Unable to load department information.');
    } finally {
      setLoading(false);
    }
  }, [api, deptId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api
      .get<DepartmentLookups>('/api/admin-control/departments/lookups')
      .then((data) =>
        setLookups({
          campuses: Array.isArray(data?.campuses) ? data.campuses : [],
          schools: Array.isArray(data?.schools) ? data.schools : [],
        }),
      )
      .catch(() => setLookups({ campuses: [], schools: [] }));
  }, [api]);

  async function applyStatusChange() {
    if (!detail) return;
    setStatusBusy(true);
    try {
      if (detail.department.status === 'ACTIVE') {
        await api.del(`/api/admin-control/departments/${deptId}`);
        toast.success(`${detail.department.dept_name} was deactivated.`);
      } else {
        await api.post(`/api/admin-control/departments/${deptId}/restore`);
        toast.success(`${detail.department.dept_name} was activated.`);
      }
      setStatusOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to change department status.');
    } finally {
      setStatusBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error ?? 'Department information is unavailable.'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" className={cn(REG_OUTLINE_BTN, 'h-10')} asChild>
            <Link href="/admin/departments">Back to departments</Link>
          </Button>
          <Button className={cn(REG_BRAND_BTN, 'h-10')} onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const dept = detail.department;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin/departments" className="hover:text-sgvu-navy">
          Department Management
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-sgvu-navy">{dept.dept_name}</span>
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
              Admin Control Center
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">{dept.dept_name}</h1>
              <Badge variant={dept.status === 'ACTIVE' ? 'success' : 'secondary'}>
                {dept.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {displayValue(dept.campus_name)} · {displayValue(dept.school_name)}
            </p>
            {dept.hod_name && (
              <p className="mt-1 text-sm text-sgvu-navy">HOD · {dept.hod_name}</p>
            )}
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button className={cn(REG_BRAND_BTN, 'h-10')} onClick={() => setFormOpen(true)}>
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className={cn(REG_OUTLINE_BTN, 'h-10')}>
                    <MoreHorizontal className="h-4 w-4" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setHodOpen(true)}>Assign HOD</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusOpen(true)}>
                    {dept.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Students', value: displayCount(detail.counts.students) },
          { label: 'Faculty', value: displayCount(detail.counts.faculty) },
          { label: 'Programs', value: displayCount(detail.counts.programs) },
          { label: 'Courses', value: displayCount(detail.counts.courses) },
        ].map((stat) => (
          <Card key={stat.label} className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-sgvu-navy">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Department Name" value={dept.dept_name} />
            <Field label="Description" value={dept.description} />
            <Field label="Status" value={dept.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
          </CardContent>
        </Card>
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Organizational Structure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              University → Campus → School → Department
            </p>
            <Field label="Campus" value={dept.campus_name} />
            <Field label="School" value={dept.school_name} />
            <Field label="Department" value={dept.dept_name} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Leadership</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sgvu-navy/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HOD</p>
            <p className="mt-1 font-semibold text-sgvu-navy">{displayValue(dept.hod_name)}</p>
            <p className="text-sm text-muted-foreground">{displayValue(dept.hod_email)}</p>
            <p className="mt-1 text-xs">
              {dept.hod_name
                ? dept.hod_is_active === false
                  ? 'Inactive'
                  : 'Active'
                : 'Not assigned'}
            </p>
          </div>
          {dept.dean_name && (
            <div className="rounded-xl border border-sgvu-navy/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dean</p>
              <p className="mt-1 font-semibold text-sgvu-navy">{dept.dean_name}</p>
              <p className="text-sm text-muted-foreground">{displayValue(dept.dean_email)}</p>
              <p className="mt-1 text-xs">{dept.dean_is_active === false ? 'Inactive' : 'Active'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Programs</CardTitle>
          <Button variant="outline" size="sm" className={REG_OUTLINE_BTN} asChild>
            <Link href="/admin/iam">View All Programs</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {detail.programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No programs are linked to this department.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Program</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Students</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.programs.map((program) => (
                    <TableRow key={program.program_id}>
                      <TableCell>{program.program_name}</TableCell>
                      <TableCell>{displayValue(program.program_code)}</TableCell>
                      <TableCell>
                        {program.duration_years != null ? `${program.duration_years} yr` : 'N/A'}
                      </TableCell>
                      <TableCell>{program.status === 'ACTIVE' ? 'Active' : displayValue(program.status)}</TableCell>
                      <TableCell>N/A</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Courses</CardTitle>
          <Button variant="outline" size="sm" className={REG_OUTLINE_BTN} asChild>
            <Link href="/admin/academics">View All Courses</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {detail.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses are linked to this department.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course Code</TableHead>
                    <TableHead>Course Name</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.courses.map((course) => (
                    <TableRow key={course.course_id}>
                      <TableCell>{course.course_code}</TableCell>
                      <TableCell>{course.course_name}</TableCell>
                      <TableCell>{displayCount(course.credits)}</TableCell>
                      <TableCell>Active</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Faculty & Staff</CardTitle>
            <Button variant="outline" size="sm" className={REG_OUTLINE_BTN} asChild>
              <Link href="/directory">View Faculty</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {detail.faculty.length === 0 ? (
              <p className="text-sm text-muted-foreground">No faculty records are linked to this department.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Faculty</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.faculty.map((person) => (
                      <TableRow key={person.user_id}>
                        <TableCell>{person.name}</TableCell>
                        <TableCell>{displayValue(person.designation ?? person.role_name)}</TableCell>
                        <TableCell>{person.is_active === false ? 'Inactive' : 'Active'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Students</CardTitle>
            <Button variant="outline" size="sm" className={REG_OUTLINE_BTN} asChild>
              <Link href="/admin/student-records">View Students</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-sgvu-navy/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Students</p>
              <p className="mt-1 text-2xl font-bold text-sgvu-navy">{displayCount(detail.counts.students)}</p>
            </div>
            <div className="rounded-xl border border-sgvu-navy/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Students</p>
              <p className="mt-1 text-2xl font-bold text-sgvu-navy">
                {displayCount(detail.counts.active_students)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {detail.activity.length > 0 && (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.activity.map((item, index) => (
              <div key={item.audit_id ?? `${item.created_at}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-sgvu-navy">
                    {activityLabel(item.action, item.resource_type)}
                  </p>
                  <p className="text-xs text-muted-foreground">{displayValue(item.actor_name)}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lookups={lookups}
        department={dept}
        onSaved={() => void load()}
      />
      <AssignHodDialog
        open={hodOpen}
        onOpenChange={setHodOpen}
        deptId={dept.dept_id}
        deptName={dept.dept_name}
        currentHodId={dept.hod_user_id}
        onSaved={() => void load()}
      />
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dept.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} {dept.dept_name}?
            </DialogTitle>
            <DialogDescription>
              {dept.status === 'ACTIVE'
                ? 'Deactivation may affect related academic workflows. Students, faculty, programs and courses are not deleted.'
                : 'This restores the department as active without changing related records.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className={cn(REG_OUTLINE_BTN, 'h-10')} onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button className={cn(REG_BRAND_BTN, 'h-10')} disabled={statusBusy} onClick={() => void applyStatusChange()}>
              {statusBusy ? 'Updating…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sgvu-navy">{displayValue(value)}</p>
    </div>
  );
}
