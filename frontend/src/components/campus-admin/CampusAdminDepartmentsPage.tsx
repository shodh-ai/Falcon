'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuthedApi } from '@/lib/api';

type DepartmentRow = {
  dept_id: number;
  dept_name: string;
  description?: string | null;
  school_id: number;
  school_name: string;
  campus_name?: string | null;
  hod_name?: string | null;
};

type DepartmentDetail = DepartmentRow & {
  status?: string | null;
  created_at?: string | null;
  school_code?: string | null;
  campus_code?: string | null;
  hod_email?: string | null;
  dean_name?: string | null;
  dean_email?: string | null;
  program_count?: number | null;
  faculty_count?: number | null;
  student_count?: number | null;
  course_count?: number | null;
};

export function CampusAdminDepartmentsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [selected, setSelected] = useState<DepartmentRow | null>(null);
  const [detail, setDetail] = useState<DepartmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<DepartmentRow[]>('/api/campus-admin/departments');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Unable to load departments.');
    } finally {
      setLoading(false);
    }
  }, [api]);

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

  const schools = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((row) => map.set(row.school_id, row.school_name));
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !`${row.dept_name} ${row.school_name}`.toLowerCase().includes(term)) return false;
      if (schoolId && String(row.school_id) !== schoolId) return false;
      return true;
    });
  }, [q, rows, schoolId]);

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Departments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Departments that belong to schools on your assigned campus.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Departments</p>
          <p className="mt-1 text-2xl font-bold text-sgvu-navy">{loading ? '—' : rows.length}</p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          {error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search departments..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                <Select
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:w-56"
                >
                  <option value="">All schools</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 font-medium">Department</th>
                      <th className="p-3 font-medium">School</th>
                      <th className="p-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-muted-foreground">
                          No departments found for this campus.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row) => (
                        <tr key={row.dept_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="p-3 font-semibold text-sgvu-navy">{row.dept_name}</td>
                          <td className="p-3">{row.school_name}</td>
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
            </>
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
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DepartmentDetailPanel({
  selected,
  detail,
  loading,
  error,
}: {
  selected: DepartmentRow | null;
  detail: DepartmentDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const record = detail ?? selected;
  if (!record) return null;

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
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Department</p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {record.dept_name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {record.school_name || 'Department details'}
            </SheetDescription>
            {detail?.status ? (
              <Badge className="mt-2" variant="secondary">
                {detail.status}
              </Badge>
            ) : null}
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
          <Field label="School" value={record.school_name} />
          <Field label="School code" value={detail?.school_code} />
          <Field label="Campus" value={detail?.campus_name ?? record.campus_name} />
          <Field label="Campus code" value={detail?.campus_code} />
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
          <Field
            label="Dean email"
            value={detail?.dean_email}
            href={detail?.dean_email ? `mailto:${detail.dean_email}` : undefined}
          />
        </Section>

        <Section title="People & academics">
          <Field label="Faculty" value={formatCount(detail?.faculty_count)} />
          <Field label="Students" value={formatCount(detail?.student_count)} />
          <Field label="Programs" value={formatCount(detail?.program_count)} />
          <Field label="Courses" value={formatCount(detail?.course_count)} />
        </Section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Description</h3>
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
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
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
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toLocaleString('en-IN');
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
