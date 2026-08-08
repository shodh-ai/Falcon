'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createSpecialProgramsApi } from '@/lib/api/api.special-programs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const sp = useMemo(() => createSpecialProgramsApi(api), [api]);
  const [arts, setArts] = useState<any[]>([]);
  const [title, setTitle] = useState('My capstone repo');
  const [url, setUrl] = useState('https://github.com/example/my-project');

  const reload = () =>
    sp
      .artifacts()
      .then(setArts)
      .catch(() => toast.error('Failed to load portfolio artifacts'));

  useEffect(() => {
    void reload();
  }, [sp]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Portfolio Degree</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add GitHub repos, patents, or hardware builds — then publish your portfolio transcript for
          graduation review.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add GitHub repo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Repo title"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/you/project"
          />
          <Button
            size="sm"
            onClick={() =>
              sp
                .addArtifact({
                  artifact_type: 'GITHUB_REPO',
                  title: title.trim() || 'GitHub repo',
                  url: url.trim(),
                })
                .then(() => {
                  toast.success('GitHub repo added to portfolio');
                  return reload();
                })
                .catch((e) => toast.error(String(e.message ?? e)))
            }
          >
            Add GitHub repo
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-sgvu-navy">Your artifacts</h2>
          {arts.length > 0 && (
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
          )}
        </div>
        {arts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No artifacts yet — add a GitHub repo above.</p>
        ) : (
          arts.map((a) => (
            <Card key={a.artifact_id}>
              <CardContent className="pt-4 text-sm">
                <span className="font-semibold">{a.artifact_type}</span>: {a.title}
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-sgvu-navy underline"
                  >
                    View
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
