'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Demand = {
  demand_id: string;
  student_user_id: string;
  fee_head: string;
  academic_year: string;
  semester: number | null;
  total_amount: string;
  paid_amount: string;
  due_date: string;
  status: string;
};

const PAGE_SIZE = 100;

export default function FinanceFeeDemandsPage() {
  const api = useAuthedApi();
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.get<Demand[]>(`/finance/demands?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      .then((result) => { if (active) { setRows(result); setError(''); } })
      .catch(() => { if (active) { setRows([]); setError('Could not load fee demands. Please retry.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, page]);

  const visible = rows.filter((row) =>
    `${row.student_user_id} ${row.fee_head} ${row.academic_year} ${row.status}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader title="Fee Demands" description="Review generated student demands for this institution." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input className="max-w-sm" aria-label="Search current page" placeholder="Search this page by student ID, fee, year, or status" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Link href="/finance/fee-structures" className="text-sm font-semibold text-sgvu-navy underline">Fee templates</Link>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Card><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground"><tr>
            <th className="p-3">Student ID</th><th className="p-3">Fee</th><th className="p-3">Period</th><th className="p-3">Due</th><th className="p-3">Amount</th><th className="p-3">Paid</th><th className="p-3">Status</th>
          </tr></thead>
          <tbody>{visible.map((row) => <tr key={row.demand_id} className="border-b">
            <td className="break-all p-3 font-mono text-xs">{row.student_user_id}</td>
            <td className="p-3">{row.fee_head.replace(/_/g, ' ')}</td>
            <td className="p-3">{row.academic_year}{row.semester ? ` · Semester ${row.semester}` : ''}</td>
            <td className="p-3">{String(row.due_date).slice(0, 10)}</td>
            <td className="p-3">{formatInr(row.total_amount)}</td>
            <td className="p-3">{formatInr(row.paid_amount)}</td>
            <td className="p-3">{row.status}</td>
          </tr>)}</tbody>
        </table>
        {!loading && !visible.length && <p className="p-4 text-sm text-muted-foreground">No matching demands on this page.</p>}
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading demands…</p>}
      </CardContent></Card>
      <div className="flex items-center justify-end gap-2 text-sm">
        <span>Page {page + 1}</span>
        <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => { setLoading(true); setPage((current) => current - 1); }}>Previous</Button>
        <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE || loading} onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Next</Button>
      </div>
    </div>
  );
}
