'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { Bell, Briefcase, CalendarClock, ChevronRight, CreditCard, GraduationCap, Sparkles, UserRoundCheck } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { AuthenticatedProfilePhoto } from '@/components/profile/AuthenticatedProfilePhoto';
import { NoticeBoardWidget } from '@/components/dashboard/NoticeBoardWidget';
import { useNotificationHistory, toAppNotification } from '@/hooks/useNotifications';
import { notificationsApi } from '@/lib/api/notifications';
import { handleNotificationAction } from '@/lib/notifications/notification-actions';
import { toast } from '@/lib/notifications/falcon-toast';

type Summary = {
  cgpa: number;
  credits_completed: number;
  credits_required: number;
  attendance_percent: number;
};

type OpenDrive = {
  drive_id: string;
  job_title?: string;
  job_role?: string;
  company_name: string;
  package_lpa?: string | number;
  min_cgpa?: string | number;
  is_dept_drive?: boolean;
};

type Profile = {
  profile_photo_url?: string | null;
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const api = useAuthedApi();
  const { notifications, refresh: refreshNotifications } = useNotificationHistory();
  const firstName = user?.name?.split(' ')[0] ?? 'Student';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [openDrives, setOpenDrives] = useState<OpenDrive[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [metricsResult, placementsResult, deptDrivesResult, profileResult] = await Promise.allSettled([
          api.get<Summary>('/api/academics/dashboard/metrics'),
          api.get<{ open_drives?: OpenDrive[]; open_jobs?: OpenDrive[] }>('/api/placement/student/hub'),
          api.get<Array<{ drive_id: string; company_name: string; job_role: string | null; registered?: boolean }>>(
            '/api/academics/student/placement/drives',
          ),
          api.get<Profile>('/api/student/profile'),
        ]);

        if (metricsResult.status === 'fulfilled') setSummary(metricsResult.value);
        if (placementsResult.status === 'fulfilled' || deptDrivesResult.status === 'fulfilled') {
          const campus =
            placementsResult.status === 'fulfilled'
              ? (placementsResult.value.open_drives ?? placementsResult.value.open_jobs ?? [])
              : [];
          const dept =
            deptDrivesResult.status === 'fulfilled'
              ? deptDrivesResult.value.map((d) => ({
                  drive_id: d.drive_id,
                  job_role: d.job_role ?? undefined,
                  company_name: d.company_name,
                  is_dept_drive: true,
                }))
              : [];
          setOpenDrives([...dept, ...campus].slice(0, 5));
        }
        if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
      } catch (error) {
        console.error('Failed to load dashboard', error);
      }
    }
    void loadDashboard();
  }, [api]);

  const alertItems = notifications.map(toAppNotification).filter((n) => n.unread).slice(0, 5);
  const attendance = summary?.attendance_percent ?? 0;
  const attendanceTone = attendance >= 75 ? 'success' : 'warning';

  const openAlert = async (id: string, actionLink: string | null | undefined) => {
    if (!token) return;
    try {
      await handleNotificationAction(token, actionLink, router);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open notification');
      return;
    }
    await notificationsApi.markRead(token, id).catch(() => undefined);
    await refreshNotifications();
  };

  const dismissAlert = async (id: string) => {
    if (!token) return;
    await refreshNotifications(
      (current) => current?.filter((row) => row.notification_id !== id) ?? [],
      { revalidate: false },
    );
    try {
      await notificationsApi.dismiss(token, id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!/404|not found/i.test(msg)) {
        toast.error('Could not remove notification');
        await refreshNotifications();
        return;
      }
    }
    await refreshNotifications();
    window.dispatchEvent(new Event('falcon:notifications-refresh'));
  };

  return (
    <StudentPageShell>
      <section className="overflow-hidden rounded-[2rem] border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 p-6 text-white shadow-xl shadow-sgvu-navy/15 md:p-8">
        <div className="relative">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sgvu-gold/20 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-sgvu-gold">
                <Sparkles className="h-4 w-4" />
                {greeting()}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Hi, {firstName}</h2>
              <p className="mt-2 max-w-2xl text-sm font-medium text-white/75">
                Your academic health at a glance — performance, credits, attendance, and today&apos;s schedule.
              </p>
            </div>
            {profile?.profile_photo_url ? (
              <AuthenticatedProfilePhoto
                photoUrl={profile.profile_photo_url}
                alt="Profile"
                className="h-16 w-16 shrink-0 rounded-full border-2 border-white/20 shadow-sm sm:h-20 sm:w-20"
              />
            ) : null}
          </div>
        </div>
      </section>

      <NoticeBoardWidget />

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
          description="Unread updates with clear next steps"
          icon={Bell}
          className="lg:col-span-2"
          action={
            <Link href="/notifications" className="text-xs font-semibold text-sgvu-navy hover:underline">
              View all
            </Link>
          }
        >
          {alertItems.length === 0 ? (
            <StudentEmptyState
              icon={Bell}
              title="All caught up"
              description="No unread alerts right now. Check back later for updates."
            />
          ) : (
            <div className="space-y-3">
              {alertItems.map((alert) => (
                <NotificationItem
                  key={alert.id}
                  notification={alert}
                  compact
                  onClick={() => void openAlert(alert.id, alert.actionLink)}
                  onDismiss={() => void dismissAlert(alert.id)}
                />
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

      <StudentSectionCard
        title="Open positions"
        description="Department drives and campus recruitment — apply from the Placements Hub"
        icon={Briefcase}
        action={
          <Link href="/student/placements" className="text-xs font-semibold text-sgvu-navy hover:underline">
            View all
          </Link>
        }
      >
        {openDrives.length === 0 ? (
          <StudentEmptyState
            icon={Briefcase}
            title="No open drives"
            description="New placement opportunities will appear here when announced."
          />
        ) : (
          <div className="space-y-3">
            {openDrives.map((drive) => (
              <Link
                key={drive.drive_id}
                href={`/student/placements?drive=${drive.drive_id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white p-4 transition hover:border-sgvu-gold/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {drive.is_dept_drive ? (
                      <Badge className="bg-sgvu-navy/10 text-sgvu-navy border border-sgvu-navy/20 text-[10px] shrink-0">
                        Dept drive
                      </Badge>
                    ) : null}
                    <p className="truncate font-semibold text-sgvu-navy">{drive.job_role ?? drive.job_title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {drive.company_name}
                    {drive.is_dept_drive
                      ? ' · Register on Placements Hub'
                      : ` · ₹${Number(drive.package_lpa ?? 0).toFixed(1)} LPA · Min CGPA ${drive.min_cgpa}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
