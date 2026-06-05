'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  const { entityId } = useHrEntity();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    void api.get<EmployeeRow[]>('/api/hr/directory').then(setRows).finally(() => setLoading(false));
  }, [api, entityId]);

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
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Employee Directory"
        description="Master roster of all staff — open any profile for the full 360° view."
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name, ID, department…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="p-3">Employee ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Reporting Officer</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.user_id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{r.employee_id ?? '—'}</td>
                    <td className="p-3">
                      <Link href={`/hr/employee/${r.user_id}`} className="font-medium text-sgvu-navy hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </td>
                    <td className="p-3">{r.designation ?? r.role ?? '—'}</td>
                    <td className="p-3">{r.department ?? '—'}</td>
                    <td className="p-3">{r.reporting_officer_name ?? '—'}</td>
                    <td className="p-3">
                      <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
