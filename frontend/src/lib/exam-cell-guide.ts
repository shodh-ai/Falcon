export type ExamCellPageId =
  | 'dashboard'
  | 'live-dashboard'
  | 'sessions'
  | 'calendar'
  | 'search'
  | 'schedule'
  | 'form-fillup'
  | 'eligibility'
  | 'hall-ticket-approvals'
  | 'exam-centres'
  | 'attendance-exemptions'
  | 'admit-cards'
  | 'seating'
  | 'seating-plans'
  | 'resource-allocation'
  | 'invigilation'
  | 'print-hub'
  | 'question-papers'
  | 'exam-day'
  | 'answer-sheets'
  | 'ufm-cases'
  | 'results'
  | 'grade-cards'
  | 'course-grades'
  | 'backlog-exams'
  | 're-evaluations'
  | 'transcripts'
  | 'reports'
  | 'analytics'
  | 'notifications'
  | 'audit-log'
  | 'deadlines'
  | 'degree-audit'
  | 'documents'
  | 'student-timeline'
  | 'my-tasks'
  | 'settings';

export interface ExamCellPageMeta {
  title: string;
  subtitle: string;
}

export const EXAM_CELL_PAGES: Record<ExamCellPageId, ExamCellPageMeta> = {
  dashboard: {
    title: 'Command Center',
    subtitle: 'Overview of exam operations, pending actions, and quick links.',
  },
  'live-dashboard': {
    title: 'Live Examination Dashboard',
    subtitle: 'Real-time exam day statistics with auto-refresh — present, absent, UFM, and room activity.',
  },
  sessions: {
    title: 'Examination Sessions',
    subtitle: 'Manage academic year, semester cycle, and examination session status.',
  },
  search: {
    title: 'Global Search',
    subtitle: 'Find students, subjects, exams, hall tickets, and answer sheets across the examination system.',
  },
  calendar: {
    title: 'Examination Calendar',
    subtitle: 'Centralized academic and examination calendar — month, week, and list views with drag-and-drop rescheduling.',
  },
  schedule: {
    title: 'Master Exam Schedule',
    subtitle: 'Central timetable for admit cards, seating, and invigilation.',
  },
  'form-fillup': {
    title: 'Form Fill-up Desk',
    subtitle: 'Open or close exam form windows and review student applications.',
  },
  eligibility: {
    title: 'Student Eligibility Dashboard',
    subtitle: 'Automated eligibility classification — attendance, fees, documents, and disciplinary holds.',
  },
  'hall-ticket-approvals': {
    title: 'Hall Ticket Approval Workflow',
    subtitle: 'Multi-stage approval: registration → eligibility → finance → exam office → COE → hall ticket generation.',
  },
  'exam-centres': {
    title: 'Exam Centres & Rooms',
    subtitle: 'View buildings, halls, and seating capacity for examination planning.',
  },
  'attendance-exemptions': {
    title: 'Attendance Exemptions',
    subtitle: 'HOD-approved exemptions that allow admit card generation despite low attendance.',
  },
  'admit-cards': {
    title: 'Admit Card Engine',
    subtitle: 'Review eligibility and generate hall tickets for cleared students.',
  },
  seating: {
    title: 'Seating Planner',
    subtitle: 'Allocate exam halls and seats, then publish to the student portal.',
  },
  'seating-plans': {
    title: 'Published Seating Plans',
    subtitle: 'Read-only view of seating plans synced to the student portal.',
  },
  'resource-allocation': {
    title: 'Exam Resource Allocation',
    subtitle: 'Assign rooms, coordinators, and invigilators to exam schedules.',
  },
  invigilation: {
    title: 'Invigilation Roster',
    subtitle: 'Assign and publish faculty invigilation duties.',
  },
  'print-hub': {
    title: 'Print & Export Hub',
    subtitle: 'Export admit cards, seating charts, and duty rosters.',
  },
  'question-papers': {
    title: 'Question Paper Control',
    subtitle: 'Track QP setting, approval, and print authorization.',
  },
  'exam-day': {
    title: 'Exam Day Operations',
    subtitle: 'QR identity verification, attendance register, and flying squad logs.',
  },
  'answer-sheets': {
    title: 'Answer Sheet Tracking',
    subtitle: 'QR/barcode lifecycle tracking from issued through archived with evaluator assignment.',
  },
  'ufm-cases': {
    title: 'UFM Malpractice Desk',
    subtitle: 'Log unfair means cases — marks and grade cards are updated automatically.',
  },
  results: {
    title: 'Result Control Centre',
    subtitle: 'Review faculty submissions, lock marks, and declare results.',
  },
  'grade-cards': {
    title: 'Grade Cards & Merit List',
    subtitle: 'Generate, publish, and finalize semester grade cards.',
  },
  'course-grades': {
    title: 'Course Grades',
    subtitle: 'Aggregated internal and external marks by subject.',
  },
  'backlog-exams': {
    title: 'Backlog & Supplementary Exams',
    subtitle: 'Active backlog students and supplementary exam planning.',
  },
  're-evaluations': {
    title: 'Re-evaluations',
    subtitle: 'Process paid recheck and re-evaluation requests.',
  },
  transcripts: {
    title: 'Degree & Transcripts',
    subtitle: 'Generate transcripts and verify ABC ID for DigiLocker.',
  },
  reports: {
    title: 'Examination Reports',
    subtitle: 'Pass percentages, rankers, department analysis, and backlog statistics.',
  },
  analytics: {
    title: 'Advanced Analytics',
    subtitle: 'Management dashboards — grade distribution, subject analysis, faculty performance, and exports.',
  },
  notifications: {
    title: 'Exam Notifications',
    subtitle: 'Send datesheet, admit card, and result alerts to students.',
  },
  'audit-log': {
    title: 'Examination Audit Log',
    subtitle: 'Immutable trail of hall ticket generation, result publishing, and QP approvals.',
  },
  deadlines: {
    title: 'Deadline Management',
    subtitle: 'Registration, fee payment, hall ticket release, and result declaration countdowns.',
  },
  'degree-audit': {
    title: 'Degree Eligibility Audit',
    subtitle: 'Verify credits, CGPA, backlogs, and clearance gates before certificate issuance.',
  },
  documents: {
    title: 'Examination Document Repository',
    subtitle: 'Notices, circulars, guidelines, and student document verification desk.',
  },
  'student-timeline': {
    title: 'Student Examination Timeline',
    subtitle: 'Chronological view of registration through final result and revaluation.',
  },
  'my-tasks': {
    title: 'My Tasks',
    subtitle: 'Assigned exam cell tasks by role and priority.',
  },
  settings: {
    title: 'Examination Settings',
    subtitle: 'Account preferences and module shortcuts for examination staff.',
  },
};

/** @deprecated Use EXAM_CELL_PAGES — kept for imports that reference EXAM_CELL_GUIDES */
export const EXAM_CELL_GUIDES = EXAM_CELL_PAGES;
