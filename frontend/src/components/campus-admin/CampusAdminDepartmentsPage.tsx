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
import { Textarea } from '@/components/ui/textarea';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type DepartmentRow = {
  dept_id: number;
  dept_name: string;
  dept_code?: string | null;
  description?: string | null;
  school_id?: number | null;
  school_name?: string | null;
  campus_id?: number | null;
  campus_name?: string | null;
  hod_user_id?: string | null;
  hod_name?: string | null;
  status?: string | null;
  faculty_count?: number | null;
  program_count?: number | null;
  student_count?: number | null;
};

type DepartmentDetail = DepartmentRow & {
  created_at?: string | null;
  school_code?: string | null;
  campus_code?: string | null;
  hod_email?: string | null;
  dean_name?: string | null;
  dean_email?: string | null;
  course_count?: number | null;
};

type Lookups = {
  campuses: Array<{ campus_id: number; campus_name: string }>;
  schools: Array<{
    school_id: number;
    school_name: string;
    campus_id: number | null;
    campus_name?: string | null;
  }>;
};

type HodCandidate = {
  user_id: string;
  name: string;
  email?: string | null;
  role_name?: string | null;
  dept_name?: string | null;
};

type FormState = {
  campus_id: string;
  school_id: string;
  dept_name: string;
  dept_code: string;
  description: string;
  hod_user_id: string;
};

const EMPTY_FORM: FormState = {
  campus_id: '',
  school_id: '',
  dept_name: '',
  dept_code: '',
  description: '',
  hod_user_id: '',
};

export function CampusAdminDepartmentsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<DepartmentRow[]>([]);
  const [lookups, setLookups] = useState<Lookups>({ campuses: [], schools: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [selected, setSelected] = useState<DepartmentRow | null>(null);
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [candidates, setCandidates] = useState<HodCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      if (schoolId) params.set('school_id', schoolId);
      const [deptData, lookupData] = await Promise.all([
        api.get<DepartmentRow[]>(`/api/campus-admin/departments?${params.toString()}`),
        api.get<Lookups>('/api/campus-admin/departments/lookups').catch(() => ({
          campuses: [],
          schools: [],
        })),
      ]);
      setRows(Array.isArray(deptData) ? deptData : []);
      setLookups({
        campuses: Array.isArray(lookupData?.campuses) ? lookupData.campuses : [],
        schools: Array.isArray(lookupData?.schools) ? lookupData.schools : [],
      });
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Unable to load departments.');
    } finally {
      setLoading(false);
    }
  }, [api, schoolId, search, statusFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = q.trim();
      setSearch((prev) => (prev === next ? prev : next));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void api
      .get<DepartmentDetail>(`/api/campus-admin/departments/${selected.dept_id}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(selected);
          setDetailError('Unable to load the full department record.');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selected]);

  useEffect(() => {
    if (!formOpen) return;
    const params = new URLSearchParams();
    if (editing?.dept_id) params.set('dept_id', String(editing.dept_id));
    void api
      .get<HodCandidate[]>(
        `/api/campus-admin/departments/hod-candidates${params.toString() ? `?${params}` : ''}`,
      )
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch(() => setCandidates([]));
  }, [api, editing?.dept_id, formOpen]);

  const schoolsForCampus = useMemo(
    () =>
      lookups.schools.filter(
        (school) => !form.campus_id || String(school.campus_id) === form.campus_id,
      ),
    [form.campus_id, lookups.schools],
  );

  const schoolOptions = useMemo(() => {
    const map = new Map<number, string>();
    lookups.schools.forEach((school) => map.set(school.school_id, school.school_name));
    rows.forEach((row) => {
      if (row.school_id != null && row.school_name) map.set(row.school_id, row.school_name);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [lookups.schools, rows]);

  function openCreate() {
    setEditing(null);
    const defaultCampus =
      lookups.campuses.length === 1 ? String(lookups.campuses[0].campus_id) : '';
    setForm({ ...EMPTY_FORM, campus_id: defaultCampus });
    setFormOpen(true);
  }

  function openEdit(row: DepartmentRow) {
    setEditing(row);
    setForm({
      campus_id: row.campus_id != null ? String(row.campus_id) : '',
      school_id: row.school_id != null ? String(row.school_id) : '',
      dept_name: row.dept_name ?? '',
      dept_code: row.dept_code ?? '',
      description: row.description ?? '',
      hod_user_id: row.hod_user_id ?? '',
    });
    setFormOpen(true);
  }

  async function submitForm() {
    const name = form.dept_name.trim();
    const code = form.dept_code.trim().toUpperCase();
    if (name.length < 2) {
      toast.error('Department name is required.');
      return;
    }
    if (code && code.length < 2) {
      toast.error('Department code must be at least 2 characters.');
      return;
    }
    if (!form.school_id) {
      toast.error('Select a school.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        dept_name: name,
        dept_code: code || null,
        description: form.description.trim() || null,
        school_id: Number(form.school_id),
        hod_user_id: form.hod_user_id || null,
      };
      if (editing) {
        await api.patch(`/api/campus-admin/departments/${editing.dept_id}`, body);
        toast.success('Department updated.');
      } else {
        await api.post('/api/campus-admin/departments', body);
        toast.success('Department created.');
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save department.');
    } finally {
      setSaving(false);
    }
  }

  function askDeactivate(row: DepartmentRow) {
    setConfirmAction({
      title: `Deactivate ${row.dept_name}?`,
      description:
        'The department will become inactive. Historical faculty, programs, and students stay linked.',
      action: async () => {
        await api.del(`/api/campus-admin/departments/${row.dept_id}`);
        toast.success('Department deactivated.');
        setSelected((prev) =>
          prev?.dept_id === row.dept_id ? { ...prev, status: 'INACTIVE' } : prev,
        );
        setDetail((prev) =>
          prev?.dept_id === row.dept_id ? { ...prev, status: 'INACTIVE' } : prev,
        );
        await load();
      },
    });
  }

  function askActivate(row: DepartmentRow) {
    setConfirmAction({
      title: `Activate ${row.dept_name}?`,
      description: 'The department will become active again for campus operations.',
      action: async () => {
        await api.post(`/api/campus-admin/departments/${row.dept_id}/activate`);
        toast.success('Department activated.');
        setSelected((prev) =>
          prev?.dept_id === row.dept_id ? { ...prev, status: 'ACTIVE' } : prev,
        );
        setDetail((prev) =>
          prev?.dept_id === row.dept_id ? { ...prev, status: 'ACTIVE' } : prev,
        );
        await load();
      },
    });
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Departments</h1>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_160px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search department, code, or school"
                className="h-11 rounded-xl border-sgvu-navy/15 pl-9"
              />
            </div>
            <Select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="">All schools</option>
              {schoolOptions.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')
              }
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All statuses</option>
            </Select>
            <Button
              type="button"
              className="h-11 rounded-xl bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
              onClick={openCreate}
            >
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          {error ? (
            <div className="space-y-3 px-6 py-16 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto p-4 md:p-5">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-medium">Department</th>
                    <th className="p-3 font-medium">School / Campus</th>
                    <th className="p-3 font-medium">HOD</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Faculty</th>
                    <th className="p-3 font-medium">Programs</th>
                    <th className="p-3 font-medium">Students</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading…
                        </span>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-muted-foreground">
                        No departments found for this campus.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.dept_id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="p-3">
                          <p className="font-semibold text-sgvu-navy">{row.dept_name}</p>
                          {row.dept_code ? (
                            <p className="text-xs text-muted-foreground">{row.dept_code}</p>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <p>{row.school_name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{row.campus_name ?? '—'}</p>
                        </td>
                        <td className="p-3">{row.hod_name ?? '—'}</td>
                        <td className="p-3">{statusBadge(row.status)}</td>
                        <td className="p-3">{formatCount(row.faculty_count)}</td>
                        <td className="p-3">{formatCount(row.program_count)}</td>
                        <td className="p-3">{formatCount(row.student_count)}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            className="text-sm font-semibold text-sgvu-navy hover:underline"
                            onClick={() => setSelected(row)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          <DepartmentDetailPanel
            selected={selected}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onEdit={() => {
              if (!selected) return;
              openEdit(selected);
              setSelected(null);
            }}
            onActivate={() => selected && askActivate(selected)}
            onDeactivate={() => selected && askDeactivate(selected)}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">
              {editing ? 'Edit Department' : 'Create Department'}
            </DialogTitle>
            <DialogDescription>
              Campus → School → Department. Assign an HOD from eligible campus faculty.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Campus</span>
              <Select
                value={form.campus_id}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    campus_id: e.target.value,
                    school_id: '',
                  }))
                }
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">Select campus</option>
                {lookups.campuses.map((campus) => (
                  <option key={campus.campus_id} value={campus.campus_id}>
                    {campus.campus_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">School *</span>
              <Select
                value={form.school_id}
                onChange={(e) => setForm((prev) => ({ ...prev, school_id: e.target.value }))}
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">Select school</option>
                {schoolsForCampus.map((school) => (
                  <option key={school.school_id} value={school.school_id}>
                    {school.school_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Department name *</span>
              <Input
                value={form.dept_name}
                onChange={(e) => setForm((prev) => ({ ...prev, dept_name: e.target.value }))}
                className="h-11 rounded-xl border-sgvu-navy/15"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Department code</span>
              <Input
                value={form.dept_code}
                onChange={(e) => setForm((prev) => ({ ...prev, dept_code: e.target.value }))}
                className="h-11 rounded-xl border-sgvu-navy/15"
                placeholder="CSE"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">HOD</span>
              <Select
                value={form.hod_user_id}
                onChange={(e) => setForm((prev) => ({ ...prev, hod_user_id: e.target.value }))}
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">No HOD assigned</option>
                {candidates.map((candidate) => (
                  <option key={candidate.user_id} value={candidate.user_id}>
                    {candidate.name}
                    {candidate.role_name ? ` (${candidate.role_name})` : ''}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Description</span>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="min-h-[90px] rounded-xl border-sgvu-navy/15"
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
              disabled={saving}
              onClick={() => void submitForm()}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>{confirmAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
              onClick={() => {
                const action = confirmAction?.action;
                setConfirmAction(null);
                if (action) {
                  void action().catch((err) =>
                    toast.error(err instanceof Error ? err.message : 'Action failed'),
                  );
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusBadge(status?: string | null) {
  const active = String(status ?? 'ACTIVE').toUpperCase() === 'ACTIVE';
  if (active) {
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

function DepartmentDetailPanel({
  selected,
  detail,
  loading,
  error,
  onEdit,
  onActivate,
  onDeactivate,
}: {
  selected: DepartmentRow | null;
  detail: DepartmentDetail | null;
  loading: boolean;
  error: string | null;
  onEdit: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const record = detail ?? selected;
  if (!record) return null;

  const inactive = String(record.status).toUpperCase() === 'INACTIVE';
  const initials = record.dept_name
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
            {initials || 'DP'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Department
            </p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {record.dept_name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {record.school_name || 'Department details'}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {statusBadge(detail?.status ?? record.status)}
              <Button type="button" size="sm" className="h-8 bg-sgvu-navy text-white hover:bg-sgvu-navy/90" onClick={onEdit}>
                Edit
              </Button>
              {inactive ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                  onClick={onActivate}
                >
                  Activate
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-amber-200 text-amber-800 hover:bg-amber-50"
                  onClick={onDeactivate}
                >
                  Deactivate
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading details…
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Section title="Organization">
          <Field label="Department" value={record.dept_name} />
          <Field label="Code" value={detail?.dept_code ?? record.dept_code} />
          <Field label="School" value={record.school_name} />
          <Field label="Campus" value={detail?.campus_name ?? record.campus_name} />
          <Field label="Created" value={formatDate(detail?.created_at)} />
        </Section>

        <Section title="Leadership">
          <Field label="HOD" value={detail?.hod_name ?? record.hod_name} />
          <Field
            label="HOD email"
            value={detail?.hod_email}
            href={detail?.hod_email ? `mailto:${detail.hod_email}` : undefined}
          />
          <Field label="Dean" value={detail?.dean_name} />
        </Section>

        <Section title="People & academics">
          <Field label="Faculty" value={formatCount(detail?.faculty_count ?? record.faculty_count)} />
          <Field label="Students" value={formatCount(detail?.student_count ?? record.student_count)} />
          <Field label="Programs" value={formatCount(detail?.program_count ?? record.program_count)} />
          <Field label="Courses" value={formatCount(detail?.course_count)} />
        </Section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Description
          </h3>
          <p className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2 text-sm font-medium text-sgvu-navy">
            {detail?.description || record.description || '—'}
          </p>
        </section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">{title}</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
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
          <a href={href} className="text-sgvu-navy underline-offset-2 hover:underline">
            {display}
          </a>
        ) : (
          display
        )}
      </dd>
    </div>
  );
}

function formatCount(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-IN');
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
