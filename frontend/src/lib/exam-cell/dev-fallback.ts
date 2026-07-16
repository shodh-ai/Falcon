import { SEED } from './seed-data';
import type { ExamCellDevFallbackMeta } from './seed-data';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const FALLBACK_LISTENERS = new Set<(meta: ExamCellDevFallbackMeta) => void>();

export function onExamCellDevFallback(listener: (meta: ExamCellDevFallbackMeta) => void) {
  FALLBACK_LISTENERS.add(listener);
  return () => {
    FALLBACK_LISTENERS.delete(listener);
  };
}

function emitFallback(path: string, method: Method, reason: string) {
  const meta: ExamCellDevFallbackMeta = { path, method, reason, at: new Date().toISOString() };
  if (process.env.NODE_ENV === 'development') {
    console.warn('[exam-cell dev fallback]', method, path, '—', reason);
  }
  for (const fn of FALLBACK_LISTENERS) fn(meta);
}

export function isExamCellDevFallbackEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const flag = window.localStorage.getItem('exam_cell_dev_fallback');
    if (flag === 'false') return false;
    if (flag === 'true') return true;
  }
  return process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_EXAM_CELL_DEV_FALLBACK === 'true';
}

function queryParam(path: string, key: string): string | null {
  const q = path.split('?')[1];
  if (!q) return null;
  return new URLSearchParams(q).get(key);
}

function pathOnly(path: string): string {
  return path.split('?')[0] ?? path;
}

function postOk(extra: Record<string, unknown> = {}) {
  return { ...SEED.postSuccess, ...extra };
}

/** Returns undefined when no fallback is available for this request. */
export function resolveExamCellDevFallback(
  path: string,
  method: Method,
  body?: unknown,
): unknown | undefined {
  if (!path.startsWith('/api/exam-cell/')) return undefined;

  const p = pathOnly(path);
  const reason = 'API unavailable — using development seed data';

  if (method !== 'GET') {
    if (p.includes('/dev/bootstrap')) return postOk({ message: 'Bootstrap simulated in offline dev mode' });
    if (p.includes('/admit-cards/generate')) return { generated: 4, blocked: 1, dev_seed: true };
    if (p.includes('/hall-ticket-approvals/sync')) return { synced: 5, total: 5, dev_seed: true };
    if (p.includes('/hall-ticket-approvals/bulk-approve')) return { approved: 3, dev_seed: true };
    if (p.includes('/hall-ticket-approvals/') && p.endsWith('/advance')) return postOk();
    if (p.includes('/seating/auto-allocate')) return { allocated: 48, dev_seed: true };
    if (p.includes('/seating/publish-plans')) return { published_rooms: 2, dev_seed: true };
    if (p.includes('/seating/swap')) return { swapped: true, dev_seed: true };
    if (p.includes('/invigilation/publish')) return { published: 3, dev_seed: true };
    if (p.includes('/invigilation/auto-assign')) return { assigned: 6, rooms: 3, dev_seed: true };
    if (p.includes('/transcripts/generate')) {
      return SEED.students.map((s) => ({
        student_user_id: s.user_id,
        name: s.name,
        enrollment_number: s.enrollment_number,
        abc_id: s.user_id.endsWith('001') ? 'ABC123456789' : null,
        digilocker_ready: s.user_id.endsWith('001') || s.user_id.endsWith('002'),
        status: 'GENERATED',
      }));
    }
    if (p.includes('/formula-audit')) return { status: 'passed', failure_rate: 18, anomaly_subjects: [], dev_seed: true };
    if (p.includes('/dean-approval')) return { dean_approved: true, dev_seed: true };
    if (p.includes('/apply-grace')) return { updated: 12, preview: [], dev_seed: true };
    if (p.includes('/declare')) return { declared: 12, dev_seed: true };
    if (p.includes('/process')) return { preview: [], processed_count: 12, dev_seed: true };
    if (p.includes('/identity/verify')) {
      return {
        student: { ...SEED.students[0], profile_picture_url: null, branch: 'Computer Science', semester: 4 },
        seating: [{ room: 'A101', seat_number: '01', subject_name: 'Database Management Systems', exam_date: new Date().toISOString().slice(0, 10) }],
        verified: true,
      };
    }
    if (p.includes('/exam-day/attendance')) return postOk({ status: (body as { status?: string })?.status ?? 'PRESENT' });
    if (p.includes('/degree-audit/')) {
      return {
        final_status: 'ELIGIBLE',
        credits_earned: 168,
        cgpa_earned: 7.82,
        pending_backlogs: 0,
        library_clearance: true,
        finance_clearance: true,
        hostel_clearance: true,
        examination_clearance: true,
        dev_seed: true,
      };
    }
    if (p.includes('/notifications/send')) {
      return { delivered: 248, channel: (body as { channel?: string })?.channel ?? 'IN_APP', message: '248 notifications delivered (dev simulation)', dev_seed: true };
    }
    if (p === '/api/exam-cell/question-papers') {
      return { qp_id: `qp-${Date.now()}`, status: 'UPLOADED', notes: (body as { notes?: string })?.notes ?? '', dev_seed: true };
    }
    if (p === '/api/exam-cell/schedules') return postOk({ notified: true, dev_seed: true });
    if (p === '/api/exam-cell/deadlines') return postOk({ dev_seed: true });
    if (p.includes('/ufm-cases') && !p.includes('form-options')) return postOk({ dev_seed: true });
    emitFallback(path, method, reason);
    return postOk();
  }

  let result: unknown;

  switch (true) {
    case p === '/api/exam-cell/dashboard':
      result = SEED.dashboard();
      break;
    case p === '/api/exam-cell/live-dashboard':
      result = SEED.liveDashboard();
      break;
    case p === '/api/exam-cell/schedules':
      result = SEED.schedules();
      break;
    case p === '/api/exam-cell/subjects':
      result = SEED.subjects;
      break;
    case p === '/api/exam-cell/blocks-halls':
      result = SEED.blocksHalls;
      break;
    case p.startsWith('/api/exam-cell/branches'):
      result = SEED.branches;
      break;
    case p === '/api/exam-cell/sessions':
      result = SEED.sessions;
      break;
    case p === '/api/exam-cell/my-tasks':
      result = SEED.myTasks;
      break;
    case p.startsWith('/api/exam-cell/analytics/advanced'):
      result = SEED.analytics(Number(queryParam(path, 'semester') ?? 4));
      break;
    case p.startsWith('/api/exam-cell/admit-cards/audit'):
      result = SEED.admitCardAudit();
      break;
    case p.startsWith('/api/exam-cell/hall-ticket-approvals'):
      result = SEED.hallTicketApprovals;
      break;
    case p === '/api/exam-cell/exam-day/today':
      result = SEED.examDayToday();
      break;
    case p.startsWith('/api/exam-cell/exam-day/roster'):
      result = SEED.examDayRoster();
      break;
    case p.startsWith('/api/exam-cell/exam-day/attendance'):
      result = SEED.examDayAttendance();
      break;
    case p === '/api/exam-cell/invigilation':
      result = SEED.invigilationDuties();
      break;
    case p === '/api/exam-cell/invigilation-requests':
      result = [];
      break;
    case p.startsWith('/api/exam-cell/faculty-roster'):
      result = SEED.faculty;
      break;
    case p.startsWith('/api/exam-cell/reports/summary'):
      result = SEED.reportsSummary(Number(queryParam(path, 'semester') ?? 4));
      break;
    case p.startsWith('/api/exam-cell/eligibility/dashboard'):
      result = SEED.eligibilityDashboard(Number(queryParam(path, 'semester') ?? 4));
      break;
    case p.startsWith('/api/exam-cell/calendar/events'):
      result = SEED.calendarEvents();
      break;
    case p.startsWith('/api/exam-cell/search'):
      result = SEED.search(queryParam(path, 'q') ?? '');
      break;
    case p.startsWith('/api/exam-cell/seating-allocations'):
      result = SEED.seatingAllocations();
      break;
    case p === '/api/exam-cell/seating-runs':
      result = [{ run_id: 'seed-run-1', allocation_strategy: 'by_exam_type', exam_type: 'END_TERM', semester: 4, branch: 'CSE', created_at: new Date().toISOString(), allocations: SEED.seatingAllocations() }];
      break;
    case p === '/api/exam-cell/seating-plans':
      result = [{ plan_id: '1', room: 'A101', published: true, exam_type: 'END_TERM', exam_date: new Date().toISOString().slice(0, 10), venue: 'Block A' }];
      break;
    case p === '/api/exam-cell/exam-centres':
      result = [{ space_id: '1', building_name: 'Block A', room_number: 'A101', capacity: 60, status: 'AVAILABLE', facilities: { projector: true } }];
      break;
    case p === '/api/exam-cell/form-windows':
      result = [{ window_id: '1', title: 'End Semester Form Fill-up 2025-26', semester: 4, program_label: 'B.Tech', status: 'OPEN', opens_at: new Date().toISOString(), closes_at: new Date(Date.now() + 604800000).toISOString() }];
      break;
    case p.startsWith('/api/exam-cell/registrations'):
      result = SEED.students.map((s, i) => ({ registration_id: `reg-${i}`, student_user_id: s.user_id, student_name: s.name, enrollment_number: s.enrollment_number, status: i === 2 ? 'PENDING' : 'APPROVED', semester: 4 }));
      break;
    case p.startsWith('/api/exam-cell/audit-log'):
      result = SEED.dashboard().recent_activity;
      break;
    case p === '/api/exam-cell/question-papers':
      result = SEED.questionPapers();
      break;
    case p.startsWith('/api/exam-cell/backlog-applications'):
      result = SEED.backlogApplications();
      break;
    case p === '/api/exam-cell/re-evaluations':
      result = SEED.reEvaluations();
      break;
    case p === '/api/exam-cell/ufm-cases':
      result = SEED.ufmCases();
      break;
    case p.startsWith('/api/exam-cell/ufm-cases/form-options'):
      result = SEED.ufmFormOptions(
        Number(queryParam(path, 'semester') ?? 4),
        queryParam(path, 'department') ?? undefined,
      );
      break;
    case p === '/api/exam-cell/notifications/campaigns':
      result = [{ campaign_id: '1', subject: 'Hall tickets released — Sem 4 End Term', channel: 'IN_APP', recipient_count: 248, sent_at: new Date().toISOString() }];
      break;
    case p === '/api/exam-cell/deadlines':
      result = [{ deadline_id: '1', title: 'Form fill-up closes', deadline_type: 'REGISTRATION', due_at: new Date(Date.now() + 259200000).toISOString(), days_remaining: 3 }];
      break;
    case p.startsWith('/api/exam-cell/answer-sheets'):
      result = [{ sheet_id: '1', sheet_number: 'AS-2026-0042', status: 'RECEIVED', student_name: 'Rahul Sharma', subject_name: 'Operating Systems' }];
      break;
    case p === '/api/exam-cell/document-repository':
      result = [{ repository_id: '1', title: 'End Semester Examination Guidelines 2025-26', category: 'GUIDELINE', file_url: null, created_at: new Date().toISOString() }];
      break;
    case p === '/api/exam-cell/student-documents':
      result = [{ doc_id: '1', student_name: 'Priya Patel', enrollment_number: 'SGVU2022CSE002', document_type: 'MEDICAL_CERTIFICATE', verification_status: 'PENDING' }];
      break;
    case p === '/api/exam-cell/workflows':
      result = [{ workflow_id: '1', workflow_name: 'Internal Marks Approval', workflow_type: 'MARKS_ENTRY', steps: ['Faculty', 'HOD', 'COE', 'Locked'], is_active: true }];
      break;
    case p === '/api/exam-cell/results/pending':
      result = SEED.students.slice(0, 3).map((s, i) => ({
        mark_id: `m-${i}`, student_name: s.name, course_code: 'CS401', course_name: 'Operating Systems',
        course_id: 'b2000001-0000-4000-8000-000000000001', exam_type: 'END_TERM', marks_obtained: String(72 + i * 3),
        max_marks: '100', percent: String(72 + i * 3), semester: 4, faculty_name: 'Dr. Anil Mehta', status: 'PENDING_COE',
      }));
      break;
    case p === '/api/exam-cell/result-control/sessions':
      result = [{ session_id: SEED.ids.sessionEnd, course_id: 'b2000001-0000-4000-8000-000000000001', course_code: 'CS401', course_name: 'Operating Systems', exam_type: 'END_TERM', semester: 4, max_marks: 100, pass_marks: 40, entry_status: 'LOCKED', marks_locked: true, declared_at: null, processed_at: null, pending_coe_count: 3, report_count: 0, grading_policy_id: 1 }];
      break;
    case p === '/api/exam-cell/result-control/courses':
      result = [{ course_id: 'b2000001-0000-4000-8000-000000000001', course_code: 'CS401', course_name: 'Operating Systems' }, { course_id: 'b2000002-0000-4000-8000-000000000002', course_code: 'CS403', course_name: 'Database Management Systems' }];
      break;
    case p === '/api/exam-cell/result-control/grading-policies':
      result = [{ policy_id: 1, policy_name: 'SGVU UG Grading Policy 2025' }];
      break;
    case p.startsWith('/api/exam-cell/result-control/sessions/'):
      result = { session_id: SEED.ids.sessionEnd, course_code: 'CS401', course_name: 'Operating Systems', exam_type: 'END_TERM', coe_audit_status: 'idle', dean_approved: false, max_marks: 100, pass_marks: 40, entry_status: 'LOCKED', marks_locked: true, declared_at: null, grading_policy_id: 1 };
      break;
    case p.startsWith('/api/exam-cell/grades-aggregate/courses'):
      result = [{ course_id: 'b2000001-0000-4000-8000-000000000001', course_code: 'CS401', course_name: 'Operating Systems' }];
      break;
    case p.startsWith('/api/exam-cell/grades-aggregate/table'):
      result = SEED.gradesAggregateTable();
      break;
    case p.startsWith('/api/exam-cell/grade-cards'):
      if (pathOnly(path).includes('/top-students')) {
        result = SEED.students.slice(0, 5).map((s, i) => ({
          student_user_id: s.user_id,
          student_name: s.name,
          enrollment_number: s.enrollment_number,
          rank: i + 1,
          sgpa: (8.5 - i * 0.15).toFixed(2),
          cgpa: (8.2 - i * 0.1).toFixed(2),
          result_stage: i < 2 ? 'PROVISIONAL' : 'DRAFT',
        }));
      } else {
        result = SEED.students.map((s, i) => ({
          grade_card_id: `gc-${i}`,
          student_user_id: s.user_id,
          semester: Number(queryParam(path, 'semester') ?? 4),
          cgpa: (7.8 + i * 0.1).toFixed(2),
          status: 'DRAFT',
          published_at: null,
          student_name: s.name,
          student_email: `${s.enrollment_number.toLowerCase()}@student.sgvu.edu.in`,
          enrollment_number: s.enrollment_number,
          payload: {
            result_stage: 'DRAFT',
            sgpa: 8.2 - i * 0.1,
            cgpa: 7.8 + i * 0.1,
            rank: i + 1,
            credits_attempted: 24,
            credits_earned: 22,
          },
        }));
      }
      break;
    case p.startsWith('/api/exam-cell/students/') && p.endsWith('/timeline'):
      result = {
        student: {
          name: SEED.students[0].name,
          enrollment_number: SEED.students[0].enrollment_number,
        },
        timeline: [
          { stage: 'Registration', status: 'COMPLETED', at: new Date(Date.now() - 604800000).toISOString() },
          { stage: 'Hall Ticket', status: 'GENERATED', at: new Date(Date.now() - 259200000).toISOString() },
          { stage: 'Exam Attendance', status: 'PRESENT', at: new Date().toISOString() },
          { stage: 'Result', status: 'PENDING', at: null },
        ],
      };
      break;
    case p === '/api/exam-cell/dev/status':
      result = { schedules: 3, sessions: 2, seating: 5, hall_ticket_approvals: 3, needs_bootstrap: false, dev_seed: true };
      break;
    default:
      result = [];
  }

  emitFallback(path, method, reason);
  return result;
}

export function shouldUseExamCellFallback(status: number): boolean {
  // Do not mask 500 — surface server errors during QA and production debugging.
  return status === 404 || status === 502 || status === 503 || status === 504;
}

export function shouldUseExamCellFallbackForNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
  if (err instanceof Error && /cannot reach api|ECONNREFUSED|network/i.test(err.message)) return true;
  return false;
}
