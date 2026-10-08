'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
  HodTableHead,
  HodTableWrap,
} from '@/components/hod/HodPagePrimitives';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Slot = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
  faculty_user_id: string;
  faculty_name: string;
  dept_id?: number | null;
  dept_name?: string | null;
  flags?: {
    faculty_overloaded?: boolean;
    scheduling_conflict?: boolean;
  };
};

type FacultyOption = {
  user_id: string;
  name: string;
  email: string | null;
  department: string | null;
};

type UnassignedAllocation = {
  allocation_id: string;
  subject_code: string;
  subject_name: string;
  program_name: string;
  semester: string;
  academic_year: string;
};

type WorkloadRow = {
  user_id: string;
  name: string;
  dept_name: string | null;
  hours_per_week: number;
  workload_status: 'OVERLOADED' | 'UNDERUTILIZED' | 'BALANCED';
};

type SchedulingConflict = {
  conflict_type: 'FACULTY' | 'ROOM';
  day_of_week: number;
  slot_ids: string[];
  label: string;
  details: string;
};

type AllocationResponse = {
  schools?: Array<{ school_id: number; school_name: string }>;
  slots: Slot[];
  faculty: FacultyOption[];
  highlights?: {
    unassigned_allocations: UnassignedAllocation[];
    unassigned_count: number;
    overloaded_faculty: WorkloadRow[];
    underutilized_faculty: WorkloadRow[];
    scheduling_conflicts: SchedulingConflict[];
    summary: {
      total_slots: number;
      unassigned_count: number;
      overloaded_count: number;
      underutilized_count: number;
      conflict_count: number;
    };
  };
};

const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DeanCourseAllocationPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<AllocationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [issueFilter, setIssueFilter] = useState<'ALL' | 'ISSUES'>('ALL');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const response = await api.get<AllocationResponse>(
          '/api/academics/dean/course-allocation',
        );
        setData(response);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load allocation slots');
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const slots = data?.slots ?? [];
  const faculty = data?.faculty ?? [];
  const highlights = data?.highlights;
  const schools = data?.schools ?? [];

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const slot of slots) {
      if (slot.dept_name) names.add(slot.dept_name);
    }
    return Array.from(names).sort();
  }, [slots]);

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      if (deptFilter !== 'ALL' && slot.dept_name !== deptFilter) return false;
      if (issueFilter === 'ISSUES') {
        return Boolean(
          slot.flags?.faculty_overloaded || slot.flags?.scheduling_conflict,
        );
      }
      return true;
    });
  }, [slots, deptFilter, issueFilter]);

  const summary = highlights?.summary ?? {
    total_slots: slots.length,
    unassigned_count: highlights?.unassigned_count ?? 0,
    overloaded_count: 0,
    underutilized_count: 0,
    conflict_count: 0,
  };

  const schoolLabel =
    schools.length === 1
      ? schools[0].school_name
      : schools.length > 1
        ? `${schools.length} schools`
        : 'your school';

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Course Allocation Review"
        description={`Read-only view of faculty course assignments across ${schoolLabel}. Highlights flag unassigned courses, overloaded faculty, and scheduling conflicts.`}
        workspaceLabel="Dean Workspace"
        meta={
          <>
            <HodMetricChip label="Total Slots" value={summary.total_slots} emphasis />
            <HodMetricChip label="Faculty Pool" value={faculty.length} />
            {summary.unassigned_count > 0 ? (
              <HodMetricChip label="Unassigned Courses" value={summary.unassigned_count} />
            ) : null}
            {summary.overloaded_count > 0 ? (
              <HodMetricChip label="Overloaded" value={summary.overloaded_count} />
            ) : null}
            {summary.conflict_count > 0 ? (
              <HodMetricChip label="Conflicts" value={summary.conflict_count} />
            ) : null}
          </>
        }
      />

      {!loading && highlights ? (
        <div className="space-y-4">
          {(highlights.unassigned_allocations.length > 0 ||
            highlights.overloaded_faculty.length > 0 ||
            highlights.scheduling_conflicts.length > 0) && (
            <div className="grid gap-3 md:grid-cols-3">
              {highlights.unassigned_allocations.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
                  <p className="font-semibold text-sgvu-navy">
                    Unassigned courses ({highlights.unassigned_allocations.length})
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {highlights.unassigned_allocations.slice(0, 4).map((row) => (
                      <li key={row.allocation_id}>
                        {row.subject_code} · {row.program_name} (Sem {row.semester})
                      </li>
                    ))}
                    {highlights.unassigned_allocations.length > 4 ? (
                      <li>+{highlights.unassigned_allocations.length - 4} more</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {highlights.overloaded_faculty.length > 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-sm">
                  <p className="font-semibold text-sgvu-navy">
                    Overloaded faculty ({highlights.overloaded_faculty.length})
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {highlights.overloaded_faculty.slice(0, 4).map((row) => (
                      <li key={row.user_id}>
                        {row.name}
                        {row.dept_name ? ` · ${row.dept_name}` : ''} — {row.hours_per_week}h/wk
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {highlights.scheduling_conflicts.length > 0 ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 text-sm">
                  <p className="font-semibold text-sgvu-navy">
                    Scheduling conflicts ({highlights.scheduling_conflicts.length})
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {highlights.scheduling_conflicts.slice(0, 4).map((row, index) => (
                      <li key={`${row.label}-${index}`}>
                        {DOW[row.day_of_week]} · {row.label} — {row.details}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {departments.length > 1 ? (
              <Select
                className="rounded-lg border px-3 py-2 text-sm"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="ALL">All departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              className="rounded-lg border px-3 py-2 text-sm"
              value={issueFilter}
              onChange={(e) => setIssueFilter(e.target.value as 'ALL' | 'ISSUES')}
            >
              <option value="ALL">All slots</option>
              <option value="ISSUES">Issues only</option>
            </Select>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : filteredSlots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
          {slots.length === 0
            ? 'No timetable slots found for your school.'
            : 'No slots match the selected filters.'}
        </p>
      ) : (
        <HodTableWrap>
          <table className="w-full min-w-full text-left text-sm">
            <HodTableHead
              columns={['Department', 'Course', 'Day', 'Time', 'Room', 'Faculty Assigned', 'Flags']}
            />
            <tbody>
              {filteredSlots.map((slot, i) => {
                const hasIssue =
                  slot.flags?.faculty_overloaded || slot.flags?.scheduling_conflict;
                return (
                  <tr
                    key={slot.timetable_id}
                    className={cn(
                      'border-b border-gray-100',
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                      hasIssue && 'bg-amber-50/70',
                    )}
                  >
                    <td className="px-4 py-3">{slot.dept_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sgvu-navy">{slot.course_code}</p>
                      <p className="text-muted-foreground">{slot.course_name}</p>
                    </td>
                    <td className="px-4 py-3 font-medium">{DOW[slot.day_of_week]}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      {String(slot.start_time).slice(0, 5)}–{String(slot.end_time).slice(0, 5)}
                    </td>
                    <td className="px-4 py-3">{slot.room ?? '—'}</td>
                    <td className="px-4 py-3">
                      {slot.faculty_user_id ? (
                        <span className="font-medium text-sgvu-navy">{slot.faculty_name}</span>
                      ) : (
                        <span className="font-medium text-amber-600">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {slot.flags?.faculty_overloaded ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                            Overload
                          </span>
                        ) : null}
                        {slot.flags?.scheduling_conflict ? (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                            Conflict
                          </span>
                        ) : null}
                        {!hasIssue ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </HodTableWrap>
      )}
    </HodPageFrame>
  );
}
