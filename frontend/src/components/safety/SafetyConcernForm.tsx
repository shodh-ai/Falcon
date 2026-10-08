'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  CircleMinus,
  Lock,
  MapPin,
  Paperclip,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { useAuthedApi } from '@/lib/api';
import {
  ACCUSED_TYPES,
  CONCERN_TYPES,
  accusedTypeLabel,
  concernStatusLabel,
  concernTypeLabel,
  formatConcernLoggedAt,
  proofDocHref,
  type SafetyConcern,
  type SafetyConcernStatus,
} from '@/lib/student-safety';
import { cn } from '@/lib/utils';

const PROOF_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx';

type AccusedOption = {
  user_id: string;
  name: string;
  official_email: string | null;
  dept_name?: string | null;
  roll_number?: string | null;
};

function formatPersonOption(u: AccusedOption): string {
  const parts = [u.name];
  if (u.roll_number) parts.push(u.roll_number);
  else if (u.dept_name) parts.push(u.dept_name);
  return parts.join(' · ');
}

function nameHintFromQuery(query: string): string {
  return query.split('·')[0]?.trim() ?? query.trim();
}

function findAccusedMatch(query: string, options: AccusedOption[]): AccusedOption | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const hint = nameHintFromQuery(query).toLowerCase();
  return options.find(
    (u) =>
      u.user_id.toLowerCase() === q ||
      u.name.toLowerCase() === q ||
      u.name.toLowerCase() === hint ||
      hint.startsWith(u.name.toLowerCase()) ||
      u.official_email?.toLowerCase() === q ||
      u.roll_number?.toLowerCase() === q,
  );
}

function filterAccusedOptions(query: string, options: AccusedOption[]): AccusedOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, 10);
  return options
    .filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.official_email?.toLowerCase().includes(q) ||
        u.roll_number?.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q) ||
        u.dept_name?.toLowerCase().includes(q),
    )
    .slice(0, 10);
}

function statusTone(status: SafetyConcernStatus) {
  switch (status) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'border-transparent bg-emerald-100 text-emerald-800';
    case 'UNDER_REVIEW':
    case 'ESCALATED':
      return 'border-transparent bg-amber-100 text-amber-900';
    default:
      return 'border-transparent bg-sgvu-navy/10 text-sgvu-navy';
  }
}

function statusAccent(status: SafetyConcernStatus) {
  switch (status) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'bg-emerald-500';
    case 'UNDER_REVIEW':
    case 'ESCALATED':
      return 'bg-amber-500';
    default:
      return 'bg-sgvu-navy';
  }
}

function concernTypeIcon(type: string) {
  return type === 'SEXUAL_HARASSMENT' ? AlertTriangle : ShieldAlert;
}

const emptyForm = {
  concern_type: 'RAGGING',
  accused_type: 'STUDENT',
  accused_user_id: '',
  accused_description: '',
  incident_description: '',
  incident_location: '',
  incident_date: '',
  is_hostel_related: false,
};

export function SafetyConcernForm() {
  const api = useAuthedApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<SafetyConcern[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accusedOptions, setAccusedOptions] = useState<AccusedOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [personQuery, setPersonQuery] = useState('');
  const [personPickerOpen, setPersonPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<SafetyConcern[]>('/api/student-safety/concerns/mine');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open || form.accused_type === 'OTHER') {
      setAccusedOptions([]);
      return;
    }
    setPersonQuery('');
    setForm((prev) => ({ ...prev, accused_user_id: '', accused_description: '' }));
    void api
      .get<AccusedOption[]>(`/api/student-safety/accused-options?type=${form.accused_type}`)
      .then((data) => setAccusedOptions(Array.isArray(data) ? data : []))
      .catch(() => setAccusedOptions([]));
  }, [api, open, form.accused_type]);

  const hasOpen = rows.some((r) =>
    ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'].includes(r.status),
  );
  const activeCount = rows.filter((r) =>
    ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'].includes(r.status),
  ).length;
  const closedCount = rows.filter((r) =>
    ['RESOLVED', 'CLOSED'].includes(r.status),
  ).length;

  async function uploadProofs(): Promise<string[]> {
    const urls: string[] = [];
    for (const file of proofFiles) {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await api.post<{ url?: string; path?: string }>(
        '/api/uploads/single',
        formData,
      );
      const ref = uploaded.url ?? uploaded.path;
      if (ref) urls.push(ref);
    }
    return urls;
  }

  async function submit() {
    if (!form.incident_description.trim()) {
      toast.error('Please describe what happened');
      return;
    }

    let accusedUserId = form.accused_user_id || null;
    let accusedDescription = form.accused_description.trim();

    if (form.accused_type === 'OTHER') {
      if (!accusedDescription) {
        toast.error('Describe the person involved');
        return;
      }
    } else {
      const matched = findAccusedMatch(personQuery, accusedOptions);
      if (matched) {
        accusedUserId = matched.user_id;
      } else if (personQuery.trim()) {
        accusedUserId = null;
        accusedDescription = personQuery.trim();
      } else if (!accusedUserId) {
        toast.error('Select or type the name, roll number, or ID of the person involved');
        return;
      }
    }

    if (!accusedUserId && !accusedDescription) {
      toast.error('Select or type the person involved');
      return;
    }

    setSubmitting(true);
    try {
      const evidence_urls = proofFiles.length ? await uploadProofs() : [];
      await api.post('/api/student-safety/concerns', {
        concern_type: form.concern_type,
        accused_type: form.accused_type,
        accused_user_id: accusedUserId,
        accused_description: accusedDescription || undefined,
        incident_description: form.incident_description.trim(),
        incident_location: form.incident_location.trim() || undefined,
        incident_date: form.incident_date || undefined,
        is_hostel_related: form.is_hostel_related,
        evidence_urls,
      });
      toast.success('Your concern has been submitted confidentially');
      setOpen(false);
      setProofFiles([]);
      setPersonQuery('');
      setPersonPickerOpen(false);
      if (fileRef.current) fileRef.current.value = '';
      setForm(emptyForm);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero CTA */}
      <section className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm">
        <div className="border-b border-sgvu-navy/8 bg-gradient-to-r from-sgvu-navy/[0.04] via-white to-sgvu-gold/10 px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sgvu-navy text-white">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-sgvu-navy md:text-xl">
                  Report ragging or harassment
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Submit confidentially to the Disciplinary Committee. Proof is optional. Faculty
                  cases are handled so the accused is notified officially without learning your
                  identity.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-sgvu-navy ring-1 ring-sgvu-navy/10">
                    <Lock className="h-3 w-3 text-sgvu-gold" />
                    Identity protected
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-sgvu-navy ring-1 ring-sgvu-navy/10">
                    <FileText className="h-3 w-3 text-sgvu-gold" />
                    Proof optional
                  </span>
                </div>
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
              <Button
                type="button"
                size="lg"
                aria-pressed={open}
                className={cn(
                  'w-full min-w-0 transition-colors sm:w-auto sm:min-w-[180px]',
                  open
                    ? 'bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90 active:bg-sgvu-gold'
                    : 'bg-sgvu-navy text-white hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy',
                )}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? <X className="h-4 w-4" /> : <CircleMinus className="h-4 w-4" />}
                {open ? 'Close form' : 'Raise a concern'}
              </Button>
            </div>
          </div>
        </div>

        {!loading && rows.length > 0 ? (
          <div className="grid grid-cols-3 divide-x divide-sgvu-navy/8 border-t border-sgvu-navy/8">
            <div className="px-2 py-3 text-center sm:px-4">
              <p className="text-base font-black tabular-nums text-sgvu-navy sm:text-lg">{rows.length}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                Total
              </p>
            </div>
            <div className="px-2 py-3 text-center sm:px-4">
              <p className="text-base font-black tabular-nums text-amber-700 sm:text-lg">{activeCount}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                Active
              </p>
            </div>
            <div className="px-2 py-3 text-center sm:px-4">
              <p className="text-base font-black tabular-nums text-emerald-700 sm:text-lg">{closedCount}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                Closed
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* Form */}
      {open ? (
        <section className="rounded-2xl border border-sgvu-navy/10 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5">
            <h3 className="text-base font-bold text-sgvu-navy">Confidential report form</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Share what you can. Incomplete details are OK — investigators can follow up.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-sgvu-navy">
                  Type of concern
                </label>
                <Select
                  value={form.concern_type}
                  onValueChange={(val) => setForm({ ...form, concern_type: val })}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl">
                    <SelectValue placeholder="Select concern type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONCERN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-sgvu-navy">
                  Who are you reporting?
                </label>
                <Select
                  value={form.accused_type}
                  onValueChange={(val) => {
                    setPersonQuery('');
                    setPersonPickerOpen(false);
                    setForm({
                      ...form,
                      accused_type: val,
                      accused_user_id: '',
                      accused_description: '',
                    });
                  }}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl">
                    <SelectValue placeholder="Select who you are reporting..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCUSED_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.accused_type !== 'OTHER' ? (
              <div className="relative">
                <label className="mb-1.5 block text-xs font-semibold text-sgvu-navy">
                  Person involved
                </label>
                <Input
                  className="h-11 rounded-xl"
                  placeholder="Start typing name, roll number, email, or ID…"
                  value={personQuery}
                  onFocus={() => setPersonPickerOpen(true)}
                  onBlur={() => window.setTimeout(() => setPersonPickerOpen(false), 150)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPersonQuery(value);
                    setPersonPickerOpen(true);
                    const matched = findAccusedMatch(value, accusedOptions);
                    setForm({
                      ...form,
                      accused_user_id: matched?.user_id ?? '',
                      accused_description: matched ? '' : value,
                    });
                  }}
                />
                {personPickerOpen && filterAccusedOptions(personQuery, accusedOptions).length > 0 ? (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-sgvu-navy/10 bg-white shadow-lg">
                    {filterAccusedOptions(personQuery, accusedOptions).map((u) => (
                      <button
                        key={u.user_id}
                        type="button"
                        className="block w-full px-3 py-2.5 text-left text-sm hover:bg-sgvu-gold/10"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setPersonQuery(formatPersonOption(u));
                          setForm({
                            ...form,
                            accused_user_id: u.user_id,
                            accused_description: '',
                          });
                          setPersonPickerOpen(false);
                        }}
                      >
                        <span className="font-medium text-sgvu-navy">{u.name}</span>
                        {u.roll_number ? (
                          <span className="text-muted-foreground"> · {u.roll_number}</span>
                        ) : null}
                        {u.dept_name ? (
                          <span className="text-muted-foreground"> · {u.dept_name}</span>
                        ) : null}
                        {u.official_email ? (
                          <span className="block text-xs text-muted-foreground">
                            {u.official_email}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Select from the list, or type a name / roll number if they are not listed.
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-sgvu-navy">
                  Describe the person
                </label>
                <Input
                  className="h-11 rounded-xl"
                  placeholder="Name, year, hostel block, or other details you know"
                  value={form.accused_description}
                  onChange={(e) =>
                    setForm({ ...form, accused_description: e.target.value })
                  }
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-sgvu-navy">
                What happened?
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-sgvu-gold/45"
                rows={4}
                placeholder="Describe the incident — dates, witnesses, and context help the committee."
                value={form.incident_description}
                onChange={(e) =>
                  setForm({ ...form, incident_description: e.target.value })
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-sgvu-navy">
                  <MapPin className="h-3.5 w-3.5 text-sgvu-gold" />
                  Location
                </label>
                <Input
                  className="h-11 rounded-xl"
                  placeholder="Classroom, hostel, campus…"
                  value={form.incident_location}
                  onChange={(e) =>
                    setForm({ ...form, incident_location: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-sgvu-navy">
                  <CalendarDays className="h-3.5 w-3.5 text-sgvu-gold" />
                  Incident date
                </label>
                <Input
                  type="date"
                  className="h-11 rounded-xl"
                  value={form.incident_date}
                  onChange={(e) => setForm({ ...form, incident_date: e.target.value })}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-sgvu-navy/10 bg-slate-50/80 px-3 py-3 text-sm text-sgvu-navy">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-sgvu-navy/30"
                checked={form.is_hostel_related}
                onChange={(e) =>
                  setForm({ ...form, is_hostel_related: e.target.checked })
                }
              />
              This happened in or around the hostel
            </label>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-sgvu-navy">
                Supporting proof (optional)
              </label>
              <div className="rounded-xl border border-dashed border-sgvu-navy/20 bg-slate-50/50 px-3 py-3">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={PROOF_ACCEPT}
                  className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sgvu-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                  onChange={(e) => setProofFiles(Array.from(e.target.files ?? []))}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  PDF, JPG, PNG, or DOC — max size per upload settings.
                </p>
                {proofFiles.map((f) => (
                  <p
                    key={f.name}
                    className="mt-1.5 flex items-center gap-1.5 text-xs text-sgvu-navy"
                  >
                    <Paperclip className="h-3 w-3 text-sgvu-gold" />
                    {f.name}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-sgvu-navy/8 pt-4">
              <Button
                type="button"
                className="bg-sgvu-navy px-6 text-white hover:bg-[#123A6D]"
                onClick={() => void submit()}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Submit confidentially
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-sgvu-navy/15 text-sgvu-navy"
                disabled={submitting}
                onClick={() => {
                  setOpen(false);
                  setProofFiles([]);
                  setPersonQuery('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* My concerns */}
      <section className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/8 bg-slate-50/70 px-5 py-4 md:px-6">
          <div>
            <h3 className="text-lg font-bold text-sgvu-navy">My concerns</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Track the status of reports you have filed.
            </p>
          </div>
          {!loading && rows.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-sgvu-navy/5 px-2.5 py-1 text-sgvu-navy">
                {rows.length} total
              </span>
              {activeCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                  {activeCount} active
                </span>
              ) : null}
              {closedCount > 0 ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
                  {closedCount} closed
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="p-4 md:p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your concerns…
            </div>
          ) : rows.length === 0 ? (
            <StudentEmptyState
              icon={CheckCircle2}
              title="No concerns filed yet"
              description="When you submit a confidential report, it will appear here with live status from the Disciplinary Committee."
              className="border-0 bg-transparent py-10"
              action={
                <Button
                  className={cn(
                    'transition-colors',
                    open
                      ? 'bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90'
                      : 'bg-sgvu-navy text-white hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy',
                  )}
                  onClick={() => setOpen(true)}
                >
                  <CircleMinus className="h-4 w-4" />
                  Raise a concern
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => {
                const evidence = Array.isArray(r.evidence_urls) ? r.evidence_urls : [];
                const TypeIcon = concernTypeIcon(r.concern_type);
                const against = [
                  accusedTypeLabel(r.accused_type),
                  r.accused_name?.trim() || null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                const summary = r.incident_description?.trim();

                return (
                  <li key={r.concern_id}>
                    <article className="relative overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white transition hover:border-sgvu-gold/45 hover:shadow-sm">
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 w-1',
                          statusAccent(r.status),
                        )}
                        aria-hidden
                      />
                      <div className="pl-4 pr-4 py-4 md:pl-5 md:pr-5 md:py-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div
                              className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                                r.status === 'UNDER_REVIEW' || r.status === 'ESCALATED'
                                  ? 'bg-amber-50 text-amber-700'
                                  : r.status === 'RESOLVED' || r.status === 'CLOSED'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-sgvu-navy/5 text-sgvu-navy',
                              )}
                            >
                              <TypeIcon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-base font-bold text-sgvu-navy">
                                  {concernTypeLabel(r.concern_type)}
                                </h4>
                                <Badge className={cn('border text-[11px]', statusTone(r.status))}>
                                  {concernStatusLabel(r.status)}
                                </Badge>
                              </div>
                              {summary ? (
                                <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                  {summary}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              Logged
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-sgvu-navy">
                              <Clock3 className="h-3.5 w-3.5 shrink-0 text-sgvu-gold" />
                              <span className="truncate">
                                {formatConcernLoggedAt(r.created_at)}
                              </span>
                            </p>
                          </div>
                          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              Against
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-sgvu-navy">
                              <UserRound className="h-3.5 w-3.5 shrink-0 text-sgvu-gold" />
                              <span className="truncate">{against || '—'}</span>
                            </p>
                          </div>
                          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              Location
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-sgvu-navy">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-sgvu-gold" />
                              <span className="truncate">
                                {r.incident_location?.trim() || 'Not specified'}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sgvu-navy/8 pt-3">
                          {evidence.length > 0 ? (
                            evidence.map((url, idx) => (
                              <a
                                key={url}
                                href={proofDocHref(url)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-sgvu-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                                View evidence{evidence.length > 1 ? ` ${idx + 1}` : ''}
                                <ExternalLink className="h-3 w-3 opacity-70" />
                              </a>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No evidence attached
                            </span>
                          )}
                          {r.is_hostel_related ? (
                            <span className="rounded-full bg-sgvu-gold/20 px-2.5 py-1 text-[11px] font-semibold text-sgvu-navy">
                              Hostel-related
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
