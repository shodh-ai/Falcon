'use client';

import { useEffect, useState } from 'react';
import { Eye, MapPin, Calendar } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
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
    <FacultyPageShell>
      <FacultyPageHeader
        description="Read-only roster synced from Exam Cell — room, block, and session details."
        meta={<FacultyMetricChip label="Duties" value={duties.length} emphasis />}
      />

      {duties.length === 0 ? (
        <FacultyEmptyState description="No invigilation duties assigned yet." />
      ) : (
        <FacultyPanel title="Your invigilation roster" count={duties.length}>
          <div className="grid gap-3 sm:grid-cols-2">
            {duties.map((d) => (
              <div
                key={d.assignment_id}
                className="rounded-xl border border-border/60 bg-background p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                    <div>
                      <p className="font-semibold text-sgvu-navy">{d.session_label ?? 'Invigilation'}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(d.exam_date).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">Exam Cell</Badge>
                </div>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-sgvu-navy/60" />
                    Block {d.block_name ?? '—'} · Room {d.room}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </FacultyPanel>
      )}
    </FacultyPageShell>
  );
}
