'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [levels, setLevels] = useState<any[]>([]);

  useEffect(() => {
    void ops
      .dofaLevels()
      .then(setLevels)
      .catch(() => toast.error('Load failed'));
  }, [ops]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Digital DOFA Matrix</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        DOFA is the nervous system — this page shows the <strong>live P2P amount matrix</strong>{' '}
        (read-only). Changing the constitution requires dual-key access in the{' '}
        <a className="underline text-sgvu-navy" href="/finance/dofa-policy-vault">
          Policy Vault
        </a>
        . Middle managers approve in{' '}
        <a className="underline text-sgvu-navy" href="/approvals/dofa-inbox">
          the unified inbox
        </a>
        ; the Chairman only sees{' '}
        <a className="underline text-sgvu-navy" href="/leadership/exceptions">
          Exceptions
        </a>
        .
      </p>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Five-level P2P hierarchy. Amount routes approvals automatically — Chairman only sees CapEx
        above ₹15 Lakh. Level 3 requires two digital signatures. IT cannot raise limits alone.
      </p>
      {levels.map((l) => (
        <Card key={l.level_no}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Level {l.level_no}: {l.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              Limit:{' '}
              {l.max_amount_inr == null
                ? 'Above prior levels (no upper cap)'
                : `Up to ₹${Number(l.max_amount_inr).toLocaleString('en-IN')}`}
            </div>
            <div>Approvers: {(l.required_roles ?? []).join(' + ')}</div>
            <div>Signatures required: {l.required_signatures}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
