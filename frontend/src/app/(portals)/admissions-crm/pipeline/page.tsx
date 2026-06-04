'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KanbanBoard, type KanbanColumn } from '@/components/workspaces/KanbanBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Lead = {
  lead_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  lead_score: number;
  stage: string;
};

type KanbanPayload = { stage: string; leads: Lead[] }[];

const STAGE_LABELS: Record<string, string> = {
  RAW_LEAD: 'Raw Lead',
  CONTACTED: 'Contacted',
  APPLICATION_STARTED: 'Application Started',
  FEE_PAID: 'Fee Paid',
  ENROLLED: 'Enrolled',
};

export default function AdmissionsCrmPipelinePage() {
  const api = useAuthedApi();
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<{ channel: string; subject: string; body: string; created_at: string }[]>([]);

  const load = () => {
    void api.get<KanbanPayload>('/api/admissions-crm/kanban').then((data) => {
      setColumns(
        data.map((col) => ({
          id: col.stage,
          title: STAGE_LABELS[col.stage] ?? col.stage,
          cards: col.leads.map((l) => ({
            id: l.lead_id,
            title: l.full_name,
            subtitle: l.email ?? l.phone ?? '—',
            meta: `Score: ${l.lead_score}`,
          })),
        })),
      );
    });
  };

  useEffect(() => {
    load();
  }, [api]);

  async function onMove(cardId: string, nextStage: string) {
    try {
      await api.patch(`/api/admissions-crm/leads/${cardId}/stage`, { stage: nextStage });
      toast.success('Lead moved');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Move failed');
    }
  }

  async function openLead(leadId: string) {
    const all = columns.flatMap((c) => c.cards);
    const card = all.find((c) => c.id === leadId);
    if (!card) return;
    setSelectedLead({
      lead_id: leadId,
      full_name: card.title,
      email: card.subtitle?.includes('@') ? card.subtitle : null,
      phone: null,
      lead_score: Number(card.meta?.replace('Score: ', '') ?? 0),
      stage: '',
    });
    const tl = await api.get<typeof timeline>(`/api/admissions-crm/leads/${leadId}/timeline`);
    setTimeline(tl);
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Lead Pipeline</h1>
      <KanbanBoard columns={columns} onMove={onMove} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omnichannel inbox (select a card ID)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {columns.flatMap((c) =>
            c.cards.map((card) => (
              <button
                key={card.id}
                type="button"
                className="block w-full rounded border px-3 py-2 text-left hover:bg-muted"
                onClick={() => void openLead(card.id)}
              >
                {card.title} — view timeline
              </button>
            )),
          )}
          {selectedLead && (
            <div className="mt-4 space-y-2 border-t pt-4">
              <p className="font-semibold">{selectedLead.full_name}</p>
              {timeline.map((t, i) => (
                <div key={i} className="rounded bg-muted p-2">
                  [{t.channel}] {t.subject ?? t.body} · {new Date(t.created_at).toLocaleString()}
                </div>
              ))}
              {!timeline.length && <p className="text-muted-foreground">No communications logged yet.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
