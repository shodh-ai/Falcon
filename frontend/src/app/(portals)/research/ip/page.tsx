'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function ResearchIpPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState('');

  const reload = () =>
    api.get<any[]>('/api/research/ip').then(setRows).catch(() => setRows([]));

  useEffect(() => {
    void reload();
  }, [api]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">IP Docket</h1>
      <p className="text-sm text-muted-foreground">
        Patents and disclosures linked to optional research grants (Tokamak / Shodh).
      </p>
      <div className="flex gap-2 max-w-lg">
        <Input placeholder="Invention title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button
          onClick={() =>
            api
              .post('/api/research/ip', { title, ip_type: 'PATENT' })
              .then(() => {
                toast.success('Disclosure logged');
                setTitle('');
                return reload();
              })
              .catch((e) => toast.error(String(e?.message ?? e)))
          }
        >
          File disclosure
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="p-2">Title</th>
            <th className="p-2">Type</th>
            <th className="p-2">Status</th>
            <th className="p-2">Grant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ip_id} className="border-b">
              <td className="p-2">{r.title}</td>
              <td className="p-2">{r.ip_type}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2">{r.grant_title || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
