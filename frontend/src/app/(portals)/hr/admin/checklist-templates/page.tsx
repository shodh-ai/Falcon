'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrTabBar } from '@/components/hr/HrTabBar';
import { ONBOARDING_STAGE_TABS } from '@/components/hr/OnboardingWorkflowPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type WorkflowTemplate = {
  template_id: string;
  workflow_type: string;
  stage_name: string;
  task_name: string;
  is_mandatory: boolean;
  step_order: number;
};

export default function HrWorkflowTemplatesPage() {
  const api = useHrApi();
  const { entityReady, loading: entityLoading } = useHrEntity();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [activeStage, setActiveStage] = useState<string>(ONBOARDING_STAGE_TABS[0].id);
  const [newTaskName, setNewTaskName] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!entityReady) return;
    void api.get<WorkflowTemplate[]>('/api/hr/admin/workflow-templates?workflow_type=ONBOARDING').then(setTemplates);
  }, [api, entityReady]);

  useEffect(() => {
    load();
  }, [load]);

  const stageTemplates = useMemo(
    () =>
      templates
        .filter((t) => t.stage_name === activeStage)
        .sort((a, b) => a.step_order - b.step_order),
    [templates, activeStage],
  );

  async function addTask() {
    const task = newTaskName.trim();
    if (!task) return;
    try {
      await api.post('/api/hr/admin/workflow-templates', {
        workflow_type: 'ONBOARDING',
        stage_name: activeStage,
        task_name: task,
        is_mandatory: true,
      });
      setNewTaskName('');
      toast.success('Task added');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add task');
    }
  }

  async function toggleMandatory(template: WorkflowTemplate) {
    try {
      await api.patch(`/api/hr/admin/workflow-templates/${template.template_id}`, {
        is_mandatory: !template.is_mandatory,
      });
      setTemplates((prev) =>
        prev.map((t) =>
          t.template_id === template.template_id ? { ...t, is_mandatory: !t.is_mandatory } : t,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function deleteTask(templateId: string) {
    try {
      await api.post(`/api/hr/admin/workflow-templates/${templateId}/delete`, {});
      toast.success('Task removed');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function persistOrder(ordered: WorkflowTemplate[]) {
    try {
      await api.patch('/api/hr/admin/workflow-templates/reorder', {
        stage_name: activeStage,
        ordered_template_ids: ordered.map((t) => t.template_id),
      });
      setTemplates((prev) => {
        const others = prev.filter((t) => t.stage_name !== activeStage);
        const reindexed = ordered.map((t, i) => ({ ...t, step_order: i + 1 }));
        return [...others, ...reindexed];
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reorder failed');
      load();
    }
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const items = [...stageTemplates];
    const from = items.findIndex((t) => t.template_id === dragId);
    const to = items.findIndex((t) => t.template_id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    setDragId(null);
    void persistOrder(items);
  }

  if (entityLoading) {
    return <p className="text-sm text-muted-foreground">Loading entity context…</p>;
  }

  return (
    <>
      <HrPageHeader
        title="Onboarding Workflow Templates"
        description="Configure the Default Workflow — three stages, drag-and-drop task order, and mandatory flags (Zimyo-style)."
      />

      <Card className="border-gray-100 shadow-sm">
        <CardContent className="p-0">
          <div className="border-b px-4 pt-4">
            <HrTabBar tabs={[...ONBOARDING_STAGE_TABS]} active={activeStage} onChange={setActiveStage} />
          </div>

          <div className="divide-y">
            {stageTemplates.map((template) => (
              <div
                key={template.template_id}
                draggable
                onDragStart={() => setDragId(template.template_id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(template.template_id)}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                <span className="flex-1 text-sm font-medium text-sgvu-navy">{template.task_name}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={template.is_mandatory}
                    onChange={() => void toggleMandatory(template)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  Mandatory
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-red-600"
                  onClick={() => void deleteTask(template.template_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {stageTemplates.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No tasks in this stage yet.</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 p-4">
            <Input
              className="max-w-sm"
              placeholder="New task name…"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addTask()}
            />
            <Button size="sm" onClick={() => void addTask()} disabled={!newTaskName.trim()}>
              <Plus className="mr-1 h-4 w-4" />
              Add task
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
