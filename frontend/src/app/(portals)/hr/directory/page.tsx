'use client';

import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { AddEmployeeDialog } from '@/components/hr/AddEmployeeDialog';
import { EditEmployeeDialog } from '@/components/hr/EditEmployeeDialog';
import { BulkDocumentExportDialog } from '@/components/hr/BulkDocumentExportDialog';
import { HrDataTable, HrTable, HrTableHead, HrTh, HrTableBody, HrTr, HrTd } from '@/components/hr/HrDataTable';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import useSWR from 'swr';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from '@/lib/api/pagination';

type EmployeeRow = {
  user_id: string;
  name: string;
  email: string;
  employee_id: string | null;
  designation: string | null;
  department: string | null;
  role: string | null;
  joining_date: string | null;
  reporting_officer_name: string | null;
  is_active: boolean;
};

export default function HrDirectoryPage() {
  const api = useHrApi();
  const { entityId, entityReady } = useHrEntity();
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading, mutate } = useSWR<PaginatedResponse<EmployeeRow>>(
    entityReady ? ['hr-directory', entityId, offset, query] : null,
    () => {
      const q = new URLSearchParams({
        limit: String(DEFAULT_PAGE_SIZE),
        offset: String(offset),
      });
      if (query.trim()) q.set('q', query.trim());
      return api.get<PaginatedResponse<EmployeeRow>>(`/api/hr/directory?${q}`);
    },
    { keepPreviousData: true, revalidateOnFocus: true },
  );

  const rows = data?.data ?? [];

  const filtered = useMemo(() => rows, [rows]);

  if (!entityReady || (isLoading && !data)) return <FalconLoader label="Loading employee directory…" />;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HrPageHeader
          title="Employee Directory"
          description="Master roster of all staff — open any profile for the full 360° view."
        />
        <div className="flex flex-wrap gap-2">
          <BulkDocumentExportDialog />
          <AddEmployeeDialog onCreated={() => void mutate()} />
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="border-gray-200 bg-white pl-9 shadow-sm"
          placeholder="Search name, ID, department…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <HrEmptyState
          icon={Users}
          title={query ? 'No matching employees' : 'Directory is empty'}
          description={query ? 'Try a different search term.' : 'Staff records will appear once employees are onboarded.'}
        />
      ) : (
        <>
          <HrDataTable>
            <HrTable>
              <HrTableHead>
                <HrTh>Employee</HrTh>
                <HrTh>ID</HrTh>
                <HrTh>Designation</HrTh>
                <HrTh>Department</HrTh>
                <HrTh>Reporting Officer</HrTh>
                <HrTh>Status</HrTh>
                <HrTh className="w-14 text-right">Actions</HrTh>
              </HrTableHead>
              <HrTableBody>
                {filtered.map((r) => (
                  <HrTr key={r.user_id}>
                    <HrTd>
                      <HrPersonCell
                        name={r.name}
                        subtitle={r.email}
                        href={`/hr/employee/${r.user_id}`}
                      />
                    </HrTd>
                    <HrTd className="font-mono text-xs text-muted-foreground">{r.employee_id ?? '—'}</HrTd>
                    <HrTd>{r.designation ?? r.role ?? '—'}</HrTd>
                    <HrTd>{r.department ?? '—'}</HrTd>
                    <HrTd>{r.reporting_officer_name ?? '—'}</HrTd>
                    <HrTd>
                      <HrStatusBadge status={r.is_active ? 'ACTIVE' : 'INACTIVE'} />
                    </HrTd>
                    <HrTd className="text-right">
                      <EditEmployeeDialog employee={r} onUpdated={() => void mutate()} />
                    </HrTd>
                  </HrTr>
                ))}
              </HrTableBody>
            </HrTable>
          </HrDataTable>
          {data ? (
            <PaginationBar
              total={data.total}
              limit={data.limit}
              offset={data.offset}
              onPageChange={setOffset}
            />
          ) : null}
        </>
      )}
    </>
  );
}
