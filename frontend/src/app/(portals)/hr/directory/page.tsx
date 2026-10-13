'use client';

import { useState } from 'react';
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
import { Select } from '@/components/ui/select';
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

type Department = { dept_id: number; dept_name: string };

export default function HrDirectoryPage() {
  const api = useHrApi();
  const { entityId, entityReady } = useHrEntity();
  const [query, setQuery] = useState('');
  const [deptId, setDeptId] = useState('');
  const [offset, setOffset] = useState(0);

  const { data: metadata } = useSWR<{ departments: Department[] }>(
    entityReady ? ['hr-directory-departments', entityId] : null,
    () => api.get<{ departments: Department[] }>('/api/hr/metadata/roles-departments'),
  );

  const { data, isLoading, mutate } = useSWR<PaginatedResponse<EmployeeRow>>(
    entityReady ? ['hr-directory', entityId, offset, query, deptId] : null,
    () => {
      const q = new URLSearchParams({
        limit: String(DEFAULT_PAGE_SIZE),
        offset: String(offset),
      });
      if (query.trim()) q.set('q', query.trim());
      if (deptId) q.set('dept_id', deptId);
      return api.get<PaginatedResponse<EmployeeRow>>(`/api/hr/directory?${q}`);
    },
    { keepPreviousData: true, revalidateOnFocus: true },
  );

  const rows = data?.data ?? [];

  if (!entityReady || (isLoading && !data)) return <FalconLoader label="Loading employee directory…" />;

  return (
    <>
      <div className="space-y-3">
        <HrPageHeader
          title="Employee Directory"
          description="Master roster of all staff — open any profile for the full 360° view."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full flex-1">
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
          <Select
            aria-label="Filter employee directory by department"
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm sm:w-56"
            value={deptId}
            onChange={(event) => {
              setDeptId(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All departments</option>
            {(metadata?.departments ?? []).map((department) => (
              <option key={department.dept_id} value={department.dept_id}>
                {department.dept_name}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-2 sm:justify-end">
          <BulkDocumentExportDialog />
          <AddEmployeeDialog onCreated={() => void mutate()} />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <HrEmptyState
          icon={Users}
          title={query || deptId ? 'No matching employees' : 'Directory is empty'}
          description={query || deptId ? 'Try another search or department.' : 'Staff records will appear once employees are onboarded.'}
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
                {rows.map((r) => (
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
