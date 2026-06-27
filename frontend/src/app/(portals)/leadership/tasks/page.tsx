'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export default function LeadershipTasksPage() {
  const api = useLeadershipApi();
  const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueAt, setDueAt] = useState('');

  const reload = useCallback(() => {
    void api.executiveTasks().then(setTasks).catch(() => setTasks([]));
  }, [api]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async () => {
    if (!title || !assignee || !dueAt) {
      toast.error('Fill title, assignee user ID, and due date');
      return;
    }
    try {
      await api.createExecutiveTask({ title, assigned_to: assignee, due_at: dueAt, priority: 'HIGH' });
      toast.success('Task assigned');
      setTitle('');
      reload();
    } catch {
      toast.error('Failed to create task');
    }
  };

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader eyebrow="Task Delegation" title="Executive Task Engine" description="Assign, track, and escalate high-priority work" />

      <LeadershipSectionCard title="Create Task">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Prepare NBA file by Friday" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Assignee User ID</label>
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="HOD user UUID" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Due At</label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <Button className="mt-3" onClick={() => void create()}>
          Assign Task
        </Button>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Active Tasks">
        <div className="space-y-2">
          {tasks.map((t) => (
            <div
              key={String(t.task_id)}
              className={`rounded-xl border px-4 py-3 ${t.overdue ? 'border-red-200 bg-red-50' : 'border-sgvu-navy/10'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sgvu-navy">{String(t.title)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(t.assignee_name)} · Due {new Date(String(t.due_at)).toLocaleString()}
                    {t.overdue ? ' · OVERDUE' : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void api.updateExecutiveTaskStatus(String(t.task_id), 'COMPLETED').then(reload)
                  }
                >
                  Mark Complete
                </Button>
              </div>
            </div>
          ))}
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks yet</p> : null}
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
