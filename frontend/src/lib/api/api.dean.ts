type AuthedApi = {
  get: <T>(path: string) => Promise<T>;
  patch?: <T>(path: string, body?: unknown) => Promise<T>;
};

export type DeanSchool = {
  school_id: number;
  school_name: string;
  school_code: string | null;
};

export type DeanHealthMetrics = {
  total_faculty: number;
  faculty_present_today: number;
  faculty_on_leave_today: number;
  total_students: number;
  classes_scheduled_today: number;
  classes_cancelled_today: number;
  classes_rescheduled_today: number;
  average_attendance: number;
  attendance_trend_pct: number;
  attendance_trend_label: string;
  pending_leave_count: number;
  pending_gate_pass_count: number;
  pending_profile_corrections: number;
  pending_inbox_total: number;
};

export type DeanCommandCenter = {
  schools: DeanSchool[];
  department_count: number;
  hod_count: number;
  pending_events_count: number;
  health_metrics: DeanHealthMetrics;
  syllabus_coverage: Array<{
    course_code: string;
    course_name: string;
    faculty_name: string;
    coverage_percent: number;
    behind_schedule: boolean;
  }>;
  pending_inbox: Array<{
    id: string;
    type: string;
    title: string;
    employee_name: string;
    date_label: string;
    detail: string;
  }>;
  attendance_deficits: Array<{
    user_id: string;
    name: string;
    email: string;
    average_attendance: number;
    course_count: number;
  }>;
};

export type DeanDepartmentRow = {
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

export function createDeanApi(api: AuthedApi) {
  return {
    commandCenter: () => api.get<DeanCommandCenter>('/api/academics/dean/command-center'),
    departments: () => api.get<DeanDepartmentRow[]>('/api/academics/dean/departments'),
    facultyWorkload: () => api.get<unknown[]>('/api/academics/dean/faculty-workload'),
    timetable: () => api.get<unknown[]>('/api/academics/dean/timetable'),
    courseAllocation: () =>
      api.get<{ slots: unknown[]; faculty: unknown[] }>('/api/academics/dean/course-allocation'),
    syllabusCoverage: () => api.get<unknown[]>('/api/academics/dean/syllabus-coverage'),
    resultAnalytics: () => api.get<unknown[]>('/api/academics/dean/result-analytics'),
    students: (lowAttendance?: boolean) =>
      api.get<unknown[]>(
        `/api/academics/dean/students${lowAttendance ? '?lowAttendance=true' : ''}`,
      ),
    grievances: () => api.get<unknown[]>('/api/academics/dean/grievances'),
    slowLearners: () => api.get<unknown[]>('/api/academics/dean/slow-learners'),
    appraisals: () => api.get<unknown[]>('/api/academics/dean/appraisals'),
    inbox: () => api.get<unknown[]>('/api/academics/dean/inbox'),
  };
}
