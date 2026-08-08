'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi } from '@/lib/api/api.ecell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function FellowshipsPage() {
  const api = useAuthedApi();
  const ecell = useMemo(() => createEcellApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () =>
    ecell
      .listFellowships()
      .then(setRows)
      .catch(() => toast.error('Failed to load fellowships'))
      .finally(() => setLoading(false));

  useEffect(() => {
    void reload();
  }, [ecell]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Hacker Filter Fellowships</h1>
        <p className="text-sm text-muted-foreground">30-day paid trial → elite fellow conversion</p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.trial_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {r.student_name ?? r.student_user_id} — {r.status}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">
                  Stipend ₹{Number(r.paid_stipend_inr ?? 0).toLocaleString('en-IN')} · ends{' '}
                  {r.ends_at ? new Date(r.ends_at).toLocaleDateString() : '—'}
                </span>
                {r.status === 'TRIAL' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        ecell
                          .decideFellowship(r.trial_id, { decision: 'PASSED' })
                          .then(reload)
                          .catch((e) => toast.error(String(e.message ?? e)))
                      }
                    >
                      Pass
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        ecell
                          .decideFellowship(r.trial_id, { decision: 'FAILED' })
                          .then(reload)
                          .catch((e) => toast.error(String(e.message ?? e)))
                      }
                    >
                      Fail
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        ecell
                          .decideFellowship(r.trial_id, { decision: 'CONVERTED' })
                          .then(reload)
                          .catch((e) => toast.error(String(e.message ?? e)))
                      }
                    >
                      Convert
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
          {!rows.length && <p className="text-sm text-muted-foreground">No fellowship trials yet.</p>}
        </div>
      )}
    </div>
  );
}
