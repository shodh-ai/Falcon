'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createSpecialProgramsApi } from '@/lib/api/api.special-programs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const sp = useMemo(() => createSpecialProgramsApi(api), [api]);
  const [arts, setArts] = useState<any[]>([]);
  const reload = () => sp.artifacts().then(setArts).catch(() => toast.error('Load failed'));
  useEffect(() => { void reload(); }, [sp]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Portfolio Degree</h1>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => sp.addArtifact({ artifact_type: 'GITHUB_REPO', title: 'Demo repo', url: 'https://github.com/example/demo' }).then(reload)}>Add GitHub</Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            sp
              .publishTranscript({ mode: 'PORTFOLIO' })
              .then(() => toast.success('Portfolio transcript published'))
              .catch((e) => toast.error(String(e.message ?? e)))
          }
        >
          Publish transcript
        </Button>
      </div>
      {arts.map((a) => <Card key={a.artifact_id}><CardContent className="pt-4 text-sm">{a.artifact_type}: {a.title}</CardContent></Card>)}
    </div>
  );
}
