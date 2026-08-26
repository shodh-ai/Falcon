'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
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
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { useAuthedApi } from '@/lib/api';

type StaffRow = {
  user_id: string;
  name: string;
  email?: string | null;
  role_name?: string | null;
  dept_name?: string | null;
  school_name?: string | null;
};

type StaffDetail = StaffRow & {
  phone?: string | null;
  gender?: string | null;
  is_active?: boolean;
  onboarding_status?: string | null;
  campus_name?: string | null;
  reporting_officer_name?: string | null;
  employee_id?: string | null;
  designation?: string | null;
  joining_date?: string | null;
  total_experience_years?: number | null;
  industry_experience_years?: number | null;
  orcid_id?: string | null;
  scopus_id?: string | null;
  google_scholar_url?: string | null;
  week_off?: string | null;
  shift_name?: string | null;
  qualifications?: Array<{
    degree_level?: string | null;
    degree_name?: string | null;
    university?: string | null;
    passing_year?: number | null;
    specialization?: string | null;
  }>;
};

export type CampusAdminPeoplePreset = 'all' | 'faculty' | 'hod' | 'staff';

type CampusAdminFacultyStaffPageProps = {
  preset?: CampusAdminPeoplePreset;
  pageTitle?: string;
  pageDescription?: string;
  sectionLabel?: string;
};

const FACULTY_ROLES = new Set(['faculty', 'dean']);
const HOD_ROLES = new Set(['hod']);
const STAFF_ROLES = new Set([
  'warden',
  'librarian',
  'labadmin',
  'transportofficer',
  'accountant',
  'hr',
  'hradmin',
]);

function matchesPeoplePreset(roleName: string | null | undefined, preset: CampusAdminPeoplePreset) {
  if (preset === 'all') return true;
  const role = String(roleName ?? '').trim().toLowerCase();
  if (!role) return false;
  if (preset === 'faculty') return FACULTY_ROLES.has(role);
  if (preset === 'hod') return HOD_ROLES.has(role);
  return STAFF_ROLES.has(role);
}

export function CampusAdminFacultyStaffPage({
  preset = 'all',
  pageTitle = 'Faculty & Staff',
  pageDescription = 'Employees whose department sits on your assigned campus.',
  sectionLabel = 'Campus Administration',
}: CampusAdminFacultyStaffPageProps = {}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [school, setSchool] = useState('');
  const [selected, setSelected] = useState<StaffRow | null>(null);
  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const roleQuery =
        preset === 'all' ? '' : `?role=${encodeURIComponent(preset)}`;
      const data = await api.get<StaffRow[]>(
        `/api/campus-admin/faculty-staff${roleQuery}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Unable to load faculty and staff.');
    } finally {
      setLoading(false);
    }
  }, [api, preset]);

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
      .get<StaffDetail>(`/api/campus-admin/faculty-staff/${selected.user_id}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(selected);
          setDetailError('Unable to load the full faculty record.');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selected]);

  const visibleRows = useMemo(
    () => rows.filter((row) => matchesPeoplePreset(row.role_name, preset)),
    [preset, rows],
  );

  const roles = useMemo(
    () =>
      [
        ...new Set(
          visibleRows.map((row) => row.role_name).filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [visibleRows],
  );
  const schools = useMemo(
    () =>
      [
        ...new Set(
          visibleRows.map((row) => row.school_name).filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [visibleRows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesPeoplePreset(row.role_name, preset)) return false;
      if (
        term &&
        !`${row.name} ${row.email ?? ''} ${row.dept_name ?? ''}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (role && row.role_name !== role) return false;
      if (school && row.school_name !== school) return false;
      return true;
    });
  }, [preset, q, role, rows, school]);

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">{sectionLabel}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">{pageTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{pageDescription}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create or edit accounts from User Management.
            </p>
          </div>
          <Button asChild className="h-9" variant="outline">
            <Link href={campusAdminRoutes.peopleUsers}>Manage users</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pageTitle}</p>
          <p className="mt-1 text-2xl font-bold text-sgvu-navy">{loading ? '—' : visibleRows.length}</p>
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
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name or email..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-40"
                >
                  <option value="">All roles</option>
                  {roles.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Select
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-56"
                >
                  <option value="">All schools</option>
                  {schools.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">Email</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium">Department</th>
                      <th className="p-3 font-medium">School</th>
                      <th className="p-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No faculty or staff found for this campus.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row) => (
                        <tr key={row.user_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="p-3 font-semibold text-sgvu-navy">{row.name}</td>
                          <td className="p-3 text-muted-foreground">{row.email || '—'}</td>
                          <td className="p-3">
                            <Badge variant="secondary">{row.role_name || '—'}</Badge>
                          </td>
                          <td className="p-3">{row.dept_name || '—'}</td>
                          <td className="p-3">{row.school_name || '—'}</td>
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
          <StaffDetailPanel
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

function StaffDetailPanel({
  selected,
  detail,
  loading,
  error,
}: {
  selected: StaffRow | null;
  detail: StaffDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const record = detail ?? selected;
  if (!record) return null;

  const initials = record.name
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
            {initials || 'FS'}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Faculty & Staff
            </p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {record.name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {record.role_name || 'Staff'}
              {detail?.designation ? ` · ${detail.designation}` : ''}
            </SheetDescription>
            {detail?.is_active != null ? (
              <Badge className="mt-2" variant="secondary">
                {detail.is_active ? 'Active' : 'Inactive'}
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

        <Section title="Contact">
          <Field label="Email" value={record.email} href={record.email ? `mailto:${record.email}` : undefined} />
          <Field label="Phone" value={detail?.phone} href={detail?.phone ? `tel:${detail.phone}` : undefined} />
          <Field label="Gender" value={detail?.gender} />
        </Section>

        <Section title="Organization">
          <Field label="Role" value={record.role_name} />
          <Field label="Employee ID" value={detail?.employee_id} />
          <Field label="Department" value={record.dept_name} />
          <Field label="School" value={record.school_name} />
          <Field label="Campus" value={detail?.campus_name} />
          <Field label="Reporting officer" value={detail?.reporting_officer_name} />
        </Section>

        <Section title="Employment">
          <Field label="Designation" value={detail?.designation} />
          <Field label="Joining date" value={formatDate(detail?.joining_date)} />
          <Field label="Teaching experience" value={formatYears(detail?.total_experience_years)} />
          <Field label="Industry experience" value={formatYears(detail?.industry_experience_years)} />
          <Field label="Shift" value={detail?.shift_name} />
          <Field label="Week off" value={detail?.week_off} />
          <Field label="Onboarding" value={detail?.onboarding_status} />
        </Section>

        <Section title="Academic identifiers">
          <Field label="ORCID" value={detail?.orcid_id} />
          <Field label="Scopus" value={detail?.scopus_id} />
          <Field
            label="Google Scholar"
            value={detail?.google_scholar_url}
            href={detail?.google_scholar_url || undefined}
            span
          />
        </Section>

        {detail?.qualifications && detail.qualifications.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
              Qualifications
            </h3>
            <div className="space-y-2">
              {detail.qualifications.map((item, index) => (
                <div
                  key={`${item.degree_name ?? 'qual'}-${index}`}
                  className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-sgvu-navy">
                    {[item.degree_level, item.degree_name].filter(Boolean).join(' · ') || 'Qualification'}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {[item.university, item.specialization, item.passing_year]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
  span,
}: {
  label: string;
  value?: string | number | null;
  href?: string;
  span?: boolean;
}) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className={`rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2 ${span ? 'sm:col-span-2' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">
        {href && display !== '—' ? (
          <a href={href} className="text-sgvu-navy underline-offset-2 hover:underline" target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {display}
          </a>
        ) : (
          display
        )}
      </dd>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatYears(value?: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return `${value} year${value === 1 ? '' : 's'}`;
}
