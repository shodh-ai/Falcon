'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';

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

  const taskOptions = useMemo(() => {
    const names = new Set<string>(['Student Bulk Upload']);
    for (const row of submissions) {
      const name = row.assignment?.task?.task_name?.trim();
      if (name) names.add(name);
    }
    return Array.from(names).sort();
  }, [submissions]);

  const combinedRows = useMemo<HistoryRow[]>(() => {
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combinedRows.filter((entry) => {
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
  }, [combinedRows, search, taskFilter]);

  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);

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

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="registrar-upload-history">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-sgvu-gold">Upload History</p>
          <h1 className="mt-2 text-2xl font-bold text-sgvu-navy sm:text-3xl">Governance Upload History</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Previously submitted compliance files and remarks from governance tasks.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          data-testid="upload-history-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm">
          <span className="font-medium">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Task, file name, or remarks…"
              className="pl-9"
              data-testid="upload-history-search"
              aria-label="Search upload history"
            />
          </div>
        </label>
        <label className="w-full space-y-1 text-sm sm:w-56">
          <span className="font-medium">Task filter</span>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y text-sm" data-testid="upload-history-table">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Task</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Files</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Remarks</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr data-testid="upload-history-loading">
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Loading upload history" />
                  </td>
                </tr>
              ) : pageRows.length > 0 ? (
                pageRows.map((entry) =>
                  entry.kind === 'bulk' ? (
                    <tr key={entry.row.run_id} className="hover:bg-muted/30">
                      <td className="min-w-[220px] px-4 py-3 font-medium text-sgvu-navy">
                        Student Bulk Upload
                      </td>
                      <td className="min-w-[180px] px-4 py-3">{entry.row.filename}</td>
                      <td className="min-w-[180px] px-4 py-3 text-muted-foreground">
                        Imported {entry.row.rows_imported}/{entry.row.rows_total}
                        {entry.row.rows_failed ? ` · failed ${entry.row.rows_failed}` : ''}
                        {entry.row.duplicate_rows ? ` · duplicates ${entry.row.duplicate_rows}` : ''}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(entry.row.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.row.submission_id} className="hover:bg-muted/30">
                      <td className="min-w-[220px] px-4 py-3 font-medium text-sgvu-navy">
                        {entry.row.assignment?.task?.task_name || 'Submitted task'}
                      </td>
                      <td className="min-w-[180px] px-4 py-3">
                        {entry.row.file_path ? (
                          <button
                            type="button"
                            onClick={() =>
                              void downloadFile(entry.row.file_path, entry.row.file_name)
                            }
                            className="font-medium text-sgvu-navy underline decoration-sgvu-gold underline-offset-4"
                            data-testid={`upload-history-download-${entry.row.submission_id}`}
                          >
                            {entry.row.file_name || 'Download file'}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="min-w-[180px] px-4 py-3 text-muted-foreground">
                        {entry.row.text_input || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {entry.row.uploaded_at
                          ? new Date(entry.row.uploaded_at).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <tr data-testid="upload-history-empty">
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    {search || taskFilter
                      ? 'No uploads match your search or filter.'
                      : 'No upload history yet. Complete a governance task to see submissions here.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > PAGE_SIZE ? (
          <div className="border-t px-4 py-3">
            <PaginationBar
              total={filtered.length}
              limit={PAGE_SIZE}
              offset={offset}
              onPageChange={setOffset}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
