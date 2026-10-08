'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  HodPageFrame,
  HodPageHeader,
  HodTableHead,
  HodTableWrap,
} from '@/components/hod/HodPagePrimitives';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { useAuthedApi } from '@/lib/api';
import { buildDeanPageQuery, type PaginatedApiResponse } from '@/lib/dean-pagination';
import { cn } from '@/lib/utils';

type AuditRow = {
  id: string;
  user: string;
  action: string;
  module: string;
  timestamp: string;
  ip: string | null;
};

export default function DeanAuditLogPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildDeanPageQuery({ page: Math.floor(offset / limit) + 1, limit, search });
      const moduleQs =
        moduleFilter !== 'ALL' ? `&module=${encodeURIComponent(moduleFilter)}` : '';
      const data = await api.get<PaginatedApiResponse<AuditRow>>(
        `/api/academics/dean/intelligence/audit-log?${qs}${moduleQs}`,
      );
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [api, moduleFilter, offset, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Audit Log"
        description="Immutable trail of school-scoped actions. Nothing is deleted."
        workspaceLabel="Dean Workspace"
        meta={<span>{total} record{total === 1 ? '' : 's'}</span>}
      />

      <div className="flex flex-wrap gap-3">
        <Select
          aria-label="Filter audit log by module"
          className="max-w-xs rounded-lg border px-3 py-2 text-sm"
          value={moduleFilter}
          onChange={(e) => {
            setOffset(0);
            setModuleFilter(e.target.value);
          }}
        >
          <option value="ALL">All modules</option>
          <option value="attendance">Attendance</option>
          <option value="funding">Funding</option>
          <option value="helpdesk">Grievances</option>
          <option value="campus_events">Events</option>
          <option value="fin_dept_budgets">Budget</option>
        </Select>
        <Input
          aria-label="Search audit log"
          placeholder="Search user or action…"
          value={search}
          onChange={(e) => {
            setOffset(0);
            setSearch(e.target.value);
          }}
          className="max-w-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : (
        <>
          <HodTableWrap>
            <table className="w-full min-w-full text-left text-sm">
              <HodTableHead columns={['User', 'Action', 'Module', 'Timestamp', 'IP']} />
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn('border-b border-gray-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
                  >
                    <td className="px-4 py-3">{row.user}</td>
                    <td className="px-4 py-3">{row.action}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.module}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(row.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{row.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HodTableWrap>
          <PaginationBar total={total} limit={limit} offset={offset} onPageChange={setOffset} />
        </>
      )}
    </HodPageFrame>
  );
}
