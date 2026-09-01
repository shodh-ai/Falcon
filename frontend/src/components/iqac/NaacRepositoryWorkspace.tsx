'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Loader2,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type CriterionRow = {
  criterion: number;
  title: string;
  document_count: number;
  readiness: 'READY' | 'IN_PROGRESS' | 'NEEDS_ATTENTION' | string;
};

type DocumentRow = {
  document_id: string;
  naac_criterion: number;
  metric_number?: string | null;
  title: string;
  file_path: string;
  academic_year?: string;
  created_at?: string;
  uploaded_by_name?: string | null;
};

type RepoData = {
  academic_year: string;
  criteria: CriterionRow[];
  documents: DocumentRow[];
};

const ACADEMIC_YEARS = ['2024-2025', '2025-2026', '2026-2027'];
const PAGE = 10;

const TABLE_HEAD =
  'h-11 border-b border-sgvu-navy/10 bg-white px-4 text-left align-middle text-xs font-semibold normal-case text-sgvu-navy/70';
const CELL = 'px-4 py-3.5 align-middle text-sm text-sgvu-navy';

function readinessBadge(readiness: string) {
  const u = readiness.toUpperCase();
  if (u === 'READY') return 'border-transparent bg-emerald-100 text-emerald-800';
  if (u === 'IN_PROGRESS') return 'border-transparent bg-amber-100 text-amber-900';
  return 'border-transparent bg-red-100 text-red-800';
}

function readinessLabel(readiness: string) {
  return readiness.replace(/_/g, ' ');
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return v;
  }
}

function resolveFileUrl(filePath: string) {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const base = getApiBaseUrl().replace(/\/$/, '');
  const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${base}${path}`;
}


function printDocuments(title: string, rows: DocumentRow[]) {
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#0B2447}
    h1{font-size:20px} table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
    th,td{border:1px solid #ccc;padding:8px;text-align:left} th{background:#f5f5f5}</style></head>
    <body><h1>${title}</h1><p>Generated ${new Date().toLocaleString()}</p>
    <table><thead><tr><th>Criterion</th><th>Metric</th><th>Title</th><th>Uploaded</th><th>By</th></tr></thead>
    <tbody>${rows
      .map(
        (d) =>
          `<tr><td>C${d.naac_criterion}</td><td>${d.metric_number ?? '—'}</td><td>${d.title}</td><td>${fmtDate(d.created_at)}</td><td>${d.uploaded_by_name ?? '—'}</td></tr>`,
      )
      .join('')}</tbody></table>
    <script>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) {
    toast.warning('Allow pop-ups to print');
    return;
  }
  w.document.write(html);
  w.document.close();
}

async function downloadExport(path: string, token: string | null, filename: string) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function NaacRepositoryWorkspace() {
  const api = useAuthedApi();
  const { token } = useAuth();

  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [criterion, setCriterion] = useState<number | null>(null);
  const [data, setData] = useState<RepoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    naac_criterion: 1,
    metric_number: '',
    title: '',
    file_path: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ academic_year: academicYear });
      if (criterion) params.set('criterion', String(criterion));
      const res = await api.get<RepoData>(`/iqac/repository?${params}`);
      setData(res);
      setOffset(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load repository';
      setError(msg);
      setData(null);
      toast.error('Repository load failed', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [api, academicYear, criterion]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDocs = useMemo(() => {
    const docs = data?.documents ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return docs;
    return docs.filter((d) =>
      [d.title, d.metric_number, d.file_path, d.uploaded_by_name]
        .some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [data?.documents, q]);

  const pageDocs = useMemo(
    () => filteredDocs.slice(offset, offset + PAGE),
    [filteredDocs, offset],
  );

  const selectedCriterionMeta = useMemo(
    () => data?.criteria.find((c) => c.criterion === criterion),
    [data?.criteria, criterion],
  );

  function openUpload(forCriterion?: number) {
    setForm({
      naac_criterion: forCriterion ?? criterion ?? 1,
      metric_number: '',
      title: '',
      file_path: '',
    });
    setUploadOpen(true);
  }

  async function saveDocument() {
    if (!form.title.trim() || !form.file_path.trim()) {
      toast.warning('Title and file path are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/iqac/repository/documents', {
        naac_criterion: form.naac_criterion,
        metric_number: form.metric_number.trim() || undefined,
        title: form.title.trim(),
        file_path: form.file_path.trim(),
        academic_year: academicYear,
      });
      toast.success('Document added');
      setUploadOpen(false);
      void load();
    } catch (e) {
      toast.error('Upload failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteDocument(doc: DocumentRow) {
    if (!window.confirm(`Remove "${doc.title}" from the repository?`)) return;
    try {
      await api.del(`/iqac/repository/documents/${doc.document_id}`);
      toast.success('Document removed');
      void load();
    } catch (e) {
      toast.error('Delete failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    }
  }

  async function handleServerExport(criterionNo?: number) {
    try {
      const params = new URLSearchParams({ academic_year: academicYear });
      if (criterionNo) params.set('criterion', String(criterionNo));
      const suffix = criterionNo ? `-c${criterionNo}` : '';
      await downloadExport(
        `/iqac/repository/export?${params}`,
        token,
        `naac-repository${suffix}.csv`,
      );
      toast.success('Export downloaded');
    } catch (e) {
      toast.error('Export failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    }
  }

  function handlePrint() {
    printDocuments(
      criterion
        ? `NAAC Repository — Criterion ${criterion}`
        : `NAAC Repository — ${academicYear}`,
      filteredDocs,
    );
  }

  function previewDocument(doc: DocumentRow) {
    setPreviewDoc(doc);
  }

  function openDocument(doc: DocumentRow) {
    window.open(resolveFileUrl(doc.file_path), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <h1 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">
            Criteria-Wise Document Repository
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            NAAC 7-criteria digital vault with folder readiness health.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1 lg:overflow-visible">
        {(data?.criteria ?? Array.from({ length: 7 }, (_, i) => ({
          criterion: i + 1,
          title: 'Loading…',
          document_count: 0,
          readiness: 'NEEDS_ATTENTION',
        }))).map((c) => (
          <Card
            key={c.criterion}
            className={cn(
              'min-w-[148px] flex-1 shrink-0 border-sgvu-navy/10 bg-white shadow-sm transition',
              criterion === c.criterion && 'ring-2 ring-sgvu-navy',
            )}
          >
            <CardContent className="flex h-full flex-col p-4">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() =>
                  setCriterion((prev) => (prev === c.criterion ? null : c.criterion))
                }
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Criterion {c.criterion}
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-sgvu-navy">
                  {c.title}
                </p>
                <p className="mt-2 text-2xl font-black text-sgvu-navy">
                  {loading && !data ? '—' : c.document_count}
                </p>
                <Badge
                  variant="outline"
                  className={cn('mt-2 text-[10px] font-bold uppercase', readinessBadge(c.readiness))}
                >
                  {readinessLabel(c.readiness)}
                </Badge>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className={cn('mt-3 h-8 w-full gap-1.5 text-xs font-semibold', REG_BRAND_BTN)}
                  >
                    View
                    <ChevronDown className="h-3.5 w-3.5 opacity-90" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                    Criterion {c.criterion}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      setCriterion(c.criterion);
                      setOffset(0);
                    }}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    View documents
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openUpload(c.criterion)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload document
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void handleServerExport(c.criterion)}>
                    Export criterion CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="space-y-4 border-b border-sgvu-navy/5 pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base text-sgvu-navy">
              Documents
              {criterion ? (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  — Criterion {criterion}
                  {selectedCriterionMeta ? `: ${selectedCriterionMeta.title}` : ''}
                </span>
              ) : null}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className={cn('h-9 gap-1.5', REG_BRAND_BTN)}
                onClick={() => openUpload()}
              >
                <Plus className="h-4 w-4" />
                Add document
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn('h-9', REG_OUTLINE_BTN)}
                onClick={() => void handleServerExport(criterion ?? undefined)}
              >
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn('h-9 gap-1.5', REG_OUTLINE_BTN)}
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                }}
                placeholder="Search title, metric, file path…"
                className="h-10 pl-9"
              />
            </div>
            <Select
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
                setCriterion(null);
              }}
              className="h-10 w-full lg:w-44"
            >
              {ACADEMIC_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            {criterion ? (
              <Button
                size="sm"
                variant="outline"
                className={cn('h-10', REG_OUTLINE_BTN)}
                onClick={() => setCriterion(null)}
              >
                Clear filter
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading repository…
            </div>
          ) : error ? (
            <div className="space-y-3 px-6 py-12 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <Button size="sm" className={REG_BRAND_BTN} onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No documents in this folder.
              <div className="mt-3">
                <Button size="sm" className={REG_BRAND_BTN} onClick={() => openUpload()}>
                  Add first document
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TABLE_HEAD}>Criterion</TableHead>
                    <TableHead className={TABLE_HEAD}>Metric</TableHead>
                    <TableHead className={TABLE_HEAD}>Title</TableHead>
                    <TableHead className={TABLE_HEAD}>Uploaded</TableHead>
                    <TableHead className={TABLE_HEAD}>By</TableHead>
                    <TableHead className={cn(TABLE_HEAD, 'text-right')}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageDocs.map((d) => (
                    <TableRow key={d.document_id} className="border-sgvu-navy/5">
                      <TableCell className={CELL}>C{d.naac_criterion}</TableCell>
                      <TableCell className={cn(CELL, 'font-mono text-xs')}>
                        {d.metric_number ?? '—'}
                      </TableCell>
                      <TableCell className={cn(CELL, 'font-medium')}>{d.title}</TableCell>
                      <TableCell className={CELL}>{fmtDate(d.created_at)}</TableCell>
                      <TableCell className={CELL}>{d.uploaded_by_name ?? '—'}</TableCell>
                      <TableCell className={cn(CELL, 'text-right')}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              className={cn('h-8 gap-1.5 px-3 text-xs font-semibold', REG_BRAND_BTN)}
                            >
                              View
                              <ChevronDown className="h-3.5 w-3.5 opacity-90" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                              Document actions
                            </DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => previewDocument(d)}>
                              Preview details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openDocument(d)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open file
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-700 focus:text-red-700"
                              onSelect={() => void deleteDocument(d)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar
                total={filteredDocs.length}
                limit={PAGE}
                offset={offset}
                onPageChange={setOffset}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add repository document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                NAAC criterion
              </label>
              <Select
                value={String(form.naac_criterion)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, naac_criterion: Number(e.target.value) }))
                }
                className="h-10 w-full"
              >
                {(data?.criteria ?? []).map((c) => (
                  <option key={c.criterion} value={c.criterion}>
                    C{c.criterion} — {c.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Metric number
              </label>
              <Input
                value={form.metric_number}
                onChange={(e) => setForm((f) => ({ ...f, metric_number: e.target.value }))}
                placeholder="e.g. 1.1.1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Document title"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                File path or URL
              </label>
              <Input
                value={form.file_path}
                onChange={(e) => setForm((f) => ({ ...f, file_path: e.target.value }))}
                placeholder="/uploads/iqac/example.pdf"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Academic year: {academicYear}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className={REG_OUTLINE_BTN} onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void saveDocument()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewDoc?.title}</DialogTitle>
          </DialogHeader>
          {previewDoc ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Criterion:</span> C{previewDoc.naac_criterion}
              </p>
              <p>
                <span className="text-muted-foreground">Metric:</span>{' '}
                {previewDoc.metric_number ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Uploaded:</span>{' '}
                {fmtDate(previewDoc.created_at)}
              </p>
              <p>
                <span className="text-muted-foreground">By:</span>{' '}
                {previewDoc.uploaded_by_name ?? '—'}
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {previewDoc.file_path}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className={REG_OUTLINE_BTN} onClick={() => setPreviewDoc(null)}>
              Close
            </Button>
            {previewDoc ? (
              <Button className={REG_BRAND_BTN} onClick={() => openDocument(previewDoc)}>
                Open file
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
