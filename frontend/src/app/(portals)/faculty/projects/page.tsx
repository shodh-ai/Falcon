'use client';

import { useEffect, useState } from 'react';
import { FacultyPageHeader, FacultyPageShell, FacultyEmptyState } from '@/components/faculty';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Guide = {
  guide_id: string;
  project_title: string;
  student_name: string;
  status: string;
  program: string | null;
};

export default function FacultyProjectsPage() {
  const api = useAuthedApi();
  const [guides, setGuides] = useState<Guide[]>([]);

  useEffect(() => {
    void api.get<Guide[]>('/api/academics/faculty/workspaces/projects').then(setGuides);
  }, [api]);

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Project & Lab Guides"
        description="Final-year B.Tech/MBA project supervision — weekly logs, approvals, and CE marks."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {guides.map((g) => (
          <Card key={g.guide_id} className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{g.project_title}</CardTitle>
                <Badge variant="outline">{g.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Guide for {g.student_name}
              {g.program ? ` · ${g.program}` : ''}
            </CardContent>
          </Card>
        ))}
        {guides.length === 0 ? (
          <FacultyEmptyState
            className="md:col-span-2"
            description="No guided projects assigned. HoD allocates guides at semester start."
          />
        ) : null}
      </div>
    </FacultyPageShell>
  );
}
