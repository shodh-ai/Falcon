'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellFinancePayout } from '@/lib/api/api.ecell';

function formatInr(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

export default function FinanceIncubationPayoutsPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<EcellFinancePayout[]>([]);

  useEffect(() => {
    void ecellApi
      .financePayouts()
      .then((rows) => setPayouts(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Could not load incubation payouts');
        setPayouts([]);
      })
      .finally(() => setLoading(false));
  }, [ecellApi]);

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading incubation payouts…</p>;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Incubation Grant Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Finance-only view: approved disbursement line items without pitch decks or startup IP details.
        </p>
      </div>

      {payouts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No incubation grant payouts queued yet.
          </CardContent>
        </Card>
      ) : (
        payouts.map((payout) => (
          <Card key={payout.disbursement_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">
                  Disburse {formatInr(payout.amount)} to {payout.startup_name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Student: {payout.student_name} · Approved by {payout.approved_by_label}
                </p>
              </div>
              <Badge>{payout.status}</Badge>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p>Grant tag: {payout.grant_tag}</p>
              <p>Requested: {new Date(payout.created_at).toLocaleString()}</p>
              {payout.posted_at ? <p>Posted: {new Date(payout.posted_at).toLocaleString()}</p> : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
