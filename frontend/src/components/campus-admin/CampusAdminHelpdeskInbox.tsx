'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';

export type CampusHelpdeskTicketRow = {
  ticket_id: string;
  ticket_ref: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  sla_deadline?: string | null;
  escalation_level?: number | null;
  submitted_by_name?: string | null;
  submitted_by_email?: string | null;
  assigned_to_name?: string | null;
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'PENDING', label: 'Open (Pending)' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  { value: 'ACADEMICS', label: 'Academics' },
  { value: 'IT', label: 'IT' },
  { value: 'HOSTEL', label: 'Hostel' },
  { value: 'FACILITIES', label: 'Facilities' },
  { value: 'OTHER', label: 'Other' },
];

const ASSIGNED_OPTIONS = [
  { value: 'all', label: 'All tickets' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'me', label: 'Assigned to me' },
];

function statusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'PENDING') {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Open</Badge>;
  }
  if (normalized === 'IN_PROGRESS') {
    return <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">In Progress</Badge>;
  }
  if (normalized === 'RESOLVED') {
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Resolved</Badge>;
  }
  if (normalized === 'REJECTED') {
    return <Badge className="bg-red-100 text-red-900 hover:bg-red-100">Rejected</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildQuery(params: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value.trim() && value !== 'all') search.set(key, value.trim());
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function CampusAdminHelpdeskInbox() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<CampusHelpdeskTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [assigned, setAssigned] = useState('all');

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        q,
        status: status === 'all' ? '' : status,
        category: category === 'all' ? '' : category,
        assigned: assigned === 'all' ? '' : assigned,
        limit: '100',
      });
      const data = await api.get<CampusHelpdeskTicketRow[]>(
        `/api/campus-admin/requests${query}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Unable to load tickets. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [api, assigned, category, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(
    () => rows.filter((row) => ['PENDING', 'IN_PROGRESS'].includes(row.status)).length,
    [rows],
  );

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Helpdesk / Tickets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Campus ticket inbox for facilities, hostel, IT, and academic requests.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total tickets</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{loading ? '—' : rows.length}</p>
          </CardContent>
        </Card>
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open / active</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">{loading ? '—' : openCount}</p>
          </CardContent>
        </Card>
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolved / closed</p>
            <p className="mt-1 text-2xl font-bold text-sgvu-navy">
              {loading ? '—' : rows.filter((row) => ['RESOLVED', 'REJECTED'].includes(row.status)).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search ref, subject, or requester..."
                className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-xl border-sgvu-navy/15"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-xl border-sgvu-navy/15"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
              className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:max-w-xs"
            >
              {ASSIGNED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tickets…
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No tickets found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-medium">Ref</th>
                    <th className="p-3 font-medium">Subject</th>
                    <th className="p-3 font-medium">Category</th>
                    <th className="p-3 font-medium">Submitted by</th>
                    <th className="p-3 font-medium">Assigned to</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Opened</th>
                    <th className="p-3 font-medium">Updated</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.ticket_id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="p-3 font-medium text-sgvu-navy">{row.ticket_ref}</td>
                      <td className="p-3">{row.subject}</td>
                      <td className="p-3">{row.category}</td>
                      <td className="p-3">
                        <div>{row.submitted_by_name ?? '—'}</div>
                        {row.submitted_by_email ? (
                          <div className="text-xs text-muted-foreground">{row.submitted_by_email}</div>
                        ) : null}
                      </td>
                      <td className="p-3">{row.assigned_to_name ?? 'Unassigned'}</td>
                      <td className="p-3">{statusBadge(row.status)}</td>
                      <td className="p-3 whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                      <td className="p-3 whitespace-nowrap">{formatDateTime(row.updated_at)}</td>
                      <td className="p-3 text-right">
                        <Link
                          href={campusAdminRoutes.operationsRequestDetail(row.ticket_id)}
                          className="text-sm font-semibold text-sgvu-navy hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
