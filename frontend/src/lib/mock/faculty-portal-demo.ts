/**
 * Falcon Faculty Portal — smoke / QA demo payloads.
 * Prefer live API responses; use these only when demo mode is on AND live data is empty/failed.
 *
 * Factories: `@/lib/mock/faculty-smoke/factories`
 * Dataset: `@/lib/mock/faculty-smoke/dataset`
 */

import type { FalconNotification } from '@/lib/api/notifications';
import type { PortalMeetingRecord } from '@/lib/api/api.meetings';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';
import {
  attendanceAnalyticsForCourse,
  getFacultySmokeDataset,
  studentsForCourse,
  type FacultySmokeDataset,
} from '@/lib/mock/faculty-smoke/dataset';

export {
  createSeededRng,
  COURSE_CATALOG,
  DEPARTMENTS,
  avatarUrl,
  gradeFromPercent,
} from '@/lib/mock/faculty-smoke/factories';

export {
  getFacultySmokeDataset,
  studentsForCourse,
  attendanceAnalyticsForCourse,
} from '@/lib/mock/faculty-smoke/dataset';

export type { FacultySmokeDataset };

export * from '@/lib/mock/faculty-portal-demo-modules';

function ds(): FacultySmokeDataset {
  return getFacultySmokeDataset();
}

/** Full relational pack for tooling / future screens. */
export function getFacultyPortalDemoPack() {
  return ds();
}

export const FACULTY_DEMO_PROFILE = () => ds().profile;

export function facultyDemoCourses(): FacultyCourse[] {
  return ds().courses.map((c) => ({
    allocation_id: c.allocation_id,
    course_id: c.course_id,
    course_code: c.course_code,
    course_name: c.course_name,
    credits: c.credits,
    program_name: c.program_name,
    semester: c.semester,
    academic_year: c.academic_year,
  }));
}

export function facultyDemoTodayClasses() {
  return ds().todayClasses.map((c) => ({
    timetable_id: c.timetable_id,
    course_id: c.course_id,
    course_code: c.course_code,
    course_name: c.course_name,
    room: `${c.building} · ${c.room}`,
    start_time: c.start_time,
    end_time: c.end_time,
    student_count: c.student_count,
    section: c.section,
  }));
}

export function facultyDemoMissingAttendance() {
  return ds().missingAttendance.map((c) => ({
    timetable_id: c.timetable_id,
    course_id: c.course_id,
    course_code: c.course_code,
    course_name: c.course_name,
    start_time: c.start_time,
    end_time: c.end_time,
    student_count: c.student_count,
  }));
}

export function facultyDemoCourseStudents(courseId: string) {
  return studentsForCourse(courseId).map((s) => ({
    student_id: s.student_id,
    name: s.name,
    roll_number: s.roll_number,
  }));
}

export function facultyDemoAttendanceAnalytics(courseId: string) {
  return attendanceAnalyticsForCourse(courseId);
}

export function facultyDemoAttendanceState(courseId: string) {
  const roster = facultyDemoCourseStudents(courseId);
  return {
    locked: false,
    attendance_data: roster.map((s, i) => ({
      student_id: s.student_id,
      status: (i % 7 === 0 ? 'ABSENT' : 'PRESENT') as 'PRESENT' | 'ABSENT',
    })),
  };
}

export function facultyDemoResearch() {
  return ds().research.map((r) => ({
    research_id: r.research_id,
    publication_title: r.publication_title,
    title: r.publication_title,
    journal_name: r.journal_name,
    indexing_type: r.indexing_type,
    publication_type: r.publication_type,
    published_date: r.published_date,
    status: r.status,
    proof_file_path: r.proof_file_path ?? null,
  }));
}

export function facultyDemoMeetings(currentUserId?: string | null): PortalMeetingRecord[] {
  const uid = currentUserId?.trim() || ds().profile.user_id;
  return ds().meetings.map((m) => ({
    meeting_id: m.meeting_id,
    title: m.title,
    venue: m.venue,
    starts_at: m.starts_at,
    ends_at: m.ends_at,
    agenda: m.agenda,
    meeting_mode: m.meeting_mode,
    status: m.status,
    organizer_user_id: m.organizer_user_id === ds().profile.user_id ? uid : m.organizer_user_id,
    organizer_name: m.organizer_name,
    requester_user_id: m.requester_user_id === ds().profile.user_id ? uid : m.requester_user_id,
    requester_name: m.requester_name,
    participants: m.participants.map((p) => ({
      ...p,
      user_id: p.user_id === ds().profile.user_id ? uid : p.user_id,
    })),
    minutes: m.minutes ?? null,
  }));
}

export function facultyDemoNotifications(userId?: string | null): FalconNotification[] {
  const uid = userId?.trim() || 'faculty-demo';
  return ds().notifications.map((n) => ({
    notification_id: n.notification_id,
    tenant_id: n.tenant_id,
    user_id: uid,
    category: n.category,
    title: n.title,
    message: n.message,
    action_link: n.action_link,
    severity: n.severity,
    intent: n.intent,
    action_label: n.action_label,
    metadata: n.important ? { important: true } : null,
    is_read: n.is_read,
    created_at: n.created_at,
  }));
}

export function facultyDemoLeaveBalances() {
  return ds().leaveBalances;
}

export function facultyDemoMentees() {
  return ds().mentees;
}

export function facultyDemoPendingApprovals() {
  return ds().pendingApprovals;
}

export function facultyDemoAtRisk() {
  return ds().atRisk;
}

export function facultyDemoDuties() {
  return ds().duties;
}

export function facultyDemoWeeklyTests() {
  return ds().weeklyTests;
}

export function facultyDemoTimetable() {
  return ds().timetable.map((t) => ({
    timetable_id: t.timetable_id,
    day_of_week: t.day_of_week,
    start_time: t.start_time,
    end_time: t.end_time,
    room: `${t.building} · ${t.room}`,
    course_code: t.course_code,
    course_name: t.course_name,
  }));
}

export function facultyDemoTimetableStats() {
  return ds().timetableStats;
}

export function facultyDemoAdjustments() {
  return ds().adjustments;
}

export function facultyDemoHrToday() {
  return ds().hrToday;
}

export function facultyDemoHolidays() {
  return ds().holidays;
}

export function facultyDemoLeaveRequests() {
  return ds().leaveRequests.map((r) => ({
    leave_id: r.leave_id,
    request_type: r.request_type,
    leave_type: r.leave_type,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    reason: r.reason,
  }));
}

export function facultyDemoAiConversations() {
  return ds().aiHistory.conversations;
}

export function facultyDemoChatMentees() {
  return ds().chatMentees;
}

export function facultyDemoEligibleParticipants() {
  return ds().eligibleParticipants;
}

export function facultyDemoEssDocuments() {
  return ds().essDocuments;
}

export function facultyDemoAssignments(courseId?: string) {
  const rows = ds().assignments;
  return (courseId ? rows.filter((a) => a.course_id === courseId) : rows).map((a) => ({
    assignment_id: a.assignment_id,
    title: a.title,
    max_marks: a.max_marks,
    start_date: a.created_date,
    due_date: a.due_date,
    description: a.description,
    semester: Number(a.semester) || null,
    section_code: a.section_code,
    submission_count: a.submission_count,
    notified_count: a.submission_count + a.pending_count,
  }));
}

export function facultyDemoUnifiedMarks(courseId: string) {
  const roster = studentsForCourse(courseId);
  const marks = ds().marks.filter((m) => m.course_id === courseId);
  return roster.map((s) => {
    const row = marks.find((m) => m.student_id === s.student_id);
    return {
      student_user_id: s.user_id,
      name: s.name,
      roll_number: s.roll_number,
      marks: {
        INTERNAL: { obtained: row?.internal ?? s.internal_marks, status: 'PUBLISHED' },
        EXTERNAL: { obtained: row?.external ?? 0, status: 'DRAFT' },
        ASSIGNMENT: { obtained: row?.assignment ?? s.assignment_score, status: 'PUBLISHED' },
        QUIZ: { obtained: row?.quiz ?? 0, status: 'PUBLISHED' },
        LAB: { obtained: row?.lab ?? s.practical_marks, status: 'PUBLISHED' },
        ATTENDANCE: { obtained: row?.attendance ?? 0, status: 'PUBLISHED' },
        PRACTICAL: { obtained: row?.practical ?? s.practical_marks, status: 'PUBLISHED' },
      },
    };
  });
}

export function facultyDemoDashboardBundle(userId?: string | null) {
  const data = ds();
  return {
    profile: data.profile,
    classes: facultyDemoTodayClasses(),
    missingAttendance: facultyDemoMissingAttendance(),
    hrSummary: {
      today: data.hrToday.today,
      week_hours: data.hrToday.week_hours,
      display: {
        in_time: data.hrToday.display.in_time,
        out_time: data.hrToday.display.out_time,
      },
    },
    pendingApprovals: data.pendingApprovals,
    leaveBalances: data.leaveBalances,
    atRisk: data.atRisk,
    research: facultyDemoResearch(),
    duties: data.duties,
    weeklyTests: data.weeklyTests,
    courses: facultyDemoCourses(),
    mentees: data.mentees,
    meetings: facultyDemoMeetings(userId),
    notifications: facultyDemoNotifications(userId),
    stats: data.dashboardStats,
    charts: data.charts,
    announcements: data.announcements,
    recentActivity: data.recentActivity,
    upcomingEvents: data.upcomingEvents,
    performance: data.performance,
    calendar: data.calendar,
    messages: data.messages,
    documents: data.documents,
    exams: data.exams,
    assignments: data.assignments,
    submissions: data.submissions,
    students: data.students,
    activityLogs: data.activityLogs,
    aiHistory: data.aiHistory,
  };
}
