'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';
import { getP2pDofaApprovalsPath } from '@/lib/dofa-portal-routes';

export function UniversalDofaInboxPanel() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role ?? '';
  const p2pHref = getP2pDofaApprovalsPath(role);

  const [cases, setCases] = useState<any[]>([]);
  const [p2p, setP2p] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

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

  const decide = async (caseId: string, decision: 'APPROVED' | 'REJECTED') => {
    setDecidingId(caseId);
    const previous = cases;
    setCases((current) => current.filter((c) => c.case_id !== caseId));
    try {
      const res = await api.post<{
        status?: string;
        steps?: Array<{ required_role: string; decision: string | null }>;
      }>(`/api/dofa/cases/${caseId}/decide`, { decision });
      if (decision === 'REJECTED') {
        toast.success('Rejected');
      } else if (res?.status === 'APPROVED') {
        toast.success('Fully approved — case complete');
      } else {
        const next = (res?.steps ?? []).find((s) => !s.decision);
        toast.success(
          next ? `Approved — now awaiting ${next.required_role}` : 'Approved — advanced to next step',
        );
      }
      await reload();
    } catch (e) {
      setCases(previous);
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Universal DOFA Inbox</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Cross-department gatekeeper — grade changes, HR hires, asset write-offs, and more.
          Approve only what your role is authorized for.
        </p>
        <p className="text-xs mt-1">
          <Link href="/leadership/exceptions" className="underline">
            Exceptions (Chairman)
          </Link>
          {' · '}
          <Link href={p2pHref} className="underline">
            P2P purchase approvals
          </Link>
        </p>
      </div>

      {loadError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {/forbidden/i.test(loadError) ? (
            <>
              Your role cannot open the universal DOFA inbox. For purchase requisitions use{' '}
              <Link href={p2pHref} className="underline font-medium">
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
        {cases.map((c) => {
          const busy = decidingId === c.case_id;
          return (
            <div
              key={c.case_id}
              className="flex flex-wrap items-center gap-2 border-b py-3 text-sm"
            >
              <span className="font-medium">{c.domain}</span>
              <span>{c.title}</span>
              <span className="text-muted-foreground">
                awaiting {c.awaiting_role} · step {c.awaiting_step}
              </span>
              <Button size="sm" disabled={busy} onClick={() => void decide(c.case_id, 'APPROVED')}>
                {busy ? 'Working…' : 'Approve'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void decide(c.case_id, 'REJECTED')}
              >
                Reject
              </Button>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="font-semibold mb-2">P2P projections (Digital DOFA)</h2>
        {!loading && !p2p.length && !loadError && (
          <p className="text-sm text-muted-foreground">No open PRs at your level.</p>
        )}
        {p2p.map((p) => (
          <div key={p.source_id} className="border-b py-2 text-sm">
            {p.title} · ₹{Number(p.amount).toLocaleString('en-IN')} · {p.status}{' '}
            <Link className="underline text-xs" href={p2pHref}>
              Open P2P inbox
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
