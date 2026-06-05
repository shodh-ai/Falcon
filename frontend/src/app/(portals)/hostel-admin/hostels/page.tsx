'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';

type HostelRow = {
  room_id: number;
  room_number: string;
  floor: string;
  room_type: string;
  bed_count: string;
  beds_available: string;
  status: string;
};

type Detail = {
  hostel: {
    hostel_id: string;
    hostel_name: string;
    hostel_code: string;
    hostel_type: string;
    facilities: string[];
    check_in_time: string;
    check_out_time: string;
    curfew_time: string;
    visiting_hours: string;
    laundry_days: string;
    contact_number: string;
    address: string;
  };
  rooms: HostelRow[];
};

export default function HostelManagementPage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    if (!hostelId) return;
    void api.get<Detail>(`/api/hostel-admin/hostels/${hostelId}`).then(setDetail);
  }, [api, hostelId]);

  const h = detail?.hostel;
  const facilities = Array.isArray(h?.facilities) ? h.facilities : [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-sgvu-navy">Hostel Management</h1>
        <HostelScopeBar value={hostelId} onChange={setHostelId} allowAll={false} />
      </div>

      {h && (
        <Card>
          <CardHeader>
            <CardTitle>{h.hostel_name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {h.hostel_code} · {h.hostel_type} · {h.contact_number}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{h.address}</p>
            <div className="flex flex-wrap gap-2">
              {facilities.map((f) => (
                <Badge key={f} variant="secondary">
                  {f}
                </Badge>
              ))}
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Check-in</span>
                <p className="font-medium">{h.check_in_time?.slice(0, 5) ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Check-out</span>
                <p className="font-medium">{h.check_out_time?.slice(0, 5) ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Curfew</span>
                <p className="font-medium">{h.curfew_time?.slice(0, 5) ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Visiting hours</span>
                <p className="font-medium">{h.visiting_hours}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link href="/hostel-admin/students">Assign Beds</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/hostel-admin/hostels">Bed Availability</Link>
        </Button>
      </div>

      <DataTable
        columns={[
          { key: 'room', header: 'Room', render: (r) => r.room_number },
          { key: 'floor', header: 'Floor', render: (r) => r.floor ?? '—' },
          { key: 'type', header: 'Type', render: (r) => r.room_type ?? '—' },
          { key: 'beds', header: 'Beds', render: (r) => r.bed_count },
          {
            key: 'avail',
            header: 'Available',
            render: (r) => r.beds_available,
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge>{r.status}</Badge>,
          },
        ]}
        rows={detail?.rooms ?? []}
        rowKey={(r) => r.room_id}
        emptyMessage="Select a hostel to view the room matrix."
      />
    </div>
  );
}
