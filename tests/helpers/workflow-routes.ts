/** Expected portal route prefixes per workspace (frontend + API smoke registry). */
export const FACULTY_ROUTES = {
  dashboard: '/faculty/dashboard',
  attendance: '/faculty/attendance',
  leave: '/faculty/me/onboarding',
  courses: '/faculty/courses',
  timetable: '/faculty/timetable',
  students: '/faculty/courses',
  profile: '/faculty/profile',
  research: '/faculty/research',
  meetings: '/faculty/meetings',
} as const;

export const HOD_ROUTES = {
  dashboard: '/hod/dashboard',
  facultyManagement: '/hod/faculty/workload',
  attendanceApproval: '/hod/attendance',
  leaveApproval: '/hod/approvals/leaves',
  courseAllocation: '/hod/academics/course-allocation',
  analytics: '/hod/reports',
  timetable: '/hod/department-timetable',
  meetings: '/hod/meetings',
  discipline: '/hod/students/discipline',
  research: '/hod/academics',
  funding: '/hod/funding-approvals',
} as const;

export const DEAN_ROUTES = {
  dashboard: '/dean/dashboard',
  bos: '/dean/academics/bos',
  courseAllocation: '/dean/academics/course-allocation',
  resultAnalytics: '/dean/academics/result-analytics',
  syllabusTracking: '/dean/academics/syllabus-tracking',
  timetable: '/dean/academics/timetable',
  dofaApprovals: '/dean/approvals/dofa',
  dofaInbox: '/dean/approvals/dofa-inbox',
  attendance: '/dean/attendance',
  attendancePolicy: '/dean/attendance-policy',
  auditLog: '/dean/audit-log',
  budget: '/dean/budget',
  departments: '/dean/departments',
  departmentDetail: '/dean/departments/demo',
  events: '/dean/events',
  appraisals: '/dean/faculty/appraisals',
  facultyLeaderboard: '/dean/faculty/leaderboard',
  facultyWorkload: '/dean/faculty/workload',
  facultyApproval: '/dean/inbox',
  payslips: '/dean/me/payslips',
  policies: '/dean/me/policies',
  tickets: '/dean/me/tickets',
  ticketDetail: '/dean/me/tickets/demo',
  meetings: '/dean/meetings',
  meetingAnalytics: '/dean/meetings/analytics',
  notifications: '/dean/notifications',
  onboardingStep1: '/dean/onboarding/step-1',
  onboardingStep2: '/dean/onboarding/step-2',
  onboardingStep3: '/dean/onboarding/step-3',
  phdApprovals: '/dean/phd/approvals',
  placement: '/dean/placement',
  procurementRequisitions: '/dean/procurement/requisitions',
  profile: '/dean/profile',
  reports: '/dean/reports',
  research: '/dean/research',
  students: '/dean/students/monitor',
  grievances: '/dean/students/grievances',
  safetyConcerns: '/dean/safety-concerns',
  search: '/dean/search',
  settings: '/dean/settings',
  resultApproval: '/dean/inbox',
  analytics: '/dean/analytics',
} as const;

export const EXAM_CELL_ROUTES = {
  dashboard: '/exam-cell/dashboard',
  hallTickets: '/exam-cell/admit-cards',
  results: '/exam-cell/results',
  publication: '/exam-cell/results',
  gradeCards: '/exam-cell/grade-cards',
  revaluation: '/exam-cell/re-evaluations',
  scheduling: '/exam-cell/schedule',
  seating: '/exam-cell/seating',
  coeApproval: '/exam-cell/hall-ticket-approvals',
} as const;

export const FACULTY_API = {
  dashboard: '/api/academics/faculty/today-classes',
  attendance: '/api/academics/faculty/attendance',
  timetable: '/api/academics/faculty/timetable/today',
  profile: '/api/academics/faculty/profile',
  research: '/api/academics/faculty/workspaces/research',
  meetings: '/api/academics/faculty/workspaces/meetings',
} as const;

export const HOD_API = {
  dashboard: '/api/academics/hod/dashboard',
  facultyWorkload: '/api/academics/hod/faculty-workload',
  leaveApprovals: '/api/academics/hod/approvals/leaves',
  courseAllocation: '/api/academics/hod/course-allocation',
  funding: '/api/academics/hod/funding-requests',
  meetings: '/api/academics/hod/meetings',
} as const;

export const DEAN_API = {
  commandCenter: '/api/academics/dean/command-center',
  departments: '/api/academics/dean/departments',
  funding: '/api/academics/dean/funding-requests',
  inbox: '/api/academics/dean/inbox',
  resultApprovals: '/api/academics/dean/intelligence/result-approvals',
  students: '/api/academics/dean/students',
} as const;

export const EXAM_CELL_API = {
  dashboard: '/api/exam-cell/dashboard',
  schedules: '/api/exam-cell/schedules',
  results: '/api/exam-cell/results',
  gradeCards: '/api/exam-cell/grade-cards',
  seating: '/api/exam-cell/seating-allocations',
  hallTicketApprovals: '/api/exam-cell/hall-ticket-approvals',
  auditLog: '/api/exam-cell/audit-log',
} as const;

export const REGISTRAR_ROUTES = {
  dashboard: '/admin/dashboard',
  governanceTasks: '/admin/tasks',
  uploadHistory: '/admin/upload-history',
  iam: '/admin/iam',
  verifications: '/admin/verifications',
  academics: '/admin/academics',
  bulkUpload: '/admin/students/bulk-upload',
  directory: '/directory',
  phdAdmissions: '/admin/phd/admissions',
  adminOps: '/admin-ops/dashboard',
  reports: '/reports',
} as const;

export const REGISTRAR_API = {
  directory: '/api/search/directory',
  directoryFilters: '/api/search/directory/filters',
  verificationsQueue: '/api/admin/student-verifications/queue',
  assignRollNumbers: '/api/academics/enrollments/assign-roll-numbers',
  phdCandidates: '/api/phd-lifecycle/registrar/candidates',
  submissionsMy: '/tasks/submissions/my',
  assignmentsMy: '/tasks/assignments/my',
  leadershipIssues: '/api/leadership/issues',
  profileCorrections: '/api/helpdesk/tickets/profile-corrections',
} as const;
