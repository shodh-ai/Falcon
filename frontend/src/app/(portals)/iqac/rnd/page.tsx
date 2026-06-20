'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FlaskConical, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import {
  createAcademicRndApi,
  type RndApplication,
  type RndConfig,
} from '@/lib/api/api.academic-rnd';

export default function IqacRndPage() {
  const api = useAuthedApi();
  const rndApi = useMemo(() => createAcademicRndApi(api), [api]);
  const [configs, setConfigs] = useState<RndConfig[]>([]);
  const [applications, setApplications] = useState<RndApplication[]>([]);
  const [rankingQueue, setRankingQueue] = useState<RndApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [cfg, apps, ranking] = await Promise.all([
      rndApi.listConfigs(),
      rndApi.allApplications(),
      rndApi.rankingQueue(),
    ]);
    setConfigs(cfg);
    setApplications(apps);
    setRankingQueue(ranking);
  }, [rndApi]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function publishConfig(e: FormEvent) {
    e.preventDefault();
    try {
      await rndApi.upsertConfig({
        title,
        deadline: deadline || undefined,
        attachment_rules: ['Research Proposal PDF', 'Budget Estimate'],
      });
      toast.success('Grant call published — students notified via Notice Board');
      setTitle('');
      setDeadline('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed');
    }
  }

  async function submitRanking(app: RndApplication, status: 'APPROVED' | 'REJECTED') {
    const score = Number(scoreInputs[app.application_id] ?? 0);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      toast.error('Enter a ranking score between 0 and 100');
      return;
    }
    try {
      await rndApi.submitRanking(app.application_id, {
        ranking_score: score,
        ranking_status: status,
      });
      toast.success(status === 'APPROVED' ? 'Grant approved' : 'Application rejected at ranking');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ranking failed');
    }
  }

  function exportReport() {
    window.open(rndApi.exportReportUrl(), '_blank');
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-sgvu-navy">
            <FlaskConical className="h-7 w-7" />
            Student R&D Grants
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure grant calls, committee ranking, and NAAC compliance exports.
          </p>
        </div>
        <Button variant="outline" onClick={exportReport}>
          <Download className="mr-2 h-4 w-4" />
          Export R&D Report
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Publish Grant Call</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={publishConfig} className="grid gap-3 sm:grid-cols-3">
            <Input placeholder="e.g. Undergraduate Research Grant 2026" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <Button type="submit">Publish & Notify Students</Button>
          </form>
          {configs[0] && (
            <p className="mt-3 text-xs text-muted-foreground">
              Latest: {configs[0].title}
              {configs[0].deadline ? ` · deadline ${new Date(configs[0].deadline).toLocaleString('en-IN')}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranking Queue (Step 3)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rankingQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications awaiting committee ranking.</p>
          ) : (
            rankingQueue.map((app) => (
              <div key={app.application_id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-semibold text-sgvu-navy">{app.project_title}</p>
                  <p className="text-xs text-muted-foreground">{app.student_name} · Budget approved</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-24"
                  placeholder="Score"
                  value={scoreInputs[app.application_id] ?? ''}
                  onChange={(e) => setScoreInputs((s) => ({ ...s, [app.application_id]: e.target.value }))}
                />
                <Button size="sm" onClick={() => void submitRanking(app, 'APPROVED')}>
                  Approve Grant
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void submitRanking(app, 'REJECTED')}>
                  Reject
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Score</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.application_id} className="border-b">
                    <td className="py-2 pr-3 font-medium">{app.project_title}</td>
                    <td className="py-2 pr-3">{app.student_name ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">{app.status.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="py-2 pr-3">{app.ranking_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
