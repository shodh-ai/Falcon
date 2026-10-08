'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyMetricChip,
} from '@/components/faculty';
import { isEmptyArray, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoAtRiskStudents } from '@/lib/mock/faculty-portal-demo';

type AtRiskStudent = {
  user_id: string;
  name: string;
  email: string;
  enrollment_no: string;
  department: string;
  batch: string;
  risk_score: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  risk_factors: string[];
  metrics: {
    attendance_percent: number | null;
    grades_percent: number | null;
  };
};

export default function FacultyAtRiskPage() {
  const api = useAuthedApi();
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AtRiskStudent[]>('/api/academics/early-warning/dashboard')
      .then((rows) =>
        setStudents(
          withFacultyDemoFallback(rows, facultyDemoAtRiskStudents() as AtRiskStudent[], isEmptyArray),
        ),
      )
      .catch((e) => {
        const demo = withFacultyDemoFallback(
          [],
          facultyDemoAtRiskStudents() as AtRiskStudent[],
          isEmptyArray,
        );
        setStudents(demo);
        if (demo.length === 0) toast.error(e.message || 'Failed to load at-risk students');
      })
      .finally(() => setLoading(false));
  }, [api]);

  const handleScheduleMeeting = async (student: AtRiskStudent) => {
    try {
      if (isFacultyDemoSmokeId(student.user_id)) {
        toast.success(`Meeting request sent to ${student.name} (demo)`);
        return;
      }
      await api.post(`/api/academics/early-warning/${student.user_id}/intervention`);
      toast.success(`Meeting request sent to ${student.name}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `Failed to schedule meeting with ${student.name}`;
      toast.error(message);
    }
  };

  const highCount = students.filter((s) => s.risk_level === 'HIGH').length;
  const mediumCount = students.filter((s) => s.risk_level === 'MEDIUM').length;

  if (loading) {
    return <FacultyPageLoading label="Loading at-risk students…" branded />;
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Student Analytics"
        description="Students below 75% attendance or failing in assessments across your active batches."
        meta={
          <>
            <FacultyMetricChip label="High risk" value={highCount} emphasis={highCount > 0} />
            <FacultyMetricChip label="Medium risk" value={mediumCount} />
            <FacultyMetricChip label="Total flagged" value={students.length} />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-red-200/60 bg-red-50/30 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">High risk students</p>
            <p className="text-2xl font-bold text-red-600">{highCount}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200/60 bg-amber-50/30 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Medium risk students</p>
            <p className="text-2xl font-bold text-amber-600">{mediumCount}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={[
          { key: 'enrollment', header: 'Enrollment No', render: (r) => r.enrollment_no || '—' },
          { key: 'name', header: 'Student Name', render: (r) => r.name },
          { key: 'batch', header: 'Batch', render: (r) => r.batch || '—' },
          {
            key: 'risk_level',
            header: 'Risk Level',
            render: (r) => (
              <Badge
                variant={r.risk_level === 'HIGH' ? 'destructive' : 'default'}
                className={r.risk_level === 'MEDIUM' ? 'bg-amber-600' : ''}
              >
                {r.risk_level}
              </Badge>
            ),
          },
          {
            key: 'factors',
            header: 'Risk Factors',
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {(r.risk_factors ?? []).map((f, i) => (
                  <span
                    key={i}
                    className="rounded border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-700"
                  >
                    {f}
                  </span>
                ))}
                {(r.risk_factors ?? []).length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : null}
              </div>
            ),
          },
          {
            key: 'action',
            header: 'Intervention',
            render: (r) => (
              <Button size="sm" variant="outline" onClick={() => handleScheduleMeeting(r)}>
                Schedule meeting
              </Button>
            ),
          },
        ]}
        rows={students}
        rowKey={(r) => r.user_id}
      />
    </FacultyPageShell>
  );
}
