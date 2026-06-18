'use client';

import { useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { Loader2, Mail, User } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { useParentChild } from '@/context/ParentChildContext';
import { HrAvatar } from '@/components/hr/HrAvatar';
import { ParentPageHeader } from '@/components/parent/ParentPageHeader';

const ParentAcademicsChart = dynamic(
  () => import('@/components/parent/ParentAcademicsChart').then((m) => m.ParentAcademicsChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" /> },
);

type AcademicsSummary = {
  sgpa: string | null;
  marks_progression: Array<{
    course_code: string;
    course_name: string;
    mid_term: string | null;
    mid_max: string | null;
    end_term: string | null;
    end_max: string | null;
  }>;
  attendance_summary: Array<{ course_code: string; course_name: string; attendance_percent: string }>;
  revaluation_reports?: Array<{
    exam_application_id: string;
    subject_name: string;
    subject_code: string;
    original_marks: string | number | null;
    revised_marks: string | number | null;
    report_notes: string | null;
    published_at: string | null;
  }>;
  exam_reports?: Array<{
    report_id: string;
    course_code: string;
    course_name: string;
    exam_type: string;
    marks_obtained: string | number;
    max_marks: string | number;
    percent: string | number | null;
    grade: string | null;
    result_status: string;
    report_summary: string | null;
    declared_at: string;
  }>;
};

type ProctorInfo = {
  proctor: { name: string; email: string; department: string | null; proctor_user_id: string } | null;
  pending_meeting: { meeting_id: string; status: string } | null;
};

export default function ParentAcademicsPage() {
  const api = useAuthedApi();
  const { selectedChildId, selectedChild, loading: childLoading } = useParentChild();
  const [requesting, setRequesting] = useState(false);

  const { data: academics, isLoading: academicsLoading } = useSWR<AcademicsSummary>(
    selectedChildId ? ['parent-academics', selectedChildId] : null,
    () => api.get<AcademicsSummary>(`/api/parent/students/${selectedChildId}/academics`),
    { revalidateOnFocus: true },
  );

  const { data: proctorData, mutate: refreshProctor } = useSWR<ProctorInfo>(
    selectedChildId ? ['parent-proctor', selectedChildId] : null,
    () => api.get<ProctorInfo>(`/api/parent/students/${selectedChildId}/proctor`),
  );

  async function requestMeeting() {
    if (!selectedChildId) return;
    setRequesting(true);
    try {
      await api.post(`/api/parent/students/${selectedChildId}/proctor/meeting-request`, {
        note: `Parent of ${selectedChild?.name ?? 'student'} requested a PTM update.`,
      });
      toast.success('Meeting request sent to proctor inbox');
      await refreshProctor();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRequesting(false);
    }
  }

  if (childLoading || academicsLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ParentPageHeader
        title="Academic Health"
        description="Marks progression, attendance summary, and proctor connect for your child."
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <Card className="border-sgvu-navy/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Current SGPA</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-black text-sgvu-navy">{academics?.sgpa ?? '—'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mid-Term vs End-Term</CardTitle>
        </CardHeader>
        <CardContent>
          <ParentAcademicsChart data={academics?.marks_progression ?? []} />
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Course Attendance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(academics?.attendance_summary ?? []).map((row) => (
            <div
              key={row.course_code}
              className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
            >
              <span className="font-medium text-sgvu-navy">{row.course_name}</span>
              <span className="font-bold text-sgvu-gold">{row.attendance_percent}%</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {(academics?.revaluation_reports?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Re-evaluation Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {academics!.revaluation_reports!.map((report) => (
              <div key={report.exam_application_id} className="rounded-xl border px-3 py-3 text-sm">
                <p className="font-semibold text-sgvu-navy">
                  {report.subject_name} ({report.subject_code})
                </p>
                {report.original_marks != null || report.revised_marks != null ? (
                  <p className="mt-1 text-muted-foreground">
                    Marks: {report.original_marks ?? '—'} → {report.revised_marks ?? '—'}
                  </p>
                ) : null}
                {report.report_notes ? (
                  <p className="mt-2 whitespace-pre-wrap">{report.report_notes}</p>
                ) : null}
                {report.published_at ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Published {String(report.published_at).slice(0, 10)}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(academics?.exam_reports?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Declared Exam Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {academics!.exam_reports!.map((report) => (
              <div key={report.report_id} className="rounded-xl border px-3 py-3 text-sm">
                <p className="font-semibold text-sgvu-navy">
                  {report.course_name} ({report.course_code}) · {report.exam_type.replace('_', ' ')}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Marks: {report.marks_obtained}/{report.max_marks}
                  {report.percent != null ? ` (${report.percent}%)` : ''}
                  {report.grade ? ` · Grade ${report.grade}` : ''}
                </p>
                {report.report_summary ? <p className="mt-2">{report.report_summary}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-sgvu-gold/30 bg-gradient-to-br from-white to-amber-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Proctor Connect</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {proctorData?.proctor ? (
            <div className="flex items-start gap-3">
              <HrAvatar name={proctorData.proctor.name} size="lg" />
              <div>
                <p className="font-bold text-sgvu-navy">{proctorData.proctor.name}</p>
                <p className="text-xs text-muted-foreground">{proctorData.proctor.department ?? 'Faculty'}</p>
                <a
                  href={`mailto:${proctorData.proctor.email}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sgvu-navy underline"
                >
                  <Mail className="h-3 w-3" />
                  {proctorData.proctor.email}
                </a>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              Proctor not assigned yet.
            </p>
          )}
          <Button
            className="w-full bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
            disabled={requesting || !proctorData?.proctor || Boolean(proctorData?.pending_meeting)}
            onClick={() => void requestMeeting()}
          >
            {proctorData?.pending_meeting ? 'Meeting request pending' : 'Request Call / Meeting'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
