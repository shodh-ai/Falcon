'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { TimetableWidget } from '@/components/student/TimetableWidget';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Bell, CalendarClock, CreditCard, GraduationCap, Sparkles, UserRoundCheck } from 'lucide-react';
import type { TimetableSlot } from '@/lib/mock/student-dashboard';
import { useAuthedApi } from '@/lib/api';

type Summary = {
  cgpa: number;
  credits_completed: number;
  credits_required: number;
  attendance_percent: number;
};

type Alert = {
  notification_id: string;
  title: string;
  message: string | null;
  is_read: boolean;
};

type TimetableResponse = {
  timetable_id: string;
  course_name: string;
  room: string | null;
  faculty_name: string | null;
  start_time: string;
  end_time: string;
  status: 'upcoming' | 'ongoing' | 'done';
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const api = useAuthedApi();
  const firstName = user?.name?.split(' ')[0] ?? 'Student';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [metricsResult, alertsResult, timetableResult] = await Promise.allSettled([
          api.get<Summary>('/api/academics/dashboard/metrics'),
          api.get<Alert[]>('/api/notifications?limit=10'),
          api.get<TimetableResponse[]>('/api/academics/dashboard/timetable/today'),
        ]);

        if (metricsResult.status === 'fulfilled') setSummary(metricsResult.value);
        if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value);
        else setAlerts([]);

        const timetableRows = timetableResult.status === 'fulfilled' ? timetableResult.value : [];
        setTimetable(
          timetableRows.map((slot) => ({
            id: slot.timetable_id,
            subject: slot.course_name,
            room: `${slot.room ?? 'Room TBA'}${slot.faculty_name ? ` · ${slot.faculty_name}` : ''}`,
            start: slot.start_time.slice(0, 5),
            end: slot.end_time.slice(0, 5),
            status: slot.status,
          })),
        );
      } catch (error) {
        console.error('Failed to load dashboard', error);
      }
    }
    void loadDashboard();
  }, [api]);

  const unreadAlerts = alerts.filter((alert) => !alert.is_read);
  const attendance = summary?.attendance_percent ?? 0;
  const attendanceTone = attendance >= 75 ? 'success' : 'warning';

  return (
    <StudentPageShell>
      <section className="overflow-hidden rounded-[2rem] border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 p-6 text-white shadow-xl shadow-sgvu-navy/15 md:p-8">
        <div className="relative">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sgvu-gold/20 blur-3xl" />
          <div className="relative">
            <p className="flex items-center gap-2 text-sm font-medium text-sgvu-gold">
              <Sparkles className="h-4 w-4" />
              {greeting()}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Hi, {firstName}</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium text-white/75">
              Your academic health at a glance — performance, credits, attendance, and today&apos;s schedule.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StudentStatCard
          label="Overall CGPA"
          value={(summary?.cgpa ?? 8.2).toFixed(2)}
          helper="Cumulative grade point average"
          icon={GraduationCap}
          tone="gold"
        />
        <StudentStatCard
          label="Credits"
          value={`${summary?.credits_completed ?? 108} / ${summary?.credits_required ?? 160}`}
          helper="Graduation progress"
          icon={CreditCard}
        />
        <StudentStatCard
          label="Attendance"
          value={`${attendance}%`}
          helper={attendance >= 75 ? 'Above minimum threshold' : 'Below 75% minimum'}
          icon={UserRoundCheck}
          tone={attendanceTone}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <StudentSectionCard
          title="Alerts & Notifications"
          description="Unread updates from academics, finance, and campus services"
          icon={Bell}
          className="lg:col-span-2"
        >
          {unreadAlerts.length === 0 ? (
            <StudentEmptyState
              icon={Bell}
              title="All caught up"
              description="No unread alerts right now. Check back later for updates."
            />
          ) : (
            <div className="space-y-3">
              {unreadAlerts.map((alert) => (
                <div
                  key={alert.notification_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white p-4 transition hover:border-sgvu-gold/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sgvu-navy">{alert.title}</p>
                    {alert.message ? <p className="mt-0.5 text-xs text-muted-foreground">{alert.message}</p> : null}
                  </div>
                  <Badge variant="warning" className="shrink-0">
                    New
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </StudentSectionCard>

        <StudentSectionCard title="Attendance trend" description="Current semester vs minimum required" icon={CalendarClock}>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Present</span>
                <span className="font-bold text-sgvu-navy">{attendance}%</span>
              </div>
              <Progress value={attendance} className="h-2.5" />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Minimum required</span>
                <span className="font-bold text-sgvu-navy">75%</span>
              </div>
              <Progress value={75} className="h-2.5" />
            </div>
            <p className="text-xs text-muted-foreground">Subject-wise breakdown is available under Attendance & Progression.</p>
          </div>
        </StudentSectionCard>
      </div>

      <TimetableWidget slots={timetable} />
    </StudentPageShell>
  );
}
