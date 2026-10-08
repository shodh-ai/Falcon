'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { LayoutGrid, List, Loader2, Search } from 'lucide-react';
import { AddLeadDialog } from '@/components/admissions-crm/AddLeadDialog';
import {
  FUNNEL_STAGE_KEYS,
  leadMeta,
  leadPriority,
  STAGE_LABELS,
  type CrmLead,
} from '@/components/admissions-crm/admissions-crm-dashboard-data';
import { useAdmissionsKanban } from '@/components/admissions-crm/useAdmissionsKanban';
import { KanbanBoard } from '@/components/workspaces/KanbanBoard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type TimelineEntry = {
  channel: string;
  subject?: string | null;
  body?: string | null;
  created_at: string;
};

const PRIORITY_OPTIONS = ['all', 'high', 'medium', 'low'] as const;

function matchesSearch(lead: CrmLead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const program = leadMeta(lead, 'program', leadMeta(lead, 'preferred_program', ''));
  const counsellor = leadMeta(lead, 'counsellor', '');
  return [lead.full_name, lead.email ?? '', lead.phone ?? '', program, counsellor]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function CampusAdminKanbanPage() {
  const api = useAuthedApi();
  const { allLeads, columns, leadsById, loading, error, creatingLead, load, onMove, addLead } =
    useAdmissionsKanban();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<(typeof PRIORITY_OPTIONS)[number]>('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [counsellorDraft, setCounsellorDraft] = useState('');
  const [stageDraft, setStageDraft] = useState('RAW_LEAD');
  const [saving, setSaving] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  const selectedLead = selectedLeadId ? leadsById.get(selectedLeadId) : undefined;

  const filteredColumns = useMemo(
    () =>
      columns
        .filter((column) => stageFilter === 'all' || column.id === stageFilter)
        .map((column) => ({
          ...column,
          cards: column.cards.filter((card) => {
            const lead = leadsById.get(card.id);
            if (!lead) return false;
            if (!matchesSearch(lead, searchQuery)) return false;
            if (priorityFilter !== 'all' && card.priority !== priorityFilter) return false;
            return true;
          }),
        })),
    [columns, leadsById, priorityFilter, searchQuery, stageFilter],
  );

  const filteredLeads = useMemo(
    () =>
      allLeads.filter((lead) => {
        if (stageFilter !== 'all' && lead.stage !== stageFilter) return false;
        if (!matchesSearch(lead, searchQuery)) return false;
        if (priorityFilter !== 'all' && leadPriority(lead) !== priorityFilter) return false;
        return true;
      }),
    [allLeads, priorityFilter, searchQuery, stageFilter],
  );

  const loadTimeline = useCallback(
    async (leadId: string) => {
      setTimelineLoading(true);
      try {
        const entries = await api.get<TimelineEntry[]>(`/api/admissions-crm/leads/${leadId}/timeline`);
        setTimeline(Array.isArray(entries) ? entries : []);
      } catch {
        setTimeline([]);
      } finally {
        setTimelineLoading(false);
      }
    },
    [api],
  );

  const openLead = useCallback(
    (leadId: string) => {
      const lead = leadsById.get(leadId);
      setSelectedLeadId(leadId);
      setNoteDraft('');
      setCounsellorDraft(lead ? leadMeta(lead, 'counsellor', '') : '');
      setStageDraft(lead?.stage ?? 'RAW_LEAD');
      void loadTimeline(leadId);
    },
    [leadsById, loadTimeline],
  );

  async function saveStage() {
    if (!selectedLeadId || !stageDraft) return;
    setSaving(true);
    try {
      await api.patch(`/api/admissions-crm/leads/${selectedLeadId}/stage`, { stage: stageDraft });
      toast.success('Stage updated');
      load();
      await loadTimeline(selectedLeadId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update stage');
    } finally {
      setSaving(false);
    }
  }

  async function assignCounsellor() {
    if (!selectedLeadId || !counsellorDraft.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/admissions-crm/leads/${selectedLeadId}/activities`, {
        channel: 'SYSTEM',
        subject: 'Counsellor assigned',
        body: counsellorDraft.trim(),
        metadata: { counsellor: counsellorDraft.trim() },
      });
      toast.success('Counsellor assigned');
      load();
      await loadTimeline(selectedLeadId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not assign counsellor');
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!selectedLeadId || !noteDraft.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/admissions-crm/leads/${selectedLeadId}/activities`, {
        channel: 'NOTE',
        body: noteDraft.trim(),
      });
      toast.success('Note added');
      setNoteDraft('');
      await loadTimeline(selectedLeadId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Kanban Board</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Campus lead pipeline. Move stages, assign a counsellor, and keep notes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-9">
              <Link href={campusAdminRoutes.admissionsApplications}>Applications</Link>
            </Button>
            <Button className="h-9" disabled={creatingLead || loading} onClick={() => setAddLeadOpen(true)}>
              {creatingLead ? 'Adding…' : 'Add Lead'}
            </Button>
            <Button variant="outline" className="h-9" disabled={loading} onClick={load}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          {error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={load}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, phone, or program..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                <Select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-48"
                >
                  <option value="all">All stages</option>
                  {FUNNEL_STAGE_KEYS.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as (typeof PRIORITY_OPTIONS)[number])
                  }
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-40"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 'all' ? 'All priorities' : option[0].toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </Select>
                <div className="flex rounded-xl border border-sgvu-navy/15 p-1">
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${view === 'board' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setView('board')}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Board
                  </button>
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${view === 'list' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setView('list')}
                  >
                    <List className="h-3.5 w-3.5" />
                    List
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading pipeline…
                </p>
              ) : view === 'board' ? (
                <KanbanBoard
                  columns={filteredColumns}
                  onMove={onMove}
                  onCardClick={openLead}
                  layout="scroll"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="p-3 font-medium">Lead</th>
                        <th className="p-3 font-medium">Program</th>
                        <th className="p-3 font-medium">Stage</th>
                        <th className="p-3 font-medium">Priority</th>
                        <th className="p-3 font-medium">Counsellor</th>
                        <th className="p-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            No leads on this campus yet. Add a lead to start the pipeline.
                          </td>
                        </tr>
                      ) : (
                        filteredLeads.map((lead) => (
                          <tr key={lead.lead_id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="p-3">
                              <p className="font-semibold text-sgvu-navy">{lead.full_name}</p>
                              <p className="text-xs text-muted-foreground">{lead.email || lead.phone || '—'}</p>
                            </td>
                            <td className="p-3">
                              {leadMeta(lead, 'program', leadMeta(lead, 'preferred_program', '—'))}
                            </td>
                            <td className="p-3">
                              <Badge variant="secondary">{STAGE_LABELS[lead.stage] ?? lead.stage}</Badge>
                            </td>
                            <td className="p-3 capitalize">{leadPriority(lead)}</td>
                            <td className="p-3">{leadMeta(lead, 'counsellor', 'Unassigned')}</td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                className="text-sm font-semibold text-sgvu-navy hover:underline"
                                onClick={() => openLead(lead.lead_id)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedLead)} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <SheetContent side="right" className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy">
          {selectedLead ? (
            <LeadDetailPanel
              lead={selectedLead}
              timeline={timeline}
              timelineLoading={timelineLoading}
              stageDraft={stageDraft}
              counsellorDraft={counsellorDraft}
              noteDraft={noteDraft}
              saving={saving}
              onStageDraft={setStageDraft}
              onCounsellorDraft={setCounsellorDraft}
              onNoteDraft={setNoteDraft}
              onSaveStage={() => void saveStage()}
              onAssignCounsellor={() => void assignCounsellor()}
              onAddNote={() => void addNote()}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <AddLeadDialog
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        submitting={creatingLead}
        onSubmit={async (values) => {
          const created = await addLead('Campus Admin', values);
          if (created) setAddLeadOpen(false);
        }}
      />
    </div>
  );
}

function LeadDetailPanel({
  lead,
  timeline,
  timelineLoading,
  stageDraft,
  counsellorDraft,
  noteDraft,
  saving,
  onStageDraft,
  onCounsellorDraft,
  onNoteDraft,
  onSaveStage,
  onAssignCounsellor,
  onAddNote,
}: {
  lead: CrmLead;
  timeline: TimelineEntry[];
  timelineLoading: boolean;
  stageDraft: string;
  counsellorDraft: string;
  noteDraft: string;
  saving: boolean;
  onStageDraft: (value: string) => void;
  onCounsellorDraft: (value: string) => void;
  onNoteDraft: (value: string) => void;
  onSaveStage: () => void;
  onAssignCounsellor: () => void;
  onAddNote: () => void;
}) {
  const initials = lead.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sgvu-navy text-sm font-semibold text-white">
            {initials || 'LD'}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Lead</p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {lead.full_name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {leadMeta(lead, 'program', leadMeta(lead, 'preferred_program', 'Lead details'))}
            </SheetDescription>
            <Badge className="mt-2" variant="secondary">
              {STAGE_LABELS[lead.stage] ?? lead.stage}
            </Badge>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        <Section title="Contact">
          <Field label="Name" value={lead.full_name} />
          <Field label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
          <Field label="Phone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : undefined} />
          <Field label="City" value={leadMeta(lead, 'city', '')} />
        </Section>

        <Section title="Pipeline">
          <Field label="Stage" value={STAGE_LABELS[lead.stage] ?? lead.stage} />
          <Field label="Priority" value={leadPriority(lead)} />
          <Field label="Score" value={lead.lead_score} />
          <Field label="Counsellor" value={leadMeta(lead, 'counsellor', 'Unassigned')} />
          <Field label="Program" value={leadMeta(lead, 'program', leadMeta(lead, 'preferred_program', ''))} />
          <Field label="Source" value={leadMeta(lead, 'source', '')} />
        </Section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Change stage</h3>
          <div className="flex gap-2">
            <Select
              value={stageDraft}
              onChange={(e) => onStageDraft(e.target.value)}
              className="h-10 flex-1 rounded-xl border-sgvu-navy/15"
            >
              {FUNNEL_STAGE_KEYS.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </Select>
            <Button className="h-10" disabled={saving} onClick={onSaveStage}>
              Update
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Assign counsellor</h3>
          <div className="flex gap-2">
            <Input
              value={counsellorDraft}
              onChange={(e) => onCounsellorDraft(e.target.value)}
              placeholder="Counsellor name"
              className="h-10 rounded-xl border-sgvu-navy/15"
            />
            <Button
              variant="outline"
              className="h-10"
              disabled={saving || !counsellorDraft.trim()}
              onClick={onAssignCounsellor}
            >
              Assign
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Notes</h3>
          <textarea
            value={noteDraft}
            onChange={(e) => onNoteDraft(e.target.value)}
            rows={3}
            placeholder="Add an internal note…"
            className="w-full rounded-xl border border-sgvu-navy/15 bg-background px-3 py-2 text-sm"
          />
          <Button className="h-9" disabled={saving || !noteDraft.trim()} onClick={onAddNote}>
            Save note
          </Button>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Activity</h3>
          {timelineLoading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading activity…
            </p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {timeline.map((entry, index) => (
                <div
                  key={`${entry.created_at}-${index}`}
                  className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2 text-sm"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {entry.channel}
                  </p>
                  <p className="mt-1 font-medium text-sgvu-navy">
                    {entry.subject ?? entry.body ?? 'Activity logged'}
                  </p>
                  {entry.subject && entry.body ? (
                    <p className="mt-0.5 text-muted-foreground">{entry.body}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString('en-IN')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">{title}</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | number | null;
  href?: string;
}) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">
        {href && display !== '—' ? (
          <a href={href} className="text-sgvu-navy underline-offset-2 hover:underline">
            {display}
          </a>
        ) : (
          display
        )}
      </dd>
    </div>
  );
}
