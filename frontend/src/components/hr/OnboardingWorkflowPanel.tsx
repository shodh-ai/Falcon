'use client';

import { useMemo, useState } from 'react';
import { GripVertical, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { HrTabBar } from '@/components/hr/HrTabBar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useHrApi } from '@/lib/api/use-hr-api';

export const ONBOARDING_STAGE_TABS = [
  { id: 'Offer Management', label: 'Offer Management' },
  { id: 'Candidate Onboarding', label: 'Candidate Onboarding' },
  { id: 'Employee Onboarding', label: 'Employee Onboarding' },
] as const;

export type OnboardingTask = {
  task_id: string;
  status: 'PENDING' | 'COMPLETED';
  completed_at: string | null;
  completed_by_name: string | null;
  template_id: string;
  stage_name: string;
  task_name: string;
  is_mandatory: boolean;
  step_order: number;
};

export type OnboardingWorkflow = {
  employee: {
    user_id: string;
    name: string;
    email: string;
    designation: string | null;
    joining_date: string | null;
    employee_id: string | null;
    job_title: string | null;
  };
  stages: Array<{ stage_name: string; tasks: OnboardingTask[] }>;
  progress_percent: number;
  total_tasks: number;
  completed_tasks: number;
};

type Props = {
  workflow: OnboardingWorkflow;
  onUpdate: (workflow: OnboardingWorkflow) => void;
  readOnly?: boolean;
};

export function OnboardingWorkflowPanel({ workflow, onUpdate, readOnly = false }: Props) {
  const api = useHrApi();
  const [activeStage, setActiveStage] = useState<string>(ONBOARDING_STAGE_TABS[0].id);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const stageTasks = useMemo(() => {
    const stage = workflow.stages.find((s) => s.stage_name === activeStage);
    return stage?.tasks ?? [];
  }, [workflow.stages, activeStage]);

  async function toggleTask(task: OnboardingTask) {
    if (readOnly) return;
    const completed = task.status !== 'COMPLETED';
    setSavingTaskId(task.task_id);
    try {
      await api.patch(`/api/hr/onboarding/tasks/${task.task_id}`, { completed });
      const nextStages = workflow.stages.map((stage) => ({
        ...stage,
        tasks: stage.tasks.map((t) =>
          t.task_id === task.task_id
            ? {
                ...t,
                status: completed ? ('COMPLETED' as const) : ('PENDING' as const),
                completed_at: completed ? new Date().toISOString() : null,
              }
            : t,
        ),
      }));
      const allTasks = nextStages.flatMap((s) => s.tasks);
      const done = allTasks.filter((t) => t.status === 'COMPLETED').length;
      onUpdate({
        ...workflow,
        stages: nextStages,
        completed_tasks: done,
        progress_percent: allTasks.length ? Math.round((done / allTasks.length) * 100) : 0,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update task');
    } finally {
      setSavingTaskId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sgvu-gold">Default Workflow</p>
            <h2 className="mt-1 text-xl font-black text-sgvu-navy">{workflow.employee.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {workflow.employee.designation ?? 'New hire'}
              {workflow.employee.job_title ? ` · ${workflow.employee.job_title}` : ''}
              {workflow.employee.joining_date ? ` · Joining ${workflow.employee.joining_date}` : ''}
            </p>
          </div>
          <div className="min-w-[200px]">
            <p className="text-right text-sm font-semibold text-sgvu-navy">
              {workflow.completed_tasks}/{workflow.total_tasks} tasks
            </p>
            <Progress value={workflow.progress_percent} className="mt-2 h-2" />
            <p className="mt-1 text-right text-xs text-muted-foreground">{workflow.progress_percent}% complete</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="px-4 pt-4">
          <HrTabBar tabs={[...ONBOARDING_STAGE_TABS]} active={activeStage} onChange={setActiveStage} />
        </div>

        <div className="divide-y">
          {stageTasks.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No tasks configured for this stage.</p>
          ) : (
            stageTasks.map((task) => {
              const done = task.status === 'COMPLETED';
              return (
                <div
                  key={task.task_id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3.5 transition-colors',
                    done && 'bg-emerald-50/40',
                    savingTaskId === task.task_id && 'opacity-70',
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium text-sgvu-navy', done && 'line-through opacity-70')}>
                      {task.task_name}
                    </p>
                    {done && task.completed_by_name ? (
                      <p className="text-xs text-muted-foreground">Completed by {task.completed_by_name}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={task.is_mandatory}
                        readOnly
                        disabled
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                      Mandatory
                    </label>
                    {!task.is_mandatory ? (
                      <Badge variant="outline" className="text-[10px]">
                        Optional
                      </Badge>
                    ) : null}
                    <button
                      type="button"
                      disabled={readOnly || savingTaskId === task.task_id}
                      onClick={() => void toggleTask(task)}
                      className={cn(
                        'rounded-full p-1 transition-colors',
                        done ? 'text-emerald-600 hover:text-emerald-700' : 'text-muted-foreground hover:text-sgvu-navy',
                      )}
                      title={done ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
