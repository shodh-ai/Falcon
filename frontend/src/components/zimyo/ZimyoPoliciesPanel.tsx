'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  FileText,
  Download,
  ChevronLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import { Button } from '@/components/ui/button';

type Policy = {
  policy_id: string;
  title: string;
  category: string;
  file_url: string | null;
  is_mandatory: boolean;
  acknowledged: boolean;
  user_vote: 'YES' | 'NO' | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  HOLIDAY: 'SGVU Holiday Calendar',
  LEAVE: 'Leave Policies',
  COMPLIANCE: 'Compliance Policies',
  TRAVEL: 'Travel Policies',
  GENERAL: 'General Policies',
};

const DEMO_HOLIDAY_POLICIES: Policy[] = [
  {
    policy_id: 'demo-hol-2026',
    title: 'Holiday Calendar 2026',
    category: 'HOLIDAY',
    file_url: '/policies/holiday-calendar-2026.pdf',
    is_mandatory: true,
    acknowledged: false,
    user_vote: null,
  },
  {
    policy_id: 'demo-hol-2025',
    title: 'Holiday List 2025',
    category: 'HOLIDAY',
    file_url: '/policies/holiday-list-2025.pdf',
    is_mandatory: true,
    acknowledged: false,
    user_vote: null,
  },
  {
    policy_id: 'demo-hol-2024',
    title: 'Holiday Calendar 2024',
    category: 'HOLIDAY',
    file_url: '/policies/holiday-calendar-2024.pdf',
    is_mandatory: true,
    acknowledged: false,
    user_vote: null,
  },
  {
    policy_id: 'demo-hol-2023',
    title: 'Holiday List 2023',
    category: 'HOLIDAY',
    file_url: '/policies/holiday-list-2023.pdf',
    is_mandatory: true,
    acknowledged: false,
    user_vote: null,
  },
];

function formatCategory(cat: string) {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolvePolicyUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) return `${getApiBaseUrl()}${url}`;
  if (url.startsWith('/uploads/')) {
    return `${getApiBaseUrl()}/api/uploads/download?path=${encodeURIComponent(url)}`;
  }
  return url;
}

function isLocalDemoPolicy(url: string | null) {
  return !!url && url.startsWith('/policies/');
}

function isDemoPolicy(id: string) {
  return id.startsWith('demo-');
}

function normalizePolicy(raw: Policy): Policy {
  return {
    ...raw,
    acknowledged: raw.acknowledged === true || (raw.acknowledged as unknown) === 'true',
  };
}

function groupByCategory(items: Policy[]) {
  const map = new Map<string, Policy[]>();
  for (const p of items) {
    const list = map.get(p.category) ?? [];
    list.push(p);
    map.set(p.category, list);
  }
  return Array.from(map.entries())
    .map(([category, policies]) => ({
      category,
      label: formatCategory(category),
      count: policies.length,
      items: policies,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function ZimyoPoliciesPanel() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [detailSearch, setDetailSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Policy[]>('/api/hr/ess/policies')
      .then((data) => {
        const normalized = data.map(normalizePolicy);
        const hasHoliday = normalized.some((p) => p.category === 'HOLIDAY');
        const merged = hasHoliday ? normalized : [...normalized, ...DEMO_HOLIDAY_POLICIES];
        setPolicies(merged);
        setUsingDemoData(!hasHoliday);
      })
      .catch(() => {
        setPolicies(DEMO_HOLIDAY_POLICIES);
        setUsingDemoData(true);
        toast.error('Could not load policies — showing sample holiday calendar');
      })
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const allCategories = useMemo(() => groupByCategory(policies), [policies]);

  const categories = useMemo(() => {
    if (!listSearch) return allCategories;
    const q = listSearch.toLowerCase();
    return allCategories.filter(
      (c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
    );
  }, [allCategories, listSearch]);

  const selectedGroup = useMemo(
    () => allCategories.find((c) => c.category === selectedCategory) ?? null,
    [allCategories, selectedCategory],
  );

  const filteredPolicies = useMemo(() => {
    if (!selectedGroup) return [];
    if (!detailSearch) return selectedGroup.items;
    const q = detailSearch.toLowerCase();
    return selectedGroup.items.filter((p) => p.title.toLowerCase().includes(q));
  }, [selectedGroup, detailSearch]);

  async function acknowledge(id: string) {
    if (isDemoPolicy(id)) {
      setPolicies((prev) =>
        prev.map((p) => (p.policy_id === id ? { ...p, acknowledged: true } : p)),
      );
      toast.success('Sample policy acknowledged (demo only)');
      return;
    }
    setAcknowledging(id);
    try {
      await api.post(`/api/hr/ess/policies/${id}/acknowledge`, {});
      toast.success('Policy acknowledged');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to acknowledge');
    } finally {
      setAcknowledging(null);
    }
  }

  async function openPolicy(url: string | null) {
    if (!url) {
      toast.info('PDF not available for this policy');
      return;
    }
    if (isLocalDemoPolicy(url)) {
      toast.info('Sample holiday calendar PDF is not uploaded on this environment');
      return;
    }
    if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
      if (!token) {
        toast.error('Please sign in to view this policy');
        return;
      }
      try {
        const res = await fetch(resolvePolicyUrl(url), {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
        });
        if (!res.ok) throw new Error('Could not open policy');
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not open policy');
      }
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function downloadPolicy(url: string | null, title: string) {
    if (!url) {
      toast.info('Download not available for this policy');
      return;
    }
    if (isLocalDemoPolicy(url)) {
      toast.info('Sample holiday calendar PDF is not uploaded on this environment');
      return;
    }
    if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
      if (!token) {
        toast.error('Please sign in to download');
        return;
      }
      try {
        const res = await fetch(resolvePolicyUrl(url), {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
        });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`;
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast.success('Policy downloaded');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Download failed');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs font-bold">Loading policies...</span>
      </div>
    );
  }

  /* ── Category detail view ── */
  if (selectedCategory && selectedGroup) {
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedCategory(null); setDetailSearch(''); }}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-sgvu-navy transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-bold text-sgvu-navy">{selectedGroup.label}</h2>
            {usingDemoData && selectedCategory === 'HOLIDAY' && (
              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                Sample data
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sgvu-navy w-44"
              placeholder="Search..."
            />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-500 tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Policy Name</th>
                <th className="px-5 py-3.5 text-center">View Policy</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Digitally Acknowledge</th>
                <th className="px-5 py-3.5 text-center">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPolicies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-slate-400 font-bold">
                    No policies found
                  </td>
                </tr>
              ) : (
                filteredPolicies.map((p) => (
                  <tr key={p.policy_id} className="hover:bg-slate-50/40 font-medium">
                    <td className="px-5 py-4 text-slate-800 font-bold">{p.title}</td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => void openPolicy(p.file_url)}
                        className="inline-flex items-center justify-center p-1 rounded hover:bg-rose-50 transition-all"
                        title="View PDF"
                      >
                        <FileText className="h-5 w-5 text-rose-500" />
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      {p.acknowledged ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="h-3 w-3" />
                          Acknowledged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Pending for acknowledgement
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {p.acknowledged ? (
                        <span className="text-xs font-bold text-emerald-600">Yes</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">No</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] font-bold border-sgvu-navy/20 text-sgvu-navy hover:bg-sgvu-navy hover:text-white"
                            disabled={acknowledging === p.policy_id}
                            onClick={() => void acknowledge(p.policy_id)}
                          >
                            {acknowledging === p.policy_id ? 'Saving...' : 'Acknowledge'}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => void downloadPolicy(p.file_url, p.title)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sgvu-navy hover:bg-slate-50 transition-all"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ── My Policies category list ── */
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-sgvu-navy">My Policies</h2>
          {usingDemoData && (
            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              Includes sample holiday calendar
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sgvu-navy w-44"
            placeholder="Search..."
          />
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50/80 text-[10px] font-bold uppercase text-slate-500 tracking-wider border-b border-slate-100">
            <tr>
              <th className="px-5 py-3.5">Category Name</th>
              <th className="px-5 py-3.5">Policies</th>
              <th className="px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-xs text-slate-400 font-bold">
                  No policy categories found
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.category} className="hover:bg-slate-50/40 font-medium">
                  <td className="px-5 py-4 text-slate-800 font-bold">{cat.label}</td>
                  <td className="px-5 py-4 text-slate-600 font-bold">{cat.count}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => { setSelectedCategory(cat.category); setDetailSearch(''); }}
                      className="px-4 py-1.5 text-[10px] font-bold text-sgvu-navy bg-blue-50 border border-blue-100 rounded-lg hover:bg-sgvu-navy hover:text-white hover:border-sgvu-navy transition-all"
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
    </div>
  );
}
