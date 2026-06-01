'use client';

import { useEffect, useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type TransportData = {
  assigned_route: { route_name: string; route_code: string; bus_number: string } | null;
  all_routes: { route_name: string; route_code: string; bus_number: string; annual_fee: string }[];
  note: string | null;
};

export default function StudentTransportPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<TransportData | null>(null);

  useEffect(() => {
    void api.get<TransportData>('/api/student/transport').then(setData);
  }, [api]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Transport Hub"
        description="University bus routes, assigned vehicle, and annual transport fee."
      />

      {data?.assigned_route && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your route</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-semibold">{data.assigned_route.route_name}</p>
            <p className="text-muted-foreground">Code {data.assigned_route.route_code} · Bus {data.assigned_route.bus_number}</p>
          </CardContent>
        </Card>
      )}

      {data?.note && <p className="text-sm text-muted-foreground">{data.note}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All routes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.all_routes ?? []).map((r) => (
            <p key={r.route_code}>
              {r.route_name} ({r.route_code}) — Bus {r.bus_number ?? 'TBA'} · ₹{Number(r.annual_fee ?? 0).toLocaleString()}/yr
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
