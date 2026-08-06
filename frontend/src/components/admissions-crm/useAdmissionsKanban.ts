'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatRelative,
  leadMeta,
  leadPriority,
  STAGE_LABELS,
  type CrmLead,
} from '@/components/admissions-crm/admissions-crm-dashboard-data';
import type { KanbanColumn } from '@/components/workspaces/KanbanBoard';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

export type KanbanPayload = { stage: string; leads: CrmLead[] }[];

export function useAdmissionsKanban() {
  const api = useAuthedApi();
  const [kanbanRaw, setKanbanRaw] = useState<KanbanPayload>([]);
  const [loading, setLoading] = useState(true);
  const [creatingLead, setCreatingLead] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void api
      .get<KanbanPayload>('/api/admissions-crm/kanban')
      .then(setKanbanRaw)
      .catch(() => setKanbanRaw([]))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const allLeads = useMemo(() => kanbanRaw.flatMap((column) => column.leads), [kanbanRaw]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const column of kanbanRaw) counts[column.stage] = column.leads.length;
    return counts;
  }, [kanbanRaw]);

  const useDemo = allLeads.length === 0;

  const columns: KanbanColumn[] = useMemo(
    () =>
      kanbanRaw.map((column) => ({
        id: column.stage,
        title: STAGE_LABELS[column.stage] ?? column.stage,
        cards: column.leads.map((lead) => ({
          id: lead.lead_id,
          title: lead.full_name,
          subtitle: lead.email ?? lead.phone ?? undefined,
          program: leadMeta(lead, 'program', leadMeta(lead, 'preferred_program', 'General Programme')),
          city: leadMeta(lead, 'city', '—'),
          counsellor: leadMeta(lead, 'counsellor', 'Unassigned'),
          lastUpdated: formatRelative(lead.updated_at ?? lead.created_at),
          priority: leadPriority(lead),
          meta: `Score: ${lead.lead_score}`,
        })),
        emptyMessage: 'No leads in this stage',
      })),
    [kanbanRaw],
  );

  const leadsById = useMemo(() => {
    const map = new Map<string, CrmLead>();
    for (const lead of allLeads) map.set(lead.lead_id, lead);
    return map;
  }, [allLeads]);

  async function onMove(cardId: string, nextStage: string) {
    try {
      await api.patch(`/api/admissions-crm/leads/${cardId}/stage`, { stage: nextStage });
      toast.success('Lead moved');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Move failed');
    }
  }

  async function addLead(
    source = 'CRM',
    input?: {
      full_name: string;
      email?: string;
      phone?: string;
      program?: string;
      city?: string;
    },
  ): Promise<CrmLead | null> {
    if (creatingLead) return null;
    const fullName = (input?.full_name ?? '').trim();
    if (!fullName) {
      toast.warning('Candidate name is required');
      return null;
    }
    const email = (input?.email ?? '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.warning('Enter a valid email address');
      return null;
    }
    setCreatingLead(true);
    try {
      const created = await api.post<CrmLead>('/api/admissions-crm/leads', {
        full_name: fullName,
        email: email || undefined,
        phone: input?.phone?.trim() || undefined,
        stage: 'RAW_LEAD',
        source,
        metadata: {
          program: input?.program?.trim() || 'General Programme',
          city: input?.city?.trim() || '—',
          counsellor: 'Unassigned',
        },
      });
      toast.success('Lead created in Raw Lead stage');
      load();
      return created;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create lead');
      return null;
    } finally {
      setCreatingLead(false);
    }
  }

  return {
    kanbanRaw,
    allLeads,
    stageCounts,
    useDemo,
    columns,
    leadsById,
    loading,
    creatingLead,
    load,
    onMove,
    addLead,
  };
}
