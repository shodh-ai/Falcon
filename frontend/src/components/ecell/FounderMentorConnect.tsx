'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellMentor, type EcellMentorMeeting } from '@/lib/api/api.ecell';

export function FounderMentorConnect() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [mentors, setMentors] = useState<EcellMentor[]>([]);
  const [meetings, setMeetings] = useState<EcellMentorMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EcellMentor | null>(null);
  const [topic, setTopic] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void Promise.all([ecellApi.mentors(), ecellApi.myMentorMeetings()])
      .then(([m, mtg]) => {
        setMentors(m);
        setMeetings(mtg);
      })
      .catch(() => toast.error('Could not load mentors'))
      .finally(() => setLoading(false));
  }, [ecellApi]);

  async function requestMeeting() {
    if (!selected || !topic.trim() || !requestedTime) {
      toast.error('Select a mentor, topic, and time');
      return;
    }
    setSubmitting(true);
    try {
      await ecellApi.requestMentorMeeting({
        mentor_user_id: selected.user_id,
        topic: topic.trim(),
        requested_time: new Date(requestedTime).toISOString(),
      });
      toast.success('Mentor meeting requested');
      setSelected(null);
      setTopic('');
      setRequestedTime('');
      setMeetings(await ecellApi.myMentorMeetings());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading mentor directory…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mentor Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mentors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mentors available yet.</p>
          ) : (
            mentors.map((mentor) => (
              <button
                key={mentor.user_id}
                type="button"
                onClick={() => setSelected(mentor)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selected?.user_id === mentor.user_id ? 'border-sgvu-gold ring-2 ring-sgvu-gold/30' : 'hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sgvu-navy">{mentor.name}</p>
                  <Badge variant="secondary">{mentor.mentor_type}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {mentor.expertise_label}
                  {mentor.dept_name ? ` · ${mentor.dept_name}` : ''}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selected ? `Requesting: ${selected.name}` : 'Select a mentor from the directory'}
            </p>
            <Input placeholder="Topic / pitch focus" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <Input
              type="datetime-local"
              value={requestedTime}
              onChange={(e) => setRequestedTime(e.target.value)}
            />
            <Button disabled={!selected || submitting} onClick={() => void requestMeeting()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Request Meeting
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {meetings.length === 0 ? (
              <p className="text-muted-foreground">No mentor meetings yet.</p>
            ) : (
              meetings.map((m) => (
                <div key={m.meeting_id} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{m.mentor_name ?? 'Mentor'}</p>
                    <Badge>{m.status}</Badge>
                  </div>
                  <p className="text-muted-foreground">{m.topic}</p>
                  <p>{new Date(m.requested_time).toLocaleString()}</p>
                  {m.meeting_link ? <p className="text-sgvu-navy">Link/Room: {m.meeting_link}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
