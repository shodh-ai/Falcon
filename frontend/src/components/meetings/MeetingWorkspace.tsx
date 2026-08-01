'use client';

import { Select } from '@/components/ui/select';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, Check, FileText, Plus, Send, Users, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
  createMeetingsApi,
  type EligibleParticipant,
  type MeetingParticipant,
  type PortalMeetingRecord,
} from '@/lib/api/api.meetings';
import { usePresidentApi } from '@/lib/api/api.president';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultMeetingTime() {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 30, 0, 0);
  return toLocalInputValue(start.toISOString());
}

function minMeetingTimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1, 0, 0);
  return toLocalInputValue(now.toISOString());
}

function isHodParticipant(participant: EligibleParticipant) {
  const role = participant.role_name.toLowerCase();
  const relation = participant.relation.toLowerCase();
  return role === 'hod' || relation === 'hod';
}

/** Fuzzy match so "Computer Science" aligns with "Computer Science & Engineering". */
function matchesDepartment(participant: EligibleParticipant, department: string) {
  const needle = department.trim().toLowerCase();
  if (!needle) return false;
  const dept = (participant.dept_name ?? '').toLowerCase();
  if (!dept) return false;
  return dept.includes(needle) || needle.includes(dept);
}

function findDepartmentHodMatches(participants: EligibleParticipant[], department: string) {
  const hodMatches = participants.filter(
    (p) => isHodParticipant(p) && matchesDepartment(p, department),
  );
  if (hodMatches.length > 0) return hodMatches;
  return participants.filter((p) => matchesDepartment(p, department));
}

function participantStatusLabel(
  participant: MeetingParticipant,
  meeting: PortalMeetingRecord,
) {
  if (participant.participant_role === 'ORGANIZER' && meeting.meeting_mode === 'SCHEDULED') {
    return 'Organizer';
  }
  if (participant.participant_role === 'ATTENDEE' && meeting.meeting_mode === 'REQUESTED') {
    return 'Requester';
  }
  if (participant.rsvp_status === 'ACCEPTED') return 'Accepted';
  if (participant.rsvp_status === 'DECLINED') return 'Declined';
  return 'Awaiting response';
}

function formatMeetingWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const NAVY_BTN =
  'bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy';
const OUTLINE_NAVY_BTN =
  'border-sgvu-navy/20 text-sgvu-navy transition-colors hover:bg-sgvu-navy/5 active:bg-sgvu-gold active:text-sgvu-navy active:border-sgvu-gold';

export function MeetingWorkspace({
  workspaceLabel = 'Meetings',
  description = 'Schedule meetings with people in your scope, request time with seniors, and publish minutes.',
  syncExecutiveActionItems = false,
}: {
  workspaceLabel?: string;
  description?: string;
  syncExecutiveActionItems?: boolean;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading meetings…</p>}>
      <MeetingWorkspaceInner
        workspaceLabel={workspaceLabel}
        description={description}
        syncExecutiveActionItems={syncExecutiveActionItems}
      />
    </Suspense>
  );
}

function MeetingWorkspaceInner({
  workspaceLabel = 'Meetings',
  description = 'Schedule meetings with people in your scope, request time with seniors, and publish minutes.',
  syncExecutiveActionItems = false,
}: {
  workspaceLabel?: string;
  description?: string;
  syncExecutiveActionItems?: boolean;
}) {
  const api = useAuthedApi();
  const presidentApi = usePresidentApi();
  const { user } = useAuth();
  const meetingsApi = useMemo(() => createMeetingsApi(api), [api]);
  const searchParams = useSearchParams();
  const selectedFromQuery = searchParams.get('meeting');
  const composeFromQuery = searchParams.get('compose');
  const inviteQueryFromUrl = searchParams.get('query') ?? '';
  const departmentFromUrl =
    searchParams.get('department')?.trim() || inviteQueryFromUrl.trim();
  const preferHodFromUrl = (searchParams.get('role') ?? '').toLowerCase() === 'hod';

  const [meetings, setMeetings] = useState<PortalMeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'schedule' | 'request'>(
    composeFromQuery === 'schedule' || composeFromQuery === 'request' ? composeFromQuery : 'list',
  );
  const [selectedId, setSelectedId] = useState<string | null>(selectedFromQuery);
  const [scheduleInvitees, setScheduleInvitees] = useState<string[]>([]);
  const [scheduleEligible, setScheduleEligible] = useState<EligibleParticipant[]>([]);
  const [requestEligible, setRequestEligible] = useState<EligibleParticipant[]>([]);
  const [inviteSearch, setInviteSearch] = useState(inviteQueryFromUrl);
  const [busy, setBusy] = useState(false);
  const hodCoordinatedRef = useRef(false);

  const defaults = defaultMeetingTime();
  const minDateTime = minMeetingTimeLocal();
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    venue: '',
    meeting_at: defaults,
    agenda: '',
  });
  const [requestForm, setRequestForm] = useState({
    title: '',
    venue: '',
    meeting_at: defaults,
    agenda: '',
    recipient_user_id: '',
  });
  const [agendaDraft, setAgendaDraft] = useState('');
  const [minutesDraft, setMinutesDraft] = useState({ notes: '', decisions: '', action_items: '' });

  const selected = meetings.find((m) => m.meeting_id === selectedId) ?? meetings[0] ?? null;
  const myParticipant = selected?.participants?.find((p) => p.user_id === user?.user_id) ?? null;
  const canManageSelected = !!selected && selected.organizer_user_id === user?.user_id;
  const canRespond =
    !!myParticipant &&
    myParticipant.rsvp_status === 'PENDING' &&
    (myParticipant.participant_role === 'INVITEE' ||
      (myParticipant.participant_role === 'ORGANIZER' && selected?.meeting_mode === 'REQUESTED'));

  const load = useCallback(async () => {
    const rows = await meetingsApi.list();
    setMeetings(rows);
    return rows;
  }, [meetingsApi]);

  useEffect(() => {
    // Fetching on mount intentionally populates meeting state asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
      .catch(() => toast.error('Could not load meetings'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    // Draft editors mirror the newly selected record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected?.agenda != null) setAgendaDraft(selected.agenda);
    if (selected?.minutes) {
      setMinutesDraft({
        notes: selected.minutes.notes ?? '',
        decisions: selected.minutes.decisions ?? '',
        action_items: selected.minutes.action_items ?? '',
      });
    }
  }, [selected?.meeting_id, selected?.agenda, selected?.minutes]);

  useEffect(() => {
    if (tab !== 'schedule') return;
    void meetingsApi
      .eligible('schedule')
      .then((res) => setScheduleEligible(res.participants))
      .catch(() => toast.error('Could not load invitees'));
  }, [tab, meetingsApi]);

  useEffect(() => {
    if (tab !== 'request') return;
    void meetingsApi
      .eligible('request')
      .then((res) => setRequestEligible(res.participants))
      .catch(() => toast.error('Could not load recipients'));
  }, [tab, meetingsApi]);

  // Deep-link from Academic Excellence "Contact HOD": pre-select that department's HOD.
  useEffect(() => {
    if (tab !== 'schedule' || !departmentFromUrl || scheduleEligible.length === 0) return;
    if (hodCoordinatedRef.current) return;

    const matches = preferHodFromUrl
      ? findDepartmentHodMatches(scheduleEligible, departmentFromUrl)
      : scheduleEligible.filter((p) => matchesDepartment(p, departmentFromUrl));

    const preferred =
      preferHodFromUrl && matches.some(isHodParticipant)
        ? matches.filter(isHodParticipant)
        : matches;

    if (preferred.length === 0) {
      hodCoordinatedRef.current = true;
      toast.error(`No HOD found for ${departmentFromUrl}`);
      return;
    }

    hodCoordinatedRef.current = true;
    const ids = preferred.map((p) => p.user_id);
    setScheduleInvitees((prev) => [...new Set([...prev, ...ids])]);
    setInviteSearch(departmentFromUrl);
    setScheduleForm((prev) => ({
      ...prev,
      title: prev.title || `Academic coordination — ${departmentFromUrl}`,
      agenda:
        prev.agenda ||
        `Discuss academic performance, attendance, and corrective actions for ${departmentFromUrl}.`,
    }));

    const names = preferred.map((p) => p.name).join(', ');
    toast.success(
      preferred.length === 1
        ? `Coordinating with ${names} (HOD, ${departmentFromUrl})`
        : `Coordinating with ${preferred.length} contacts for ${departmentFromUrl}`,
    );
  }, [tab, departmentFromUrl, preferHodFromUrl, scheduleEligible]);

  const filteredScheduleEligible = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    const base = !q
      ? scheduleEligible
      : scheduleEligible.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.role_name.toLowerCase().includes(q) ||
            (p.dept_name?.toLowerCase().includes(q) ?? false),
        );

    if (!departmentFromUrl) return base;

    // Surface the department HOD(s) first when arriving from Contact HOD.
    return [...base].sort((a, b) => {
      const aMatch = matchesDepartment(a, departmentFromUrl);
      const bMatch = matchesDepartment(b, departmentFromUrl);
      const aHod = aMatch && isHodParticipant(a) ? 2 : aMatch ? 1 : 0;
      const bHod = bMatch && isHodParticipant(b) ? 2 : bMatch ? 1 : 0;
      return bHod - aHod;
    });
  }, [inviteSearch, scheduleEligible, departmentFromUrl]);

  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduleInvitees.length) {
      toast.error('Select at least one invitee');
      return;
    }
    if (new Date(scheduleForm.meeting_at).getTime() <= Date.now()) {
      toast.error('Choose a future date and time');
      return;
    }
    setBusy(true);
    try {
      await meetingsApi.schedule({
        title: scheduleForm.title,
        venue: scheduleForm.venue,
        meeting_at: new Date(scheduleForm.meeting_at).toISOString(),
        agenda: scheduleForm.agenda || undefined,
        invitee_user_ids: scheduleInvitees,
      });
      toast.success('Meeting scheduled and invitations sent');
      setTab('list');
      setScheduleInvitees([]);
      await load();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule meeting');
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestForm.recipient_user_id) {
      toast.error('Select a recipient');
      return;
    }
    if (new Date(requestForm.meeting_at).getTime() <= Date.now()) {
      toast.error('Choose a future date and time');
      return;
    }
    setBusy(true);
    try {
      await meetingsApi.request({
        title: requestForm.title,
        venue: requestForm.venue,
        meeting_at: new Date(requestForm.meeting_at).toISOString(),
        agenda: requestForm.agenda || undefined,
        recipient_user_id: requestForm.recipient_user_id,
      });
      toast.success('Meeting request sent');
      setTab('list');
      await load();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setBusy(false);
    }
  }

  async function respond(meetingId: string, response: 'ACCEPTED' | 'DECLINED') {
    setBusy(true);
    try {
      await meetingsApi.respond(meetingId, { response });
      toast.success(response === 'ACCEPTED' ? 'Meeting accepted' : 'Meeting declined');
      await load();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update meeting');
    } finally {
      setBusy(false);
    }
  }

  async function saveAgenda() {
    if (!selected) return;
    setBusy(true);
    try {
      await meetingsApi.updateAgenda(selected.meeting_id, agendaDraft);
      toast.success('Agenda updated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update agenda');
    } finally {
      setBusy(false);
    }
  }

  async function publishMinutes() {
    if (!selected) return;
    setBusy(true);
    try {
      await meetingsApi.publishMinutes(selected.meeting_id, minutesDraft);
      if (syncExecutiveActionItems && minutesDraft.action_items.trim()) {
        const organizer = selected.participants?.find((p) => p.participant_role === 'ORGANIZER');
        const fallbackAssignee = organizer?.user_id ?? user?.user_id ?? '';
        const items = minutesDraft.action_items
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [title, assignee] = line.split('|').map((part) => part.trim());
            return {
              title: title || line,
              assigned_to_user_id: assignee || fallbackAssignee,
            };
          })
          .filter((item) => item.assigned_to_user_id);
        if (items.length) {
          await presidentApi.meetingActionItems(selected.meeting_id, items);
          toast.success(`Created ${items.length} executive action item(s)`);
        }
      }
      toast.success('Minutes published');
      await load();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish minutes');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <FalconLoader label="Loading meetings…" />;
  }

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow={workspaceLabel}
        title="Meetings"
        description={description}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === 'list' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={tab === 'list'}
              className={tab === 'list' ? NAVY_BTN : OUTLINE_NAVY_BTN}
              onClick={() => setTab('list')}
            >
              My meetings
            </Button>
            <Button
              variant={tab === 'schedule' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={tab === 'schedule'}
              className={tab === 'schedule' ? NAVY_BTN : OUTLINE_NAVY_BTN}
              onClick={() => setTab('schedule')}
            >
              <Plus className="mr-1 h-4 w-4" />
              Schedule
            </Button>
            <Button
              variant={tab === 'request' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={tab === 'request'}
              className={tab === 'request' ? NAVY_BTN : OUTLINE_NAVY_BTN}
              onClick={() => setTab('request')}
            >
              <Send className="mr-1 h-4 w-4" />
              Request
            </Button>
          </div>
        }
      />

      {tab === 'schedule' ? (
        <Card>
          <CardHeader>
            <CardTitle>Schedule a meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void submitSchedule(e)} className="space-y-4">
              <Input aria-label="Meeting title" placeholder="Title" value={scheduleForm.title} onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })} required />
              <Input aria-label="Meeting venue" placeholder="Venue" value={scheduleForm.venue} onChange={(e) => setScheduleForm({ ...scheduleForm, venue: e.target.value })} required />
              <Input
                aria-label="Meeting date and time"
                type="datetime-local"
                min={minDateTime}
                value={scheduleForm.meeting_at}
                onChange={(e) => setScheduleForm({ ...scheduleForm, meeting_at: e.target.value })}
                required
              />
              <Textarea
                aria-label="Meeting agenda"
                className="min-h-[100px] w-full"
                placeholder="Agenda (optional)"
                value={scheduleForm.agenda}
                onChange={(e) => setScheduleForm({ ...scheduleForm, agenda: e.target.value })}
              />
              <div>
                <p className="mb-2 text-sm font-medium text-sgvu-navy">Invite participants</p>
                {departmentFromUrl && scheduleInvitees.length > 0 ? (
                  <p className="mb-2 rounded-lg border border-sgvu-gold/40 bg-sgvu-gold/10 px-3 py-2 text-xs font-medium text-sgvu-navy">
                    Pre-selected for {departmentFromUrl}
                    {preferHodFromUrl ? ' (department HOD)' : ''}. Review and send the invitation.
                  </p>
                ) : null}
                <Input
                  aria-label="Search invitees"
                  placeholder="Search by name, role, or department"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-sgvu-navy/10 p-3">
                  {filteredScheduleEligible.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {scheduleEligible.length === 0
                        ? 'No eligible participants in your scope.'
                        : 'No participants match your search.'}
                    </p>
                  ) : (
                    filteredScheduleEligible.map((p) => {
                      const isDeptHod =
                        !!departmentFromUrl &&
                        isHodParticipant(p) &&
                        matchesDepartment(p, departmentFromUrl);
                      return (
                      <label
                        key={p.user_id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                          isDeptHod ? 'bg-sgvu-gold/10' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={scheduleInvitees.includes(p.user_id)}
                          onChange={(e) =>
                            setScheduleInvitees((prev) =>
                              e.target.checked ? [...prev, p.user_id] : prev.filter((id) => id !== p.user_id),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 font-medium text-sgvu-navy">{p.name}</span>
                        <Badge variant="outline">{p.role_name}</Badge>
                        {p.dept_name ? (
                          <Badge variant="secondary" className="max-w-[10rem] truncate">
                            {p.dept_name}
                          </Badge>
                        ) : null}
                      </label>
                      );
                    })
                  )}
                </div>
              </div>
              <Button type="submit" disabled={busy} className={NAVY_BTN}>
                <Users className="mr-1 h-4 w-4" />
                Send invitations
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'request' ? (
        <Card>
          <CardHeader>
            <CardTitle>Request a meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void submitRequest(e)} className="space-y-4">
              <Select
                aria-label="Meeting recipient"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={requestForm.recipient_user_id}
                onChange={(e) => setRequestForm({ ...requestForm, recipient_user_id: e.target.value })}
                required
              >
                <option value="">Select recipient</option>
                {requestEligible.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.name} ({p.role_name})
                  </option>
                ))}
              </Select>
              <Input aria-label="Meeting request title" placeholder="Title" value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} required />
              <Input aria-label="Requested meeting venue" placeholder="Venue" value={requestForm.venue} onChange={(e) => setRequestForm({ ...requestForm, venue: e.target.value })} required />
              <Input
                aria-label="Requested meeting date and time"
                type="datetime-local"
                min={minDateTime}
                value={requestForm.meeting_at}
                onChange={(e) => setRequestForm({ ...requestForm, meeting_at: e.target.value })}
                required
              />
              <Textarea
                aria-label="Meeting request agenda"
                className="min-h-[100px] w-full"
                placeholder="Agenda (optional)"
                value={requestForm.agenda}
                onChange={(e) => setRequestForm({ ...requestForm, agenda: e.target.value })}
              />
              <Button type="submit" disabled={busy} className={NAVY_BTN}>
                <Send className="mr-1 h-4 w-4" />
                Send request
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'list' ? (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <Card className="border-sgvu-navy/10 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-sgvu-navy">Upcoming & recent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {meetings.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No meetings yet.</p>
              ) : (
                meetings.map((m) => {
                  const isActive = selected?.meeting_id === m.meeting_id;
                  return (
                    <button
                      key={m.meeting_id}
                      type="button"
                      onClick={() => setSelectedId(m.meeting_id)}
                      className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
                        isActive
                          ? 'border-sgvu-gold bg-sgvu-gold/5 shadow-sm'
                          : 'border-sgvu-navy/10 bg-white hover:border-sgvu-navy/20 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate font-semibold text-sgvu-navy">{m.title}</p>
                        <Badge variant="outline" className="shrink-0 capitalize">
                          {m.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {formatMeetingWhen(m.starts_at)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.venue}</p>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          {selected ? (
            <Card className="border-sgvu-navy/10 shadow-sm">
              <CardHeader className="space-y-3 border-b border-sgvu-navy/5 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CardTitle className="text-xl text-sgvu-navy">{selected.title}</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="capitalize">
                      {selected.meeting_mode.toLowerCase()}
                    </Badge>
                    <Badge className="capitalize">{selected.status.toLowerCase()}</Badge>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/60 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">When</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-medium text-sgvu-navy">
                      <CalendarClock className="h-4 w-4 shrink-0 text-sgvu-navy/60" />
                      {formatMeetingWhen(selected.starts_at)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/60 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Venue</p>
                    <p className="mt-1 text-sm font-medium text-sgvu-navy">{selected.venue}</p>
                  </div>
                  <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/60 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Organizer</p>
                    <p className="mt-1 text-sm font-medium text-sgvu-navy">{selected.organizer_name}</p>
                  </div>
                  <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/60 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Requester</p>
                    <p className="mt-1 text-sm font-medium text-sgvu-navy">{selected.requester_name}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-5 text-sm">
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Participants</p>
                  <ul className="divide-y divide-sgvu-navy/5 overflow-hidden rounded-xl border border-sgvu-navy/10">
                    {selected.participants?.map((p) => (
                      <li
                        key={p.participant_id}
                        className="flex items-center justify-between gap-3 bg-white px-4 py-3"
                      >
                        <span className="min-w-0 truncate font-medium text-sgvu-navy">{p.name}</span>
                        <Badge variant="outline" className="shrink-0">
                          {participantStatusLabel(p, selected)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>

                {canRespond ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      className={NAVY_BTN}
                      onClick={() => void respond(selected.meeting_id, 'ACCEPTED')}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className={OUTLINE_NAVY_BTN}
                      onClick={() => void respond(selected.meeting_id, 'DECLINED')}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Decline
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Agenda</p>
                  {canManageSelected ? (
                    <>
                      <Textarea
                        aria-label="Edit meeting agenda"
                        className="min-h-[100px] w-full"
                        value={agendaDraft}
                        onChange={(e) => setAgendaDraft(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        className={OUTLINE_NAVY_BTN}
                        onClick={() => void saveAgenda()}
                      >
                        Save agenda
                      </Button>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap rounded-xl border border-sgvu-navy/10 bg-slate-50/60 px-4 py-3 text-muted-foreground">
                      {selected.agenda || 'No agenda published.'}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Minutes
                  </p>
                  {canManageSelected ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label htmlFor="meeting-notes" className="text-sm font-medium text-sgvu-navy">
                          Notes
                        </label>
                        <Textarea
                          id="meeting-notes"
                          aria-label="Meeting notes"
                          className="min-h-[100px] w-full"
                          placeholder="Meeting notes"
                          value={minutesDraft.notes}
                          onChange={(e) => setMinutesDraft({ ...minutesDraft, notes: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="meeting-decisions" className="text-sm font-medium text-sgvu-navy">
                          Decisions
                        </label>
                        <Textarea
                          id="meeting-decisions"
                          aria-label="Meeting decisions"
                          className="min-h-[100px] w-full"
                          placeholder="Key decisions"
                          value={minutesDraft.decisions}
                          onChange={(e) => setMinutesDraft({ ...minutesDraft, decisions: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="meeting-actions" className="text-sm font-medium text-sgvu-navy">
                          Action items
                        </label>
                        <Textarea
                          id="meeting-actions"
                          aria-label="Meeting action items"
                          className="min-h-[100px] w-full"
                          placeholder="Action items and owners"
                          value={minutesDraft.action_items}
                          onChange={(e) => setMinutesDraft({ ...minutesDraft, action_items: e.target.value })}
                        />
                      </div>
                      <Button
                        variant="default"
                        className={`w-full ${NAVY_BTN}`}
                        disabled={busy || !minutesDraft.notes.trim()}
                        onClick={() => void publishMinutes()}
                      >
                        Publish minutes
                      </Button>
                    </div>
                  ) : selected.minutes ? (
                    <dl className="space-y-3 rounded-xl border border-sgvu-navy/10 bg-slate-50/60 px-4 py-4">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sgvu-navy">{selected.minutes.notes}</dd>
                      </div>
                      {selected.minutes.decisions ? (
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decisions</dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sgvu-navy">{selected.minutes.decisions}</dd>
                        </div>
                      ) : null}
                      {selected.minutes.action_items ? (
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action items</dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sgvu-navy">{selected.minutes.action_items}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="rounded-xl border border-dashed border-sgvu-navy/15 px-4 py-6 text-center text-muted-foreground">
                      Minutes have not been published.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-sgvu-navy/10 shadow-sm">
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Select a meeting to view details, agenda, and minutes.
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
