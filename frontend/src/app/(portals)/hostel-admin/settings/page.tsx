'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type MasterRow = { config_id: string; category: string; label: string };
type PermRow = { permission_id: string; role_name: string; permission_key: string; allowed: boolean };

export default function HostelSettingsPage() {
  const api = useAuthedApi();
  const [master, setMaster] = useState<MasterRow[]>([]);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [newItem, setNewItem] = useState({ category: 'ROOM_TYPE', label: '' });

  useEffect(() => {
    void api.get<MasterRow[]>('/api/hostel-admin/master-data').then(setMaster);
    void api.get<PermRow[]>('/api/hostel-admin/permissions').then(setPerms);
  }, [api]);

  async function addMaster() {
    if (!newItem.label.trim()) return;
    try {
      await api.post('/api/hostel-admin/master-data', newItem);
      toast.success('Saved');
      setNewItem({ category: newItem.category, label: '' });
      setMaster(await api.get<MasterRow[]>('/api/hostel-admin/master-data'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">System &amp; Master Data</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Master Data</h2>
        <div className="flex flex-wrap gap-2">
          <Select
            className="rounded-lg border px-3 py-2 text-sm"
            value={newItem.category}
            onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value }))}
          >
            <option value="ROOM_TYPE">Room Types</option>
            <option value="TICKET_TYPE">Ticket Types</option>
            <option value="LEAVE_TYPE">Leave Types</option>
          </Select>
          <Input
            placeholder="Label"
            value={newItem.label}
            onChange={(e) => setNewItem((n) => ({ ...n, label: e.target.value }))}
          />
          <Button variant="outline" onClick={() => void addMaster()}>
            Add
          </Button>
        </div>
        <DataTable
          columns={[
            { key: 'cat', header: 'Category', render: (r) => r.category },
            { key: 'lbl', header: 'Label', render: (r) => r.label },
          ]}
          rows={master}
          rowKey={(r) => r.config_id}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Role Permissions</h2>
        <DataTable
          columns={[
            { key: 'role', header: 'Role', render: (r) => r.role_name },
            { key: 'key', header: 'Permission', render: (r) => r.permission_key },
            {
              key: 'ok',
              header: 'Allowed',
              render: (r) => <Badge variant={r.allowed ? 'default' : 'outline'}>{r.allowed ? 'Yes' : 'No'}</Badge>,
            },
          ]}
          rows={perms}
          rowKey={(r) => r.permission_id}
        />
      </section>
    </div>
  );
}
