'use client';

import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/DataTable';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';
import { toast } from 'sonner';

type PassRow = {
  pass_id: string;
  pass_no: string;
  student_name: string;
  hostel_name: string;
  purpose: string;
  out_time: string;
  status: string;
  source: string;
};

type LeaveStats = { pending: string; approved: string; rejected: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HostelGatePassesPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [hostelId, setHostelId] = useState('');
  const [passes, setPasses] = useState<PassRow[]>([]);
  const [stats, setStats] = useState<LeaveStats | null>(null);

  const load = useCallback(async () => {
    const q = hostelId ? `?hostelId=${hostelId}` : '';
    const [gp, leaves, s] = await Promise.all([
      api.get<PassRow[]>(`/api/hostel-admin/gate-passes${q}`),
      api.get<any[]>(`/api/hostel-admin/leaves${q}`),
      api.get<LeaveStats>(`/api/hostel-admin/leaves/stats${hostelId ? `?hostelId=${hostelId}` : ''}`),
    ]);

    const mappedLeaves: PassRow[] = leaves.map(l => ({
      pass_id: l.leave_id,
      pass_no: 'LV-' + l.leave_id.slice(0, 5).toUpperCase(),
      student_name: l.student_name,
      hostel_name: l.hostel_name,
      purpose: l.leave_type + (l.purpose ? ` - ${l.purpose}` : ''),
      out_time: l.from_date,
      status: l.status,
      source: 'leave'
    }));

    // Combine and sort by date descending
    const combined = [...gp, ...mappedLeaves].sort((a, b) => {
      const d1 = new Date(a.out_time).getTime();
      const d2 = new Date(b.out_time).getTime();
      return (isNaN(d2) ? 0 : d2) - (isNaN(d1) ? 0 : d1);
    });

    setPasses(combined);
    setStats(s);
  }, [api, hostelId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = io(`${API_BASE}/hostel-admin`, { transports: ['websocket'] });
    socket.emit('joinHostelDesk', {
      hostel_id: hostelId || undefined,
      tenant_id: user?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
    });
    socket.on('gate_pass.updated', () => void load());
    socket.on('leave.created', () => void load());
    return () => {
      socket.disconnect();
    };
  }, [hostelId, load, user?.tenant_id]);

  async function approve(passId: string, source: string) {
    try {
      if (source === 'leave') {
        await api.patch(`/api/hostel-admin/leaves/${passId}`, { status: 'APPROVED' });
      } else if (source === 'request') {
        await api.patch(`/api/hostel-admin/requests/${passId}/approve`, {});
      } else if (source === 'operations') {
        await api.patch(`/api/hostel-admin/gate-passes/${passId}`, { status: 'APPROVED' });
      }
      toast.success('Approved successfully');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function reject(passId: string, source: string) {
    try {
      if (source === 'leave') {
        await api.patch(`/api/hostel-admin/leaves/${passId}`, { status: 'REJECTED' });
      } else if (source === 'request') {
        await api.patch(`/api/hostel-admin/requests/${passId}/reject`, {});
      } else if (source === 'operations') {
        await api.patch(`/api/hostel-admin/gate-passes/${passId}`, { status: 'REJECTED' });
      }
      toast.success('Rejected successfully');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Leave &amp; Gate Passes</h1>
      <HostelScopeBar value={hostelId} onChange={setHostelId} />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Pending', value: stats?.pending, color: 'text-amber-700' },
          { label: 'Approved', value: stats?.approved, color: 'text-green-700' },
          { label: 'Rejected', value: stats?.rejected, color: 'text-red-700' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={[
          { key: 'no', header: 'Pass/Leave No', render: (r) => r.pass_no ?? r.pass_id.slice(0, 8) },
          { key: 'student', header: 'Student', render: (r) => r.student_name },
          { key: 'hostel', header: 'Hostel', render: (r) => r.hostel_name ?? '—' },
          { key: 'purpose', header: 'Purpose', render: (r) => r.purpose ?? '—' },
          {
            key: 'out',
            header: 'Out Time / Date',
            render: (r) => (r.out_time ? new Date(r.out_time).toLocaleString() : '—'),
          },
          { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          {
            key: 'act',
            header: 'Action',
            render: (r) =>
              r.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void approve(r.pass_id, r.source)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void reject(r.pass_id, r.source)}>
                    Decline
                  </Button>
                </div>
              ) : null,
          },
        ]}
        rows={passes}
        rowKey={(r) => r.pass_id}
      />
    </div>
  );
}
