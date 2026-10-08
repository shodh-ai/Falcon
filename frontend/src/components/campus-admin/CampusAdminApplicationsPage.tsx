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

type ApplicationRow = {
  application_id: string;
  status?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  program_name?: string | null;
  program_code?: string | null;
  school_name?: string | null;
  campus_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  lead_stage?: string | null;
  source?: string | null;
  lead_score?: number | null;
};

type ApplicationDetail = ApplicationRow & {
  updated_at?: string | null;
  school_code?: string | null;
  campus_code?: string | null;
  duration_years?: number | null;
  counsellor?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  documents?: Array<{ document_kind: string; status: string }>;
};

function formatStatus(value?: string | null) {
  if (!value) return '—';
  return value.replace(/_/g, ' ');
}

function statusVariant(value?: string | null): 'secondary' | 'warning' | 'success' | 'destructive' {
  const status = (value ?? '').toUpperCase();
  if (status === 'OFFERED' || status === 'ACCEPTED') return 'success';
  if (status === 'REJECTED' || status === 'WITHDRAWN') return 'destructive';
  if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') return 'warning';
  return 'secondary';
}

export function CampusAdminApplicationsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [school, setSchool] = useState('');
  const [selected, setSelected] = useState<ApplicationRow | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ApplicationRow[]>('/api/campus-admin/applications');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
      setError('Unable to load applications.');
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
      .get<ApplicationDetail>(`/api/campus-admin/applications/${selected.application_id}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(selected);
          setDetailError('Unable to load the full application record.');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selected]);

  const statuses = useMemo(
    () => [...new Set(rows.map((row) => row.status).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );
  const schools = useMemo(
    () => [...new Set(rows.map((row) => row.school_name).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        term &&
        !`${row.full_name ?? ''} ${row.email ?? ''} ${row.program_name ?? ''} ${row.program_code ?? ''}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (status && row.status !== status) return false;
      if (school && row.school_name !== school) return false;
      return true;
    });
  }, [q, rows, school, status]);

  const counts = useMemo(() => {
    const underReview = rows.filter((row) =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes((row.status ?? '').toUpperCase()),
    ).length;
    const offered = rows.filter((row) => (row.status ?? '').toUpperCase() === 'OFFERED').length;
    const accepted = rows.filter((row) => (row.status ?? '').toUpperCase() === 'ACCEPTED').length;
    return { total: rows.length, underReview, offered, accepted };
  }, [rows]);

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Applications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Admissions applications for programs on your assigned campus.
            </p>
          </div>
          <Button asChild className="h-9">
            <Link href={campusAdminRoutes.admissionsKanban}>Open Kanban</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CountCard label="Applications" value={loading ? '—' : counts.total} />
        <CountCard label="Under review" value={loading ? '—' : counts.underReview} />
        <CountCard label="Offered" value={loading ? '—' : counts.offered} />
        <CountCard label="Accepted" value={loading ? '—' : counts.accepted} />
      </div>

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
                    placeholder="Search by applicant, email, or program..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-44"
                >
                  <option value="">All statuses</option>
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {formatStatus(item)}
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
                      <th className="p-3 font-medium">Applicant</th>
                      <th className="p-3 font-medium">Program</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">School</th>
                      <th className="p-3 font-medium">Submitted</th>
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
                          No applications for programs on this campus. Track leads on the Kanban board.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row) => (
                        <tr key={row.application_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="p-3">
                            <p className="font-semibold text-sgvu-navy">{row.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{row.email || '—'}</p>
                          </td>
                          <td className="p-3">
                            {row.program_name || '—'}
                            {row.program_code ? (
                              <span className="block text-xs text-muted-foreground">{row.program_code}</span>
                            ) : null}
                          </td>
                          <td className="p-3">
                            <Badge variant={statusVariant(row.status)}>{formatStatus(row.status)}</Badge>
                          </td>
                          <td className="p-3">{row.school_name || '—'}</td>
                          <td className="p-3">{formatDate(row.submitted_at || row.created_at)}</td>
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
          <ApplicationDetailPanel
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

function CountCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-sgvu-navy">{value}</p>
      </CardContent>
    </Card>
  );
}

function ApplicationDetailPanel({
  selected,
  detail,
  loading,
  error,
}: {
  selected: ApplicationRow | null;
  detail: ApplicationDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const record = detail ?? selected;
  if (!record) return null;

  const initials = (record.full_name || 'AP')
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
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Application</p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {record.full_name || 'Applicant'}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {record.program_name || 'Admissions application'}
            </SheetDescription>
            <Badge className="mt-2" variant={statusVariant(record.status)}>
              {formatStatus(record.status)}
            </Badge>
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

        <Section title="Applicant">
          <Field label="Name" value={record.full_name} />
          <Field label="Email" value={record.email} href={record.email ? `mailto:${record.email}` : undefined} />
          <Field label="Phone" value={record.phone} href={record.phone ? `tel:${record.phone}` : undefined} />
          <Field label="Gender" value={detail?.gender} />
          <Field label="Date of birth" value={formatDate(detail?.date_of_birth)} />
          <Field label="Category" value={detail?.category} />
          <Field label="City" value={detail?.city} />
          <Field label="State" value={detail?.state} />
        </Section>

        <Section title="Program">
          <Field label="Program" value={record.program_name} />
          <Field label="Code" value={record.program_code} />
          <Field label="Duration" value={detail?.duration_years != null ? `${detail.duration_years} years` : null} />
          <Field label="School" value={record.school_name} />
          <Field label="Campus" value={detail?.campus_name ?? record.campus_name} />
          <Field label="Campus code" value={detail?.campus_code} />
        </Section>

        <Section title="Pipeline">
          <Field label="Application status" value={formatStatus(record.status)} />
          <Field label="Lead stage" value={formatStatus(record.lead_stage)} />
          <Field label="Source" value={record.source} />
          <Field label="Counsellor" value={detail?.counsellor} />
          <Field label="Lead score" value={record.lead_score} />
          <Field label="Submitted" value={formatDateTime(record.submitted_at)} />
          <Field label="Created" value={formatDateTime(record.created_at)} />
          <Field label="Updated" value={formatDateTime(detail?.updated_at)} />
        </Section>

        {detail?.documents && detail.documents.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Documents</h3>
            <div className="space-y-2">
              {detail.documents.map((doc, index) => (
                <div
                  key={`${doc.document_kind}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{formatStatus(doc.document_kind)}</span>
                  <Badge variant="secondary">{formatStatus(doc.status)}</Badge>
                </div>
              ))}
            </div>
          </section>
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
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
