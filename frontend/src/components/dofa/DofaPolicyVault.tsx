'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Node,
  type Edge,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';

type GraphMeta = {
  graph_id: string;
  domain: string;
  title: string;
  version: number;
  status: string;
  minutes_ref?: string;
  proposal_memo?: string;
  graph_json?: { nodes?: Node[]; edges?: Edge[] };
  compiled_matrix?: unknown;
  proposed_by?: string;
};

type AuditRow = {
  audit_id: string;
  action: string;
  actor_email?: string;
  actor_role?: string;
  created_at: string;
  minutes_ref?: string;
  before_json?: unknown;
  after_json?: unknown;
};

const DOMAINS = [
  'P2P',
  'HR_HIRE',
  'GRADE_CHANGE',
  'ASSET_WRITEOFF',
  'ESM_EXCEPTION',
  'MOU',
  'SPACE',
] as const;

function BandNode({ data }: { data: Record<string, unknown> }) {
  const roles = (data.required_roles as string[]) ?? [];
  return (
    <div className="rounded-md border-2 border-sgvu-navy bg-white px-3 py-2 text-xs shadow-sm min-w-[180px]">
      <Handle type="target" position={Position.Top} />
      <div className="font-bold text-sgvu-navy">
        {String(data.label ?? data.rule_key ?? 'Band')}
      </div>
      <div className="text-muted-foreground mt-1">
        {data.amount_max != null || data.max_amount_inr != null
          ? `Up to ₹${Number(data.amount_max ?? data.max_amount_inr).toLocaleString('en-IN')}`
          : data.amount_min != null
            ? `From ₹${Number(data.amount_min).toLocaleString('en-IN')}`
            : 'No amount cap'}
      </div>
      <div className="mt-1">Sig: {roles.join(' → ') || '—'}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { band: BandNode, condition: BandNode };

function rolesOf(user: { role?: string; roles?: string[] } | null | undefined) {
  if (!user) return [];
  const list = user.roles?.length ? user.roles : user.role ? [user.role] : [];
  return list.map((r) => r.toLowerCase());
}

export function DofaPolicyVault() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const r = rolesOf(user);
  const canPropose = r.some((x) =>
    ['campusadmin', 'superadmin', 'cio'].includes(x),
  );
  const canUnlock = r.includes('cfo');
  const canAudit = r.some((x) =>
    ['chairman', 'president', 'cfo', 'internalauditor', 'superadmin', 'campusadmin'].includes(
      x,
    ),
  );

  const [tab, setTab] = useState<'board' | 'audit'>('board');
  const [domain, setDomain] = useState<string>('P2P');
  const [graphs, setGraphs] = useState<GraphMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphMeta | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [memo, setMemo] = useState('');
  const [minutes, setMinutes] = useState('');
  const [otp, setOtp] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const editable = canPropose && selected?.status === 'DRAFT';

  const loadGraphs = useCallback(() => {
    void api
      .get<GraphMeta[]>(`/api/dofa/policy/graphs?domain=${domain}`)
      .then((list) => {
        setGraphs(list);
        const pub = list.find((g) => g.status === 'PUBLISHED') ?? list[0];
        if (pub) setSelectedId(pub.graph_id);
      })
      .catch(() => setGraphs([]));
  }, [api, domain]);

  useEffect(() => {
    loadGraphs();
  }, [loadGraphs]);

  useEffect(() => {
    if (!selectedId) return;
    void api
      .get<GraphMeta>(`/api/dofa/policy/graphs/${selectedId}`)
      .then((g) => {
        setSelected(g);
        setMemo(g.proposal_memo ?? '');
        setMinutes(g.minutes_ref ?? '');
        const gj = g.graph_json ?? { nodes: [], edges: [] };
        setNodes((gj.nodes as Node[]) ?? []);
        setEdges((gj.edges as Edge[]) ?? []);
      })
      .catch((e) => toast.error(String(e?.message ?? e)));
  }, [api, selectedId, setNodes, setEdges]);

  useEffect(() => {
    if (tab !== 'audit' || !canAudit) return;
    void api
      .get<AuditRow[]>(
        `/api/dofa/policy/audit${selectedId ? `?graph_id=${selectedId}` : ''}`,
      )
      .then(setAudit)
      .catch(() => setAudit([]));
  }, [api, tab, canAudit, selectedId]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges],
  );

  const compiledFromNodes = useMemo(() => {
    return nodes
      .filter((n) => n.type === 'band' || n.type === 'condition' || !n.type)
      .map((n, idx) => {
        const d = n.data as Record<string, unknown>;
        if (domain === 'P2P') {
          return {
            level_no: Number(d.level_no ?? idx + 1),
            label: String(d.label ?? `Level ${idx + 1}`),
            max_amount_inr:
              d.amount_max != null
                ? Number(d.amount_max)
                : d.max_amount_inr != null
                  ? Number(d.max_amount_inr)
                  : null,
            required_roles: (d.required_roles as string[]) ?? [],
            required_signatures: Number(d.required_signatures ?? 1),
          };
        }
        return {
          rule_key: String(d.rule_key ?? `BAND_${idx + 1}`),
          amount_min: d.amount_min != null ? Number(d.amount_min) : null,
          amount_max: d.amount_max != null ? Number(d.amount_max) : null,
          required_roles: (d.required_roles as string[]) ?? [],
          required_signatures: Number(d.required_signatures ?? 1),
          exception_escalate_role: String(d.exception_escalate_role ?? 'Chairman'),
        };
      });
  }, [nodes, domain]);

  function addBand() {
    const id = `band_${Date.now()}`;
    const y = nodes.length * 120;
    if (domain === 'P2P') {
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: 'band',
          position: { x: 80, y },
          data: {
            level_no: ns.length + 1,
            label: `Level ${ns.length + 1}`,
            amount_max: 50000,
            required_roles: ['HOD'],
            required_signatures: 1,
          },
        },
      ]);
    } else {
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: 'band',
          position: { x: 80, y },
          data: {
            rule_key: `BAND_${ns.length + 1}`,
            amount_min: 0,
            amount_max: null,
            required_roles: ['Dean'],
            required_signatures: 1,
            exception_escalate_role: 'Chairman',
          },
        },
      ]);
    }
  }

  async function createDraftFromCanvas() {
    try {
      const g = await api.post<GraphMeta>('/api/dofa/policy/graphs', {
        domain,
        title: `${domain} change — ${new Date().toISOString().slice(0, 10)}`,
        graph_json: { nodes, edges },
        compiled_matrix: compiledFromNodes,
        proposal_memo: memo || 'Board-approved DOFA limit change',
        minutes_ref: minutes || 'FC-PENDING',
      });
      toast.success('Draft created (live matrices untouched)');
      setSelectedId(g.graph_id);
      loadGraphs();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  async function saveDraft() {
    if (!selectedId) return;
    try {
      await api.put(`/api/dofa/policy/graphs/${selectedId}`, {
        graph_json: { nodes, edges },
        compiled_matrix: compiledFromNodes,
        proposal_memo: memo,
        minutes_ref: minutes,
      });
      toast.success('Draft saved');
      loadGraphs();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  async function submitToCfo() {
    if (!selectedId) return;
    try {
      await api.put(`/api/dofa/policy/graphs/${selectedId}`, {
        graph_json: { nodes, edges },
        compiled_matrix: compiledFromNodes,
        proposal_memo: memo,
        minutes_ref: minutes,
      });
      const g = await api.post<GraphMeta>(
        `/api/dofa/policy/graphs/${selectedId}/submit`,
        {},
      );
      setSelected(g);
      toast.success('Frozen — awaiting CFO unlock');
      loadGraphs();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  async function requestOtp() {
    if (!selectedId) return;
    try {
      const res = await api.post<{ dev_otp?: string; expires_at: string }>(
        `/api/dofa/policy/graphs/${selectedId}/request-otp`,
        {},
      );
      if (res.dev_otp) {
        setOtp(res.dev_otp);
        toast.success(`OTP issued (dev): ${res.dev_otp}`);
      } else {
        toast.success('OTP sent to CFO channel');
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  async function unlockPublish() {
    if (!selectedId) return;
    try {
      const g = await api.post<GraphMeta>(
        `/api/dofa/policy/graphs/${selectedId}/unlock`,
        { otp },
      );
      setSelected(g);
      toast.success('Unlocked & published to live matrices');
      loadGraphs();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  function bumpSelectedBandAmount(amount: number) {
    setNodes((ns) =>
      ns.map((n, i) => {
        if (i !== 0) return n;
        return {
          ...n,
          data: {
            ...n.data,
            amount_max: amount,
            max_amount_inr: amount,
            label:
              domain === 'P2P'
                ? `HOD / Lab (₹${amount.toLocaleString('en-IN')})`
                : n.data.label,
          },
        };
      }),
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-4">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">DOFA Policy Vault</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          The constitution of the university. IT drafts the IF/THEN board; the CFO unlocks with a
          second key. Live spend matrices never change without dual control — etched in the audit
          stone.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={tab === 'board' ? 'default' : 'outline'}
          onClick={() => setTab('board')}
        >
          Workflow board
        </Button>
        {canAudit && (
          <Button
            size="sm"
            variant={tab === 'audit' ? 'default' : 'outline'}
            onClick={() => setTab('audit')}
          >
            Audit stone
          </Button>
        )}
        <select
          className="border rounded px-2 py-1 text-sm"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="border rounded px-2 py-1 text-sm min-w-[220px]"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {graphs.map((g) => (
            <option key={g.graph_id} value={g.graph_id}>
              v{g.version} · {g.status} · {g.title}
            </option>
          ))}
        </select>
        {selected && (
          <span className="text-xs font-semibold uppercase tracking-wide text-sgvu-navy">
            {selected.status}
          </span>
        )}
      </div>

      {tab === 'audit' ? (
        <div className="flex-1 overflow-auto border rounded-md bg-white p-4">
          {!audit.length && (
            <p className="text-sm text-muted-foreground">No audit rows yet.</p>
          )}
          {audit.map((a) => (
            <div key={a.audit_id} className="border-b py-3 text-sm">
              <div className="font-medium">
                On {new Date(a.created_at).toLocaleString()},{' '}
                {a.actor_email || a.actor_role || 'SYSTEM'} — <strong>{a.action}</strong>
              </div>
              {a.minutes_ref && (
                <div className="text-xs text-muted-foreground">Minutes: {a.minutes_ref}</div>
              )}
              <pre className="mt-1 text-[10px] overflow-x-auto text-muted-foreground">
                {JSON.stringify({ before: a.before_json, after: a.after_json }, null, 0).slice(
                  0,
                  400,
                )}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 gap-3">
          <div className="flex-1 min-h-[420px] border rounded-md bg-slate-50">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={editable ? onNodesChange : undefined}
              onEdgesChange={editable ? onEdgesChange : undefined}
              onConnect={editable ? onConnect : undefined}
              nodeTypes={nodeTypes}
              fitView
              nodesDraggable={editable}
              nodesConnectable={editable}
              elementsSelectable
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>

          <aside className="w-80 shrink-0 space-y-3 overflow-auto border rounded-md bg-white p-3 text-sm">
            <div className="font-semibold text-sgvu-navy">Governance (parliament)</div>
            <label className="block text-xs text-muted-foreground">Proposal memo</label>
            <textarea
              className="w-full border rounded p-2 text-sm min-h-[80px]"
              value={memo}
              disabled={!canPropose}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Tokamak Labs bottleneck — raise L1 to ₹1.5L…"
            />
            <label className="block text-xs text-muted-foreground">Board minutes ref</label>
            <Input
              value={minutes}
              disabled={!canPropose}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="FC-2026-Q3-12"
            />

            {canPropose && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-xs font-semibold">IT Head actions</div>
                <Button size="sm" variant="outline" className="w-full" onClick={addBand}>
                  Add IF amount band
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => bumpSelectedBandAmount(150000)}
                >
                  Demo: set first band → ₹1.5L
                </Button>
                <Button size="sm" className="w-full" onClick={createDraftFromCanvas}>
                  New draft from canvas
                </Button>
                {editable && (
                  <>
                    <Button size="sm" variant="outline" className="w-full" onClick={saveDraft}>
                      Save draft
                    </Button>
                    <Button size="sm" className="w-full" onClick={submitToCfo}>
                      Submit → CFO (freeze)
                    </Button>
                  </>
                )}
              </div>
            )}

            {canUnlock && selected?.status === 'PENDING_CFO' && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-xs font-semibold">CFO second key</div>
                <Button size="sm" variant="outline" className="w-full" onClick={requestOtp}>
                  Request OTP
                </Button>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit OTP"
                />
                <Button size="sm" className="w-full" onClick={unlockPublish}>
                  Unlock & publish
                </Button>
              </div>
            )}

            <div className="pt-2 border-t text-xs text-muted-foreground">
              Compiled preview:{' '}
              <code className="break-all">
                {JSON.stringify(compiledFromNodes).slice(0, 180)}…
              </code>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
