'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Loader2, QrCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuthedApi } from '@/lib/api';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentInfoTile } from '@/components/student/StudentInfoTile';

type Allocation = {
  hostel_block: string | null;
  room_number: string | null;
  bed_number: string | null;
  mess_plan: string;
  warden: { name: string; email: string } | null;
};

type HostelRequest = {
  request_id: string;
  request_type: string;
  status: string;
  payload: { out_date?: string; in_date?: string; destination?: string; reason?: string } | null;
  remarks?: string | null;
  qr_token?: string | null;
};

type HostelLeave = {
  leave_id: string;
  leave_type: string;
  purpose: string | null;
  from_date: string;
  to_date: string;
  status: string;
  hostel_name: string | null;
};

const LEAVE_TYPES = ['Home Visit', 'Hospital Visit', 'Market Visit', 'Family Function'];

export default function StudentHostelPage() {
  const api = useAuthedApi();
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [requests, setRequests] = useState<HostelRequest[]>([]);
  const [leaves, setLeaves] = useState<HostelLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'gate' | 'leave'>('gate');
  const [gatePass, setGatePass] = useState({
    out_date: '',
    in_date: '',
    reason: '',
    destination: '',
    purpose: 'Market Visit',
  });
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'Home Visit',
    purpose: '',
    from_date: '',
    to_date: '',
  });

  async function loadHostelData() {
    try {
      const [allocationData, requestData, leaveData] = await Promise.all([
        api.get<Allocation | null>('/api/operations/hostel/my-allocation'),
        api.get<HostelRequest[]>('/api/operations/hostel/requests'),
        api.get<HostelLeave[]>('/api/operations/hostel/leaves'),
      ]);
      setAllocation(allocationData);
      setRequests(requestData);
      setLeaves(leaveData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load hostel data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHostelData();
  }, []);

  async function submitGatePass() {
    if (!gatePass.out_date || !gatePass.in_date || !gatePass.reason.trim() || !gatePass.destination.trim()) {
      toast.error('Please fill out all gate pass fields.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/operations/hostel/requests', {
        request_type: 'GATE_PASS',
        remarks: gatePass.reason.trim(),
        payload: {
          ...gatePass,
          purpose: gatePass.purpose,
        },
      });
      setGatePass({ out_date: '', in_date: '', reason: '', destination: '', purpose: 'Market Visit' });
      toast.success('Gate pass sent — your warden will see it instantly');
      await loadHostelData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit gate pass');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLeave() {
    if (!leaveForm.from_date || !leaveForm.to_date) {
      toast.error('Select leave dates');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/operations/hostel/leaves', leaveForm);
      toast.success('Leave request submitted to warden');
      setLeaveForm({ leave_type: 'Home Visit', purpose: '', from_date: '', to_date: '' });
      await loadHostelData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Hostel & Mess"
        description="Gate passes, leave requests, and room details — synced live with your warden desk."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/student/hostel-booking">Book a bed (Tatkal)</Link>
          </Button>
        }
      />

      <StudentSectionCard title="Current allocation" description="Your room, mess plan, and warden contact" icon={Building2} tone="gold">
        {loading ? (
          <StudentLoadingState label="Loading hostel data…" className="min-h-[12vh]" />
        ) : !allocation ? (
          <StudentEmptyState
            title="No active room"
            description="Join the hostel sale to get allocated."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/student/hostel-booking">Book a bed</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <StudentInfoTile label="Block" value={allocation.hostel_block} />
            <StudentInfoTile label="Room · Bed" value={`${allocation.room_number} · ${allocation.bed_number ?? 'TBD'}`} />
            <StudentInfoTile label="Mess plan" value={allocation.mess_plan} />
            <StudentInfoTile label="Warden" value={allocation.warden?.name} />
          </div>
        )}
      </StudentSectionCard>

      <StudentTabBar
        tabs={[
          { id: 'gate' as const, label: 'Gate pass' },
          { id: 'leave' as const, label: 'Leave' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'gate' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request gate pass</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={gatePass.purpose}
              onChange={(e) => setGatePass((p) => ({ ...p, purpose: e.target.value }))}
            >
              {['Hospital Visit', 'Market Visit', 'Bank / Official', 'Family Emergency'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Out date</label>
                <Input type="date" value={gatePass.out_date} onChange={(e) => setGatePass((p) => ({ ...p, out_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Expected return</label>
                <Input type="date" value={gatePass.in_date} onChange={(e) => setGatePass((p) => ({ ...p, in_date: e.target.value }))} />
              </div>
            </div>
            <Input placeholder="Reason" value={gatePass.reason} onChange={(e) => setGatePass((p) => ({ ...p, reason: e.target.value }))} />
            <Input placeholder="Destination" value={gatePass.destination} onChange={(e) => setGatePass((p) => ({ ...p, destination: e.target.value }))} />
            <Button className="w-full bg-sgvu-navy" onClick={() => void submitGatePass()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit gate pass'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request leave</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={leaveForm.leave_type}
              onChange={(e) => setLeaveForm((p) => ({ ...p, leave_type: e.target.value }))}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input placeholder="Purpose (optional)" value={leaveForm.purpose} onChange={(e) => setLeaveForm((p) => ({ ...p, purpose: e.target.value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="date" value={leaveForm.from_date} onChange={(e) => setLeaveForm((p) => ({ ...p, from_date: e.target.value }))} />
              <Input type="date" value={leaveForm.to_date} onChange={(e) => setLeaveForm((p) => ({ ...p, to_date: e.target.value }))} />
            </div>
            <Button className="w-full bg-sgvu-navy" onClick={() => void submitLeave()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit leave request'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.map((item) => (
            <div key={item.request_id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{item.request_type.replace('_', ' ')}</p>
                <Badge variant={item.status === 'APPROVED' ? 'default' : 'outline'}>{item.status}</Badge>
              </div>
              {item.payload?.destination && (
                <p className="text-xs text-muted-foreground">→ {item.payload.destination}</p>
              )}
              {item.status === 'APPROVED' && item.qr_token && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                  <QrCode className="h-4 w-4" />
                  Show QR at gate: {item.qr_token.slice(0, 16)}…
                </div>
              )}
            </div>
          ))}
          {leaves.map((l) => (
            <div key={l.leave_id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Leave · {l.leave_type}</p>
                <Badge variant="outline">{l.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {l.from_date} → {l.to_date} · {l.hostel_name}
              </p>
            </div>
          ))}
          {!loading && requests.length === 0 && leaves.length === 0 && (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          )}
        </CardContent>
      </Card>
    </StudentPageShell>
  );
}
