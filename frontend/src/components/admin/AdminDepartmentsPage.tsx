'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, Plus, RefreshCw, Search } from 'lucide-react';
import { DepartmentFormDialog } from '@/components/admin/departments/DepartmentFormDialog';
import {
  displayCount,
  displayValue,
  type DepartmentDetail,
  type DepartmentListRow,
  type DepartmentLookups,
  type HodCandidate,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

const EMPTY_LOOKUPS: DepartmentLookups = { campuses: [], schools: [] };

function statusBadge(status: DepartmentListRow['status']) {
  if (status === 'ACTIVE') {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
      Inactive
    </Badge>
  );
}

export function AdminDepartmentsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<DepartmentListRow[]>([]);
  const [lookups, setLookups] = useState<DepartmentLookups>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentListRow | null>(null);
  const [detailsRow, setDetailsRow] = useState<DepartmentListRow | null>(null);
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hodDialogRow, setHodDialogRow] = useState<DepartmentListRow | null>(null);
  const [hodCandidates, setHodCandidates] = useState<HodCandidate[]>([]);
  const [hodUserId, setHodUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);

  const loadDepartments = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (schoolFilter) params.set('school_id', schoolFilter);
      if (campusFilter) params.set('campus_id', campusFilter);
      params.set('status', statusFilter);
      const data = await api.get<DepartmentListRow[]>(
        `/api/admin-control/departments?${params.toString()}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, [api, campusFilter, schoolFilter, search, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<DepartmentLookups>('/api/admin-control/departments/lookups')
      .then((data) => {
        if (!cancelled) {
          setLookups({
            campuses: data?.campuses ?? [],
            schools: data?.schools ?? [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLookups(EMPTY_LOOKUPS);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    setLoading(true);
    void loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    if (!detailsRow) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void api
      .get<DepartmentDetail>(`/api/admin-control/departments/${detailsRow.dept_id}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null);
          toast.error(err instanceof Error ? err.message : 'Unable to load department details');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, detailsRow]);

  useEffect(() => {
    if (!hodDialogRow) {
      setHodCandidates([]);
      setHodUserId('');
      return;
    }
    setHodUserId(hodDialogRow.hod_user_id ?? '');
    void api
      .get<HodCandidate[]>(
        `/api/admin-control/hod/candidates?dept_id=${hodDialogRow.dept_id}`,
      )
      .then((rows) => setHodCandidates(Array.isArray(rows) ? rows : []))
      .catch(() => setHodCandidates([]));
  }, [api, hodDialogRow]);

  const schoolsForFilter = useMemo(() => {
    if (!campusFilter) return lookups.schools;
    return lookups.schools.filter((school) => String(school.campus_id) === campusFilter);
  }, [campusFilter, lookups.schools]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: DepartmentListRow) {
    setEditing(row);
    setFormOpen(true);
  }

  async function runConfirmedAction() {
    if (!confirmAction) return;
    setSubmitting(true);
    try {
      await confirmAction.action();
      setConfirmAction(null);
      await loadDepartments();
      if (detailsRow) {
        const refreshed = await api.get<DepartmentDetail>(
          `/api/admin-control/departments/${detailsRow.dept_id}`,
        );
        setDetail(refreshed);
        setDetailsRow((prev) =>
          prev
            ? {
                ...prev,
                ...refreshed.department,
              }
            : prev,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveHodAssignment() {
    if (!hodDialogRow) return;
    if (!hodUserId) {
      toast.error('Select an eligible HOD user');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/admin-control/hod/assign', {
        dept_id: hodDialogRow.dept_id,
        hod_user_id: hodUserId,
      });
      toast.success('HOD assigned');
      setHodDialogRow(null);
      await loadDepartments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to assign HOD');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
                Admin Control Center
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
                Department Management
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Manage university departments under Campus → School, assign HODs, and activate or
                deactivate without losing faculty, programs, or courses.
              </p>
            </div>
            <Button type="button" className={cn('h-11', REG_BRAND_BTN)} onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Department
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_160px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search department, code, or school"
                className="h-11 pl-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setLoading(true);
                    setSearch(searchInput);
                  }
                }}
              />
            </div>
            <Select
              value={campusFilter}
              onChange={(e) => {
                setLoading(true);
                setCampusFilter(e.target.value);
                setSchoolFilter('');
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
              value={schoolFilter}
              onChange={(e) => {
                setLoading(true);
                setSchoolFilter(e.target.value);
              }}
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
              value={statusFilter}
              onChange={(e) => {
                setLoading(true);
                setStatusFilter(e.target.value as 'active' | 'inactive' | 'all');
              }}
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All statuses</option>
            </Select>
            <Button
              type="button"
              variant="outline"
              className={cn('h-11', REG_OUTLINE_BTN)}
              onClick={() => {
                setLoading(true);
                setSearch(searchInput);
              }}
            >
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading departments…
            </div>
          ) : error ? (
            <div className="space-y-4 px-6 py-16 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void loadDepartments();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="space-y-3 px-6 py-16 text-center">
              <p className="font-semibold text-sgvu-navy">No departments found</p>
              <p className="text-sm text-muted-foreground">
                Adjust filters or create the first department under a school.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto p-4 md:p-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Department</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>HOD</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Programs</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.dept_id}>
                      <TableCell className="font-semibold text-sgvu-navy">
                        {row.dept_name}
                        {row.campus_name ? (
                          <p className="text-xs font-normal text-muted-foreground">
                            {row.campus_name}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{displayValue(row.dept_code)}</TableCell>
                      <TableCell>{displayValue(row.school_name)}</TableCell>
                      <TableCell>{displayValue(row.hod_name)}</TableCell>
                      <TableCell>{displayCount(row.faculty_count)}</TableCell>
                      <TableCell>{displayCount(row.program_count)}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailsRow(row)}>
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={row.status !== 'ACTIVE'}
                              onClick={() => openEdit(row)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={row.status !== 'ACTIVE'}
                              onClick={() => setHodDialogRow(row)}
                            >
                              Assign HOD
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {row.status === 'ACTIVE' ? (
                              <DropdownMenuItem
                                className="text-amber-700 focus:text-amber-700"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Deactivate department',
                                    description: `Deactivate ${row.dept_name}? Faculty, programs, and courses are kept. New HOD/course assignments to this department will be blocked.`,
                                    action: async () => {
                                      await api.del(
                                        `/api/admin-control/departments/${row.dept_id}`,
                                      );
                                      toast.success('Department deactivated');
                                    },
                                  })
                                }
                              >
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-emerald-700 focus:text-emerald-700"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Activate department',
                                    description: `Restore ${row.dept_name} so it can receive faculty and HOD assignments again?`,
                                    action: async () => {
                                      await api.post(
                                        `/api/admin-control/departments/${row.dept_id}/restore`,
                                      );
                                      toast.success('Department activated');
                                    },
                                  })
                                }
                              >
                                Activate
                              </DropdownMenuItem>
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
        onSaved={() => {
          setLoading(true);
          void loadDepartments();
        }}
      />

      <Dialog open={Boolean(hodDialogRow)} onOpenChange={(open) => !open && setHodDialogRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign HOD</DialogTitle>
            <DialogDescription>
              Choose an eligible Faculty, HOD, or Dean for {hodDialogRow?.dept_name}. Campus mismatch
              is rejected by the server.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5 text-sm">
            <span className="font-semibold text-sgvu-navy">Eligible users</span>
            <Select
              value={hodUserId}
              onChange={(e) => setHodUserId(e.target.value)}
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="">Select HOD</option>
              {hodCandidates.map((person) => (
                <option key={person.user_id} value={person.user_id}>
                  {person.name}
                  {person.role_name ? ` · ${person.role_name}` : ''}
                  {person.dept_name ? ` · ${person.dept_name}` : ''}
                </option>
              ))}
            </Select>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={cn(REG_OUTLINE_BTN)}
              onClick={() => setHodDialogRow(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(REG_BRAND_BTN)}
              disabled={submitting}
              onClick={() => void saveHodAssignment()}
            >
              {submitting ? 'Saving…' : 'Assign HOD'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>{confirmAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={cn(REG_OUTLINE_BTN)}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(REG_BRAND_BTN)}
              disabled={submitting}
              onClick={() => void runConfirmedAction()}
            >
              {submitting ? 'Working…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detailsRow)} onOpenChange={(open) => !open && setDetailsRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="text-sgvu-navy">
              {detailsRow?.dept_name ?? 'Department'}
            </SheetTitle>
            <SheetDescription>
              Related faculty, HOD, programs, and courses from Falcon records.
            </SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading details…
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-3 rounded-xl border border-sgvu-navy/10 bg-muted/20 p-4 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Code: </span>
                  {displayValue(detail.department.dept_code)}
                </p>
                <p>
                  <span className="text-muted-foreground">Status: </span>
                  {statusBadge(detail.department.status)}
                </p>
                <p>
                  <span className="text-muted-foreground">School: </span>
                  {displayValue(detail.department.school_name)}
                </p>
                <p>
                  <span className="text-muted-foreground">Campus: </span>
                  {displayValue(detail.department.campus_name)}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">HOD: </span>
                  {displayValue(detail.department.hod_name)}
                  {detail.department.hod_email
                    ? ` (${detail.department.hod_email})`
                    : ''}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Description: </span>
                  {displayValue(detail.department.description)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Faculty', detail.counts.faculty],
                  ['Programs', detail.counts.programs],
                  ['Courses', detail.counts.courses],
                  ['Students', detail.counts.students],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-sgvu-navy/10 bg-white p-3 text-center"
                  >
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-lg font-bold text-sgvu-navy">
                      {displayCount(value as number | null)}
                    </p>
                  </div>
                ))}
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-sgvu-navy">Faculty</h3>
                {detail.faculty.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No faculty linked.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {detail.faculty.map((person) => (
                      <li
                        key={person.user_id}
                        className="rounded-lg border border-sgvu-navy/10 px-3 py-2"
                      >
                        <p className="font-medium text-sgvu-navy">{person.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[person.role_name, person.email].filter(Boolean).join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-sgvu-navy">Programs</h3>
                {detail.programs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No programs linked.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {detail.programs.map((program) => (
                      <li
                        key={program.program_id}
                        className="rounded-lg border border-sgvu-navy/10 px-3 py-2"
                      >
                        <p className="font-medium text-sgvu-navy">{program.program_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[program.program_code, program.status].filter(Boolean).join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-sgvu-navy">Courses</h3>
                {detail.courses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No courses linked.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {detail.courses.map((course) => (
                      <li
                        key={course.course_id}
                        className="rounded-lg border border-sgvu-navy/10 px-3 py-2"
                      >
                        <p className="font-medium text-sgvu-navy">
                          {course.course_code} — {course.course_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Credits: {displayCount(course.credits)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="flex flex-wrap gap-2">
                {detail.department.status === 'ACTIVE' ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(REG_OUTLINE_BTN)}
                      onClick={() => {
                        setDetailsRow(null);
                        openEdit(detail.department);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(REG_OUTLINE_BTN)}
                      onClick={() => {
                        setDetailsRow(null);
                        setHodDialogRow(detail.department);
                      }}
                    >
                      Assign HOD
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">No detail available.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
