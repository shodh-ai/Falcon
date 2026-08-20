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

type StudentRow = {
  user_id: string;
  name: string;
  email?: string | null;
  dept_name?: string | null;
  school_name?: string | null;
};

type StudentDetail = StudentRow & {
  phone?: string | null;
  is_active?: boolean;
  onboarding_status?: string | null;
  campus_name?: string | null;
  enrollment_no?: string | null;
  prn_number?: string | null;
  admission_number?: string | null;
  abc_id?: string | null;
  batch?: string | null;
  current_semester?: number | null;
  section_code?: string | null;
  program_name?: string | null;
  degree_name?: string | null;
  advisor_name?: string | null;
  status?: string | null;
  admission_type?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  blood_group?: string | null;
  nationality?: string | null;
  category?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
};

export function CampusAdminStudentsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [school, setSchool] = useState('');
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<StudentRow[]>('/api/campus-admin/students');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Unable to load students.');
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
      .get<StudentDetail>(`/api/campus-admin/students/${selected.user_id}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(selected);
          setDetailError('Unable to load the full student record.');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selected]);

  const departments = useMemo(
    () => [...new Set(rows.map((row) => row.dept_name).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );
  const schools = useMemo(
    () => [...new Set(rows.map((row) => row.school_name).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !`${row.name} ${row.email ?? ''} ${row.dept_name ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      if (department && row.dept_name !== department) return false;
      if (school && row.school_name !== school) return false;
      return true;
    });
  }, [department, q, rows, school]);

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Students placed in departments on your assigned campus.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Students</p>
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
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-48"
                >
                  <option value="">All departments</option>
                  {departments.map((item) => (
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
                      <th className="p-3 font-medium">Department</th>
                      <th className="p-3 font-medium">School</th>
                      <th className="p-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No students found for this campus.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row) => (
                        <tr key={row.user_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="p-3 font-semibold text-sgvu-navy">{row.name}</td>
                          <td className="p-3 text-muted-foreground">{row.email || '—'}</td>
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
          <StudentDetailPanel
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

function StudentDetailPanel({
  selected,
  detail,
  loading,
  error,
}: {
  selected: StudentRow | null;
  detail: StudentDetail | null;
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
            {initials || 'ST'}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Student</p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {record.name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {detail?.enrollment_no || detail?.prn_number || record.email || 'Student details'}
            </SheetDescription>
            {detail?.status || detail?.is_active != null ? (
              <Badge className="mt-2" variant="secondary">
                {detail?.status || (detail?.is_active ? 'Active' : 'Inactive')}
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

        <Section title="Identity">
          <Field label="Enrollment no." value={detail?.enrollment_no} />
          <Field label="PRN" value={detail?.prn_number} />
          <Field label="Admission no." value={detail?.admission_number} />
          <Field label="ABC ID" value={detail?.abc_id} />
          <Field label="Onboarding" value={detail?.onboarding_status} />
        </Section>

        <Section title="Contact">
          <Field label="Email" value={record.email} href={record.email ? `mailto:${record.email}` : undefined} />
          <Field label="Phone" value={detail?.phone} href={detail?.phone ? `tel:${detail.phone}` : undefined} />
          <Field label="Gender" value={detail?.gender} />
          <Field label="Date of birth" value={formatDate(detail?.date_of_birth)} />
          <Field label="Blood group" value={detail?.blood_group} />
          <Field label="Nationality" value={detail?.nationality} />
          <Field label="Category" value={detail?.category} />
        </Section>

        <Section title="Academics">
          <Field label="Program" value={detail?.program_name} />
          <Field label="Degree" value={detail?.degree_name} />
          <Field label="Department" value={record.dept_name} />
          <Field label="School" value={record.school_name} />
          <Field label="Campus" value={detail?.campus_name} />
          <Field label="Batch" value={detail?.batch} />
          <Field label="Semester" value={detail?.current_semester} />
          <Field label="Section" value={detail?.section_code} />
          <Field label="Advisor" value={detail?.advisor_name} />
          <Field label="Admission type" value={detail?.admission_type} />
        </Section>

        <Section title="Family / emergency">
          <Field label="Father" value={detail?.father_name} />
          <Field label="Mother" value={detail?.mother_name} />
          <Field label="Emergency contact" value={detail?.emergency_contact_name} />
          <Field
            label="Emergency phone"
            value={detail?.emergency_contact_phone}
            href={detail?.emergency_contact_phone ? `tel:${detail.emergency_contact_phone}` : undefined}
          />
        </Section>
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

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
