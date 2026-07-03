'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { CourseEnrolledStudentsModal } from '@/components/hod/CourseEnrolledStudentsModal';

type Row = {
  course_id: string;
  course_code: string;
  course_name: string;
  enrolled: number;
  passed: number;
  failed: number;
  pass_percent: number;
};

export default function HodResultAnalyticsPage() {

  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);


  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/hod/result-analytics');
        setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load result analytics');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Result Analytics"
        description="Pass / fail breakdown across department subjects."
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.course_code}
        onRowClick={(r) => {
          setSelectedCourseId(r.course_id);
          setSelectedCourseName(r.course_name);
        }}
        empty="No graded enrollments yet."
        columns={[
          {
            key: 'course',
            label: 'Course',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.course_code}</p>
                <p className="text-muted-foreground">{r.course_name}</p>
              </div>
            ),
          },
          { key: 'enrolled', label: 'Enrolled', className: 'w-20 tabular-nums', render: (r) => r.enrolled },
          { key: 'passed', label: 'Passed', className: 'w-20 tabular-nums font-semibold', render: (r) => r.passed },
          { key: 'failed', label: 'Failed', className: 'w-20 tabular-nums', render: (r) => r.failed },
          {
            key: 'pass',
            label: 'Pass %',
            className: 'w-20 tabular-nums font-bold',
            render: (r) => `${r.pass_percent}%`,
          },
        ]}
      />

      <CourseEnrolledStudentsModal
        courseId={selectedCourseId}
        courseName={selectedCourseName}
        open={!!selectedCourseId}
        onOpenChange={(open) => !open && setSelectedCourseId(null)}
      />
    </HodPageFrame>

  );
}
