'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, UserRound } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuthedApi } from '@/lib/api';
import { StudentMeetingSlots, type StudentMeeting } from '@/components/mentorship/StudentMeetingSlots';
import { MentorshipStudentChat } from '@/components/mentorship/MentorshipStudentChat';

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
  const [meetingLoading, setMeetingLoading] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<StudentMeeting[]>([]);
  const [meetingDate, setMeetingDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<
    { interaction_id: string; reason: string; start_date: string; end_date: string; status: string }[]
  >([]);

  function loadLeaveRequests() {
    void api.get<typeof leaveRequests>('/api/academics/proctor/leave-requests/my').then(setLeaveRequests).catch(() => setLeaveRequests([]));
  }

  function loadMeetings() {
    void api.get<StudentMeeting[]>('/api/academics/proctor/meetings/my').then(setMeetings).catch(() => setMeetings([]));
  }

  useEffect(() => {
    api
      .get<MentorAssignmentResponse>('/api/academics/proctor/me')
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

  /** Parse a slot label (e.g. '10:00 AM') + a date string ('YYYY-MM-DD') into a Date. */
  function parseSlotDateTime(slot: string, dateStr: string): Date {
    const [time, meridian] = slot.split(' ');
    const [hoursRaw, minutesRaw] = time.split(':').map(Number);
    const normalizedHours =
      meridian === 'PM' && hoursRaw !== 12 ? hoursRaw + 12 : hoursRaw === 12 && meridian === 'AM' ? 0 : hoursRaw;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, normalizedHours, minutesRaw, 0, 0);
  }

  /** Today and max date (2 weeks ahead) as YYYY-MM-DD for the date picker bounds. */
  const { todayStr, maxDateStr } = useMemo(() => {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const max = new Date();
    max.setDate(max.getDate() + 14);
    return { todayStr: fmt(now), maxDateStr: fmt(max) };
  }, []);

  /** Returns true if the given slot has already passed for the selected date. */
  function isSlotPassed(slot: string): boolean {
    return parseSlotDateTime(slot, meetingDate) < new Date();
  }

  async function bookMeeting(slot: string) {
    if (isSlotPassed(slot)) {
      toast.error('This time slot has already passed. Please choose a later slot or a future date.');
      return;
    }
    setMeetingLoading(slot);
    try {
      const date = parseSlotDateTime(slot, meetingDate);
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
      await api.post('/api/academics/proctor/leave-requests', { reason, start_date: leaveStart, end_date: leaveEnd });
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

  const mentorProfile = mentor?.proctor;

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Mentorship Connect"
        description="Direct line to your mentor for meetings, approvals, and confidential academic guidance."
      />

      {loading && <StudentLoadingState label="Loading mentor details…" />}

      {!loading && !mentor && (
        <StudentEmptyState
          icon={UserRound}
          title="No mentor assigned"
          description="Please contact your department to get a mentor assigned."
        />
      )}

      {!loading && mentor && mentorProfile && (
        <>
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <StudentSectionCard title="Your mentor" description="Assigned faculty mentor" icon={UserRound} tone="gold">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-sgvu-gold/30">
                  <AvatarFallback className="bg-sgvu-navy/5 text-lg font-bold text-sgvu-navy">
                    {mentorProfile.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-bold text-sgvu-navy">{mentorProfile.name}</p>
                  <p className="text-sm text-muted-foreground">{mentorProfile.department || 'Department of CSE'}</p>
                  <p className="text-xs text-muted-foreground">{mentorProfile.email}</p>
                </div>
              </div>
            </StudentSectionCard>

            <StudentSectionCard title="Book a 15-min meeting" description="Pick a date & select an available slot" icon={CalendarClock}>
              <div className="mb-3 flex items-center gap-3">
                <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Meeting date</label>
                <Input
                  type="date"
                  className="max-w-[180px]"
                  value={meetingDate}
                  min={todayStr}
                  max={maxDateStr}
                  onChange={(e) => setMeetingDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {['10:00 AM', '11:30 AM', '2:15 PM', '4:30 PM'].map((slot) => {
                  const passed = isSlotPassed(slot);
                  return (
                    <Button
                      key={slot}
                      variant="outline"
                      className={`w-full ${passed ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => bookMeeting(slot)}
                      disabled={passed || meetingLoading === slot}
                      title={passed ? 'This slot has already passed' : `Book meeting at ${slot}`}
                    >
                      {meetingLoading === slot ? <Loader2 className="h-4 w-4 animate-spin" /> : slot}
                    </Button>
                  );
                })}
              </div>
            </StudentSectionCard>
          </div>

          <StudentMeetingSlots meetings={meetings} />

          <div className="grid gap-6 lg:grid-cols-2">
            <StudentSectionCard title="Permissions / leave requests" description="Request mentor approval for leave" icon={CalendarClock}>
              <div className="space-y-3">
                <Input placeholder="Reason for leave / exemption" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
                    <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
                    <Input type="date" value={leaveEnd} min={leaveStart || undefined} onChange={(e) => setLeaveEnd(e.target.value)} />
                  </div>
                </div>
                <Button className="w-full" onClick={() => void sendLeaveRequest()} disabled={submittingLeave}>
                  {submittingLeave ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send to mentor'}
                </Button>
                {leaveRequests.length > 0 && (
                  <ul className="space-y-2 border-t pt-3 text-sm">
                    {leaveRequests.slice(0, 3).map((r) => (
                      <li key={r.interaction_id} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-white p-3">
                        <span className="text-muted-foreground">
                          {r.start_date} – {r.end_date}: {r.reason.slice(0, 40)}
                          {r.reason.length > 40 ? '…' : ''}
                        </span>
                        <Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                          {r.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </StudentSectionCard>

            <MentorshipStudentChat />
          </div>
        </>
      )}
    </StudentPageShell>
  );
}
