'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Search } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useAuthedApi } from '@/lib/api';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const EMPTY_FILTERS = { role: '', department: '', status: '', batch: '' };
const DEBOUNCE_MS = 300;

export function UniversityDirectoryHub() {
  const api = useAuthedApi();
  const router = useRouter();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '25');
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (filters.role) params.set('role', filters.role);
    if (filters.department) params.set('department', filters.department);
    if (filters.status) params.set('status', filters.status);
    if (filters.batch) params.set('batch', filters.batch);
    return params.toString();
  }, [filters, page, debouncedSearch]);

  const loadDirectory = useCallback(() => {
    setLoading(true);
    void api
      .get<DirectoryResponse>(`/api/search/directory?${queryString}`)
      .then(setData)
      .catch(() => {
        setData(null);
        toast.error('Failed to load directory');
      })
      .finally(() => setLoading(false));
  }, [api, queryString]);

  useEffect(() => {
    void api.get<FilterOptions>('/api/search/directory/filters').then(setOptions).catch(() => setOptions(null));
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
      const response = await fetch(`${API_URL}/api/search/directory/export?${params.toString()}`, {
        headers: {
          'x-tenant-subdomain': getSubdomainFromClient(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'university-directory.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Directory exported');
    } catch {
      toast.error('Could not export CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LeadershipPageHeader
        eyebrow="Master Data"
        title="University Directory"
        description="Browse, filter, and export the full university roster. Click any row to open a 360° profile."
      />

      <LeadershipSectionCard title="Search & Filters">
        <div className="mb-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search directory</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sgvu-navy/40" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, SGVU-/EMP- ID, role, or department…"
                className="h-11 w-full rounded-xl border border-sgvu-navy/12 bg-white pl-10 pr-4 text-sm text-sgvu-navy shadow-sm placeholder:text-muted-foreground/70 focus:border-sgvu-gold/60 focus:outline-none focus:ring-2 focus:ring-sgvu-gold/20"
              />
            </div>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Role"
            value={filters.role}
            onChange={(v) => updateFilter('role', v)}
            options={[{ value: '', label: 'All roles' }, ...(options?.roles ?? []).map((r) => ({ value: r, label: r }))]}
          />
          <FilterSelect
            label="Department / School"
            value={filters.department}
            onChange={(v) => updateFilter('department', v)}
            options={[
              { value: '', label: 'All departments' },
              ...(options?.departments ?? []).map((d) => ({ value: d, label: d })),
            ]}
          />
          <FilterSelect
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
            label="Batch / Year"
            value={filters.batch}
            onChange={(v) => updateFilter('batch', v)}
            options={[
              { value: '', label: 'All batches' },
              ...(options?.batches ?? []).map((b) => ({ value: b, label: b })),
            ]}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full border-sgvu-navy/15 text-sgvu-navy hover:border-sgvu-gold/50"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download CSV
            </Button>
          </div>
        </div>
      </LeadershipSectionCard>

      <LeadershipSectionCard title={`Directory · ${data?.total ?? 0} records`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading directory…
          </div>
        ) : !data?.items.length ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {debouncedSearch ? `No users match "${debouncedSearch}".` : 'No users match these filters.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-sgvu-navy/10 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">University ID</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Batch</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr
                      key={row.user_id}
                      onClick={() => router.push(profile360Path(row.user_id))}
                      className="cursor-pointer border-b border-sgvu-navy/5 transition hover:bg-sgvu-gold/5 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-sgvu-navy">{row.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-sgvu-navy/80">{row.university_id ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.email}</td>
                      <td className="px-4 py-3">{row.role_name}</td>
                      <td className="px-4 py-3">{row.dept_name}</td>
                      <td className="px-4 py-3">{row.batch ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sgvu-navy/10 pt-4">
              <p className="text-xs text-muted-foreground">
                Page {data.page} of {Math.max(data.total_pages, 1)} · {data.total} total
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= (data.total_pages || 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </LeadershipSectionCard>
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
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-sgvu-navy/12 bg-white px-3 text-sm text-sgvu-navy shadow-sm focus:border-sgvu-gold/60 focus:outline-none focus:ring-2 focus:ring-sgvu-gold/20"
      >
        {options.map((opt) => (
          <option key={`${label}-${opt.value}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        status === 'Active' && 'bg-emerald-50 text-emerald-700',
        status === 'Alumni' && 'bg-sky-50 text-sky-700',
        status === 'On Leave' && 'bg-amber-50 text-amber-700',
        status === 'Suspended' && 'bg-red-50 text-red-700',
      )}
    >
      {status}
    </span>
  );
}
