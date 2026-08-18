'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MoreHorizontal, Plus, Search } from 'lucide-react';
import { AssignHodDialog } from '@/components/admin/departments/AssignHodDialog';
import { DepartmentFormDialog } from '@/components/admin/departments/DepartmentFormDialog';
import {
  displayCount,
  displayValue,
  type DepartmentListRow,
  type DepartmentLookups,
} from '@/components/admin/departments/department-types';
import { REG_BRAND_BTN, REG_OUTLINE_BTN } from '@/components/admin/registrar-desk/RegistrarDeskChrome';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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

export function DepartmentManagementPage() {
  const api = useAuthedApi();
  const router = useRouter();
  const { user } = useAuth();
  const canManage = canManageDepartments(user);
  const [rows, setRows] = useState<DepartmentListRow[]>([]);
  const [lookups, setLookups] = useState<DepartmentLookups>({ campuses: [], schools: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [campusId, setCampusId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentListRow | null>(null);
  const [hodRow, setHodRow] = useState<DepartmentListRow | null>(null);
  const [statusRow, setStatusRow] = useState<DepartmentListRow | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const schoolsForFilter = useMemo(
    () => lookups.schools.filter((school) => !campusId || String(school.campus_id) === campusId),
    [lookups.schools, campusId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(qInput), 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status });
      if (q.trim()) params.set('q', q.trim());
      if (campusId) params.set('campus_id', campusId);
      if (schoolId) params.set('school_id', schoolId);
      const data = await api.get<DepartmentListRow[]>(`/api/admin-control/departments?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError('Unable to load department information.');
      void err;
    } finally {
      setLoading(false);
    }
  }, [api, campusId, q, schoolId, status]);

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

  useEffect(() => {
    void load();
  }, [load]);

  async function applyStatusChange() {
    if (!statusRow) return;
    setStatusBusy(true);
    try {
      if (statusRow.status === 'ACTIVE') {
        await api.del(`/api/admin-control/departments/${statusRow.dept_id}`);
        toast.success(`${statusRow.dept_name} was deactivated.`);
      } else {
        await api.post(`/api/admin-control/departments/${statusRow.dept_id}/restore`);
        toast.success(`${statusRow.dept_name} was activated.`);
      }
      setStatusRow(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to change department status.');
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
              Admin Control Center
            </p>
            <h1 className="mt-1 text-2xl font-bold text-sgvu-navy sm:text-3xl">Department Management</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Manage university departments, academic structure and department information.
            </p>
          </div>
          {canManage && (
            <Button
              className={cn(REG_BRAND_BTN, 'h-10 shrink-0')}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Department
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search departments..."
                className="h-11 rounded-xl border-sgvu-navy/15 pl-9"
                aria-label="Search departments"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[36rem]">
              <Select
                value={campusId}
                onChange={(e) => {
                  setCampusId(e.target.value);
                  setSchoolId('');
                }}
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">All campuses</option>
                {lookups.campuses.map((campus) => (
                  <option key={campus.campus_id} value={campus.campus_id}>
                    {campus.campus_name}
                  </option>
                ))}
              </Select>
              <Select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">All schools</option>
                {schoolsForFilter.map((school) => (
                  <option key={school.school_id} value={school.school_id}>
                    {school.school_name}
                  </option>
                ))}
              </Select>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive' | 'all')}
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All statuses</option>
              </Select>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className={cn(REG_OUTLINE_BTN, 'mt-3 h-9')} variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead>Department</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>HOD</TableHead>
                    <TableHead className="text-right">Programs</TableHead>
                    <TableHead className="text-right">Faculty</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading…
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        No departments found.
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
                    rows.map((row) => (
                      <TableRow
                        key={row.dept_id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/admin/departments/${row.dept_id}`)}
                      >
                        <TableCell className="font-semibold text-sgvu-navy">{row.dept_name}</TableCell>
                        <TableCell>{displayValue(row.campus_name)}</TableCell>
                        <TableCell>{displayValue(row.school_name)}</TableCell>
                        <TableCell>{displayValue(row.hod_name)}</TableCell>
                        <TableCell className="text-right">{displayCount(row.program_count)}</TableCell>
                        <TableCell className="text-right">{displayCount(row.faculty_count)}</TableCell>
                        <TableCell className="text-right">{displayCount(row.student_count)}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === 'ACTIVE' ? 'success' : 'secondary'}>
                            {row.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${row.dept_name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/departments/${row.dept_id}`}>View</Link>
                              </DropdownMenuItem>
                              {canManage && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditing(row);
                                      setFormOpen(true);
                                    }}
                                  >
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setHodRow(row)}>Assign HOD</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setStatusRow(row)}>
                                    {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lookups={lookups}
        department={editing}
        onSaved={() => void load()}
      />
      {hodRow && (
        <AssignHodDialog
          open={Boolean(hodRow)}
          onOpenChange={(open) => {
            if (!open) setHodRow(null);
          }}
          deptId={hodRow.dept_id}
          deptName={hodRow.dept_name}
          currentHodId={hodRow.hod_user_id}
          onSaved={() => void load()}
        />
      )}
      <Dialog open={Boolean(statusRow)} onOpenChange={(open) => !open && setStatusRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusRow?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} {statusRow?.dept_name}?
            </DialogTitle>
            <DialogDescription>
              {statusRow?.status === 'ACTIVE'
                ? 'Deactivation archives the department. Related students, faculty, programs and courses are not deleted, but academic workflows that depend on this department may be affected.'
                : 'This will restore the department as active. Related academic records are left unchanged.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className={cn(REG_OUTLINE_BTN, 'h-10')} onClick={() => setStatusRow(null)}>
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
