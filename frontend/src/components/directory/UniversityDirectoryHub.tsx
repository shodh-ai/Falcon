'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { profile360Path } from '@/lib/directory-routes';
import { getSubdomainFromClient } from '@/lib/tenant';
import { cn } from '@/lib/utils';

type DirectoryRow = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  university_id: string | null;
  dept_name: string;
  batch: string | null;
  status: string;
};

type DirectoryResponse = {
  items: DirectoryRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

type FilterOptions = {
  roles: string[];
  departments: string[];
  batches: string[];
  statuses: string[];
};

const EMPTY_FILTERS = { role: '', department: '', status: '', batch: '' };
const DEBOUNCE_MS = 300;
const PAGE_SIZE = 25;
const SEARCH_MAX_LENGTH = 120;

const btnIdle =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
const btnBusy =
  'h-10 border border-sgvu-gold bg-sgvu-gold px-4 text-sm font-semibold text-sgvu-navy';
const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
const fieldClass =
  'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';

export function UniversityDirectoryHub() {
  const api = useAuthedApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get('role')?.trim() ?? '';
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    role: initialRole,
  }));
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterEpoch, setFilterEpoch] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim().slice(0, SEARCH_MAX_LENGTH);
      setDebouncedSearch(next);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (filters.role) params.set('role', filters.role);
    if (filters.department) params.set('department', filters.department);
    if (filters.status) params.set('status', filters.status);
    if (filters.batch) params.set('batch', filters.batch);
    return params.toString();
  }, [filters, page, debouncedSearch]);

  const hasActiveFilters = Boolean(
    search.trim() ||
      debouncedSearch ||
      filters.role ||
      filters.department ||
      filters.status ||
      filters.batch,
  );

  const loadDirectory = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    void api
      .get<DirectoryResponse>(`/api/search/directory?${queryString}`)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setData(result);
        setLoadError(null);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        setData(null);
        const message = err instanceof Error ? err.message : 'Failed to load directory';
        setLoadError(message);
        toast.error('Failed to load directory');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [api, queryString]);

  useEffect(() => {
    void api
      .get<FilterOptions>('/api/search/directory/filters')
      .then(setOptions)
      .catch(() => setOptions(null));
  }, [api]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const updateFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
    setFilterEpoch((epoch) => epoch + 1);
    toast.success('Filters cleared');
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (filters.role) params.set('role', filters.role);
      if (filters.department) params.set('department', filters.department);
      if (filters.status) params.set('status', filters.status);
      if (filters.batch) params.set('batch', filters.batch);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(
        `${getApiBaseUrl()}/api/search/directory/export?${params.toString()}`,
        {
          headers: {
            'x-tenant-subdomain': getSubdomainFromClient(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `university-directory-${stamp}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Directory exported');
    } catch {
      toast.error('Could not export CSV');
    } finally {
      setExporting(false);
    }
  };

  const rangeLabel = useMemo(() => {
    if (!data || data.total === 0) return '0 records';
    const start = (data.page - 1) * data.limit + 1;
    const end = Math.min(data.page * data.limit, data.total);
    return `Showing ${start}–${end} of ${data.total}`;
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-sm font-semibold text-sgvu-gold">Master Data</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">University Directory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse, filter, and export the full university roster. Open any row for a 360° profile.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Search & filters</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Combine search with role, department, status, and batch (AND logic).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className={hasActiveFilters ? btnIdle : cn(btnIdle, 'opacity-60')}
                disabled={!hasActiveFilters}
                onClick={resetFilters}
              >
                Reset filters
              </Button>
              <Button
                type="button"
                className={exporting ? btnBusy : btnIdle}
                disabled={exporting || Boolean(loadError)}
                onClick={() => void exportCsv()}
                aria-busy={exporting}
              >
                {exporting ? 'Exporting…' : 'Download CSV'}
              </Button>
            </div>
          </div>

          <div>
            <label htmlFor="directory-search" className={cn(labelClass, 'mb-1.5 block')}>
              Search directory
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sgvu-navy/40"
                aria-hidden
              />
              <input
                id="directory-search"
                type="search"
                value={search}
                maxLength={SEARCH_MAX_LENGTH}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, university ID, role, or department…"
                className="h-11 w-full rounded-lg border border-sgvu-navy/20 bg-white pl-10 pr-10 text-sm text-sgvu-navy shadow-none placeholder:text-muted-foreground/70 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25"
                aria-describedby="directory-search-hint"
              />
              {search ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-sgvu-navy/5 hover:text-sgvu-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
                  onClick={() => {
                    setSearch('');
                    setDebouncedSearch('');
                    setPage(1);
                  }}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <p id="directory-search-hint" className="mt-1.5 text-xs text-muted-foreground">
              Updates after you pause typing. Leading and trailing spaces are ignored.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              key={`role-${filterEpoch}`}
              label="Role"
              value={filters.role}
              onChange={(v) => updateFilter('role', v)}
              options={[
                { value: '', label: 'All roles' },
                ...(options?.roles ?? []).map((r) => ({ value: r, label: r })),
              ]}
            />
            <FilterSelect
              key={`department-${filterEpoch}`}
              label="Department / School"
              value={filters.department}
              onChange={(v) => updateFilter('department', v)}
              options={[
                { value: '', label: 'All departments' },
                ...(options?.departments ?? []).map((d) => ({ value: d, label: d })),
              ]}
            />
            <FilterSelect
              key={`status-${filterEpoch}`}
              label="Status"
              value={filters.status}
              onChange={(v) => updateFilter('status', v)}
              options={[
                { value: '', label: 'All statuses' },
                ...(options?.statuses ?? ['Active', 'Alumni', 'On Leave', 'Suspended']).map((s) => ({
                  value: s,
                  label: s,
                })),
              ]}
            />
            <FilterSelect
              key={`batch-${filterEpoch}`}
              label="Batch / Year"
              value={filters.batch}
              onChange={(v) => updateFilter('batch', v)}
              options={[
                { value: '', label: 'All batches' },
                ...(options?.batches ?? []).map((b) => ({ value: b, label: b })),
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Directory results</h2>
              <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
                {loading ? 'Loading…' : loadError ? 'Could not load results' : rangeLabel}
                {hasActiveFilters && !loading && !loadError ? ' · filters applied' : ''}
              </p>
            </div>
            {loadError ? (
              <Button type="button" variant="outline" className={btnIdle} onClick={() => loadDirectory()}>
                Retry
              </Button>
            ) : null}
          </div>

          {loading ? (
            <DirectorySkeleton />
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-red-200 bg-red-50/40 px-4 py-10 text-center">
              <p className="text-sm font-medium text-red-800">Directory could not be loaded</p>
              <p className="mt-1 text-sm text-red-700/80">{loadError}</p>
            </div>
          ) : !data?.items.length ? (
            <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-4 py-12 text-center">
              <p className="text-sm font-medium text-sgvu-navy">No matching people</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {debouncedSearch
                  ? `No users match “${debouncedSearch}”.`
                  : 'No users match these filters.'}
              </p>
              {hasActiveFilters ? (
                <Button type="button" className={cn(btnIdle, 'mt-4')} onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-sgvu-navy/10">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="sticky top-0 z-[1] bg-sgvu-navy/[0.04]">
                    <tr className="border-b border-sgvu-navy/10 text-left text-[11px] uppercase tracking-wide text-sgvu-navy/55">
                      <th className="px-4 py-3 font-bold">Name</th>
                      <th className="px-4 py-3 font-bold">University ID</th>
                      <th className="px-4 py-3 font-bold">Email</th>
                      <th className="px-4 py-3 font-bold">Role</th>
                      <th className="px-4 py-3 font-bold">Department</th>
                      <th className="px-4 py-3 font-bold">Batch</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr
                        key={row.user_id}
                        role="link"
                        tabIndex={0}
                        aria-label={`Open profile for ${row.name}`}
                        onClick={() => router.push(profile360Path(row.user_id))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            router.push(profile360Path(row.user_id));
                          }
                        }}
                        className="cursor-pointer border-b border-sgvu-navy/5 transition hover:bg-sgvu-gold/5 focus-visible:bg-sgvu-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sgvu-gold/40 last:border-0"
                      >
                        <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-sgvu-navy">
                          {row.name || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-sgvu-navy/80">
                          {row.university_id ?? '—'}
                        </td>
                        <td className="max-w-[16rem] truncate px-4 py-3 text-muted-foreground">
                          {row.email || '—'}
                        </td>
                        <td className="px-4 py-3">{row.role_name || '—'}</td>
                        <td className="max-w-[12rem] truncate px-4 py-3">{row.dept_name || '—'}</td>
                        <td className="px-4 py-3">{row.batch ?? '—'}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={row.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sgvu-navy/10 pt-4">
                <p className="text-xs text-muted-foreground">
                  Page {data.page} of {Math.max(data.total_pages, 1)} · {data.total} total
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className={btnIdle}
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={btnIdle}
                    disabled={page >= (data.total_pages || 1) || loading}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading directory">
      <div className="overflow-hidden rounded-xl border border-sgvu-navy/10">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid animate-pulse grid-cols-7 gap-3 border-b border-sgvu-navy/5 px-4 py-3 last:border-0"
          >
            {Array.from({ length: 7 }).map((__, j) => (
              <div key={j} className="h-4 rounded bg-sgvu-navy/10" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const selectId = `filter-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className={labelClass}>
        {label}
      </label>
      <Select
        id={selectId}
        value={value || 'ALL'}
        onChange={(e) => onChange(e.target.value === 'ALL' ? '' : e.target.value)}
        className={fieldClass}
      >
        {options.map((opt) => (
          <option key={`${label}-${opt.value || 'ALL'}`} value={opt.value || 'ALL'}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status?.trim() || 'Unknown';
  const key = normalized.toLowerCase();
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        key === 'active' && 'bg-emerald-50 text-emerald-700',
        (key === 'alumni' || key === 'graduated') && 'bg-sky-50 text-sky-700',
        (key === 'on leave' || key === 'pending') && 'bg-amber-50 text-amber-700',
        (key === 'suspended' || key === 'blocked' || key === 'inactive') && 'bg-red-50 text-red-700',
        ![
          'active',
          'alumni',
          'graduated',
          'on leave',
          'pending',
          'suspended',
          'blocked',
          'inactive',
        ].includes(key) && 'bg-slate-100 text-slate-700',
      )}
    >
      {normalized}
    </span>
  );
}
