'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  Scale,
  ShoppingCart,
  XCircle,
} from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/notifications/falcon-toast';
import { getP2pDofaApprovalsPath } from '@/lib/dofa-portal-routes';
import { isFacultyDemoSmokeId } from '@/lib/faculty-demo-mode';
import { cn } from '@/lib/utils';

type DofaCase = {
  case_id: string;
  domain?: string;
  title?: string;
  awaiting_role?: string;
  awaiting_step?: number | string;
};

type P2pProjection = {
  source_id: string;
  title?: string;
  amount?: number | string;
  status?: string;
};

export function UniversalDofaInboxPanel() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role ?? '';
  const p2pHref = getP2pDofaApprovalsPath(role);

  const [cases, setCases] = useState<DofaCase[]>([]);
  const [p2p, setP2p] = useState<P2pProjection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ cases: DofaCase[]; p2p_projections: P2pProjection[] }>(
        '/api/dofa/inbox',
      );
      const roleName = String(role).toLowerCase();
      if (roleName === 'faculty') {
        const { isEmptyArray, withFacultyDemoFallback } = await import('@/lib/faculty-demo-mode');
        const { facultyDemoDofaInbox } = await import('@/lib/mock/faculty-portal-demo');
        const demo = facultyDemoDofaInbox();
        setCases(withFacultyDemoFallback(d.cases || [], demo.cases, isEmptyArray));
        setP2p(withFacultyDemoFallback(d.p2p_projections || [], demo.p2p_projections, isEmptyArray));
      } else {
        setCases(d.cases || []);
        setP2p(d.p2p_projections || []);
      }
      setLoadError(null);
    } catch (e: unknown) {
      const roleName = String(role).toLowerCase();
      if (roleName === 'faculty') {
        const { isEmptyArray, withFacultyDemoFallback } = await import('@/lib/faculty-demo-mode');
        const { facultyDemoDofaInbox } = await import('@/lib/mock/faculty-portal-demo');
        const demo = facultyDemoDofaInbox();
        setCases(withFacultyDemoFallback([], demo.cases, isEmptyArray));
        setP2p(withFacultyDemoFallback([], demo.p2p_projections, isEmptyArray));
        setLoadError(null);
      } else {
        setCases([]);
        setP2p([]);
        const msg = String((e as Error)?.message ?? e);
        setLoadError(msg);
        if (!/forbidden/i.test(msg)) {
          toast.error(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [api, role]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = async (caseId: string, decision: 'APPROVED' | 'REJECTED') => {
    setDecidingId(caseId);
    const previous = cases;
    setCases((current) => current.filter((c) => c.case_id !== caseId));
    try {
      if (isFacultyDemoSmokeId(caseId)) {
        toast.success(
          decision === 'REJECTED'
            ? 'Rejected (demo)'
            : 'Approved — advanced to next step (demo)',
        );
        return;
      }
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

  const domainCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cases) {
      const key = String(item.domain || 'OTHER').toUpperCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).slice(0, 4);
  }, [cases]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <header className="rounded-2xl border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy/[0.05] via-white to-sgvu-gold/10 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sgvu-navy text-white">
                <Scale className="h-4 w-4" />
              </span>
              <Badge variant="secondary" className="bg-sgvu-navy/10 text-sgvu-navy">
                Cross-department
              </Badge>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">
              Universal DOFA Inbox
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Cross-department gatekeeper — grade changes, HR hires, asset write-offs, and more.
              Approve only what your role is authorized for.
            </p>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[22rem]">
            <div className="rounded-xl border border-border/60 bg-white px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Pending
              </p>
              <p className="text-xl font-black tabular-nums text-sgvu-navy">{cases.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                P2P items
              </p>
              <p className="text-xl font-black tabular-nums text-sgvu-navy">{p2p.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Your role
              </p>
              <p className="truncate text-sm font-bold text-sgvu-navy">{role || '—'}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            href="/leadership/exceptions"
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-white px-3 text-sm font-semibold text-sgvu-navy transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
          >
            Exceptions (Chairman)
          </Link>
          <Link
            href={p2pHref}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-white px-3 text-sm font-semibold text-sgvu-navy transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
          >
            <ShoppingCart className="h-4 w-4 text-sgvu-gold" />
            P2P purchase approvals
          </Link>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {/forbidden/i.test(loadError) ? (
            <>
              Your role cannot open the universal DOFA inbox. For purchase requisitions use{' '}
              <Link href={p2pHref} className="font-semibold underline">
                DOFA Purchase Approvals
              </Link>
              .
            </>
          ) : (
            loadError
          )}
        </div>
      ) : null}

      {domainCounts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {domainCounts.map(([domain, count]) => (
            <Badge key={domain} variant="outline" className="border-sgvu-navy/20 text-sgvu-navy">
              {domain} · {count}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Pending cases */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="h-5 w-1 shrink-0 rounded-full bg-sgvu-gold" />
              <h2 className="text-sm font-bold text-sgvu-navy">Pending for your role</h2>
              <span className="rounded-md bg-sgvu-navy/10 px-2 py-0.5 text-xs font-bold text-sgvu-navy">
                {cases.length}
              </span>
            </div>
            <p className="mt-1 pl-3.5 text-xs text-muted-foreground">
              Review and decide cases waiting at your step
            </p>
          </div>
          <Inbox className="hidden h-5 w-5 text-sgvu-navy/40 sm:block" />
        </div>

        <div className="p-4 sm:p-5">
          {loading && !loadError ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-sgvu-navy" />
              Loading inbox…
            </div>
          ) : null}

          {!loading && !cases.length && !loadError ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              No DOFA cases awaiting you.
            </div>
          ) : null}

          <div className="grid gap-3">
            {cases.map((c) => {
              const busy = decidingId === c.case_id;
              return (
                <article
                  key={c.case_id}
                  className={cn(
                    'grid min-h-[5.5rem] gap-3 rounded-xl border border-border/70 bg-background p-4',
                    'sm:grid-cols-[minmax(0,1fr)_13.5rem] sm:items-center',
                  )}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-sgvu-navy text-white hover:bg-sgvu-navy">
                        {c.domain || 'CASE'}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        Step {c.awaiting_step ?? '—'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold leading-snug text-sgvu-navy">
                      {c.title || 'Untitled case'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Awaiting <span className="font-semibold text-sgvu-navy">{c.awaiting_role || role || 'role'}</span>
                    </p>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:w-[13.5rem]">
                    <Button
                      size="sm"
                      className="h-10 w-full justify-center"
                      disabled={busy}
                      onClick={() => void decide(c.case_id, 'APPROVED')}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          Approve
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 w-full justify-center"
                      disabled={busy}
                      onClick={() => void decide(c.case_id, 'REJECTED')}
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* P2P projections */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="h-5 w-1 shrink-0 rounded-full bg-sgvu-gold" />
              <h2 className="text-sm font-bold text-sgvu-navy">P2P projections (Digital DOFA)</h2>
              <span className="rounded-md bg-sgvu-navy/10 px-2 py-0.5 text-xs font-bold text-sgvu-navy">
                {p2p.length}
              </span>
            </div>
            <p className="mt-1 pl-3.5 text-xs text-muted-foreground">
              Purchase requests visible at your approval level
            </p>
          </div>
          <ShoppingCart className="hidden h-5 w-5 text-sgvu-navy/40 sm:block" />
        </div>

        <div className="p-4 sm:p-5">
          {!loading && !p2p.length && !loadError ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
              No open purchase requisitions at your level.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {p2p.map((p) => (
              <article
                key={p.source_id}
                className="flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-border/70 bg-background p-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-sgvu-gold/40 text-sgvu-navy">
                      {p.status || 'PENDING'}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold leading-snug text-sgvu-navy">
                    {p.title || 'Purchase request'}
                  </p>
                  <p className="text-lg font-black tabular-nums text-sgvu-navy">
                    ₹{Number(p.amount ?? 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <Link
                  href={p2pHref}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-border/60 text-sm font-semibold text-sgvu-navy transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
                >
                  Open P2P inbox
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
