'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { TimetableWidget } from '@/components/student/TimetableWidget';
import { AttendanceMeterWidget } from '@/components/student/AttendanceMeterWidget';
import { FinancialDuesWidget } from '@/components/student/FinancialDuesWidget';
import { GatePassDialog } from '@/components/student/GatePassDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  mockAttendance,
  mockFeeDues,
  mockTimetableToday,
} from '@/lib/mock/student-dashboard';
import { GraduationCap, BookOpen } from 'lucide-react';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? 'Student';
  const hallTicketBlocked = mockAttendance.percentage < 75 || mockFeeDues.totalPending > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <p className="text-sm font-medium text-sgvu-gold">Good afternoon</p>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">Hi, {firstName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s where you stand today — classes, attendance, and fees at a glance.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="lg:col-span-2">
          <TimetableWidget slots={mockTimetableToday} />
        </div>
        <div className="space-y-4 lg:space-y-6">
          <AttendanceMeterWidget
            percentage={mockAttendance.percentage}
            present={mockAttendance.present}
            total={mockAttendance.total}
            minimumRequired={mockAttendance.minimumRequired}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
        <FinancialDuesWidget
          totalPending={mockFeeDues.totalPending}
          dueDate={mockFeeDues.dueDate}
          items={mockFeeDues.items}
        />

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <GatePassDialog />
            <Button asChild variant="outline" className="w-full justify-start gap-2 touch-target" size="lg">
              <Link href="/student/courses">
                <BookOpen className="h-5 w-5 text-sgvu-gold" />
                Course Registration (CBCS)
              </Link>
            </Button>
            <div className="rounded-xl border border-dashed border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-semibold text-sgvu-navy">
                    <GraduationCap className="h-5 w-5" />
                    Hall Ticket
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hallTicketBlocked
                      ? 'Blocked: attendance below 75% or fees pending.'
                      : 'Ready to download.'}
                  </p>
                </div>
                {hallTicketBlocked && <Badge variant="destructive">Locked</Badge>}
              </div>
              <Button
                asChild={!hallTicketBlocked}
                disabled={hallTicketBlocked}
                className="mt-4 w-full"
                variant={hallTicketBlocked ? 'outline' : 'default'}
              >
                {hallTicketBlocked ? (
                  <span>Download unavailable</span>
                ) : (
                  <Link href="/student/exams">Download Hall Ticket</Link>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
