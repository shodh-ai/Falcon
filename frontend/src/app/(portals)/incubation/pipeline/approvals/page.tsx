'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellProject } from '@/lib/api/api.ecell';

function formatInr(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

const COLUMNS = [
  { key: 'UNDER_L1_REVIEW', title: 'Level 1 Review' },
  { key: 'L1_APPROVED', title: 'Level 2 Review' },
  { key: 'L2_APPROVED', title: 'Grant Approved' },
] as const;

export default function IncubationApprovalsPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [approvedAmount, setApprovedAmount] = useState<Record<string, number>>({});
  const [board, setBoard] = useState<EcellProject[]>([]);
  const [l1, setL1] = useState<EcellProject[]>([]);
  const [l2, setL2] = useState<EcellProject[]>([]);

  const load = useCallback(async () => {
    const [boardRows, l1Rows, l2Rows] = await Promise.all([
      ecellApi.pipelineBoard().catch(() => [] as EcellProject[]),
      ecellApi.l1Pending().catch(() => [] as EcellProject[]),
      ecellApi.l2Pending().catch(() => [] as EcellProject[]),
    ]);
    setBoard(boardRows);
    setL1(l1Rows);
    setL2(l2Rows);
    const amounts: Record<string, number> = {};
    for (const row of [...l1Rows, ...l2Rows]) {
      amounts[row.project_id] = Number(row.approved_funding_amount ?? row.requested_funding);
    }
    setApprovedAmount(amounts);
  }, [ecellApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load approval board'))
      .finally(() => setLoading(false));
  }, [load]);

  async function runAction(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    try {
      await action();
      toast.success('Approval updated');
      setRejectId(null);
      setComment('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading approval pipeline…</p>;

  const actionQueues: Array<{ tab: 'l1' | 'l2'; title: string; rows: EcellProject[] }> = [
    { tab: 'l1', title: 'Level 1 Actions', rows: l1 },
    { tab: 'l2', title: 'Level 2 Final Grant', rows: l2 },
  ];

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">L1 & L2 Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kanban view of startups moving through incubation approval stages. Sensitive pitch data stays in this workspace.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const cards = board.filter((p) => p.current_status === col.key);
          return (
            <div key={col.key} className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-sgvu-navy">{col.title}</h2>
                <Badge variant="secondary">{cards.length}</Badge>
              </div>
              <div className="space-y-3">
                {cards.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No startups here</p>
                ) : (
                  cards.map((project) => (
                    <Card key={project.project_id} className="shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{project.startup_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{project.student_name}</p>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        <p className="line-clamp-3 text-muted-foreground">{project.innovation_description}</p>
                        <p>{formatInr(project.requested_funding)} requested</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-sgvu-navy">Action Queues</h2>
        {actionQueues.map(({ tab, title, rows }) => (
          <div key={tab} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending in this queue.</p>
            ) : (
              rows.map((project) => (
                <Card key={`${tab}-${project.project_id}`}>
                  <CardContent className="space-y-3 pt-6 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{project.startup_name}</p>
                      <Badge>{project.current_status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={approvedAmount[project.project_id] ?? Number(project.requested_funding)}
                      onChange={(e) =>
                        setApprovedAmount((m) => ({
                          ...m,
                          [project.project_id]: Number(e.target.value) || 0,
                        }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy === project.project_id}
                        onClick={() =>
                          void runAction(project.project_id, () =>
                            tab === 'l1'
                              ? ecellApi.approveL1(project.project_id, {
                                  approved_funding_amount: approvedAmount[project.project_id],
                                })
                              : ecellApi.approveL2(project.project_id, {
                                  approved_funding_amount: approvedAmount[project.project_id],
                                }),
                          )
                        }
                      >
                        {busy === project.project_id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-4 w-4" />
                        )}
                        {tab === 'l1' ? 'Approve L1' : 'Final Approve & Grant'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRejectId(`${tab}-${project.project_id}`)}
                      >
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    </div>
                    {rejectId === `${tab}-${project.project_id}` ? (
                      <div className="space-y-2 rounded-lg border p-3">
                        <Input placeholder="Remarks" value={comment} onChange={(e) => setComment(e.target.value)} />
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!comment.trim()}
                          onClick={() =>
                            void runAction(project.project_id, () =>
                              tab === 'l1'
                                ? ecellApi.rejectL1(project.project_id, comment)
                                : ecellApi.rejectL2(project.project_id, comment),
                            )
                          }
                        >
                          Confirm Reject
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
