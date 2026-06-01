'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const api = useAuthedApi();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setProfile(await api.get<Record<string, unknown>>(`/api/hr/employees/${id}/profile`));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load employee profile');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [api, id]);

  if (loading) return <FalconLoader label="Loading employee 360° profile…" />;
  const personal = profile?.personal as Record<string, unknown> | undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">Employee 360°</p>
        <h2 className="mt-1 text-2xl font-black text-sgvu-navy sm:text-3xl">{String(personal?.name ?? 'Employee')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{String(personal?.email ?? '')}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ['Personal Details', profile?.personal],
          ['Bank / Tax Info', profile?.bank_tax],
          ['Assigned Assets', profile?.assets],
          ['Employment History', profile?.employment_history],
        ].map(([title, value]) => (
          <Card key={String(title)}>
            <CardHeader>
              <CardTitle>{String(title)}</CardTitle>
              <CardDescription>Falcon HRMS profile tab</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-72 overflow-auto rounded-xl bg-muted p-4 text-xs">{JSON.stringify(value, null, 2)}</pre>
              {title === 'Personal Details' && <Badge className="mt-3">Active Profile</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
