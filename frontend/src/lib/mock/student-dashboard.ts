/**
 * Backward-compatible student dashboard mocks + full portal demo pack.
 */

export type {
  DemoStudentProfile,
  DemoSubject,
  DemoAttendanceRow,
  DemoAssignment,
  DemoExam,
  DemoTimetableSlot,
  DemoFeeDemand,
  DemoLibraryLoan,
  DemoPlacementCompany,
  DemoNotification,
} from './student-portal-demo';

export {
  DEMO_STUDENT,
  DEMO_FACULTY,
  DEMO_SUBJECTS,
  DEMO_DASHBOARD_METRICS,
  DEMO_WEEKLY_TIMETABLE,
  DEMO_ATTENDANCE,
  DEMO_ATTENDANCE_SUMMARY,
  DEMO_ASSIGNMENTS,
  DEMO_EXAMS,
  DEMO_MARKS,
  DEMO_FEE_STRUCTURE,
  DEMO_FEE_PAYMENTS,
  DEMO_LIBRARY_LOANS,
  DEMO_PLACEMENTS,
  DEMO_TRANSPORT,
  DEMO_HOSTEL,
  DEMO_NOTIFICATIONS,
  DEMO_TODAY_SCHEDULE,
  demoFallback,
  isEmptyArray,
} from './student-portal-demo';

export type { TimetableSlot } from './student-portal-demo-compat';
export {
  mockTimetableToday,
  mockAttendance,
  mockFeeDues,
  mockNotifications,
} from './student-portal-demo-compat';
