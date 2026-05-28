import { API_URL, apiFetch } from './client';

const ACADEMICS = `${API_URL}/api/academics`;

export interface AttendanceEntry {
  student_user_id: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
}

export interface MarkAttendancePayload {
  subject_id: number;
  batch_id?: number;
  session_date: string;
  session_slot?: string;
  entries: AttendanceEntry[];
}

export interface FacultyTodayClass {
  classId: number;
  timetableEntryId: number;
  subjectName: string;
  roomNumber: string;
  time: string;
  startTime: string;
  endTime: string;
  batchId: number;
  subjectId: number;
  studentCount: number;
}

export interface ClassStudent {
  student_id: string;
  name: string;
  roll_number: string;
  photo_url: string | null;
}

export interface BulkAttendancePayload {
  course_offering_id: number;
  subject_id: number;
  batch_id?: number;
  session_date: string;
  session_slot?: string;
  entries: { student_id: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }[];
}

export const academicsApi = {
  listSubjects: (token: string) => apiFetch<unknown[]>(token, { url: `${ACADEMICS}/subjects`, headers: {} }),
  createSubject: (token: string, dto: Record<string, unknown>) =>
    apiFetch<unknown>(token, { url: `${ACADEMICS}/subjects`, method: 'POST', headers: {}, data: dto }),
  listBatches: (token: string) => apiFetch<unknown[]>(token, { url: `${ACADEMICS}/batches`, headers: {} }),
  getFacultyTodayClasses: (token: string) =>
    apiFetch<FacultyTodayClass[]>(token, { url: `${ACADEMICS}/faculty/today-classes`, headers: {} }),
  getClassStudents: (token: string, classId: number) =>
    apiFetch<ClassStudent[]>(token, { url: `${ACADEMICS}/classes/${classId}/students`, headers: {} }),
  bulkAttendance: (token: string, payload: BulkAttendancePayload) =>
    apiFetch<{ saved: number; session_date: string }>(token, {
      url: `${ACADEMICS}/attendance/bulk`,
      method: 'POST',
      headers: {},
      data: payload,
    }),
  markAttendance: (token: string, payload: MarkAttendancePayload) =>
    apiFetch<unknown>(token, { url: `${ACADEMICS}/attendance`, method: 'POST', headers: {}, data: payload }),
  studentResults: (token: string, studentUserId: string) =>
    apiFetch<unknown[]>(token, { url: `${ACADEMICS}/results/student/${studentUserId}`, headers: {} }),
  listGradingPolicies: (token: string) =>
    apiFetch<unknown[]>(token, { url: `${ACADEMICS}/grading-policies`, headers: {} }),
  createGradingPolicy: (token: string, dto: Record<string, unknown>) =>
    apiFetch<unknown>(token, {
      url: `${ACADEMICS}/grading-policies`,
      method: 'POST',
      headers: {},
      data: dto,
    }),
};
