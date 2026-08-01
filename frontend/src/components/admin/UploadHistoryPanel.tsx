'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Search } from 'lucide-react';
import { UploadHistoryEmptyState } from '@/components/admin/UploadHistoryEmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type SubmissionRow = {
  submission_id: string;
  file_name?: string | null;
  file_path?: string | null;
  text_input?: string | null;
  uploaded_at?: string | null;
  assignment?: {
    task?: {
      task_name?: string | null;
    };
  };
};

type BulkUploadRow = {
  run_id: string;
  filename: string;
  rows_total: number;
  rows_imported: number;
  rows_failed: number;
  duplicate_rows: number;
  status: string;
  created_at: string;
  uploader_name?: string | null;
  rollback_available?: boolean;
};

type HistoryRow =
  | { kind: 'governance'; row: SubmissionRow }
  | { kind: 'bulk'; row: BulkUploadRow };

const PAGE_SIZE = 10;

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

const NEW_UPLOAD_BTN =
  'inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[#0B2447] bg-[#0B2447] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#123A6D] active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

function formatWhen(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UploadHistoryPanel() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [bulkRuns, setBulkRuns] = useState<BulkUploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, bulk] = await Promise.all([
        api.get<SubmissionRow[]>('/tasks/submissions/my'),
        api.get<BulkUploadRow[]>('/admissions/students/bulk-upload/history').catch(() => []),
      ]);
      setSubmissions(Array.isArray(rows) ? rows : []);
      setBulkRuns(Array.isArray(bulk) ? bulk : []);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load upload history';
      setError(message);
      setSubmissions([]);
      setBulkRuns([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [search, taskFilter]);

  const liveRows = useMemo<HistoryRow[]>(() => {
    const governanceRows: HistoryRow[] = submissions.map((row) => ({
      kind: 'governance',
      row,
    }));
    const bulkRows: HistoryRow[] = bulkRuns.map((row) => ({ kind: 'bulk', row }));
    return [...bulkRows, ...governanceRows].sort((a, b) => {
      const aTime =
        a.kind === 'bulk'
          ? new Date(a.row.created_at).getTime()
          : new Date(a.row.uploaded_at ?? 0).getTime();
      const bTime =
        b.kind === 'bulk'
          ? new Date(b.row.created_at).getTime()
          : new Date(b.row.uploaded_at ?? 0).getTime();
      return bTime - aTime;
    });
  }, [submissions, bulkRuns]);

  const taskOptions = useMemo(() => {
    const names = new Set<string>(['Student Bulk Upload']);
    for (const entry of liveRows) {
      if (entry.kind === 'governance') {
        const name = entry.row.assignment?.task?.task_name?.trim();
        if (name) names.add(name);
      }
    }
    return Array.from(names).sort();
  }, [liveRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveRows.filter((entry) => {
      if (entry.kind === 'bulk') {
        const taskName = 'Student Bulk Upload';
        if (taskFilter && taskFilter !== taskName) return false;
        if (!q) return true;
        return (
          taskName.toLowerCase().includes(q) ||
          entry.row.filename.toLowerCase().includes(q) ||
          (entry.row.uploader_name ?? '').toLowerCase().includes(q)
        );
      }
      const row = entry.row;
      const taskName = row.assignment?.task?.task_name ?? '';
      if (taskFilter && taskName !== taskFilter) return false;
      if (!q) return true;
      return (
        taskName.toLowerCase().includes(q) ||
        (row.file_name ?? '').toLowerCase().includes(q) ||
        (row.text_input ?? '').toLowerCase().includes(q)
      );
    });
  }, [liveRows, search, taskFilter]);

  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);
  const hasFilters = Boolean(search.trim() || taskFilter);
  const isEmpty = !loading && filtered.length === 0;

  const stats = useMemo(() => {
    const governance = liveRows.filter((r) => r.kind === 'governance').length;
    const bulk = liveRows.filter((r) => r.kind === 'bulk').length;
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const thisMonth = liveRows.filter((entry) => {
      const raw = entry.kind === 'bulk' ? entry.row.created_at : entry.row.uploaded_at;
      if (!raw) return false;
      const d = new Date(raw);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
    return {
      total: liveRows.length,
      governance,
      bulk,
      thisMonth,
    };
  }, [liveRows]);

  async function downloadFile(filePath?: string | null, fileName?: string | null) {
    if (!token || !filePath) return;
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/uploads/download?path=${encodeURIComponent(filePath)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || 'download';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Unable to download file');
    }
  }

  function clearFilters() {
    setSearch('');
    setTaskFilter('');
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6" data-testid="registrar-upload-history">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
                Upload History
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
                Governance Upload History
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Previously submitted compliance files and remarks from governance tasks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/students/bulk-upload"
                className={cn(NEW_UPLOAD_BTN, 'shrink-0')}
                data-testid="upload-history-new-upload"
              >
                New Upload
              </Link>
              <Button
                type="button"
                size="sm"
                className={cn('h-10 shrink-0', BRAND_BTN)}
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total uploads', value: stats.total },
              { label: 'Governance files', value: stats.governance },
              { label: 'Bulk imports', value: stats.bulk },
              { label: 'This month', value: stats.thisMonth },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 px-4 py-3"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-sgvu-navy">
                  {loading ? '—' : item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 border-t border-sgvu-navy/10 pt-5 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-end">
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Search</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Task, file name, or remarks…"
                  className="h-11 rounded-xl border-sgvu-navy/15 bg-white pl-9"
                  data-testid="upload-history-search"
                  aria-label="Search upload history"
                />
              </div>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Task filter</span>
              <select
                className="flex h-11 w-full rounded-xl border border-sgvu-navy/15 bg-white px-3 text-sm text-sgvu-navy outline-none transition focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value)}
                data-testid="upload-history-task-filter"
                aria-label="Filter by governance task"
              >
                <option value="">All tasks</option>
                {taskOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={cn('h-11 rounded-xl px-4 text-sm font-bold', BRAND_BTN)}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          data-testid="upload-history-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-sgvu-navy/10 px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-sgvu-navy">Submission ledger</p>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? 'Loading records…'
                  : `${filtered.length} record${filtered.length === 1 ? '' : 's'} shown`}
              </p>
            </div>
          </div>

          <Table data-testid="upload-history-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-slate-50/90 pl-5">Type</TableHead>
                <TableHead className="bg-slate-50/90">Task</TableHead>
                <TableHead className="bg-slate-50/90">Files</TableHead>
                <TableHead className="bg-slate-50/90">Remarks</TableHead>
                <TableHead className="bg-slate-50/90">Uploaded</TableHead>
                <TableHead className="bg-slate-50/90 pr-5 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow data-testid="upload-history-loading">
                  <TableCell colSpan={6} className="py-20 text-center text-muted-foreground">
                    <Loader2
                      className="mx-auto h-6 w-6 animate-spin"
                      aria-label="Loading upload history"
                    />
                  </TableCell>
                </TableRow>
              ) : isEmpty ? (
                <TableRow data-testid="upload-history-empty">
                  <TableCell colSpan={6} className="py-16">
                    <UploadHistoryEmptyState
                      hasFilters={hasFilters}
                      onClearFilters={clearFilters}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((entry) =>
                  entry.kind === 'bulk' ? (
                    <TableRow key={entry.row.run_id} className="border-sgvu-navy/5">
                      <TableCell className="pl-5 align-top">
                        <Badge
                          variant="outline"
                          className="border-transparent bg-blue-100 font-medium text-blue-800"
                        >
                          Bulk
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="font-semibold text-sgvu-navy">Student Bulk Upload</p>
                        {entry.row.uploader_name ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            by {entry.row.uploader_name}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" aria-hidden />
                          <span className="break-all text-sgvu-navy/85">{entry.row.filename}</span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-muted-foreground">
                        Imported {entry.row.rows_imported}/{entry.row.rows_total}
                        {entry.row.rows_failed ? ` · failed ${entry.row.rows_failed}` : ''}
                        {entry.row.duplicate_rows
                          ? ` · duplicates ${entry.row.duplicate_rows}`
                          : ''}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap text-muted-foreground">
                        {formatWhen(entry.row.created_at)}
                      </TableCell>
                      <TableCell className="pr-5 text-right align-top">
                        <Button type="button" size="sm" className={cn('h-9 px-4', BRAND_BTN)} disabled>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={entry.row.submission_id} className="border-sgvu-navy/5">
                      <TableCell className="pl-5 align-top">
                        <Badge
                          variant="outline"
                          className="border-transparent bg-emerald-100 font-medium text-emerald-800"
                        >
                          Governance
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="font-semibold text-sgvu-navy">
                          {entry.row.assignment?.task?.task_name || 'Submitted task'}
                        </p>
                      </TableCell>
                      <TableCell className="align-top">
                        {entry.row.file_name ? (
                          <div className="flex items-start gap-2">
                            <FileText
                              className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold"
                              aria-hidden
                            />
                            <span className="break-all text-sgvu-navy/85">
                              {entry.row.file_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px] align-top break-words text-muted-foreground">
                        {entry.row.text_input || '—'}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap text-muted-foreground">
                        {formatWhen(entry.row.uploaded_at)}
                      </TableCell>
                      <TableCell className="pr-5 text-right align-top">
                        <Button
                          type="button"
                          size="sm"
                          className={cn('h-9 px-4', BRAND_BTN)}
                          disabled={!entry.row.file_path}
                          data-testid={`upload-history-download-${entry.row.submission_id}`}
                          onClick={() => void downloadFile(entry.row.file_path, entry.row.file_name)}
                        >
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ),
                )
              )}
            </TableBody>
          </Table>

          {!loading && filtered.length > PAGE_SIZE ? (
            <div className="border-t border-sgvu-navy/10 px-5 py-3">
              <PaginationBar
                total={filtered.length}
                limit={PAGE_SIZE}
                offset={offset}
                onPageChange={setOffset}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
