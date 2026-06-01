'use client';

import { useEffect, useState } from 'react';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Duty = {
  assignment_id: string;
  exam_date: string;
  block_name: string | null;
  room: string;
  session_label: string | null;
};

export default function FacultyInvigilationPage() {
  const api = useAuthedApi();
  const [duties, setDuties] = useState<Duty[]>([]);

  useEffect(() => {
    void api.get<Duty[]>('/api/academics/faculty/workspaces/invigilation').then(setDuties);
  }, [api]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Exam Invigilation Duty"
        description="Read-only roster synced from Exam Cell — room, block, and session details."
      />

      <div className="grid gap-3">
        {duties.map((d) => (
          <Card key={d.assignment_id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{d.session_label ?? 'Invigilation'}</CardTitle>
              <Badge>{new Date(d.exam_date).toLocaleDateString()}</Badge>
            </CardHeader>
            <CardContent className="text-sm">
              <p>Block: {d.block_name ?? '—'}</p>
              <p>Room: {d.room}</p>
            </CardContent>
          </Card>
        ))}
        {duties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invigilation duties assigned yet.</p>
        ) : null}
      </div>
    </div>
  );
}
