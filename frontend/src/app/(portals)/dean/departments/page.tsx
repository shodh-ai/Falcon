'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodDataTable,
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi, type DeanDepartmentRow } from '@/lib/api/api.dean';

export default function DeanDepartmentsPage() {
  const api = useAuthedApi();
  const deanApi = createDeanApi(api);
  const [rows, setRows] = useState<DeanDepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setRows(await deanApi.departments());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load departments');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, deanApi]);

  const totals = rows.reduce(
    (acc, row) => ({
      faculty: acc.faculty + row.faculty_count,
      students: acc.students + row.student_count,
      courses: acc.courses + row.active_courses,
    }),
    { faculty: 0, students: 0, courses: 0 },
  );

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="Departments & HOD Oversight"
        description="School-wide department health with HOD assignment and risk indicators."
        meta={
          <>
            <HodMetricChip label="Departments" value={rows.length} emphasis />
            <HodMetricChip label="Faculty" value={totals.faculty} />
            <HodMetricChip label="Students" value={totals.students} />
            <HodMetricChip label="Active Courses" value={totals.courses} />
          </>
        }
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => String(r.dept_id)}
        empty="No departments in your assigned school scope."
        columns={[
          {
            key: 'dept',
            label: 'Department',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.dept_name}</p>
                <p className="text-muted-foreground">{r.hod_name ?? 'HOD not assigned'}</p>
              </div>
            ),
          },
          { key: 'faculty', label: 'Faculty', className: 'w-20', render: (r) => r.faculty_count },
          { key: 'students', label: 'Students', className: 'w-20', render: (r) => r.student_count },
          { key: 'courses', label: 'Courses', className: 'w-20', render: (r) => r.active_courses },
          {
            key: 'syllabus',
            label: 'Syllabus',
            className: 'w-24 tabular-nums',
            render: (r) => `${r.syllabus_completion_pct}%`,
          },
          {
            key: 'risk',
            label: 'Risk',
            className: 'w-28',
            render: (r) => (
              <span className="text-sm text-muted-foreground">
                {r.attendance_risk_count} att · {r.result_risk_count} res
              </span>
            ),
          },
        ]}
      />
    </HodPageFrame>
  );
}
