'use client';

import { useEffect, useState } from 'react';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { API_URL } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';

const TABS = [
  { id: 'publications', label: 'Publications' },
  { id: 'patents', label: 'Patents' },
  { id: 'fdp', label: 'FDP / STTP' },
  { id: 'consultancy', label: 'Consultancy' },
  { id: 'projects', label: 'Research Projects' },
];

export default function IqacFacultyDataPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [tab, setTab] = useState('publications');
  const [year, setYear] = useState('2025-2026');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    void api
      .get<{ rows: Record<string, unknown>[] }>(`/iqac/faculty-data?tab=${tab}&academic_year=${year}`)
      .then((d) => setRows(d.rows ?? []));
  }, [api, tab, year]);

  async function exportExcel() {
    const res = await fetch(`${API_URL}/iqac/faculty-data/export?tab=${tab}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iqac-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <IqacPageHeader
        title="Faculty Contributions"
        description="Aggregated from /faculty/research — filter by academic year and export NAAC-format spreadsheets."
      />
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? 'default' : 'outline'} onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
        <select className="ml-auto rounded-md border px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value)}>
          <option>2025-2026</option>
          <option>2024-2025</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => void exportExcel()}>
          Export to Excel (CSV)
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base capitalize">{tab.replace('_', ' ')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                {columns.map((c) => (
                  <th key={c} className="p-2">
                    {c.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b">
                  {columns.map((c) => (
                    <td key={c} className="p-2">
                      {String(row[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-4 text-muted-foreground">No records for this tab yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
