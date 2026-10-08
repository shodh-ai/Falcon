'use client';

import { Select } from '@/components/ui/select';

export type DeanFilterValues = {
  dept_id?: string;
  academic_year?: string;
  semester?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
};

export function DeanFilterBar({
  departments = [],
  value,
  onChange,
  showSemester = true,
  showStatus = false,
}: {
  departments?: Array<{ dept_id: number; dept_name: string }>;
  value: DeanFilterValues;
  onChange: (next: DeanFilterValues) => void;
  showSemester?: boolean;
  showStatus?: boolean;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="flex flex-wrap gap-3">
      {departments.length > 1 ? (
        <Select
          className="rounded-lg border px-3 py-2 text-sm"
          value={value.dept_id ?? 'ALL'}
          onChange={(e) => onChange({ ...value, dept_id: e.target.value })}
        >
          <option value="ALL">All departments</option>
          {departments.map((dept) => (
            <option key={dept.dept_id} value={String(dept.dept_id)}>
              {dept.dept_name}
            </option>
          ))}
        </Select>
      ) : null}
      <Select
        className="rounded-lg border px-3 py-2 text-sm"
        value={value.academic_year ?? String(year)}
        onChange={(e) => onChange({ ...value, academic_year: e.target.value })}
      >
        <option value={String(year)}>{year}-{year + 1}</option>
        <option value={String(year - 1)}>{year - 1}-{year}</option>
      </Select>
      {showSemester ? (
        <Select
          className="rounded-lg border px-3 py-2 text-sm"
          value={value.semester ?? 'ALL'}
          onChange={(e) => onChange({ ...value, semester: e.target.value })}
        >
          <option value="ALL">All semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
            <option key={sem} value={String(sem)}>
              Semester {sem}
            </option>
          ))}
        </Select>
      ) : null}
      {showStatus ? (
        <Select
          className="rounded-lg border px-3 py-2 text-sm"
          value={value.status ?? 'ALL'}
          onChange={(e) => onChange({ ...value, status: e.target.value })}
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      ) : null}
      <input
        type="date"
        className="rounded-lg border px-3 py-2 text-sm"
        value={value.date_from ?? ''}
        onChange={(e) => onChange({ ...value, date_from: e.target.value })}
      />
      <input
        type="date"
        className="rounded-lg border px-3 py-2 text-sm"
        value={value.date_to ?? ''}
        onChange={(e) => onChange({ ...value, date_to: e.target.value })}
      />
    </div>
  );
}

export function buildDeanFilterQuery(value: DeanFilterValues) {
  const params = new URLSearchParams();
  if (value.dept_id && value.dept_id !== 'ALL') params.set('dept_id', value.dept_id);
  if (value.academic_year) params.set('academic_year', value.academic_year);
  if (value.semester && value.semester !== 'ALL') params.set('semester', value.semester);
  if (value.status && value.status !== 'ALL') params.set('status', value.status);
  if (value.date_from) params.set('date_from', value.date_from);
  if (value.date_to) params.set('date_to', value.date_to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
