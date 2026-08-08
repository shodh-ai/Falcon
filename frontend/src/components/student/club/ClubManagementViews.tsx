'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
  Plus,
  QrCode,
  Search,
  Users,
} from 'lucide-react';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { BlockedDate, CampusEvent, Venue } from '@/lib/api/api.campus-events';

const APPROVAL_STEPS = [
  { key: 'faculty', label: 'Faculty advisor', detail: 'Club coordinator review' },
  { key: 'hod', label: 'HOD', detail: 'Department approval' },
  { key: 'dean', label: 'Dean', detail: 'Academic clearance' },
  { key: 'finance', label: 'Finance', detail: 'Budget & ticketing' },
] as const;

const selectClass =
  'flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40';

const textareaClass =
  'min-h-[96px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40';

function formatBlockedDate(dateStr: string) {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 10);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-sgvu-navy">{label}</label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      {!error && hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border/70" />
    </div>
  );
}

export function BlockedDatesDialog({
  open,
  onOpenChange,
  blocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocked: BlockedDate[];
}) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(
    () => [...blocked].sort((a, b) => a.date.localeCompare(b.date)),
    [blocked],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (row) =>
        row.date.includes(q) ||
        row.title.toLowerCase().includes(q) ||
        formatBlockedDate(row.date).toLowerCase().includes(q),
    );
  }, [query, sorted]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <DialogTitle>University blocked dates</DialogTitle>
          <DialogDescription>
            Exams, holidays, and convocation block new club events on these days.
          </DialogDescription>
        </DialogHeader>
        <div className="border-b px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by date or event name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-x-auto overflow-y-auto px-2 py-2">
          <table className="w-full min-w-[280px] text-sm">
            <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                    No matching dates
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.date} className="border-t border-border/50 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium tabular-nums text-sgvu-navy">
                      {formatBlockedDate(row.date)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.title}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t px-6 py-3 text-xs text-muted-foreground">
          {sorted.length} blocked date{sorted.length === 1 ? '' : 's'} in master calendar
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ApprovalGuideCard({ onOpenCalendar, blockedCount }: { onOpenCalendar: () => void; blockedCount: number }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-sgvu-navy">Approval pipeline</p>
        <p className="mt-1 text-xs text-muted-foreground">Your proposal moves through four tiers before going live.</p>
        <ol className="mt-4 space-y-3">
          {APPROVAL_STEPS.map((step, idx) => (
            <li key={step.key} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sgvu-navy/10 text-xs font-bold text-sgvu-navy">
                {idx + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-sgvu-navy">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={onOpenCalendar}>
        <CalendarDays className="h-4 w-4 text-sgvu-gold" />
        Blocked dates
        {blockedCount > 0 ? (
          <Badge variant="secondary" className="ml-auto">
            {blockedCount}
          </Badge>
        ) : null}
      </Button>
    </div>
  );
}

export type ProposeFormState = {
  club_id: string;
  title: string;
  description: string;
  guest_speakers: string;
  venue_id: string;
  event_date: string;
  total_slots: number;
  is_paid: boolean;
  ticket_price: number;
  funds_needed: number;
  venue_text: string;
};

export function ProposeEventPanel({
  clubs,
  venues,
  blocked,
  form,
  setForm,
  submitting,
  onSubmit,
  onOpenCalendar,
}: {
  clubs: { club_id: string; name: string }[];
  venues: Venue[];
  blocked: BlockedDate[];
  form: ProposeFormState;
  setForm: React.Dispatch<React.SetStateAction<ProposeFormState>>;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onOpenCalendar: () => void;
}) {
  const [customVenue, setCustomVenue] = useState(() => venues.length === 0);
  const blockedSet = useMemo(() => new Set(blocked.map((b) => b.date.slice(0, 10))), [blocked]);
  const selectedDay = form.event_date.slice(0, 10);
  const dateBlocked = selectedDay ? blockedSet.has(selectedDay) : false;
  const blockedReason = dateBlocked ? blocked.find((b) => b.date.startsWith(selectedDay))?.title : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
      <StudentSectionCard
        title="Propose club event"
        description="Submit for faculty coordinator review. IQAC credits apply once the event is live."
        icon={Plus}
        tone="gold"
        contentClassName="pt-0"
      >
        <form className="space-y-5" onSubmit={onSubmit}>
          <Field label="Club">
            <Select
              value={form.club_id}
              onValueChange={(val) => setForm((f) => ({ ...f, club_id: val }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select club..." />
              </SelectTrigger>
              <SelectContent>
                {clubs.map((c) => (
                  <SelectItem key={c.club_id} value={c.club_id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Event title">
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Robotics Hackathon 2026"
              required
            />
          </Field>

          <Field label="Description">
            <textarea
              className={textareaClass}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What happens, who should attend, and why it matters"
            />
          </Field>

          <Field label="Guest speakers" hint="Optional">
            <Input
              value={form.guest_speakers}
              onChange={(e) => setForm((f) => ({ ...f, guest_speakers: e.target.value }))}
              placeholder="Names separated by commas"
            />
          </Field>

          <SectionDivider label="Schedule" />

          <Field label="Venue">
            {venues.length > 0 && !customVenue ? (
              <Select
                value={form.venue_id || "none"}
                onValueChange={(val) => setForm((f) => ({ ...f, venue_id: val === "none" ? "" : val, venue_text: '' }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select campus venue…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select campus venue…</SelectItem>
                  {venues.map((v) => (
                    <SelectItem key={v.venue_id} value={v.venue_id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={form.venue_text}
                onChange={(e) => setForm((f) => ({ ...f, venue_text: e.target.value, venue_id: '' }))}
                placeholder="e.g. Innovation Lab, Block C"
              />
            )}
            {venues.length > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-sgvu-navy underline-offset-2 hover:underline"
                onClick={() => {
                  setCustomVenue((v) => !v);
                  setForm((f) => ({ ...f, venue_id: '', venue_text: '' }));
                }}
              >
                {customVenue ? 'Pick from campus venues instead' : 'Enter a custom venue instead'}
              </button>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Date & time"
              error={dateBlocked ? `Blocked: ${blockedReason ?? 'University calendar'}` : null}
              hint={dateBlocked ? undefined : 'Pick a day not on the university blocked calendar'}
            >
              <Input
                type="datetime-local"
                className={cn(dateBlocked && 'border-destructive focus-visible:ring-destructive/30')}
                value={form.event_date}
                onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                required
              />
              {!dateBlocked ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-sgvu-navy underline"
                  onClick={onOpenCalendar}
                >
                  View blocked dates
                </button>
              ) : null}
            </Field>
            <Field label="Capacity (slots)">
              <Input
                type="number"
                min={1}
                value={form.total_slots}
                onChange={(e) => setForm((f) => ({ ...f, total_slots: Number(e.target.value) }))}
              />
            </Field>
          </div>

          <SectionDivider label="Registration & budget" />

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={form.is_paid}
              onChange={(e) => setForm((f) => ({ ...f, is_paid: e.target.checked }))}
            />
            <span className="text-sm">
              <span className="font-medium text-sgvu-navy">Paid registration</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Attendees pay a ticket fee when signing up</span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {form.is_paid ? (
              <Field label="Ticket price (₹)">
                <Input
                  type="number"
                  min={1}
                  value={form.ticket_price}
                  onChange={(e) => setForm((f) => ({ ...f, ticket_price: Number(e.target.value) }))}
                />
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
            <Field label="University funds (₹)" hint="Logistics budget from the university. Use 0 if none.">
              <Input
                type="number"
                min={0}
                value={form.funds_needed}
                onChange={(e) => setForm((f) => ({ ...f, funds_needed: Number(e.target.value) }))}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Faculty → HOD → Dean → Finance</p>
            <Button type="submit" className="bg-sgvu-navy sm:min-w-[220px]" disabled={submitting || dateBlocked}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit proposal'}
            </Button>
          </div>
        </form>
      </StudentSectionCard>

      <aside className="hidden lg:block lg:sticky lg:top-6">
        <ApprovalGuideCard onOpenCalendar={onOpenCalendar} blockedCount={blocked.length} />
      </aside>

      <div className="lg:hidden">
        <ApprovalGuideCard onOpenCalendar={onOpenCalendar} blockedCount={blocked.length} />
      </div>
    </div>
  );
}

function tierBadges(ev: CampusEvent) {
  const tiers = [
    { label: 'Faculty', value: ev.advisor_approval },
    { label: 'HOD', value: ev.hod_approval },
    { label: 'Dean', value: ev.dean_approval },
    { label: 'Finance', value: ev.finance_approval },
  ];
  return tiers;
}

export function ClubEventsPanel({
  events,
  onDownloadCsv,
}: {
  events: CampusEvent[];
  onDownloadCsv: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return (
      <StudentSectionCard title="My club events" description="Track proposals through the approval pipeline" icon={CalendarDays}>
        <StudentEmptyState title="No events yet" description="Submit your first proposal to start the approval chain." />
      </StudentSectionCard>
    );
  }

  return (
    <StudentSectionCard
      title="My club events"
      description="Track proposals through the approval pipeline"
      icon={CalendarDays}
      action={<Badge variant="secondary">{events.length}</Badge>}
    >
      <div className="space-y-3">
        {events.map((ev) => (
          <article key={ev.event_id} className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sgvu-navy">{ev.title}</h3>
                {ev.event_date ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(ev.event_date).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                ) : null}
              </div>
              <Badge>{ev.status}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tierBadges(ev).map((tier) => {
                const approved = tier.value === 'APPROVED';
                return (
                  <span
                    key={tier.label}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      approved ? 'bg-emerald-50 text-emerald-800' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {approved ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                    {tier.label}
                  </span>
                );
              })}
            </div>
            {ev.status === 'LIVE' ? (
              <Button type="button" variant="link" className="mt-2 h-auto p-0 text-sgvu-navy" onClick={() => onDownloadCsv(ev.event_id)}>
                Download attendee CSV
              </Button>
            ) : null}
          </article>
        ))}
      </div>
    </StudentSectionCard>
  );
}

export function ClubScannerPanel({
  liveEvents,
  scanEventId,
  setScanEventId,
  qrInput,
  setQrInput,
  scanStats,
  scanning,
  lastScan,
  onScan,
}: {
  liveEvents: CampusEvent[];
  scanEventId: string;
  setScanEventId: (id: string) => void;
  qrInput: string;
  setQrInput: (v: string) => void;
  scanStats: { registered: number; attended: number } | null;
  scanning: boolean;
  lastScan: { ok: boolean; studentName?: string; duplicate?: boolean; message: string } | null;
  onScan: () => void;
}) {
  const qrRef = useRef<HTMLInputElement>(null);
  const canScan = Boolean(scanEventId && qrInput.trim()) && !scanning;

  useEffect(() => {
    if (liveEvents.length > 0) qrRef.current?.focus();
  }, [liveEvents.length, scanEventId]);

  useEffect(() => {
    if (lastScan?.ok) qrRef.current?.focus();
  }, [lastScan]);

  if (liveEvents.length === 0) {
    return (
      <StudentSectionCard title="Event day scanner" description="Check in attendees with QR codes" icon={QrCode}>
        <StudentEmptyState
          title="No live events"
          description="Complete the approval chain first. Scanner unlocks when an event goes LIVE."
        />
      </StudentSectionCard>
    );
  }

  const pct =
    scanStats && scanStats.registered > 0
      ? Math.round((scanStats.attended / scanStats.registered) * 100)
      : 0;

  return (
    <StudentSectionCard title="Event day scanner" description="Check in attendees with QR codes" icon={QrCode} tone="gold">
      <div className="space-y-4">
        <Field label="Live event">
          <Select value={scanEventId} onValueChange={(val) => setScanEventId(val)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select event..." />
            </SelectTrigger>
            <SelectContent>
              {liveEvents.map((e) => (
                <SelectItem key={e.event_id} value={e.event_id}>
                  {e.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {scanStats ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 px-3 py-3 text-center">
              <Users className="mx-auto h-4 w-4 text-sgvu-gold" />
              <p className="mt-1 text-lg font-bold text-sgvu-navy">{scanStats.registered}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Registered</p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-3 py-3 text-center">
              <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-1 text-lg font-bold text-sgvu-navy">{scanStats.attended}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Checked in</p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-3 py-3 text-center">
              <MapPin className="mx-auto h-4 w-4 text-sgvu-navy" />
              <p className="mt-1 text-lg font-bold text-sgvu-navy">{pct}%</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Attendance</p>
            </div>
          </div>
        ) : null}

        <Field label="QR code" hint="Paste the full ticket line or just FALCON-EVT-… then click Mark attendance">
          <Input
            ref={qrRef}
            placeholder="FALCON-EVT-…"
            value={qrInput}
            autoComplete="off"
            onChange={(e) => setQrInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onScan();
              }
            }}
          />
        </Field>

        {lastScan ? (
          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-sm',
              lastScan.ok
                ? lastScan.duplicate
                  ? 'border-amber-200 bg-amber-50 text-amber-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-destructive/30 bg-destructive/5 text-destructive',
            )}
          >
            <p className="font-semibold">{lastScan.message}</p>
            {lastScan.ok && !lastScan.duplicate ? (
              <p className="mt-1 text-xs opacity-80">IQAC SODECA credit applied on first check-in.</p>
            ) : null}
          </div>
        ) : null}

        <Button
          type="button"
          className="w-full bg-sgvu-navy sm:w-auto"
          disabled={!canScan}
          onClick={onScan}
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark attendance'}
        </Button>
      </div>
    </StudentSectionCard>
  );
}
