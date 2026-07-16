'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HrStatCard } from '@/components/hr/HrStatCard';
import {
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import {
  DeanFilterBar,
  buildDeanFilterQuery,
  type DeanFilterValues,
} from '@/components/dean/DeanFilterBar';

type MeetingAnalyticsPayload = {
  meetings_scheduled: number;
  meetings_completed: number;
  meetings_cancelled: number;
  pending_mom: number;
  average_attendance: number;
  department_participation: Array<{ department: string; count: number }>;
};

export default function DeanMeetingAnalyticsPage() {
  const api = useAuthedApi();
  const [filters, setFilters] = useState<DeanFilterValues>({});
  const [departments, setDepartments] = useState<Array<{ dept_id: number; dept_name: string }>>([]);
  const [data, setData] = useState<MeetingAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Array<{ dept_id: number; dept_name: string }>>('/api/academics/dean/departments')
      .then((rows) => setDepartments(rows))
      .catch(() => setDepartments([]));
  }, [api]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const payload = await api.get<MeetingAnalyticsPayload>(
          `/api/academics/dean/intelligence/meetings${buildDeanFilterQuery(filters)}`,
        );
        setData(payload);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, filters]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Meeting Analytics"
        description="Track scheduled, completed, cancelled meetings, pending MOM, and department participation."
        workspaceLabel="Dean Workspace"
      />

      <DeanFilterBar departments={departments} value={filters} onChange={setFilters} showSemester={false} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Meeting analytics unavailable.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <HrStatCard label="Scheduled" value={data.meetings_scheduled} />
            <HrStatCard label="Completed" value={data.meetings_completed} />
            <HrStatCard label="Cancelled" value={data.meetings_cancelled} alert={data.meetings_cancelled > 0} />
            <HrStatCard label="Pending MOM" value={data.pending_mom} alert={data.pending_mom > 0} />
            <HrStatCard label="Avg Attendance" value={data.average_attendance} />
          </div>

          <HodPanel title="Department Participation">
            <HodDataTable
              columns={[
                { key: 'dept', label: 'Department', render: (r) => r.department },
                { key: 'count', label: 'Participants', render: (r) => String(r.count) },
              ]}
              rows={data.department_participation}
              rowKey={(r) => r.department}
            />
          </HodPanel>
        </>
      )}
    </HodPageFrame>
  );
}
