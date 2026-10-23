import { API_URL } from '@/lib/api/client';
import { getSubdomainFromClient } from '@/lib/tenant';

export type LmsModule = {
  module_id: string;
  module_number: number;
  title: string;
  description?: string | null;
  status: string;
  materials: LmsMaterial[];
};

export type LmsMaterial = {
  material_id: string;
  title: string;
  material_type: string;
  external_url?: string | null;
  uploaded_at?: string;
  published_sections?: string[];
};

export type MaterialPublishTarget = {
  allocation_id: string;
  label: string;
  program_name: string | null;
  semester: string | null;
  subject_code: string;
  subject_name: string;
};

export type MaterialPublishTargetsResponse = {
  course: { course_id?: string; course_code: string; course_name: string };
  targets: MaterialPublishTarget[];
  cross_section_available: boolean;
};

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
    has_reference_file?: boolean;
  };
  submission: {
    submission_id: string;
    submitted_at: string;
    marks_awarded: string | null;
    faculty_remarks: string | null;
    revision_due_at?: string | null;
    status?: string;
  } | null;
  status: 'PENDING' | 'SUBMITTED' | 'GRADED' | 'OVERDUE' | 'RETURNED_FOR_REVISION';
  can_resubmit?: boolean;
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
  faculty_user_id?: string;
  title: string;
  max_marks: number;
  start_date: string;
  due_date: string;
  description?: string | null;
  semester?: number | null;
  section_code?: string | null;
  submission_count?: number;
  notified_count?: number;
};

export type AssignmentRosterRow = {
  student_user_id: string;
  student_name: string;
  submitted: boolean;
  submission_id: string | null;
  marks_awarded: string | null;
  status: 'GRADED' | 'SUBMITTED' | 'NOT_SUBMITTED' | 'RETURNED_FOR_REVISION';
  faculty_remarks?: string | null;
  revision_due_at?: string | null;
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
  a.download = resolveDownloadFilename(
    filename,
    res.headers.get('Content-Disposition'),
    res.headers.get('Content-Type') || blob.type,
  );
  a.click();
  URL.revokeObjectURL(url);
}

const DOWNLOAD_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/zip': '.zip',
};

export function resolveDownloadFilename(
  title: string,
  contentDisposition: string | null,
  contentType: string | null,
): string {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let serverName: string | undefined;
  if (encoded) {
    try {
      serverName = decodeURIComponent(encoded);
    } catch {
      // A malformed header must not prevent the download.
    }
  }
  serverName ||= contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
  if (serverName) {
    return serverName.replace(/[\\/\x00-\x1f\x7f]/g, '_');
  }

  const safeTitle = title.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim() || 'download';
  const extension = DOWNLOAD_EXTENSIONS[(contentType || '').split(';')[0].toLowerCase()];
  if (!extension) return safeTitle;
  const stem = safeTitle
    .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|txt|png|jpe?g|webp|zip)$/i, '')
    .trim() || 'download';
  return `${stem}${extension}`;
}

export async function getBlobUrlWithAuth(path: string, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to load file'));
  const blob = await res.blob();
  return URL.createObjectURL(blob);
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
