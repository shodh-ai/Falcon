'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createMoonshotsApi } from '@/lib/api/api.moonshots';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const m = useMemo(() => createMoonshotsApi(api), [api]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => {
    void Promise.all([m.programs(), m.projects()])
      .then(([p, pr]) => {
        setPrograms(p);
        setProjects(pr);
      })
      .catch(() => toast.error('Load failed'));
  }, [m]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Deep-Tech Moonshots</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {programs.map((p) => (
          <Card key={p.program_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{p.description}</CardContent>
          </Card>
        ))}
      </div>
      <h2 className="text-lg font-bold">Projects</h2>
      {projects.map((p) => (
        <Card key={p.project_id}>
          <CardContent className="pt-4 text-sm">
            {p.title} · {p.program_code} · {p.status} · {p.student_name}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
