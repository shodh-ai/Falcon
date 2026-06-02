'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { TimetableWidget } from '@/components/student/TimetableWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Bell, CalendarClock, CreditCard, GraduationCap, UserRoundCheck } from 'lucide-react';
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

        if (metricsResult.status === 'fulfilled') {
          setSummary(metricsResult.value);
        } else {
          console.error('Failed to load dashboard metrics', metricsResult.reason);
        }

        if (alertsResult.status === 'fulfilled') {
          setAlerts(alertsResult.value);
        } else {
          console.warn('Notifications unavailable', alertsResult.reason);
          setAlerts([]);
        }

        const timetableRows =
          timetableResult.status === 'fulfilled' ? timetableResult.value : [];
        if (timetableResult.status === 'rejected') {
          console.error('Failed to load timetable', timetableResult.reason);
        }

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

  const stats = [
    { label: 'Overall CGPA', value: '8.42', helper: 'Up by 0.12 from last semester', icon: GraduationCap },
    { label: 'Credits', value: `${summary?.credits_completed ?? 108} / ${summary?.credits_required ?? 160}`, helper: 'Graduation progress', icon: CreditCard },
    { label: 'Attendance', value: `${summary?.attendance_percent ?? 84}%`, helper: 'Current semester', icon: UserRoundCheck },
  ];
  stats[0].value = `${summary?.cgpa ?? 8.2}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <p className="text-sm font-medium text-sgvu-gold">Good afternoon</p>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Hi, {firstName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your academic health at a glance: performance, credits, attendance, and mentor touchpoints.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <Icon className="h-4 w-4 text-sgvu-gold" />
                </div>
                <p className="mt-2 text-2xl font-bold text-sgvu-navy">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-sgvu-gold" />
              Alerts & Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 && (
              <p className="text-sm text-muted-foreground">No unread alerts right now.</p>
            )}
            {alerts
              .filter((alert) => !alert.is_read)
              .map((alert) => (
              <div key={alert.notification_id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{alert.title}</p>
                  {alert.message && <p className="text-xs text-muted-foreground">{alert.message}</p>}
                </div>
                <Badge variant="warning" className="shrink-0">
                  new
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-sgvu-gold" />
              Attendance trend
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>Present</span>
                <span className="font-semibold">{summary?.attendance_percent ?? 0}%</span>
              </div>
              <Progress value={summary?.attendance_percent ?? 0} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>Minimum Required</span>
                <span className="font-semibold">75%</span>
              </div>
              <Progress value={75} />
            </div>
            <p className="text-xs text-muted-foreground">Subject-wise attendance is available in Academics.</p>
          </CardContent>
        </Card>
      </div>

      <TimetableWidget slots={timetable} />
    </div>
  );
}
