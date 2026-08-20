'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileSpreadsheet,
  Filter,
  Loader2,
  Search,
} from 'lucide-react';
import {
  leadMeta,
  STAGE_LABELS,
  type CrmLead,
} from '@/components/admissions-crm/admissions-crm-dashboard-data';
import {
  ADMISSIONS_CRM_DASHBOARD_HREF,
  BRAND_BTN,
} from '@/components/admissions-crm/admissions-crm-constants';
import { AddLeadDialog } from '@/components/admissions-crm/AddLeadDialog';
import { useAdmissionsKanban } from '@/components/admissions-crm/useAdmissionsKanban';
import { KanbanBoard } from '@/components/workspaces/KanbanBoard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePathname } from 'next/navigation';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { cn } from '@/lib/utils';

type TimelineEntry = {
  channel: string;
  subject?: string | null;
  body?: string | null;
  created_at: string;
};

const STAGE_OPTIONS = [
  'RAW_LEAD',
  'CONTACTED',
  'APPLICATION_STARTED',
  'DOCUMENT_VERIFICATION',
  'FEE_PAID',
  'ENROLLED',
] as const;

const PRIORITY_OPTIONS = ['all', 'high', 'medium', 'low'] as const;

function matchesSearch(lead: CrmLead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const program = leadMeta(lead, 'program', leadMeta(lead, 'preferred_program', ''));
  const counsellor = leadMeta(lead, 'counsellor', '');
  const haystack = [lead.full_name, lead.email ?? '', lead.phone ?? '', program, counsellor]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function AdmissionsCrmPipelineWorkspace() {
  const pathname = usePathname();
  const isCampusAdminWorkspace = pathname?.startsWith('/campus-admin') ?? false;
  const dashboardHref = isCampusAdminWorkspace
    ? campusAdminRoutes.dashboard
    : ADMISSIONS_CRM_DASHBOARD_HREF;
  const api = useAuthedApi();
  const { allLeads, columns, leadsById, loading, creatingLead, load, onMove, addLead, useDemo } =
    useAdmissionsKanban();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<(typeof PRIORITY_OPTIONS)[number]>('all');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [counsellorDraft, setCounsellorDraft] = useState('');
  const [stageDraft, setStageDraft] = useState('RAW_LEAD');
  const [saving, setSaving] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  const selectedLead = selectedLeadId ? leadsById.get(selectedLeadId) : undefined;

  const filteredColumns = useMemo(() => {
    return columns
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
      }));
  }, [columns, leadsById, priorityFilter, searchQuery, stageFilter]);

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

  useEffect(() => {
    if (!selectedLead) return;
    setCounsellorDraft(leadMeta(selectedLead, 'counsellor', ''));
    setStageDraft(selectedLead.stage);
    void loadTimeline(selectedLead.lead_id);
  }, [loadTimeline, selectedLead]);

  function openLead(leadId: string) {
    setSelectedLeadId(leadId);
    setNoteDraft('');
  }

  async function saveStage() {
    if (!selectedLeadId || !stageDraft) return;
    setSaving(true);
    try {
      await api.patch(`/api/admissions-crm/leads/${selectedLeadId}/stage`, { stage: stageDraft });
      toast.success('Stage updated');
      load();
      await loadTimeline(selectedLeadId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update stage');
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
      setCounsellorDraft('');
      load();
      await loadTimeline(selectedLeadId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign counsellor');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-6 md:px-8" data-testid="admissions-crm-pipeline">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.14),transparent_55%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <Link
                href={dashboardHref}
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-sgvu-gold hover:text-sgvu-navy"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Back to dashboard
              </Link>
              <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">Lead Pipeline</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Manage leads across stages with search, filters, counsellor assignment, notes, and activity
                history.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                className={cn('inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold', BRAND_BTN)}
                disabled={creatingLead || loading}
                onClick={() => setAddLeadOpen(true)}
              >
                {creatingLead ? 'Adding…' : 'Add Lead'}
              </button>
              {isCampusAdminWorkspace ? null : (
              <Link
                href="/admin/students/bulk-upload"
                className={cn('inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold', BRAND_BTN)}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Import Excel
              </Link>
              )}
              <Button type="button" size="sm" className={cn('h-10', BRAND_BTN)} onClick={load} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {useDemo ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-900">
          No live leads yet — add a lead or import data to populate the pipeline board.
        </p>
      ) : null}

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:flex-wrap md:items-end">
          <label className="min-w-[220px] flex-1 space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Name, email, phone, program…"
                className="pl-9"
              />
            </div>
          </label>
          <label className="min-w-[160px] space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Stage</span>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All stages</option>
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage] ?? stage}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[160px] space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Priority</span>
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as (typeof PRIORITY_OPTIONS)[number])
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All priorities' : option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" aria-hidden />
            {allLeads.length.toLocaleString('en-IN')} leads
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading pipeline…
        </p>
      ) : allLeads.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-sgvu-navy/20 bg-slate-50/70 px-6 py-12 text-center">
          <p className="text-lg font-semibold text-sgvu-navy">No Leads Available</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Start by adding a new admission lead or importing an Excel file.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className={cn('inline-flex h-10 items-center rounded-lg px-5 text-sm font-bold', BRAND_BTN)}
              disabled={creatingLead || loading}
              onClick={() => setAddLeadOpen(true)}
            >
              {creatingLead ? 'Adding…' : 'Add Lead'}
            </button>
            <Link
              href="/admin/students/bulk-upload"
              className={cn('inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-bold', BRAND_BTN)}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Import Excel
            </Link>
          </div>
        </div>
      ) : (
        <KanbanBoard
          columns={filteredColumns}
          onMove={onMove}
          onCardClick={openLead}
          layout="scroll"
        />
      )}

      <Sheet open={Boolean(selectedLead)} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-white text-sgvu-navy sm:max-w-lg">
          {selectedLead ? (
            <>
              <SheetHeader className="border-b border-sgvu-navy/10 pb-4 text-left">
                <SheetTitle className="text-xl font-bold text-sgvu-navy">{selectedLead.full_name}</SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  {selectedLead.email ?? selectedLead.phone ?? 'No contact on file'}
                </SheetDescription>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-sgvu-navy/15">
                    {STAGE_LABELS[selectedLead.stage] ?? selectedLead.stage}
                  </Badge>
                  <Badge variant="outline" className="border-sgvu-navy/15">
                    Score {selectedLead.lead_score}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Change stage</h3>
                  <div className="flex gap-2">
                    <select
                      value={stageDraft}
                      onChange={(event) => setStageDraft(event.target.value)}
                      className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {STAGE_OPTIONS.map((stage) => (
                        <option key={stage} value={stage}>
                          {STAGE_LABELS[stage] ?? stage}
                        </option>
                      ))}
                    </select>
                    <Button type="button" className={BRAND_BTN} disabled={saving} onClick={() => void saveStage()}>
                      Update
                    </Button>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Assign counsellor</h3>
                  <div className="flex gap-2">
                    <Input
                      value={counsellorDraft}
                      onChange={(event) => setCounsellorDraft(event.target.value)}
                      placeholder="Counsellor name"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving || !counsellorDraft.trim()}
                      onClick={() => void assignCounsellor()}
                    >
                      Assign
                    </Button>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Notes</h3>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    rows={3}
                    placeholder="Add an internal note for this lead…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    className={cn('h-9', BRAND_BTN)}
                    disabled={saving || !noteDraft.trim()}
                    onClick={() => void addNote()}
                  >
                    Save note
                  </Button>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">
                    Timeline & activity history
                  </h3>
                  {timelineLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Loading activity…
                    </p>
                  ) : timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {timeline.map((entry, index) => (
                        <li
                          key={`${entry.created_at}-${index}`}
                          className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2.5"
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
                            {entry.channel}
                          </p>
                          <p className="mt-1 text-sm text-sgvu-navy">
                            {entry.subject ?? entry.body ?? 'Activity logged'}
                          </p>
                          {entry.subject && entry.body ? (
                            <p className="mt-1 text-sm text-muted-foreground">{entry.body}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString('en-IN')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AddLeadDialog
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        submitting={creatingLead}
        onSubmit={async (values) => {
          const created = await addLead('Lead Pipeline', values);
          if (created) setAddLeadOpen(false);
        }}
      />
    </div>
  );
}
