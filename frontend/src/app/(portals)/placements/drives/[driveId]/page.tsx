'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Kanban } from 'lucide-react';
import { PlacementKanbanBoard } from '@/components/placement/PlacementKanbanBoard';
import { PlacementPageShell } from '@/components/placement/PlacementPageShell';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import type { KanbanPipeline, PlacementPipelineStage } from '@/lib/placement';

type DriveMeta = {
  company_name: string;
  job_role?: string;
  job_profile?: string;
  package_lpa?: string | number;
  min_cgpa?: string | number;
  deadline?: string;
};

export default function PlacementDriveAtsPage() {
  const api = useAuthedApi();
  const params = useParams();
  const driveId = String(params.driveId);

  const fetchPipeline = useCallback(
    () => api.get<KanbanPipeline>(`/api/placement/drives/${driveId}/pipeline`),
    [api, driveId],
  );

  const updateStage = useCallback(
    async (applicationId: string, stage: PlacementPipelineStage) => {
      await api.patch(`/api/placement/applications/${applicationId}/stage`, { stage });
    },
    [api],
  );

  const [meta, setMeta] = useState<DriveMeta | null>(null);

  useEffect(() => {
    void api.get<DriveMeta>(`/api/placement/drives/${driveId}`).then(setMeta).catch(() => setMeta(null));
  }, [api, driveId]);

  return (
    <PlacementPageShell width="full">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="text-sgvu-navy">
          <Link href="/placements/drives">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All drives
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Kanban className="h-4 w-4" />
          Drag cards between columns · students are notified on each move
        </div>
      </div>

      <PlacementKanbanBoard
        driveId={driveId}
        companyName={meta?.company_name ?? 'Drive'}
        jobRole={meta?.job_role ?? meta?.job_profile ?? 'Role'}
        fetchPipeline={fetchPipeline}
        updateStage={updateStage}
      />
    </PlacementPageShell>
  );
}
