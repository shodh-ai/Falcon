'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Loader2,
  Users,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';
import { RegistrarExamIntegrationPanel } from '@/components/admin/RegistrarExamIntegrationPanel';
import { useAuthedApi } from '@/lib/api';

type DirectoryPage = { total: number };
type VerificationRow = {
  user_id: string;
  name: string;
  official_email: string;
  role_name: string;
  portal_kind: string;
  submitted_at: string | null;
};
type IssuesDashboard = {
  kpis: { open_tickets: number; sla_breaches: number; avg_resolution_hours: number };
};

export default function AdminDashboardPage() {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [facultyCount, setFacultyCount] = useState<number | null>(null);
  const [pendingVerifications, setPendingVerifications] = useState<VerificationRow[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [issues, setIssues] = useState<IssuesDashboard['kpis'] | null>(null);
  const [recentBulkImports, setRecentBulkImports] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [students, faculty, queue, issuesData, bulkHistory] = await Promise.all([
        api.get<DirectoryPage>('/api/search/directory?role=Student&limit=1&page=1').catch(() => ({ total: 0 })),
        api.get<DirectoryPage>('/api/search/directory?role=Faculty&limit=1&page=1').catch(() => ({ total: 0 })),
        api.get<VerificationRow[]>('/api/admin/student-verifications/queue').catch(() => []),
        api.get<IssuesDashboard>('/api/leadership/issues').catch(() => null),
        api.get<Array<{ rows_imported: number }>>('/admissions/students/bulk-upload/history').catch(() => []),
      ]);
      const queueRows = Array.isArray(queue) ? queue : [];
      setStudentCount(students.total ?? 0);
      setFacultyCount(faculty.total ?? 0);
      setPendingVerifications(queueRows.slice(0, 5));
      setPendingCount(queueRows.length);
      setIssues(issuesData?.kpis ?? null);
      const bulkRows = Array.isArray(bulkHistory) ? bulkHistory : [];
      setRecentBulkImports(
        bulkRows.slice(0, 5).reduce((sum, row) => sum + Number(row.rows_imported ?? 0), 0),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="registrar-dashboard">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Registrar Command Center</h2>
        <p className="text-sm text-muted-foreground">
          Live counts from directory, verifications, and governance tickets
        </p>
      </section>

      {loadError ? (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active students</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Users className="h-6 w-6 text-sgvu-gold" />
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (studentCount ?? '—')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faculty records</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <GraduationCap className="h-6 w-6 text-sgvu-gold" />
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (facultyCount ?? '—')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending verifications</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl text-amber-700">
              <FileCheck2 className="h-6 w-6" />
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (pendingCount ?? '—')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open governance tickets</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <ClipboardList className="h-6 w-6 text-sgvu-gold" />
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                (issues?.open_tickets ?? '—')
              )}
            </CardTitle>
            {issues?.sla_breaches ? (
              <CardDescription className="text-destructive">
                {issues.sla_breaches} SLA breach{issues.sla_breaches === 1 ? '' : 'es'}
              </CardDescription>
            ) : null}
          </CardHeader>
        </Card>
      </div>

      {!loading && recentBulkImports != null && recentBulkImports > 0 ? (
        <p className="text-sm text-muted-foreground">
          Recent bulk intake: {recentBulkImports} student
          {recentBulkImports === 1 ? '' : 's'} imported in the last five upload runs.{' '}
          <Link href="/admin/upload-history" className="font-medium text-sgvu-navy underline">
            View upload history
          </Link>
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-sgvu-gold" />
              Student & staff verifications
            </CardTitle>
            <CardDescription>Pending onboarding approvals — newest first</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/verifications">Open full queue</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="flex items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </p>
          ) : pendingVerifications.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No pending verifications.</p>
          ) : (
            pendingVerifications.map((item) => (
              <div
                key={item.user_id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Badge variant="outline" className="mb-2">
                    {item.portal_kind} · {item.role_name}
                  </Badge>
                  <p className="font-semibold text-sgvu-navy">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.official_email}</p>
                </div>
                <Button asChild size="sm">
                  <Link href="/admin/verifications">Review</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ProfileCorrectionWidget limit={10} reviewHref="/admin/verifications" />

      <RegistrarExamIntegrationPanel compact />
    </div>
  );
}
