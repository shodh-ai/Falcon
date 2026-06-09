'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';
import { toast } from 'sonner';

type StudentRow = {
  student_user_id: string;
  student_id: string;
  name: string;
  email: string;
  status: string;
  hostel_name: string;
  room_number: string;
  bed_number: string;
  program_name: string;
  dept_name: string;
  year_of_study: number;
};

export default function HostelStudentsPage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [rows, setRows] = useState<StudentRow[]>([]);

  async function load() {
    try {
      const q = new URLSearchParams();
      if (hostelId) q.set('hostelId', hostelId);
      if (status) q.set('status', status);
      const data = await api.get<StudentRow[]>(`/api/hostel-admin/students?${q}`);
      setRows(data);
    } catch (e) {
      setRows([]);
      const raw = e instanceof Error ? e.message : 'Failed to load students';
      try {
        const parsed = JSON.parse(raw) as { message?: string };
        toast.error(parsed.message ?? raw);
      } catch {
        toast.error(raw);
      }
    }
  }

  useEffect(() => {
    void load();
  }, [api, hostelId, status]);

  async function evict(studentUserId: string) {
    if (!confirm('Evict this student from the hostel?')) return;
    try {
      await api.post(`/api/hostel-admin/students/${studentUserId}/evict`, {});
      toast.success('Student evicted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Student Management</h1>
      <div className="flex flex-wrap gap-3">
        <HostelScopeBar value={hostelId} onChange={setHostelId} />
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ACTIVE">Active</option>
          <option value="VACATED">Vacated</option>
          <option value="">All statuses</option>
        </select>
      </div>

      <DataTable
        columns={[
          { key: 'id', header: 'Student ID', render: (r) => r.student_id ?? '—' },
          {
            key: 'name',
            header: 'Name & Email',
            render: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.email}</p>
              </div>
            ),
          },
          {
            key: 'course',
            header: 'Course',
            render: (r) =>
              [r.program_name, r.dept_name, r.year_of_study ? `Y${r.year_of_study}` : '']
                .filter(Boolean)
                .join(' · ') || '—',
          },
          { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          {
            key: 'room',
            header: 'Room Assignment',
            render: (r) =>
              `${r.hostel_name ?? ''} - ${r.room_number ?? ''} (${r.bed_number ?? '—'})`.trim(),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost">
                  View
                </Button>
                <Button size="sm" variant="ghost">
                  Edit
                </Button>
                <Button size="sm" variant="outline">
                  Transfer
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void evict(r.student_user_id)}>
                  Evict
                </Button>
              </div>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => r.student_user_id}
      />
    </div>
  );
}
