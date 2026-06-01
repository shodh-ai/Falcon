'use client';

import type { WorkspacePageConfig } from '@/components/workspaces/WorkspaceScaffold';

export const parentPages = {
  dashboard: {
    title: 'Parent Dashboard',
    subtitle: 'Read-only guardian overview via registered mobile OTP.',
    endpoint: '/api/parent/overview?mobile=%2B919999000001',
    dataKey: 'children',
    columns: [
      { key: 'name', label: 'Student' },
      { key: 'official_email', label: 'Email' },
      { key: 'student_user_id', label: 'Student ID' },
    ],
  },
  attendance: {
    title: 'Child Attendance',
    subtitle: 'Course-wise attendance visible to parents.',
    endpoint: '/api/parent/attendance?mobile=%2B919999000001',
    columns: [
      { key: 'course_code', label: 'Course' },
      { key: 'course_name', label: 'Name' },
      { key: 'attendance_percent', label: 'Attendance %' },
    ],
  },
  marks: {
    title: 'Marks & Grade Cards',
    subtitle: 'Mid-term, end-term, and grade information.',
    endpoint: '/api/parent/marks?mobile=%2B919999000001',
    columns: [
      { key: 'course_code', label: 'Course' },
      { key: 'course_name', label: 'Name' },
      { key: 'semester', label: 'Semester' },
      { key: 'grade', label: 'Grade' },
      { key: 'grade_points', label: 'Points' },
    ],
  },
  fees: {
    title: 'Fee Dues',
    subtitle: 'Read-only fee demand and overdue view.',
    endpoint: '/api/parent/fees?mobile=%2B919999000001',
    columns: [
      { key: 'fee_head', label: 'Head' },
      { key: 'total_amount', label: 'Total' },
      { key: 'paid_amount', label: 'Paid' },
      { key: 'due_date', label: 'Due' },
      { key: 'status', label: 'Status' },
    ],
  },
  discipline: {
    title: 'Disciplinary Records',
    subtitle: 'Disciplinary records and mentor actions.',
    endpoint: '/api/parent/discipline?mobile=%2B919999000001',
    columns: [
      { key: 'incident_date', label: 'Date' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'action_taken', label: 'Action' },
    ],
  },
} satisfies Record<string, WorkspacePageConfig>;

export const examCellPages = {
  dashboard: {
    title: 'Exam Cell Dashboard',
    subtitle: 'Assessment operations, seating plans, grade cards, and UFM oversight.',
    endpoint: '/api/exam-cell/ufm-cases',
    columns: [
      { key: 'student_name', label: 'Student' },
      { key: 'exam_type', label: 'Exam' },
      { key: 'status', label: 'Status' },
      { key: 'logged_at', label: 'Logged' },
    ],
  },
  seatingPlans: {
    title: 'Seating Plans',
    subtitle: 'Create and publish exam room seating plans.',
    endpoint: '/api/exam-cell/seating-plans',
    columns: [
      { key: 'exam_type', label: 'Exam' },
      { key: 'exam_date', label: 'Date' },
      { key: 'room', label: 'Room' },
      { key: 'published', label: 'Published' },
    ],
  },
  gradeCards: {
    title: 'Grade Cards',
    subtitle: 'Manage semester grade cards and publication status.',
    endpoint: '/api/exam-cell/grade-cards',
    columns: [
      { key: 'student_name', label: 'Student' },
      { key: 'semester', label: 'Semester' },
      { key: 'cgpa', label: 'CGPA' },
      { key: 'status', label: 'Status' },
    ],
  },
  ufmCases: {
    title: 'UFM Cases',
    subtitle: 'Unfair Means cases, penalties, and committee status.',
    endpoint: '/api/exam-cell/ufm-cases',
    columns: [
      { key: 'student_name', label: 'Student' },
      { key: 'exam_type', label: 'Exam' },
      { key: 'description', label: 'Description' },
      { key: 'penalty_applied', label: 'Penalty' },
      { key: 'status', label: 'Status' },
    ],
  },
} satisfies Record<string, WorkspacePageConfig>;
