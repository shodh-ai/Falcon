'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';
import { toast } from 'sonner';

type Visitor = {
  visitor_id: string;
  pass_id: string;
  visitor_name: string;
  entry_at: string;
  status: string;
};

export default function HostelVisitorsPage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');
  const [passId, setPassId] = useState('');
  const [action, setAction] = useState<'ENTRY' | 'EXIT'>('ENTRY');
  const [inside, setInside] = useState<Visitor[]>([]);

  async function load() {
    if (!hostelId) return;
    const list = await api.get<Visitor[]>(`/api/hostel-admin/visitors?hostelId=${hostelId}`);
    setInside(list);
  }

  useEffect(() => {
    void load();
  }, [api, hostelId]);

  async function process() {
    if (!passId.trim() || !hostelId) {
      toast.error('Enter pass ID and select hostel');
      return;
    }
    try {
      await api.post('/api/hostel-admin/visitors/scan', {
        pass_id: passId.trim(),
        action,
        hostel_id: hostelId,
      });
      setPassId('');
      toast.success(`${action} recorded`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Visitor Management</h1>
      <HostelScopeBar value={hostelId} onChange={setHostelId} allowAll={false} />

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">Enter Pass ID or scan QR</label>
          <Input
            placeholder="Scan visitor pass barcode…"
            value={passId}
            onChange={(e) => setPassId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void process()}
          />
        </div>
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={action}
          onChange={(e) => setAction(e.target.value as 'ENTRY' | 'EXIT')}
        >
          <option value="ENTRY">Entry</option>
          <option value="EXIT">Exit</option>
        </select>
        <Button className="bg-sgvu-navy" onClick={() => void process()}>
          Process
        </Button>
      </div>

      <h2 className="text-lg font-semibold">Current Visitors Inside</h2>
      <DataTable
        columns={[
          { key: 'pass', header: 'Pass ID', render: (r) => r.pass_id },
          { key: 'name', header: 'Visitor', render: (r) => r.visitor_name },
          {
            key: 'in',
            header: 'Entry Time',
            render: (r) => new Date(r.entry_at).toLocaleString(),
          },
        ]}
        rows={inside}
        rowKey={(r) => r.visitor_id}
        emptyMessage="No visitors currently inside."
      />
    </div>
  );
}
