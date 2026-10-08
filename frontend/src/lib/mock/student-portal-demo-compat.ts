import {
  DEMO_ATTENDANCE_SUMMARY,
  DEMO_DASHBOARD_METRICS,
  DEMO_FEE_STRUCTURE,
  DEMO_NOTIFICATIONS,
  DEMO_TODAY_SCHEDULE,
} from './student-portal-demo';

export interface TimetableSlot {
  id: string;
  courseId: string;
  subject: string;
  room: string;
  start: string;
  end: string;
  status: 'upcoming' | 'ongoing' | 'done';
  liveJoinUrl?: string | null;
  isVirtual?: boolean;
}

export const mockTimetableToday: TimetableSlot[] = DEMO_TODAY_SCHEDULE.map((s, i) => ({
  id: s.id,
  courseId: String(i + 1),
  subject: s.subject,
  room: s.room,
  start: s.start,
  end: s.end,
  status: i === 0 ? 'done' : i === 1 ? 'ongoing' : 'upcoming',
}));

export const mockAttendance = {
  percentage: DEMO_DASHBOARD_METRICS.attendance_percent,
  present: 286,
  total: 331,
  minimumRequired: 75,
};

export const mockFeeDues = {
  totalPending: DEMO_DASHBOARD_METRICS.fee_outstanding,
  dueDate: DEMO_FEE_STRUCTURE.find((f) => f.payable_amount > 0)?.due_date ?? '2026-08-27',
  items: DEMO_FEE_STRUCTURE.filter((f) => f.payable_amount > 0).map((f) => ({
    id: f.demand_id,
    label: `Semester ${f.semester} ${f.fee_head.replace(/_/g, ' ')}`,
    amount: f.payable_amount,
  })),
};

export const mockNotifications = DEMO_NOTIFICATIONS.slice(0, 3).map((n) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  type: n.type === 'fee' || n.type === 'warning' || n.type === 'success' ? n.type : ('info' as const),
  unread: n.unread,
}));

// silence unused if tree-shaken oddly
void DEMO_ATTENDANCE_SUMMARY;
