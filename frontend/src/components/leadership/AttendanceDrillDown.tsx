'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { ChevronRight, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeadershipApi, type DrillNode } from '@/lib/api/api.leadership';
import { LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';

const LEVELS = ['school', 'department', 'course', 'faculty'] as const;

export function AttendanceDrillDown() {
  const api = useLeadershipApi();
  const mountedRef = useRef(true);
  const [stack, setStack] = useState<Array<{ level: string; parentKey?: string; label: string }>>([
    { level: 'school', label: 'All Schools' },
  ]);
  const [nodes, setNodes] = useState<DrillNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DrillNode | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadLevel = async (level: string, parentKey?: string) => {
    setLoading(true);
    try {
      const data = await api.drilldown(level, parentKey);
      if (mountedRef.current) setNodes(data);
    } catch {
      if (mountedRef.current) setNodes([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadLevel('school');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; api is stable via useMemo
  }, []);

  const drillInto = async (node: DrillNode) => {
    const currentIdx = LEVELS.indexOf(stack[stack.length - 1].level as (typeof LEVELS)[number]);
    const nextLevel = LEVELS[currentIdx + 1];
    if (!nextLevel) {
      setSelected(node);
      return;
    }
    setStack((s) => [...s, { level: nextLevel, parentKey: node.node_key, label: node.label }]);
    await loadLevel(nextLevel, node.node_key);
    setSelected(node);
  };

  const reset = async () => {
    setStack([{ level: 'school', label: 'All Schools' }]);
    setSelected(null);
    await loadLevel('school');
  };

  const flagToHod = async () => {
    if (!selected) return;
    try {
      const res = await api.flagToHod({
        node_key: selected.node_key,
        label: selected.label,
        message: `The Chairman has requested an audit on ${selected.label} Attendance (${selected.attendance_pct}%).`,
      });
      toast.success(`Flagged to ${res.notified_hod}`);
    } catch {
      toast.error('Could not notify HOD');
    }
  };

  const atFacultyLevel = stack[stack.length - 1]?.level === 'faculty';

  return (
    <LeadershipSectionCard
      title="Attendance Drill-Down"
      description="Click a flagged bar to investigate — closed-loop to HOD"
      action={
        <Button variant="outline" size="sm" onClick={() => void reset()}>
          Reset
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1 text-xs text-muted-foreground">
        {stack.map((crumb, i) => (
          <span key={`${crumb.level}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-3 w-3 text-sgvu-gold" /> : null}
            <span className={i === stack.length - 1 ? 'font-semibold text-sgvu-navy' : ''}>{crumb.label}</span>
          </span>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading drill-down…</p>
      ) : (
        <div className="space-y-2">
          {nodes.map((node) => (
            <button
              key={node.node_key}
              type="button"
              onClick={() => void drillInto(node)}
              className="flex w-full items-center gap-3 rounded-xl border border-sgvu-navy/10 bg-sgvu-surface/50 px-3 py-2.5 text-left transition hover:border-sgvu-gold/50 hover:shadow-sm"
            >
              <div className="h-8 flex-1 overflow-hidden rounded-lg bg-white">
                <div
                  className={`h-full ${node.alert ? 'bg-red-500' : 'bg-sgvu-navy'}`}
                  style={{ width: `${Math.max(node.attendance_pct, 4)}%` }}
                />
              </div>
              <span className="w-32 truncate text-sm font-medium text-sgvu-navy">{node.label}</span>
              <span className={`font-mono text-sm tabular-nums ${node.alert ? 'text-red-600' : 'text-sgvu-navy'}`}>
                {node.attendance_pct}%
              </span>
            </button>
          ))}
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drill-down data available.</p>
          ) : null}
        </div>
      )}

      {selected && atFacultyLevel ? (
        <div className="mt-4 rounded-xl border border-sgvu-gold/40 bg-sgvu-gold/10 p-4">
          <p className="text-sm text-sgvu-navy">
            <span className="font-semibold">{selected.label}</span>:{' '}
            {Number((selected.meta as { cancelled_classes_this_week?: number })?.cancelled_classes_this_week ?? 0)} classes
            cancelled this week
          </p>
          <Button size="sm" className="mt-3 gap-2 bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90" onClick={() => void flagToHod()}>
            <Flag className="h-4 w-4" />
            Flag to HOD
          </Button>
        </div>
      ) : null}
    </LeadershipSectionCard>
  );
}
