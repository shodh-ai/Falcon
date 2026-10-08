'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import {
  HodActionButton,
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
} from '@/components/hod/HodPagePrimitives';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Input } from '@/components/ui/input';
import { buildDeanPageQuery, type PaginatedApiResponse } from '@/lib/dean-pagination';
import Link from 'next/link';

type DeptRow = {
  dept_id: number;
  dept_name: string;
  hod_name: string | null;
  hod_email: string | null;
  faculty_count: number;
  student_count: number;
  active_courses: number;
  timetable_slots: number;
  syllabus_completion_pct: number;
  syllabus_behind_count: number;
  attendance_risk_count: number;
  result_risk_count: number;
};

export default function DeanDepartmentsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<DeptRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildDeanPageQuery({ page: Math.floor(offset / limit) + 1, limit, search });
      const data = await api.get<PaginatedApiResponse<DeptRow>>(
        `/api/academics/dean/departments?${qs}`,
      );
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load departments');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [api, offset, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Departments"
        description="Overview of all departments under your school."
        workspaceLabel="Dean Workspace"
        meta={<span>{total} department{total === 1 ? '' : 's'}</span>}
        actions={
          <HodActionButton href="/dean/dashboard" variant="outline">
            Command Center
          </HodActionButton>
        }
      />

      <Input
        aria-label="Search departments"
        placeholder="Search departments or HOD…"
        value={search}
        onChange={(e) => {
          setOffset(0);
          setSearch(e.target.value);
        }}
        className="max-w-sm"
      />

      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => String(r.dept_id)}
        empty="No departments found for your school."
        columns={[
          {
            key: 'name',
            label: 'Department',
            render: (r) => (
              <div>
                <span className="font-semibold">{r.dept_name}</span>
                {r.hod_name ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    HOD: {r.hod_name}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 mt-0.5 font-medium">No HOD assigned</p>
                )}
              </div>
            ),
          },
          {
            key: 'headcount',
            label: 'Headcount',
            render: (r) => (
              <div className="flex flex-col gap-1 text-sm tabular-nums text-muted-foreground">
                <span>{r.faculty_count} Faculty</span>
                <span>{r.student_count} Students</span>
              </div>
            ),
          },
          {
            key: 'academics',
            label: 'Academics',
            render: (r) => (
              <div className="flex flex-col gap-1 text-sm tabular-nums text-muted-foreground">
                <span>{r.active_courses} Courses</span>
                <span>{r.timetable_slots} Slots/week</span>
              </div>
            ),
          },
          {
            key: 'syllabus',
            label: 'Syllabus Coverage',
            render: (r) => (
              <div>
                <span className="font-semibold text-sgvu-navy">{r.syllabus_completion_pct.toFixed(1)}%</span>
                {r.syllabus_behind_count > 0 && (
                  <p className="text-xs text-red-600 font-medium mt-0.5">
                    {r.syllabus_behind_count} behind schedule
                  </p>
                )}
              </div>
            ),
          },
          {
            key: 'risk',
            label: 'At Risk',
            render: (r) => (
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold tabular-nums text-red-600">{r.attendance_risk_count}</span>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Attendance</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold tabular-nums text-orange-600">{r.result_risk_count}</span>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Results</span>
                </div>
              </div>
            ),
          },
          {
            key: 'view',
            label: '',
            className: 'text-right',
            render: (r) => (
              <Link
                href={`/dean/departments/${r.dept_id}`}
                className="text-sm font-semibold text-sgvu-navy hover:underline"
              >
                Quick View →
              </Link>
            ),
          },
        ]}
      />
      <PaginationBar total={total} limit={limit} offset={offset} onPageChange={setOffset} />
    </HodPageFrame>
  );
}
