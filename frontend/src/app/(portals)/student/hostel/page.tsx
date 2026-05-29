'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, QrCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuthedApi } from '@/lib/api';

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
  payload: { out_date?: string; in_date?: string; destination?: string } | null;
  qr_token?: string | null;
};

export default function StudentHostelPage() {
  const api = useAuthedApi();
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [requests, setRequests] = useState<HostelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gatePass, setGatePass] = useState({ out_date: '', in_date: '', reason: '', destination: '' });
  const [roomChangeReason, setRoomChangeReason] = useState('');

  async function loadHostelData() {
    try {
      const [allocationData, requestData] = await Promise.all([
        api.get<Allocation | null>('/api/operations/hostel/my-allocation'),
        api.get<HostelRequest[]>('/api/operations/hostel/requests'),
      ]);
      setAllocation(allocationData);
      setRequests(requestData);
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
        payload: gatePass,
      });
      setGatePass({ out_date: '', in_date: '', reason: '', destination: '' });
      toast.success('Gate pass request submitted');
      await loadHostelData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit gate pass');
    } finally {
      setSubmitting(false);
    }
  }

  async function requestRoomChange() {
    if (!roomChangeReason.trim()) {
      toast.error('Please enter reason for room/mess change.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/operations/hostel/requests', {
        request_type: 'ROOM_CHANGE',
        remarks: roomChangeReason.trim(),
      });
      setRoomChangeReason('');
      toast.success('Room change request sent to warden');
      await loadHostelData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit room change request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sgvu-gold" />
            Current Allocation
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading && <p className="text-muted-foreground">Loading allocation...</p>}
          {!loading && !allocation && <p className="text-muted-foreground">No active hostel allocation found.</p>}
          {allocation && (
            <div className="space-y-2">
              <p className="font-medium text-foreground">
                Block {allocation.hostel_block} · Room {allocation.room_number}
              </p>
              <p className="text-muted-foreground">Bed: {allocation.bed_number ?? 'Not assigned'}</p>
              <p className="text-muted-foreground">Mess plan: {allocation.mess_plan}</p>
              <p className="text-muted-foreground">
                Warden: {allocation.warden?.name ?? 'N/A'} {allocation.warden?.email ? `(${allocation.warden.email})` : ''}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gate Pass System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="date" value={gatePass.out_date} onChange={(event) => setGatePass((prev) => ({ ...prev, out_date: event.target.value }))} />
            <Input type="date" value={gatePass.in_date} onChange={(event) => setGatePass((prev) => ({ ...prev, in_date: event.target.value }))} />
            <Input placeholder="Reason" value={gatePass.reason} onChange={(event) => setGatePass((prev) => ({ ...prev, reason: event.target.value }))} />
            <Input
              placeholder="Destination"
              value={gatePass.destination}
              onChange={(event) => setGatePass((prev) => ({ ...prev, destination: event.target.value }))}
            />
            <Button className="w-full" onClick={submitGatePass} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply Gate Pass'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request Room/Mess Change</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Why do you want to change room or mess plan?" value={roomChangeReason} onChange={(event) => setRoomChangeReason(event.target.value)} />
            <Button variant="outline" className="w-full" onClick={requestRoomChange} disabled={submitting}>
              Submit ROOM_CHANGE Request
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hostel Requests History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.map((item) => (
            <div key={item.request_id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{item.request_type}</p>
                <Badge variant={item.status === 'APPROVED' ? 'default' : item.status === 'REJECTED' ? 'destructive' : 'outline'}>{item.status}</Badge>
              </div>
              {item.payload?.destination && <p className="text-xs text-muted-foreground">Destination: {item.payload.destination}</p>}
              {item.status === 'APPROVED' && item.qr_token && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted p-2 text-xs">
                  <QrCode className="h-4 w-4" />
                  QR Token: {item.qr_token}
                </div>
              )}
            </div>
          ))}
          {!loading && requests.length === 0 && <p className="text-sm text-muted-foreground">No hostel requests yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
