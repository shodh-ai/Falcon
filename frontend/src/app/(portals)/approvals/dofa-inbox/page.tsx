'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';
import Link from 'next/link';

export default function DofaInboxPage() {
  const api = useAuthedApi();
  const [cases, setCases] = useState<any[]>([]);
  const [p2p, setP2p] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ cases: any[]; p2p_projections: any[] }>('/api/dofa/inbox');
      setCases(d.cases || []);
      setP2p(d.p2p_projections || []);
      setLoadError(null);
    } catch (e: unknown) {
      setCases([]);
      setP2p([]);
      const msg = String((e as Error)?.message ?? e);
      setLoadError(msg);
      if (!/forbidden/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Universal DOFA Inbox</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Middle-layer gatekeeper. Approve only what your role is authorized for — Chairman is not
          in this queue unless it is an Exception.
        </p>
        <p className="text-xs mt-1">
          <Link href="/leadership/exceptions" className="underline">
            Exceptions (Chairman)
          </Link>
          {' · '}
          <Link href="/finance/approvals" className="underline">
            P2P purchase approvals
          </Link>
          {' · '}
          <span className="text-muted-foreground">
            Narrative: docs/DOFA_UNIVERSAL_NERVOUS_SYSTEM.md
          </span>
        </p>
      </div>

      {loadError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {/forbidden/i.test(loadError) ? (
            <>
              Your role cannot open the universal DOFA inbox. For purchase requisitions use{' '}
              <Link href="/finance/approvals" className="underline font-medium">
                DOFA Purchase Approvals
              </Link>
              .
            </>
          ) : (
            loadError
          )}
        </div>
      )}

      {loading && !loadError && (
        <p className="text-sm text-muted-foreground">Loading inbox…</p>
      )}

      <section>
        <h2 className="font-semibold mb-2">Pending for your role</h2>
        {!loading && !cases.length && !loadError && (
          <p className="text-sm text-muted-foreground">No DOFA cases awaiting you.</p>
        )}
        {cases.map((c) => (
          <div
            key={c.case_id}
            className="flex flex-wrap items-center gap-2 border-b py-3 text-sm"
          >
            <span className="font-medium">{c.domain}</span>
            <span>{c.title}</span>
            <span className="text-muted-foreground">
              awaiting {c.awaiting_role} · step {c.awaiting_step}
            </span>
            <Button
              size="sm"
              onClick={() =>
                void api
                  .post(`/api/dofa/cases/${c.case_id}/decide`, { decision: 'APPROVED' })
                  .then(() => {
                    toast.success('Approved');
                    return reload();
                  })
                  .catch((e) => toast.error(String(e?.message ?? e)))
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void api
                  .post(`/api/dofa/cases/${c.case_id}/decide`, { decision: 'REJECTED' })
                  .then(() => {
                    toast.success('Rejected');
                    return reload();
                  })
                  .catch((e) => toast.error(String(e?.message ?? e)))
              }
            >
              Reject
            </Button>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-semibold mb-2">P2P projections (existing Digital DOFA)</h2>
        {!loading && !p2p.length && !loadError && (
          <p className="text-sm text-muted-foreground">No open PRs at your level.</p>
        )}
        {p2p.map((p) => (
          <div key={p.source_id} className="border-b py-2 text-sm">
            {p.title} · ₹{Number(p.amount).toLocaleString('en-IN')} · {p.status}{' '}
            <Link className="underline text-xs" href="/finance/approvals">
              Open P2P inbox
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
