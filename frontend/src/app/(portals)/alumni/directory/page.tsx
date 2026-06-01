'use client';

import { useEffect, useState } from 'react';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Row = {
  name: string;
  batch_year: number;
  current_organization: string | null;
  designation: string | null;
  linkedin_url: string | null;
};

export default function AlumniDirectoryPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [batchYear, setBatchYear] = useState('');
  const [organization, setOrganization] = useState('');

  function load() {
    const params = new URLSearchParams();
    if (batchYear) params.set('batch_year', batchYear);
    if (organization) params.set('organization', organization);
    void api.get<Row[]>(`/api/alumni/directory?${params}`).then(setRows).catch(() => setRows([]));
  }

  useEffect(() => {
    load();
  }, [api]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="Alumni Network & Directory"
        description="Search verified alumni by batch and employer (e.g. Microsoft, Amazon)."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="Batch year (e.g. 2022)" value={batchYear} onChange={(e) => setBatchYear(e.target.value)} className="max-w-[180px]" />
          <Input placeholder="Organization" value={organization} onChange={(e) => setOrganization(e.target.value)} className="max-w-[240px]" />
          <Button onClick={load}>Search</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Name</th>
                <th className="p-3">Batch</th>
                <th className="p-3">Organization</th>
                <th className="p-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3">{r.batch_year}</td>
                  <td className="p-3">{r.current_organization ?? '—'}</td>
                  <td className="p-3">{r.designation ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-4 text-sm text-muted-foreground">No alumni match your filters.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
