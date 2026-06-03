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
import { StudentMeetingSlots, type StudentMeeting } from '@/components/mentorship/StudentMeetingSlots';

/** API response shape (`proctor` field kept for backend compatibility). */
interface MentorAssignmentResponse {
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
  const [mentor, setMentor] = useState<MentorAssignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [meetingLoading, setMeetingLoading] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<StudentMeeting[]>([]);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<
    { interaction_id: string; reason: string; start_date: string; end_date: string; status: string }[]
  >([]);

  function loadLeaveRequests() {
    void api
      .get<typeof leaveRequests>('/api/academics/proctor/leave-requests/my')
      .then(setLeaveRequests)
      .catch(() => setLeaveRequests([]));
  }

  function loadMeetings() {
    void api
      .get<StudentMeeting[]>('/api/academics/proctor/meetings/my')
      .then(setMeetings)
      .catch(() => setMeetings([]));
  }

  useEffect(() => {
    api.get<MentorAssignmentResponse>('/api/academics/proctor/me')
      .then((data) => {
        setMentor(data);
        setLoading(false);
        loadMeetings();
        loadLeaveRequests();
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load mentor info');
        setLoading(false);
      });
  }, [api]);

  async function bookMeeting(slot: string) {
    setMeetingLoading(slot);
    try {
      const date = new Date();
      const [time, meridian] = slot.split(' ');
      const [hoursRaw, minutesRaw] = time.split(':').map(Number);
      const normalizedHours =
        meridian === 'PM' && hoursRaw !== 12
          ? hoursRaw + 12
          : hoursRaw === 12 && meridian === 'AM'
            ? 0
            : hoursRaw;
      date.setHours(normalizedHours, minutesRaw, 0, 0);
      await api.post('/api/academics/proctor/meetings', {
        meeting_at: date.toISOString(),
        note: 'Meeting requested from student portal',
      });
      toast.success('Meeting request sent — awaiting mentor approval');
      loadMeetings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to book meeting');
    } finally {
      setMeetingLoading(null);
    }
  }

  async function sendLeaveRequest() {
    const reason = leaveReason.trim();
    if (!reason) {
      toast.error('Please enter a reason for leave or permission');
      return;
    }
    if (!leaveStart || !leaveEnd) {
      toast.error('Please select start and end dates');
      return;
    }
    if (leaveEnd < leaveStart) {
      toast.error('End date cannot be before start date');
      return;
    }
    setSubmittingLeave(true);
    try {
      await api.post('/api/academics/proctor/leave-requests', {
        reason,
        start_date: leaveStart,
        end_date: leaveEnd,
      });
      setLeaveReason('');
      setLeaveStart('');
      setLeaveEnd('');
      toast.success('Leave request sent to your mentor');
      loadLeaveRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to send leave request');
    } finally {
      setSubmittingLeave(false);
    }
  }

  async function sendMessage() {
    const text = message.trim();
    if (!text || !mentor) return;
    if (text.length < 3) {
      toast.error('Please enter at least a few characters for your message');
      return;
    }
    setSendingMessage(true);
    try {
      await api.post('/api/academics/proctor/messages', { message: text });
      setMessage('');
      toast.success('Message sent to your mentor');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  const mentorProfile = mentor?.proctor;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Mentorship Connect</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Direct line to your mentor for meetings, approvals, and confidential academic guidance.
        </p>
      </section>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {!loading && !mentor && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No mentor assigned yet. Please contact your department.</p>
          </CardContent>
        </Card>
      )}

      {!loading && mentor && mentorProfile && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Your mentor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback>
                      {mentorProfile.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{mentorProfile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {mentorProfile.department || 'Department of CSE'}
                    </p>
                    <p className="text-xs text-muted-foreground">{mentorProfile.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Book a 15-min meeting</CardTitle>
                <Badge>Meeting slots</Badge>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                {['10:00 AM', '11:30 AM', '2:15 PM', '4:30 PM'].map((slot) => (
                  <Button
                    key={slot}
                    variant="outline"
                    className="w-full"
                    onClick={() => bookMeeting(slot)}
                    disabled={meetingLoading === slot}
                  >
                    {meetingLoading === slot ? <Loader2 className="h-4 w-4 animate-spin" /> : slot}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          <StudentMeetingSlots meetings={meetings} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Permissions / leave requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Reason for leave / exemption"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={leaveStart}
                      onChange={(e) => setLeaveStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={leaveEnd}
                      min={leaveStart || undefined}
                      onChange={(e) => setLeaveEnd(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => void sendLeaveRequest()}
                  disabled={submittingLeave}
                >
                  {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send to mentor'}
                </Button>
                {leaveRequests.length > 0 && (
                  <ul className="space-y-2 border-t pt-3 text-sm">
                    {leaveRequests.slice(0, 3).map((r) => (
                      <li key={r.interaction_id} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {r.start_date} – {r.end_date}: {r.reason.slice(0, 40)}
                          {r.reason.length > 40 ? '…' : ''}
                        </span>
                        <Badge variant={r.status === 'APPROVED' ? 'default' : r.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                          {r.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Messages / complaints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border p-3 text-sm">
                  <p className="rounded-md bg-muted p-2">
                    Mentee: Ma&apos;am, I need guidance on my back paper revaluation.
                  </p>
                  <p className="rounded-md bg-sgvu-gold/20 p-2">
                    Mentor: Meet me tomorrow with your marksheet copy.
                  </p>
                </div>
                <Input
                  placeholder="Type a message to your mentor…"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <Button className="w-full" onClick={sendMessage} disabled={sendingMessage || !message.trim()}>
                  {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send message'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
