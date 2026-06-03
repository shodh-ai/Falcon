export type CalculatedAttendanceStatus =
  | 'FULL_DAY'
  | 'HALF_DAY'
  | 'LESS_THAN_HALF_DAY'
  | 'ABSENT'
  | 'WEEK_OFF'
  | 'HOLIDAY'
  | 'RESTRICTED_HOLIDAY'
  | 'LATE_COMING'
  | 'EARLY_GOING'
  | 'PENDING_REQUEST';

export const ATTENDANCE_LEGEND: { status: CalculatedAttendanceStatus; label: string; color: string }[] = [
  { status: 'FULL_DAY', label: 'Full Day', color: '#22c55e' },
  { status: 'HALF_DAY', label: 'Half Day', color: '#e879f9' },
  { status: 'LESS_THAN_HALF_DAY', label: 'Less than half day', color: '#fca5a5' },
  { status: 'ABSENT', label: 'Absent', color: '#dc2626' },
  { status: 'WEEK_OFF', label: 'Week Off', color: '#e5e7eb' },
  { status: 'HOLIDAY', label: 'Holiday', color: '#6b7280' },
  { status: 'RESTRICTED_HOLIDAY', label: 'Restricted Holiday', color: '#1e3a5f' },
  { status: 'PENDING_REQUEST', label: 'Pending Request', color: '#eab308' },
  { status: 'LATE_COMING', label: 'Late Coming', color: '#92400e' },
  { status: 'EARLY_GOING', label: 'Early Going', color: '#7c3aed' },
];

export function attendanceCircleStyle(status: CalculatedAttendanceStatus | string) {
  const item = ATTENDANCE_LEGEND.find((l) => l.status === status);
  const bg = item?.color ?? '#d1d5db';
  const text =
    status === 'WEEK_OFF' || status === 'HOLIDAY' || status === 'RESTRICTED_HOLIDAY' ? '#374151' : '#fff';
  return { backgroundColor: bg, color: text };
}

export function attendanceLabel(status: string) {
  return ATTENDANCE_LEGEND.find((l) => l.status === status)?.label ?? status.replace(/_/g, ' ');
}
