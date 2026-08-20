'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
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
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { withAccessToken } from '@/lib/authenticated-download-url';
import {
  deriveEnrolledStudentBranches,
  mergeEnrolledStudentBranches,
  type EnrolledStudentBranch,
} from '@/lib/enrolled-student-filters';
import { toast } from '@/lib/notifications/falcon-toast';

const REQUIRED_DOCS = [
  '10th Marksheet',
  '12th Marksheet',
  'Aadhar Card',
  'PAN Card',
  'Admission Form',
  'Migration Certificate',
] as const;

const PAGE_SIZE = 10;

type DocRow = {
  title: string;
  file_path: string;
  uploaded_at?: string | null;
};

type FeeRow = {
  transaction_id: string;
  amount?: number | string | null;
  status?: string | null;
  receipt_url?: string | null;
  fee_head?: string | null;
};

type EnrolledStudent = {
  user_id: string;
  name: string;
  email?: string | null;
  enrollment_no?: string | null;
  batch?: string | null;
  dept_id?: number | null;
  dept_name?: string | null;
  documents?: DocRow[];
  transactions?: FeeRow[];
};

type DocStatus = 'missing' | 'partial' | 'complete';
type SortKey = 'name' | 'email' | 'enrollment_no' | 'dept_name' | 'docs';
type ViewMode = 'list' | 'board';

function uploadedCount(docs?: DocRow[] | null) {
  if (!docs?.length) return 0;
  return REQUIRED_DOCS.filter((title) => docs.some((doc) => doc.title === title)).length;
}

function docStatus(count: number): DocStatus {
  if (count <= 0) return 'missing';
  if (count >= REQUIRED_DOCS.length) return 'complete';
  return 'partial';
}

function statusLabel(status: DocStatus) {
  if (status === 'complete') return 'Complete';
  if (status === 'partial') return 'In progress';
  return 'Missing';
}

function statusClass(status: DocStatus) {
  if (status === 'complete') return 'font-bold text-emerald-600';
  if (status === 'partial') return 'font-bold text-amber-600';
  return 'font-bold text-red-500';
}

function statusBadge(status: DocStatus): 'success' | 'warning' | 'destructive' {
  if (status === 'complete') return 'success';
  if (status === 'partial') return 'warning';
  return 'destructive';
}

function display(value?: string | number | null) {
  if (value == null || value === '') return '—';
  return String(value);
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

function fileHref(path: string, token?: string | null) {
  if (!path || path === 'pending_refresh') return '';
  if (path.startsWith('http')) return withAccessToken(path, token);
  return withAccessToken(
    `${getApiBaseUrl()}/api/uploads/download?path=${encodeURIComponent(path)}`,
    token,
  );
}

export function CampusAdminEnrolledStudentsPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<EnrolledStudent[]>([]);
  const [branches, setBranches] = useState<EnrolledStudentBranch[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [year, setYear] = useState('');
  const [branch, setBranch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<EnrolledStudent | null>(null);
  const [uploadingDocTitle, setUploadingDocTitle] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      if (year) params.set('year', year);
      if (branch) params.set('branch', branch);
      const data = await api.get<EnrolledStudent[]>(
        `/api/admissions-crm/enrolled-students?${params.toString()}`,
      );
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);
      setYears((prev) =>
        [...new Set([...prev, ...nextRows.map((row) => row.batch).filter((value): value is string => Boolean(value))])]
          .sort()
          .reverse(),
      );
      if (!branch) {
        setBranches((prev) =>
          mergeEnrolledStudentBranches(prev, deriveEnrolledStudentBranches(nextRows)),
        );
      }
    } catch (err) {
      setRows([]);
      setError(parseApiError(err) || 'Unable to load enrolled students.');
    } finally {
      setLoading(false);
    }
  }, [api, branch, debouncedQ, year]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api
      .get<EnrolledStudentBranch[]>('/api/admissions-crm/enrolled-students/branches')
      .then((data) => {
        if (Array.isArray(data) && data.length) {
          setBranches((prev) => mergeEnrolledStudentBranches(prev, data));
        }
      })
      .catch(() => {
        /* branches still derive from loaded students */
      });
  }, [api]);

  useEffect(() => {
    if (!selected) return;
    const latest = rows.find((row) => row.user_id === selected.user_id);
    if (latest) setSelected(latest);
  }, [rows, selected?.user_id]);

  const counts = useMemo(() => {
    let complete = 0;
    let partial = 0;
    let missing = 0;
    for (const row of rows) {
      const status = docStatus(uploadedCount(row.documents));
      if (status === 'complete') complete += 1;
      else if (status === 'partial') partial += 1;
      else missing += 1;
    }
    return { total: rows.length, complete, partial, missing };
  }, [rows]);

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      if (!statusFilter) return true;
      return docStatus(uploadedCount(row.documents)) === statusFilter;
    });
    const direction = sortDir === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      const aCount = uploadedCount(a.documents);
      const bCount = uploadedCount(b.documents);
      let left = '';
      let right = '';
      if (sortKey === 'docs') return (aCount - bCount) * direction;
      if (sortKey === 'email') {
        left = a.email ?? '';
        right = b.email ?? '';
      } else if (sortKey === 'enrollment_no') {
        left = a.enrollment_no ?? '';
        right = b.enrollment_no ?? '';
      } else if (sortKey === 'dept_name') {
        left = `${a.dept_name ?? ''} ${a.batch ?? ''}`;
        right = `${b.dept_name ?? ''} ${b.batch ?? ''}`;
      } else {
        left = a.name ?? '';
        right = b.name ?? '';
      }
      return left.localeCompare(right, undefined, { sensitivity: 'base' }) * direction;
    });
    return next;
  }, [rows, sortDir, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, year, branch, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const exportCsv = () => {
    const header = [
      'Name',
      'Email',
      'Student ID',
      'Branch',
      'Year',
      'Documents uploaded',
      'Documents required',
      'Status',
    ];
    const lines = [
      header.join(','),
      ...filtered.map((row) => {
        const count = uploadedCount(row.documents);
        return [
          csvCell(row.name ?? ''),
          csvCell(row.email ?? ''),
          csvCell(row.enrollment_no ?? ''),
          csvCell(row.dept_name ?? ''),
          csvCell(row.batch ?? ''),
          String(count),
          String(REQUIRED_DOCS.length),
          statusLabel(docStatus(count)),
        ].join(',');
      }),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'enrolled-student-documents.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadingDocTitle || !selected) return;
    const formData = new FormData();
    formData.append('file', file);
    api
      .post<{ path: string }>('/api/uploads/single', formData)
      .then((res) =>
        api.post(`/api/admissions-crm/enrolled-students/${selected.user_id}/documents`, {
          title: uploadingDocTitle,
          file_path: res.path,
        }),
      )
      .then(() => {
        toast.success(`${uploadingDocTitle} uploaded`);
        void load();
      })
      .catch((err) => toast.error(parseApiError(err) || `Failed to upload ${uploadingDocTitle}`))
      .finally(() => {
        setUploadingDocTitle(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  const boardColumns: Array<{ id: DocStatus; title: string; students: EnrolledStudent[] }> = [
    { id: 'missing', title: 'Missing documents', students: filtered.filter((row) => docStatus(uploadedCount(row.documents)) === 'missing') },
    { id: 'partial', title: 'In progress', students: filtered.filter((row) => docStatus(uploadedCount(row.documents)) === 'partial') },
    { id: 'complete', title: 'Complete', students: filtered.filter((row) => docStatus(uploadedCount(row.documents)) === 'complete') },
  ];

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">
              Enrolled Students Documents
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track required admission documents for enrolled students on your assigned campus.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-9" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button className="h-9" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CountCard label="Students" value={loading ? '—' : counts.total} />
        <CountCard label="Complete" value={loading ? '—' : counts.complete} />
        <CountCard label="In progress" value={loading ? '—' : counts.partial} />
        <CountCard label="Missing" value={loading ? '—' : counts.missing} />
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
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name, email, ID..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                <Select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 xl:w-36"
                >
                  <option value="">All years</option>
                  {years.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 xl:w-52"
                >
                  <option value="">All branches</option>
                  {branches.map((item) => (
                    <option key={item.branch_key} value={item.branch_key}>
                      {item.dept_name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 xl:w-44"
                >
                  <option value="">All document status</option>
                  <option value="missing">Missing</option>
                  <option value="partial">In progress</option>
                  <option value="complete">Complete</option>
                </Select>
                <div className="flex rounded-xl border border-sgvu-navy/15 p-1">
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${view === 'list' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setView('list')}
                  >
                    <List className="h-3.5 w-3.5" />
                    List
                  </button>
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${view === 'board' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setView('board')}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Board
                  </button>
                </div>
              </div>

              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleUpload}
              />

              {loading ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading enrolled students…
                </p>
              ) : view === 'board' ? (
                <div className="grid gap-3 lg:grid-cols-3">
                  {boardColumns.map((column) => (
                    <div key={column.id} className="rounded-xl border border-sgvu-navy/10 bg-slate-50/60 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {column.title}
                        </p>
                        <Badge variant={statusBadge(column.id)}>{column.students.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {column.students.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-sgvu-navy/15 bg-white px-3 py-6 text-center text-xs text-muted-foreground">
                            No students in this status.
                          </p>
                        ) : (
                          column.students.map((row) => {
                            const count = uploadedCount(row.documents);
                            return (
                              <button
                                key={row.user_id}
                                type="button"
                                className="w-full rounded-lg border border-sgvu-navy/10 bg-white p-3 text-left hover:border-sgvu-navy/25"
                                onClick={() => setSelected(row)}
                              >
                                <p className="font-semibold text-sgvu-navy">{row.name}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {display(row.enrollment_no)} · {display(row.dept_name)}
                                </p>
                                <p className={`mt-2 text-sm ${statusClass(docStatus(count))}`}>
                                  {count}/{REQUIRED_DOCS.length}
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <SortHeader label="Student name" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
                          <SortHeader label="Email" active={sortKey === 'email'} dir={sortDir} onClick={() => toggleSort('email')} />
                          <SortHeader label="Student ID" active={sortKey === 'enrollment_no'} dir={sortDir} onClick={() => toggleSort('enrollment_no')} />
                          <SortHeader label="Branch / year" active={sortKey === 'dept_name'} dir={sortDir} onClick={() => toggleSort('dept_name')} />
                          <SortHeader
                            label="Documents status"
                            active={sortKey === 'docs'}
                            dir={sortDir}
                            onClick={() => toggleSort('docs')}
                            className="text-center"
                          />
                          <th className="p-3 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              No enrolled students match these filters.
                            </td>
                          </tr>
                        ) : (
                          pageRows.map((row) => {
                            const count = uploadedCount(row.documents);
                            const status = docStatus(count);
                            return (
                              <tr key={row.user_id} className="border-b last:border-0 hover:bg-muted/40">
                                <td className="p-3 font-semibold text-sgvu-navy">{display(row.name)}</td>
                                <td className="p-3 text-muted-foreground">{display(row.email)}</td>
                                <td className="p-3">{display(row.enrollment_no)}</td>
                                <td className="p-3">
                                  {display(row.dept_name)}
                                  <br />
                                  <span className="text-xs text-muted-foreground">{display(row.batch)}</span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={statusClass(status)}>
                                    {count}/{REQUIRED_DOCS.length}
                                  </span>
                                </td>
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
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
                      {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        className="h-8"
                        size="sm"
                        variant="outline"
                        disabled={safePage <= 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        className="h-8"
                        size="sm"
                        variant="outline"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          <StudentDocumentsPanel
            student={selected}
            token={token}
            uploadingDocTitle={uploadingDocTitle}
            onUpload={(title) => {
              setUploadingDocTitle(title);
              fileInputRef.current?.click();
            }}
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

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className = '',
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`p-3 font-medium ${className}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-sgvu-navy" onClick={onClick}>
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

function StudentDocumentsPanel({
  student,
  token,
  uploadingDocTitle,
  onUpload,
}: {
  student: EnrolledStudent | null;
  token?: string | null;
  uploadingDocTitle: string | null;
  onUpload: (title: string) => void;
}) {
  if (!student) return null;
  const count = uploadedCount(student.documents);
  const status = docStatus(count);
  const initials = student.name
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
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Admission documents
            </p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {student.name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {student.enrollment_no || student.email || 'Student details'}
            </SheetDescription>
            <Badge className="mt-2" variant={statusBadge(status)}>
              {count}/{REQUIRED_DOCS.length} {statusLabel(status).toLowerCase()}
            </Badge>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        <Section title="Student">
          <Field label="Name" value={student.name} />
          <Field label="Email" value={student.email} href={student.email ? `mailto:${student.email}` : undefined} />
          <Field label="Student ID" value={student.enrollment_no} />
          <Field label="Branch" value={student.dept_name} />
          <Field label="Year" value={student.batch} />
        </Section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Required documents
          </h3>
          <div className="overflow-hidden rounded-lg border border-sgvu-navy/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-3 font-medium">Document</th>
                  <th className="p-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {REQUIRED_DOCS.map((title) => {
                  const existing = student.documents?.find((doc) => doc.title === title);
                  const href = existing ? fileHref(existing.file_path, token) : '';
                  return (
                    <tr key={title} className="border-b last:border-0">
                      <td className="p-3">
                        <p className="font-medium text-sgvu-navy">{title}</p>
                        <p className="text-xs text-muted-foreground">
                          {existing ? formatDate(existing.uploaded_at) || 'Uploaded' : 'Not uploaded'}
                        </p>
                      </td>
                      <td className="p-3 text-right">
                        {existing && href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-sgvu-navy hover:underline"
                          >
                            View
                          </a>
                        ) : existing ? (
                          <span className="text-xs text-muted-foreground">Refreshing…</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={uploadingDocTitle === title}
                            onClick={() => onUpload(title)}
                          >
                            {uploadingDocTitle === title ? 'Uploading…' : 'Upload'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {student.transactions?.length ? (
          <Section title="Fee receipts">
            {student.transactions.map((txn) => (
              <Field
                key={txn.transaction_id}
                label={txn.fee_head || 'Fee'}
                value={txn.amount != null ? `${display(txn.status)} · ${display(txn.amount)}` : txn.status}
                href={txn.receipt_url ? fileHref(txn.receipt_url, token) : undefined}
              />
            ))}
          </Section>
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
  const text = display(value);
  return (
    <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">
        {href && text !== '—' ? (
          <a href={href} className="text-sgvu-navy underline-offset-2 hover:underline">
            {text}
          </a>
        ) : (
          text
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
