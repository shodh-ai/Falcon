'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { KanbanBoard, type KanbanColumn } from '@/components/workspaces/KanbanBoard';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type PipelineResponse = {
  stages: Array<{
    id: string;
    title: string;
    cards: Array<{
      applicant_id: string;
      name: string;
      email: string;
      job_title?: string;
      stage: string;
    }>;
  }>;
};

export default function HrRecruitmentPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);

  const load = () => {
    void api
      .get<PipelineResponse>('/api/hr/recruitment/pipeline')
      .then((data) => {
        setColumns(
          (data.stages ?? []).map((stage) => ({
            id: stage.id,
            title: stage.title,
            cards: (stage.cards ?? []).map((card) => ({
              id: card.applicant_id,
              title: card.name,
              subtitle: card.job_title ?? card.email,
              meta: card.email,
            })),
          })),
        );
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Unable to load pipeline');
        setColumns([]);
      });
  };

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function moveCard(applicantId: string, stage: string) {
    try {
      await api.patch(`/api/hr/recruitment/applicants/${applicantId}/stage`, { stage });
      if (
        stage === 'HIRED' &&
        window.confirm('Provision employee account and IT onboarding (@mygyanvihar.com)?')
      ) {
        const result = await api.post<{ email: string }>(`/api/hr/recruitment/applicants/${applicantId}/hire`, {});
        toast.success(`User provisioned: ${result.email}`);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Move failed');
    }
  }

  return (
    <div className="mx-auto max-w-[95vw] space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Recruitment (ATS)"
        description="Kanban hiring pipeline. Moving to Hired provisions the user row and IT onboarding tasks."
      />

      <KanbanBoard columns={columns} onMove={(itemId, toColumnId) => void moveCard(itemId, toColumnId)} />
    </div>
  );
}
