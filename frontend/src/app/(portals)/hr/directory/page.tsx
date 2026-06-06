'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrDataTable, HrTable, HrTableHead, HrTh, HrTableBody, HrTr, HrTd } from '@/components/hr/HrDataTable';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

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
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!entityReady) return;
    setLoading(true);
    void api.get<EmployeeRow[]>('/api/hr/directory').then(setRows).finally(() => setLoading(false));
  }, [api, entityId, entityReady]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.employee_id, r.department, r.designation].some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      ),
    );
  }, [rows, query]);

  if (loading) return <FalconLoader label="Loading employee directory…" />;

  return (
    <>
      <HrPageHeader
        title="Employee Directory"
        description="Master roster of all staff — open any profile for the full 360° view."
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="border-gray-200 bg-white pl-9 shadow-sm"
          placeholder="Search name, ID, department…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <HrEmptyState
          icon={Users}
          title={query ? 'No matching employees' : 'Directory is empty'}
          description={query ? 'Try a different search term.' : 'Staff records will appear once employees are onboarded.'}
        />
      ) : (
        <HrDataTable>
          <HrTable>
            <HrTableHead>
              <HrTh>Employee</HrTh>
              <HrTh>ID</HrTh>
              <HrTh>Designation</HrTh>
              <HrTh>Department</HrTh>
              <HrTh>Reporting Officer</HrTh>
              <HrTh>Status</HrTh>
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
                </HrTr>
              ))}
            </HrTableBody>
          </HrTable>
        </HrDataTable>
      )}
    </>
  );
}
