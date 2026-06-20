'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellMentorMeeting } from '@/lib/api/api.ecell';

export function EcellMentorInbox() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [inbox, setInbox] = useState<EcellMentorMeeting[]>([]);
  const [feedbackQueue, setFeedbackQueue] = useState<EcellMentorMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [acceptId, setAcceptId] = useState<string | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const load = useCallback(async () => {
    const [pending, feedback] = await Promise.all([
      ecellApi.mentorInbox(),
      ecellApi.mentorFeedbackPending(),
    ]);
    setInbox(pending);
    setFeedbackQueue(feedback);
  }, [ecellApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load E-Cell mentor inbox'))
      .finally(() => setLoading(false));
  }, [load]);

  async function accept(id: string) {
    if (input.trim().length < 3) {
      toast.error('Add a Google Meet link or cabin number');
      return;
    }
    setBusy(id);
    try {
      await ecellApi.acceptMentorMeeting(id, input.trim());
      toast.success('Meeting accepted');
      setAcceptId(null);
      setInput('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept');
    } finally {
      setBusy(null);
    }
  }

  async function decline(id: string) {
    if (input.trim().length < 3) {
      toast.error('Decline reason is required');
      return;
    }
    setBusy(id);
    try {
      await ecellApi.declineMentorMeeting(id, input.trim());
      toast.success('Meeting declined');
      setDeclineId(null);
      setInput('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setBusy(null);
    }
  }

  async function submitFeedback(id: string) {
    if (input.trim().length < 3) {
      toast.error('Please enter brief feedback');
      return;
    }
    setBusy(id);
    try {
      await ecellApi.submitMentorFeedback(id, input.trim());
      toast.success('Feedback submitted');
      setFeedbackId(null);
      setInput('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit feedback');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading E-Cell mentor requests…</p>;

  const pending = inbox.filter((m) => m.status === 'PENDING');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">E-Cell Startup Mentoring Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending startup mentoring requests.</p>
          ) : (
            pending.map((meeting) => (
              <div key={meeting.meeting_id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sgvu-navy">{meeting.startup_name}</p>
                    <p className="text-sm text-muted-foreground">{meeting.founder_name}</p>
                  </div>
                  <Badge>{meeting.status}</Badge>
                </div>
                <p className="mt-2 text-sm">{meeting.topic}</p>
                <p className="text-sm text-muted-foreground">{new Date(meeting.requested_time).toLocaleString()}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => { setAcceptId(meeting.meeting_id); setDeclineId(null); setInput(''); }}>
                    <Check className="mr-1 h-4 w-4" /> Accept
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { setDeclineId(meeting.meeting_id); setAcceptId(null); setInput(''); }}>
                    <X className="mr-1 h-4 w-4" /> Decline
                  </Button>
                </div>
                {acceptId === meeting.meeting_id ? (
                  <div className="mt-3 space-y-2">
                    <Input placeholder="Google Meet link or cabin number" value={input} onChange={(e) => setInput(e.target.value)} />
                    <Button size="sm" disabled={busy === meeting.meeting_id} onClick={() => void accept(meeting.meeting_id)}>
                      Confirm Accept
                    </Button>
                  </div>
                ) : null}
                {declineId === meeting.meeting_id ? (
                  <div className="mt-3 space-y-2">
                    <Input placeholder="Reason for declining" value={input} onChange={(e) => setInput(e.target.value)} />
                    <Button size="sm" variant="destructive" disabled={busy === meeting.meeting_id} onClick={() => void decline(meeting.meeting_id)}>
                      Confirm Decline
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {feedbackQueue.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback Needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {feedbackQueue.map((meeting) => (
              <div key={meeting.meeting_id} className="rounded-xl border p-4">
                <p className="font-semibold">{meeting.startup_name}</p>
                <p className="text-sm text-muted-foreground">{meeting.topic}</p>
                {feedbackId === meeting.meeting_id ? (
                  <div className="mt-3 space-y-2">
                    <Input placeholder="Brief session feedback for Incubation Admin" value={input} onChange={(e) => setInput(e.target.value)} />
                    <Button size="sm" disabled={busy === meeting.meeting_id} onClick={() => void submitFeedback(meeting.meeting_id)}>
                      Submit Feedback
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" className="mt-3" variant="outline" onClick={() => { setFeedbackId(meeting.meeting_id); setInput(''); }}>
                    Leave Feedback
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
