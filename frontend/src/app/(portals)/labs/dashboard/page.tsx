'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createLabsApi } from '@/lib/api/api.labs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function LabsDashboardPage() {
  const api = useAuthedApi();
  const labs = useMemo(() => createLabsApi(api), [api]);
  const [zones, setZones] = useState<any[]>([]);
  const [budget, setBudget] = useState<any>(null);

  useEffect(() => {
    void Promise.all([labs.zones(), labs.budget()])
      .then(([z, b]) => {
        setZones(z);
        setBudget(b);
      })
      .catch(() => toast.error('Failed to load labs dashboard'));
  }, [labs]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Tokamak Labs</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Monthly Cap</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-sgvu-navy">
            ₹{Number(budget?.monthly_cap ?? 200000).toLocaleString('en-IN')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Allocated</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-sgvu-navy">
            ₹{Number(budget?.allocated_amount ?? 0).toLocaleString('en-IN')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Utilized</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-sgvu-navy">
            ₹{Number(budget?.utilized_amount ?? 0).toLocaleString('en-IN')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Zones Online</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-sgvu-navy">{zones.length}</CardContent>
        </Card>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {zones.map((z) => (
          <Card key={z.zone_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{z.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {z.zone_code} — {z.description}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
