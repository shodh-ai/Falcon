'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellGrant } from '@/lib/api/api.ecell';

function formatInr(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

export default function IncubationGrantsPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<EcellGrant[]>([]);

  useEffect(() => {
    void ecellApi
      .grants()
      .then(setGrants)
      .catch(() => toast.error('Could not load grants'))
      .finally(() => setLoading(false));
  }, [ecellApi]);

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading grant ledger…</p>;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Grant Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track funding milestones and disbursement status for incubated startups.
        </p>
      </div>

      {grants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No grant records yet.</CardContent>
        </Card>
      ) : (
        grants.map((grant) => (
          <Card key={grant.disbursement_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{grant.startup_name}</CardTitle>
                <p className="text-sm text-muted-foreground">{grant.student_name}</p>
              </div>
              <Badge>{grant.status}</Badge>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p>Amount: {formatInr(grant.amount)}</p>
              <p>Tag: {grant.grant_tag}</p>
              <p>Created: {new Date(grant.created_at).toLocaleString()}</p>
              <p>
                Milestone: {grant.status === 'POSTED' ? 'Initial seed released' : 'Pending finance posting'}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
