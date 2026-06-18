import { API_URL } from '@/lib/api/client';
import { getSubdomainFromClient } from '@/lib/tenant';

export type LmsModule = {
  module_id: string;
  module_number: number;
  title: string;
  description?: string | null;
  status: string;
  materials: { material_id: string; title: string; material_type: string; uploaded_at?: string }[];
};

export type LmsMaterial = { material_id: string; title: string; material_type: string; uploaded_at?: string };

export type FacultyWorkspace = {
  course: { course_id?: string; course_code: string; course_name: string; credits: number };
  syllabus_materials?: LmsMaterial[];
  modules: LmsModule[];
  syllabus_configured: boolean;
};

export type StudentAssignmentRow = {
  assignment: {
    assignment_id: string;
    title: string;
    start_date: string;
    due_date: string;
    max_marks: number;
    description?: string | null;
  };
  submission: {
    submission_id: string;
    submitted_at: string;
    marks_awarded: string | null;
    faculty_remarks: string | null;
  } | null;
  status: 'PENDING' | 'SUBMITTED' | 'GRADED' | 'OVERDUE';
};

export type StudentWorkspace = {
  course: { course_code: string; course_name: string };
  enrollment: { attendance_percent: number; semester: number };
  syllabus_progress: { completed: number; total: number; percent: number };
  syllabus_materials?: LmsMaterial[];
  modules: LmsModule[];
  assignments: StudentAssignmentRow[];
};

export type FacultyAssignment = {
  assignment_id: string;
  title: string;
  max_marks: number;
  start_date: string;
  due_date: string;
  description?: string | null;
  submission_count?: number;
};

export type AssignmentRosterRow = {
  student_user_id: string;
  student_name: string;
  submitted: boolean;
  submission_id: string | null;
  marks_awarded: string | null;
  status: 'GRADED' | 'SUBMITTED' | 'NOT_SUBMITTED';
};

export function formatDeadlineCountdown(dueDate: string): string {
  const ms = new Date(dueDate).getTime() - Date.now();
  if (ms <= 0) return 'Deadline passed';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `Due in ${days} Day${days === 1 ? '' : 's'}, ${hours} Hour${hours === 1 ? '' : 's'}`;
  if (hours > 0) return `Due in ${hours} Hour${hours === 1 ? '' : 's'}, ${mins} Min`;
  return `Due in ${mins} Min`;
}

export async function downloadWithAuth(path: string, token: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Download failed'));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function postMultipart(path: string, token: string, form: FormData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Upload failed'));
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export async function patchMultipart(path: string, token: string, form: FormData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Update failed'));
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : null;
}
