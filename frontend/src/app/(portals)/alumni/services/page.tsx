'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Request = { request_id: string; service_type: string; status: string; created_at: string };

const SERVICE_TYPES = [
  { value: 'TRANSCRIPT', label: 'Official Transcript' },
  { value: 'MIGRATION_CERTIFICATE', label: 'Migration Certificate' },
  { value: 'DEGREE_DISPATCH', label: 'Duplicate Degree' },
  { value: 'BONAFIDE', label: 'Bonafide / Other' },
];

export default function AlumniServicesPage() {
  const api = useAuthedApi();
  const [requests, setRequests] = useState<Request[]>([]);
  const [type, setType] = useState('TRANSCRIPT');

  const load = () => void api.get<Request[]>('/api/alumni/services').then(setRequests).catch(() => setRequests([]));

  useEffect(() => {
    load();
  }, [api]);

  async function submit() {
    try {
      await api.post('/api/alumni/services', { service_type: type, remarks: 'Alumni portal request' });
      toast.success('Service request submitted');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="University Services"
        description="Request official transcripts, migration certificates, or duplicate degrees."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New request</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <select className="rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {SERVICE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button onClick={() => void submit()}>Submit ticket</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {requests.map((r) => (
            <p key={r.request_id}>
              {r.service_type} — <span className="font-medium">{r.status}</span> ·{' '}
              {new Date(r.created_at).toLocaleDateString()}
            </p>
          ))}
          {!requests.length && <p className="text-muted-foreground">No service requests yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
