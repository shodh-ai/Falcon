'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { toast } from '@/lib/notifications/falcon-toast';

type OrgNode = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  reporting_officer_id: string | null;
  pillar: string;
};

const PILLAR_META: Record<string, { title: string; accent: string }> = {
  ACADEMIC: { title: 'Academic', accent: 'border-sky-600' },
  OPERATIONS: { title: 'Operations', accent: 'border-amber-600' },
  FINANCE: { title: 'Finance', accent: 'border-emerald-700' },
};

function PersonCard({ n }: { n: OrgNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{n.name}</div>
      <div className="text-xs font-medium text-slate-600">{n.role_name}</div>
      <div className="text-[11px] text-slate-400 truncate">{n.email}</div>
    </div>
  );
}

function buildRoots(people: OrgNode[], chairmanId: string | null) {
  const byOfficer = new Map<string | null, OrgNode[]>();
  for (const p of people) {
    const key = p.reporting_officer_id;
    if (!byOfficer.has(key)) byOfficer.set(key, []);
    byOfficer.get(key)!.push(p);
  }
  return { byOfficer, chairmanId };
}

function TreeBranch({
  node,
  byOfficer,
  depth = 0,
}: {
  node: OrgNode;
  byOfficer: Map<string | null, OrgNode[]>;
  depth?: number;
}) {
  const kids = byOfficer.get(node.user_id) ?? [];
  return (
    <div className="space-y-2" style={{ marginLeft: depth ? 12 : 0 }}>
      <PersonCard n={node} />
      {kids.length > 0 && (
        <div className="border-l-2 border-slate-200 pl-3 space-y-2">
          {kids.map((k) => (
            <TreeBranch key={k.user_id} node={k} byOfficer={byOfficer} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [data, setData] = useState<{
    chairman: OrgNode | null;
    pillars: Record<string, OrgNode[]>;
    people: OrgNode[];
  } | null>(null);

  useEffect(() => {
    ops
      .orgPillars()
      .then(setData)
      .catch(() => toast.error('Could not load org pillars'));
  }, [ops]);

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading org chart…</div>;
  }

  const { byOfficer } = buildRoots(data.people, data.chairman?.user_id ?? null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Digital DOFA · Anti-collusion
          </p>
          <h1 className="text-3xl font-black tracking-tight text-sgvu-navy">
            Three-Pillar Org Hierarchy
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Academic, Operations, and Finance report independently to the Chairman. Procurement
            and Stores never share a leaf manager; Finance never reports to the COO.
          </p>
        </header>

        {data.chairman && (
          <div className="flex justify-center">
            <div className="w-full max-w-sm rounded-lg border-2 border-sgvu-navy bg-sgvu-navy px-4 py-3 text-white shadow-md">
              <div className="text-xs uppercase tracking-wide text-sgvu-gold">Board</div>
              <div className="text-lg font-bold">{data.chairman.name}</div>
              <div className="text-sm opacity-90">{data.chairman.role_name}</div>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {(['ACADEMIC', 'OPERATIONS', 'FINANCE'] as const).map((key) => {
            const meta = PILLAR_META[key];
            const pillarPeople = data.pillars[key] || [];
            const roots = pillarPeople.filter(
              (p) =>
                !p.reporting_officer_id ||
                p.reporting_officer_id === data.chairman?.user_id ||
                !pillarPeople.some((x) => x.user_id === p.reporting_officer_id),
            );
            return (
              <section
                key={key}
                className={`rounded-xl border-t-4 ${meta.accent} bg-white/90 p-4 shadow-sm backdrop-blur`}
              >
                <h2 className="mb-3 text-lg font-bold text-slate-900">{meta.title}</h2>
                <div className="space-y-3">
                  {roots.map((r) => (
                    <TreeBranch key={r.user_id} node={r} byOfficer={byOfficer} />
                  ))}
                  {!roots.length && (
                    <p className="text-xs text-slate-400">No seeded personas in this pillar.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
