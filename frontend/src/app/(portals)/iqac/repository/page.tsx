'use client';

import { useEffect, useState } from 'react';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type RepoData = {
  criteria: { criterion: number; title: string; document_count: number; readiness: string }[];
  documents: { document_id: string; naac_criterion: number; metric_number: string; title: string; file_path: string }[];
};

export default function IqacRepositoryPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<RepoData | null>(null);
  const [criterion, setCriterion] = useState<number | null>(null);

  useEffect(() => {
    const q = criterion ? `?criterion=${criterion}` : '';
    void api.get<RepoData>(`/iqac/repository${q}`).then(setData);
  }, [api, criterion]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <IqacPageHeader title="Criteria-Wise Document Repository" description="NAAC 7-criteria digital vault with folder readiness health." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data?.criteria ?? []).map((c) => (
          <button
            key={c.criterion}
            type="button"
            onClick={() => setCriterion(c.criterion === criterion ? null : c.criterion)}
            className={`rounded-xl border p-4 text-left transition hover:bg-muted/50 ${criterion === c.criterion ? 'ring-2 ring-sgvu-navy' : ''}`}
          >
            <p className="text-xs font-medium text-muted-foreground">Criterion {c.criterion}</p>
            <p className="mt-1 text-sm font-semibold leading-snug">{c.title}</p>
            <p className="mt-2 text-2xl font-black text-sgvu-navy">{c.document_count}</p>
            <Badge className="mt-2" variant={c.readiness === 'READY' ? 'default' : c.readiness === 'IN_PROGRESS' ? 'secondary' : 'destructive'}>
              {c.readiness.replace('_', ' ')}
            </Badge>
          </button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents{criterion ? ` — Criterion ${criterion}` : ''}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.documents ?? []).map((d) => (
            <div key={d.document_id} className="flex justify-between border-b py-2">
              <span>
                <span className="font-mono text-xs text-muted-foreground">{d.metric_number}</span> — {d.title}
              </span>
              <span className="text-muted-foreground">C{d.naac_criterion}</span>
            </div>
          ))}
          {!data?.documents?.length && <p className="text-muted-foreground">No documents in this folder.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
