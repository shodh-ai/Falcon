'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Download, GripVertical, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getSubdomainFromClient } from '@/lib/tenant';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  PLACEMENT_KANBAN_COLUMNS,
  PLACEMENT_STAGE_LABELS,
  type KanbanApplicant,
  type KanbanPipeline,
  type PlacementPipelineStage,
} from '@/lib/placement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const COLUMN_THEME: Record<PlacementPipelineStage, { header: string; dot: string; drag: string }> = {
  APPLIED: { header: 'bg-slate-100 text-slate-800', dot: 'bg-slate-400', drag: 'border-slate-200 bg-slate-50/50' },
  APTITUDE_CLEARED: { header: 'bg-sky-100 text-sky-900', dot: 'bg-sky-500', drag: 'border-sky-200 bg-sky-50/50' },
  TECH_INTERVIEW: { header: 'bg-violet-100 text-violet-900', dot: 'bg-violet-500', drag: 'border-violet-200 bg-violet-50/50' },
  HR_INTERVIEW: { header: 'bg-amber-100 text-amber-900', dot: 'bg-amber-500', drag: 'border-amber-200 bg-amber-50/50' },
  OFFERED: { header: 'bg-emerald-100 text-emerald-900', dot: 'bg-emerald-500', drag: 'border-emerald-200 bg-emerald-50/50' },
  REJECTED: { header: 'bg-red-100 text-red-900', dot: 'bg-red-500', drag: 'border-red-200 bg-red-50/50' },
};

type Props = {
  driveId: string;
  companyName: string;
  jobRole: string;
  fetchPipeline: () => Promise<KanbanPipeline>;
  updateStage: (applicationId: string, stage: PlacementPipelineStage) => Promise<void>;
};

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function PlacementKanbanBoard({ driveId, companyName, jobRole, fetchPipeline, updateStage }: Props) {
  const { token } = useAuth();
  const [pipeline, setPipeline] = useState<KanbanPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPipeline(await fetchPipeline());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [fetchPipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDragEnd(result: DropResult) {
    if (!result.destination || !pipeline) return;
    const sourceStage = result.source.droppableId as PlacementPipelineStage;
    const destStage = result.destination.droppableId as PlacementPipelineStage;
    if (sourceStage === destStage) return;

    const appId = result.draggableId;
    const sourceItems = [...(pipeline.columns[sourceStage] ?? [])];
    const destItems = [...(pipeline.columns[destStage] ?? [])];
    const moved = sourceItems.find((a) => a.application_id === appId);
    if (!moved) return;

    const prev = pipeline;
    setPipeline({
      ...pipeline,
      columns: {
        ...pipeline.columns,
        [sourceStage]: sourceItems.filter((a) => a.application_id !== appId),
        [destStage]: [...destItems, { ...moved, pipeline_stage: destStage }],
      },
    });
    setMoving(true);
    try {
      await updateStage(appId, destStage);
      toast.success(`Moved to ${PLACEMENT_STAGE_LABELS[destStage]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Stage update failed');
      setPipeline(prev);
    } finally {
      setMoving(false);
    }
  }

  async function exportExcel(stage: PlacementPipelineStage) {
    if (!token) return;
    const res = await fetch(`${API_URL}/api/placement/drives/${driveId}/export?stage=${stage}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${companyName}-${stage}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalApplicants = pipeline
    ? PLACEMENT_KANBAN_COLUMNS.reduce((sum, stage) => sum + (pipeline.columns[stage]?.length ?? 0), 0)
    : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="h-9 w-9 animate-spin text-sgvu-navy" />
        <p className="text-sm text-muted-foreground">Loading ATS pipeline…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ATS Pipeline</p>
          <h2 className="text-xl font-black text-sgvu-navy">{companyName}</h2>
          <p className="text-sm text-muted-foreground">{jobRole} · {totalApplicants} applicant{totalApplicants === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={moving} onClick={() => void load()}>
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90"
            disabled={moving}
            onClick={() => void exportExcel('APPLIED').catch((e) => toast.error(e.message))}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Applied
          </Button>
        </div>
      </div>

      <DragDropContext onDragEnd={(r) => void onDragEnd(r)}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {PLACEMENT_KANBAN_COLUMNS.map((stage) => {
            const items = (pipeline?.columns[stage] ?? []) as KanbanApplicant[];
            const theme = COLUMN_THEME[stage];

            return (
              <Droppable key={stage} droppableId={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex w-[272px] shrink-0 flex-col rounded-2xl border p-3 transition',
                      snapshot.isDraggingOver ? theme.drag : 'border-border/60 bg-muted/10',
                    )}
                  >
                    <div className={cn('mb-3 flex items-center justify-between rounded-xl px-3 py-2', theme.header)}>
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', theme.dot)} />
                        <span className="text-xs font-bold uppercase tracking-wide">
                          {PLACEMENT_STAGE_LABELS[stage]}
                        </span>
                      </div>
                      <Badge variant="secondary" className="bg-white/80">
                        {items.length}
                      </Badge>
                    </div>

                    <div className="min-h-[120px] flex-1 space-y-2">
                      {items.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop students here</p>
                      ) : null}
                      {items.map((app, index) => (
                        <Draggable key={app.application_id} draggableId={app.application_id} index={index}>
                          {(dragProvided, dragSnapshot) => {
                            const { style, ...draggableProps } = dragProvided.draggableProps;
                            return (
                            <div
                              ref={dragProvided.innerRef}
                              {...draggableProps}
                              style={style as CSSProperties}
                              className={cn(
                                'rounded-xl border bg-white p-3 shadow-sm transition',
                                dragSnapshot.isDragging ? 'border-sgvu-gold shadow-lg ring-2 ring-sgvu-gold/20' : 'border-border/60',
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <div {...dragProvided.dragHandleProps} className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing">
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                <Avatar className="h-9 w-9 shrink-0">
                                  <AvatarFallback className="bg-sgvu-navy text-xs font-bold text-sgvu-gold">
                                    {initials(app.student_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold text-sgvu-navy">{app.student_name}</p>
                                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                    <Mail className="h-3 w-3 shrink-0" />
                                    {app.student_email}
                                  </p>
                                  <p className="mt-1.5 text-xs">
                                    CGPA <span className="font-semibold text-sgvu-navy">{app.cgpa_at_apply ?? '—'}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                            );
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
