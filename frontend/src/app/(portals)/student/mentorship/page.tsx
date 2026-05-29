'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthedApi } from '@/lib/api';

interface ProctorInfo {
  mentorship_id: string;
  assigned_at: string;
  proctor: {
    user_id: string;
    name: string;
    email: string;
    dept_id: number | null;
    department: string | null;
  };
}

export default function StudentMentorshipPage() {
  const api = useAuthedApi();
  const [proctor, setProctor] = useState<ProctorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [meetingLoading, setMeetingLoading] = useState<string | null>(null);

  useEffect(() => {
    api.get<ProctorInfo>('/api/academics/proctor/me')
      .then(data => {
        setProctor(data);
        setLoading(false);
      })
      .catch(err => {
        toast.error(err.message || 'Failed to load proctor info');
        setLoading(false);
      });
  }, [api]);

  async function bookMeeting(slot: string) {
    setMeetingLoading(slot);
    try {
      const date = new Date();
      const [time, meridian] = slot.split(' ');
      const [hoursRaw, minutesRaw] = time.split(':').map(Number);
      const normalizedHours = meridian === 'PM' && hoursRaw !== 12 ? hoursRaw + 12 : hoursRaw === 12 && meridian === 'AM' ? 0 : hoursRaw;
      date.setHours(normalizedHours, minutesRaw, 0, 0);
      await api.post('/api/academics/proctor/meetings', {
        meeting_at: date.toISOString(),
        note: 'Meeting requested from student portal',
      });
      toast.success('Meeting request sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to book meeting');
    } finally {
      setMeetingLoading(null);
    }
  }

  async function sendMessage() {
    if (!message.trim() || !proctor) return;
    setSendingMessage(true);
    try {
      // Create a helpdesk ticket assigned directly to the proctor
      await api.post('/api/helpdesk/tickets', {
        category: 'MENTORSHIP',
        subject: 'Message from student via Mentorship Portal',
        description: message.trim(),
        assigned_to_user_id: proctor.proctor.user_id,
      });
      setMessage('');
      toast.success('Message sent to proctor');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Proctor / Mentorship Connect</h2>
        <p className="mt-1 text-sm text-muted-foreground">Direct mentorship line for meetings, approvals, and confidential academic guidance.</p>
      </section>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {!loading && !proctor && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No proctor assigned yet. Please contact your department.</p>
          </CardContent>
        </Card>
      )}

      {!loading && proctor && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Proctor Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback>{proctor.proctor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{proctor.proctor.name}</p>
                    <p className="text-xs text-muted-foreground">{proctor.proctor.department || 'Department of CSE'}</p>
                    <p className="text-xs text-muted-foreground">{proctor.proctor.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Book a 15-min Meeting</CardTitle>
            <Badge>Calendly-style slots</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {['10:00 AM', '11:30 AM', '2:15 PM', '4:30 PM'].map((slot) => (
              <Button key={slot} variant="outline" className="w-full" onClick={() => bookMeeting(slot)} disabled={meetingLoading === slot}>
                {meetingLoading === slot ? <Loader2 className="h-4 w-4 animate-spin" /> : slot}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Permissions / Leave Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Reason for leave / exemption" />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" />
              <Input type="date" />
            </div>
            <Button className="w-full">Send to Proctor</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages / Complaints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border p-3 text-sm">
              <p className="rounded-md bg-muted p-2">Student: Ma&apos;am, I need guidance on my back paper revaluation.</p>
              <p className="rounded-md bg-sgvu-gold/20 p-2">Proctor: Meet me tomorrow with your marksheet copy.</p>
            </div>
            <Input placeholder="Type a message to your proctor..." value={message} onChange={(event) => setMessage(event.target.value)} />
            <Button className="w-full" onClick={sendMessage} disabled={sendingMessage || !message.trim()}>
              {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Message'}
            </Button>
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
