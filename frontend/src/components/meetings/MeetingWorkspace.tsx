'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

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

export function MeetingWorkspace({
  workspaceLabel = 'Meetings',
  description = 'Schedule meetings with people in your scope, request time with seniors, and publish minutes.',
}: {
  workspaceLabel?: string;
  description?: string;
}) {
  const api = useAuthedApi();
  const { user } = useAuth();
  const meetingsApi = useMemo(() => createMeetingsApi(api), [api]);
  const searchParams = useSearchParams();
  const selectedFromQuery = searchParams.get('meeting');

  const [meetings, setMeetings] = useState<PortalMeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'schedule' | 'request'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(selectedFromQuery);
  const [scheduleInvitees, setScheduleInvitees] = useState<string[]>([]);
  const [scheduleEligible, setScheduleEligible] = useState<EligibleParticipant[]>([]);
  const [requestEligible, setRequestEligible] = useState<EligibleParticipant[]>([]);
  const [busy, setBusy] = useState(false);

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

  const selected = meetings.find((m) => m.meeting_id === selectedId) ?? null;
  const myParticipant = selected?.participants?.find((p) => p.user_id === user?.user_id) ?? null;
  const canRespond =
    !!myParticipant &&
    myParticipant.rsvp_status === 'PENDING' &&
    (myParticipant.participant_role === 'INVITEE' ||
      (myParticipant.participant_role === 'ORGANIZER' && selected?.meeting_mode === 'REQUESTED'));

  const load = useCallback(async () => {
    const rows = await meetingsApi.list();
    setMeetings(rows);
    if (selectedId && !rows.some((r) => r.meeting_id === selectedId)) {
      setSelectedId(rows[0]?.meeting_id ?? null);
    }
  }, [meetingsApi, selectedId]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load meetings'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (selectedFromQuery) setSelectedId(selectedFromQuery);
  }, [selectedFromQuery]);

  useEffect(() => {
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
    return <p className="p-6 text-sm text-muted-foreground">Loading meetings…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">{workspaceLabel}</p>
        <h1 className="mt-1 text-2xl font-black text-sgvu-navy">Meetings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={tab === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setTab('list')}>
            My meetings
          </Button>
          <Button variant={tab === 'schedule' ? 'default' : 'outline'} size="sm" onClick={() => setTab('schedule')}>
            <Plus className="mr-1 h-4 w-4" />
            Schedule
          </Button>
          <Button variant={tab === 'request' ? 'default' : 'outline'} size="sm" onClick={() => setTab('request')}>
            <Send className="mr-1 h-4 w-4" />
            Request
          </Button>
        </div>
      </div>

      {tab === 'schedule' ? (
        <Card>
          <CardHeader>
            <CardTitle>Schedule a meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void submitSchedule(e)} className="space-y-4">
              <Input placeholder="Title" value={scheduleForm.title} onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })} required />
              <Input placeholder="Venue" value={scheduleForm.venue} onChange={(e) => setScheduleForm({ ...scheduleForm, venue: e.target.value })} required />
              <Input
                type="datetime-local"
                min={minDateTime}
                value={scheduleForm.meeting_at}
                onChange={(e) => setScheduleForm({ ...scheduleForm, meeting_at: e.target.value })}
                required
              />
              <textarea
                className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Agenda (optional)"
                value={scheduleForm.agenda}
                onChange={(e) => setScheduleForm({ ...scheduleForm, agenda: e.target.value })}
              />
              <div>
                <p className="mb-2 text-sm font-medium">Invite participants</p>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {scheduleEligible.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No eligible participants in your scope.</p>
                  ) : (
                    scheduleEligible.map((p) => (
                      <label key={p.user_id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={scheduleInvitees.includes(p.user_id)}
                          onChange={(e) =>
                            setScheduleInvitees((prev) =>
                              e.target.checked ? [...prev, p.user_id] : prev.filter((id) => id !== p.user_id),
                            )
                          }
                        />
                        <span>{p.name}</span>
                        <Badge variant="outline">{p.role_name}</Badge>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <Button type="submit" disabled={busy}>
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
              <Input placeholder="Title" value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} required />
              <Input placeholder="Venue" value={requestForm.venue} onChange={(e) => setRequestForm({ ...requestForm, venue: e.target.value })} required />
              <Input
                type="datetime-local"
                min={minDateTime}
                value={requestForm.meeting_at}
                onChange={(e) => setRequestForm({ ...requestForm, meeting_at: e.target.value })}
                required
              />
              <textarea
                className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Agenda (optional)"
                value={requestForm.agenda}
                onChange={(e) => setRequestForm({ ...requestForm, agenda: e.target.value })}
              />
              <Button type="submit" disabled={busy}>
                <Send className="mr-1 h-4 w-4" />
                Send request
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'list' ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming & recent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {meetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meetings yet.</p>
              ) : (
                meetings.map((m) => (
                  <button
                    key={m.meeting_id}
                    type="button"
                    onClick={() => setSelectedId(m.meeting_id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition ${selectedId === m.meeting_id ? 'border-sgvu-gold bg-sgvu-gold/5' : 'border-gray-100 hover:bg-slate-50'}`}
                  >
                    <p className="font-semibold text-sgvu-navy">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.starts_at).toLocaleString()} · {m.venue}
                    </p>
                    <Badge className="mt-2" variant="outline">
                      {m.status}
                    </Badge>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle>{selected.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selected.meeting_mode}</Badge>
                  <Badge>{selected.status}</Badge>
                </div>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="h-4 w-4" />
                  {new Date(selected.starts_at).toLocaleString()}
                </p>
                <p>{selected.venue}</p>
                <p>
                  Organizer: <strong>{selected.organizer_name}</strong> · Requester:{' '}
                  <strong>{selected.requester_name}</strong>
                </p>
                <div>
                  <p className="mb-2 font-medium">Participants</p>
                  <ul className="space-y-1">
                    {selected.participants?.map((p) => (
                      <li key={p.participant_id} className="flex items-center justify-between rounded border px-2 py-1">
                        <span>{p.name}</span>
                        <Badge variant="outline">{participantStatusLabel(p, selected)}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>

                {canRespond ? (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void respond(selected.meeting_id, 'ACCEPTED')}>
                      <Check className="mr-1 h-4 w-4" />
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void respond(selected.meeting_id, 'DECLINED')}>
                      <X className="mr-1 h-4 w-4" />
                      Decline
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="font-medium">Agenda</p>
                  <textarea
                    className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                    value={agendaDraft}
                    onChange={(e) => setAgendaDraft(e.target.value)}
                  />
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveAgenda()}>
                    Save agenda
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4" />
                    Minutes
                  </p>
                  <textarea
                    className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Notes"
                    value={minutesDraft.notes}
                    onChange={(e) => setMinutesDraft({ ...minutesDraft, notes: e.target.value })}
                  />
                  <textarea
                    className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Decisions"
                    value={minutesDraft.decisions}
                    onChange={(e) => setMinutesDraft({ ...minutesDraft, decisions: e.target.value })}
                  />
                  <textarea
                    className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Action items"
                    value={minutesDraft.action_items}
                    onChange={(e) => setMinutesDraft({ ...minutesDraft, action_items: e.target.value })}
                  />
                  <Button size="sm" disabled={busy} onClick={() => void publishMinutes()}>
                    Publish minutes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select a meeting to view details, agenda, and minutes.
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
