'use client';

import { useEffect, useState } from 'react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type KanbanCard = {
  applicant_id: string;
  name: string;
  email: string;
  stage: string;
  job_title?: string;
  progress_percent?: number;
  checklist_completed?: number;
  checklist_total?: number;
};

type Kanban = {
  stages: { id: string; title: string; cards: KanbanCard[] }[];
};

export default function HrOnboardingPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [kanban, setKanban] = useState<Kanban | null>(null);

  useEffect(() => {
    void api.get<Kanban>('/api/hr/onboarding').then(setKanban);
  }, [api, entityId]);

  return (
    <div className="mx-auto max-w-[95vw] space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Onboarding Pipeline"
        description="Kanban board — move applicants to Hired to trigger the onboarding flow."
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {kanban?.stages.map((stage) => (
          <div key={stage.id} className="min-w-[240px] flex-shrink-0 rounded-lg border bg-muted/20 p-3">
            <h3 className="mb-3 text-sm font-semibold text-sgvu-navy">{stage.title}</h3>
            <div className="space-y-2">
              {stage.cards.map((card) => (
                <Card key={card.applicant_id} className="shadow-sm">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm">{card.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 p-3 pt-0 text-xs text-muted-foreground">
                    <p>{card.email}</p>
                    {card.job_title && <p>{card.job_title}</p>}
                    {card.checklist_total != null && card.checklist_total > 0 && (
                      <div className="space-y-1 pt-1">
                        <p>
                          Checklist: {card.checklist_completed ?? 0}/{card.checklist_total} tasks
                        </p>
                        <Progress value={card.progress_percent ?? 0} className="h-1.5" />
                      </div>
                    )}
                    {card.stage === 'HIRED' && (
                      <Badge variant="outline">{card.progress_percent ?? 0}% complete</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
