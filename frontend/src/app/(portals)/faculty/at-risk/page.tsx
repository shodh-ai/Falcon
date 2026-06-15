'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

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
    api.get<AtRiskStudent[]>('/api/academics/early-warning/dashboard')
      .then(setStudents)
      .catch((e) => toast.error(e.message || 'Failed to load at-risk students'))
      .finally(() => setLoading(false));
  }, [api]);

  const handleScheduleMeeting = async (student: AtRiskStudent) => {
    try {
      await api.post(`/api/academics/early-warning/${student.user_id}/intervention`);
      toast.success(`Meeting request sent to ${student.name}`);
    } catch (error: any) {
      toast.error(error.message || `Failed to schedule meeting with ${student.name}`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-sgvu-navy">At-Risk Students Early Warning</h1>
        <p className="text-sm text-muted-foreground">
          Students below 75% attendance or failing in assessments across your active batches.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">High Risk Students</p>
            <p className="text-2xl font-bold text-red-600">
              {students.filter((s) => s.risk_level === 'HIGH').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Medium Risk Students</p>
            <p className="text-2xl font-bold text-amber-600">
              {students.filter((s) => s.risk_level === 'MEDIUM').length}
            </p>
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
              <Badge variant={r.risk_level === 'HIGH' ? 'destructive' : 'default'} className={r.risk_level === 'MEDIUM' ? 'bg-amber-600' : ''}>
                {r.risk_level}
              </Badge>
            ),
          },
          {
            key: 'factors',
            header: 'Risk Factors',
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {r.risk_factors.map((f, i) => (
                  <span key={i} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-100">
                    {f}
                  </span>
                ))}
              </div>
            ),
          },
          {
            key: 'action',
            header: 'Intervention',
            render: (r) => (
              <button 
                onClick={() => handleScheduleMeeting(r)}
                className="text-sm text-sgvu-navy hover:underline border px-3 py-1 rounded bg-white shadow-sm"
              >
                Schedule Meeting
              </button>
            ),
          },
        ]}
        rows={students}
        rowKey={(r) => r.user_id}
      />
    </div>
  );
}
