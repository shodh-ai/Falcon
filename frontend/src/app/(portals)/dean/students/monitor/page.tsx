'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
} from '@/components/hod/HodPagePrimitives';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Input } from '@/components/ui/input';
import { StudentDetailsModal } from '@/components/workspaces/StudentDetailsModal';
import { useAuthedApi } from '@/lib/api';
import { buildDeanPageQuery, type PaginatedApiResponse } from '@/lib/dean-pagination';

type StudentRow = {
  user_id: string;
  name: string;
  email: string;
  department: string;
  average_attendance: number;
  course_count: number;
  cgpa: number | null;
  enrollment_year?: number;
};

export default function DeanStudentMonitorPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildDeanPageQuery({ page: Math.floor(offset / limit) + 1, limit, search });
      const data = await api.get<PaginatedApiResponse<StudentRow>>(
        `/api/academics/dean/students?lowAttendance=true&${qs}`,
      );
      setRows(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load students');
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
        title="Student Monitor"
        description="Students with low-attendance risk visibility before exam season across your school."
        workspaceLabel="Dean Workspace"
        meta={<span>{total} student{total === 1 ? '' : 's'}</span>}
      />

      <Input
        aria-label="Search students"
        placeholder="Search by name, email, or department…"
        value={search}
        onChange={(e) => {
          setOffset(0);
          setSearch(e.target.value);
        }}
        className="max-w-md"
      />

      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.user_id}
        empty="No at-risk students found."
        onRowClick={(r) => {
          setSelectedId(r.user_id);
          setModalOpen(true);
        }}
        columns={[
          { key: 'name', label: 'Student', render: (r) => r.name },
          { key: 'email', label: 'Email', render: (r) => r.email },
          { key: 'department', label: 'Department', render: (r) => r.department },
          {
            key: 'average_attendance',
            label: 'Avg Attendance %',
            render: (r) => `${r.average_attendance}%`,
          },
          { key: 'course_count', label: 'Courses', render: (r) => String(r.course_count) },
          {
            key: 'cgpa',
            label: 'CGPA',
            render: (r) => (r.cgpa != null ? String(r.cgpa) : '—'),
          },
        ]}
      />

      <PaginationBar total={total} limit={limit} offset={offset} onPageChange={setOffset} />

      <StudentDetailsModal
        studentId={selectedId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        portal="dean"
      />
    </HodPageFrame>
  );
}
