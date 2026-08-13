/**
 * Relational Faculty Portal smoke dataset.
 * Generated once per module load via seeded factories — consistent IDs/relationships.
 */

import {
  BATCHES,
  COURSE_CATALOG,
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  LAST_NAMES,
  PROGRAMS,
  SECTIONS,
  academicSessionAnchor,
  academicStatusFromAttendance,
  addDays,
  avatarUrl,
  createSeededRng,
  emailFor,
  employeeId,
  gradeFromPercent,
  indianPhone,
  isoDate,
  rollNumber,
  type SeededRng,
} from './factories';

export type SmokeFacultyProfile = {
  user_id: string;
  name: string;
  display_name: string;
  honorific: string | null;
  email: string;
  phone: string | null;
  role: string;
  department: string | null;
  employee_id: string | null;
  designation: string;
  joining_date: string | null;
  profile_photo_url: string | null;
  total_teaching_experience_years: number | null;
  industry_experience_years: number;
  api_score: number;
  active_mentees: number;
  bio: string;
  skills: string[];
  research_interests: string[];
  office_hours: string;
  social_links: { linkedin: string; google_scholar: string; orcid: string };
  responsibilities: Array<{ title: string; description?: string | null; source?: string }>;
  personal: {
    date_of_birth: string | null;
    blood_group: string | null;
    gender: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    permanent_address: string | null;
    current_address: string | null;
  };
  kyc: {
    pan_masked: string | null;
    aadhaar_masked: string | null;
    bank_masked: string | null;
    ifsc_code: string | null;
    pf_uan: string | null;
  };
  research_identifiers: {
    orcid_id: string | null;
    scopus_id: string | null;
    google_scholar_url: string | null;
  };
  research_summary: {
    total_scopus_papers: number;
    total_patents: number;
    total_conference_papers: number;
    total_books: number;
    total_publications: number;
    total_grants_inr: number;
    total_grants_display: string;
  };
  qualifications: Array<{
    qual_id: string;
    degree_level: string;
    degree_name: string;
    university: string;
    passing_year: number;
    specialization: string | null;
    document_proof_url: string | null;
  }>;
  workload: {
    courses: Array<{
      course_id: string;
      course_code: string;
      course_name: string;
      credits: number;
      session_type: string;
    }>;
    weekly_teaching_hours: number;
    project_guides_count: number;
    project_guides: Array<{
      guide_id: string;
      project_title: string | null;
      project_type: string | null;
      student_name: string;
    }>;
    phd_scholars_count: number;
    phd_scholars: Array<{ scholar_id: string; current_phase: string; scholar_name: string }>;
  };
  bank_change_pending: null;
};

export type SmokeCourse = {
  allocation_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  program_name: string | null;
  semester: string | null;
  academic_year: string | null;
  department: string;
  batch: string;
  section: string;
  students_enrolled: number;
  attendance_percent: number;
  completion_percent: number;
  faculty_role: 'Course Instructor' | 'Lab Instructor' | 'Co-Instructor';
  status: 'ACTIVE' | 'COMPLETED' | 'UPCOMING';
};

export type SmokeStudent = {
  student_id: string;
  user_id: string;
  roll_number: string;
  name: string;
  photo: string;
  email: string;
  phone: string;
  program: string;
  semester: number;
  section: string;
  department: string;
  course_ids: string[];
  attendance_percent: number;
  internal_marks: number;
  assignment_score: number;
  practical_marks: number;
  overall_grade: string;
  academic_status: string;
};

export type SmokeAttendanceDay = {
  date: string;
  student_id: string;
  course_id: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'MEDICAL_LEAVE' | 'LATE' | 'HOLIDAY';
};

export type SmokeAssignment = {
  assignment_id: string;
  title: string;
  course_id: string;
  course_code: string;
  course_name: string;
  due_date: string;
  created_date: string;
  max_marks: number;
  submission_count: number;
  pending_count: number;
  average_marks: number;
  status: 'OPEN' | 'CLOSED' | 'GRADING' | 'PUBLISHED';
  description: string;
  semester: string;
  section_code: string;
};

export type SmokeSubmission = {
  submission_id: string;
  assignment_id: string;
  student_id: string;
  student_name: string;
  roll_number: string;
  submitted_on: string | null;
  late_submission: boolean;
  marks: number | null;
  feedback: string | null;
  grade: string | null;
  status: 'SUBMITTED' | 'LATE' | 'PENDING' | 'GRADED' | 'RETURNED';
};

export type SmokeExam = {
  exam_id: string;
  exam_type: 'MID_SEMESTER' | 'END_SEMESTER' | 'QUIZ' | 'LAB_EXAM' | 'PRACTICAL' | 'VIVA';
  exam_date: string;
  room: string;
  start_time: string;
  end_time: string;
  invigilator: string;
  course_id: string;
  course_code: string;
  course_name: string;
  total_marks: number;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
};

export type SmokeMarks = {
  student_id: string;
  course_id: string;
  internal: number;
  external: number;
  assignment: number;
  quiz: number;
  lab: number;
  attendance: number;
  practical: number;
  final_grade: string;
  result_status: 'PASS' | 'FAIL' | 'ABSENT' | 'DETAINED';
};

export type SmokeTimetableSlot = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string;
  building: string;
  course_id: string;
  course_code: string;
  course_name: string;
  section: string;
  semester: string;
  student_count: number;
};

export type SmokeLeaveRequest = {
  leave_id: string;
  request_type: string;
  leave_type: 'CL' | 'ML' | 'DL' | 'EL' | 'CONFERENCE';
  leave_label: string;
  start_date: string;
  end_date: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'CANCELLED';
  reason: string;
  applied_date: string;
};

export type SmokeResearch = {
  research_id: string;
  publication_title: string;
  journal_name: string | null;
  indexing_type: string | null;
  publication_type: 'JOURNAL' | 'CONFERENCE' | 'PATENT' | 'BOOK' | 'PROJECT';
  published_date: string | null;
  status: string;
  funding_inr?: number;
  collaborators?: string[];
  proof_file_path?: string | null;
};

export type SmokeMeeting = {
  meeting_id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  agenda: string;
  meeting_mode: 'SCHEDULED' | 'REQUESTED';
  status: string;
  organizer_user_id: string;
  organizer_name: string;
  requester_user_id: string;
  requester_name: string;
  category: string;
  participants: Array<{
    participant_id: string;
    user_id: string;
    name: string;
    email: string;
    participant_role: string;
    rsvp_status: string;
  }>;
  minutes?: {
    minutes_id: string;
    notes: string;
    decisions?: string | null;
    action_items?: string | null;
    published_at?: string | null;
  } | null;
};

export type SmokeNotification = {
  notification_id: string;
  tenant_id: string;
  user_id: string;
  category: string;
  title: string;
  message: string;
  action_link: string | null;
  severity: string;
  intent: string;
  action_label: string;
  is_read: boolean;
  important: boolean;
  created_at: string;
};

export type SmokeMessageThread = {
  thread_id: string;
  counterpart: string;
  counterpart_role: 'Faculty' | 'Student' | 'HOD' | 'Exam Cell' | 'Registrar';
  subject: string;
  unread: number;
  updated_at: string;
  messages: Array<{
    message_id: string;
    sender: 'self' | 'other';
    body: string;
    sent_at: string;
  }>;
};

export type SmokeDocument = {
  document_id: string;
  title: string;
  category:
    | 'Course Files'
    | 'Lecture Notes'
    | 'Question Banks'
    | 'Assignments'
    | 'Lab Manuals'
    | 'Research Papers'
    | 'Certificates';
  file_name: string;
  size_kb: number;
  upload_date: string;
  downloads: number;
  owner: string;
  visibility: 'PRIVATE' | 'COURSE' | 'DEPARTMENT' | 'PUBLIC';
  document_type: string;
  verification_status: string;
  uploaded_at: string;
};

export type SmokePerformance = {
  teaching_score: number;
  student_feedback: number;
  research_score: number;
  attendance: number;
  workload_hours: number;
  completion_rate: number;
  kpis: Array<{ label: string; value: string; tone: 'good' | 'warn' | 'neutral' }>;
};

export type SmokeCalendarEvent = {
  event_id: string;
  title: string;
  type: 'CLASS' | 'MEETING' | 'EXAM' | 'EVENT' | 'DEADLINE' | 'LEAVE' | 'HOLIDAY';
  starts_at: string;
  ends_at: string;
  location?: string;
};

export type SmokeAiHistory = {
  conversations: Array<{
    conversation_id: string;
    title: string;
    prompt_type: string;
    token_usage: number;
    created_at: string;
    updated_at: string;
  }>;
  suggested_prompts: string[];
  resolved_queries: Array<{ query: string; resolved_at: string }>;
  recent_searches: string[];
  bookmarks: Array<{ title: string; href: string }>;
};

export type SmokeActivityLog = {
  log_id: string;
  action:
    | 'LOGIN'
    | 'LOGOUT'
    | 'ATTENDANCE_UPDATED'
    | 'MARKS_UPLOADED'
    | 'ASSIGNMENT_CREATED'
    | 'COURSE_EDITED'
    | 'LEAVE_APPLIED'
    | 'DOCUMENTS_UPLOADED';
  detail: string;
  created_at: string;
  ip?: string;
};

export type FacultySmokeDataset = {
  profile: SmokeFacultyProfile;
  courses: SmokeCourse[];
  students: SmokeStudent[];
  attendanceDays: SmokeAttendanceDay[];
  assignments: SmokeAssignment[];
  submissions: SmokeSubmission[];
  exams: SmokeExam[];
  marks: SmokeMarks[];
  timetable: SmokeTimetableSlot[];
  leaveRequests: SmokeLeaveRequest[];
  leaveBalances: Array<{ leave_type: string; entitled: number; used: number }>;
  research: SmokeResearch[];
  meetings: SmokeMeeting[];
  notifications: SmokeNotification[];
  messages: SmokeMessageThread[];
  documents: SmokeDocument[];
  performance: SmokePerformance;
  calendar: SmokeCalendarEvent[];
  aiHistory: SmokeAiHistory;
  activityLogs: SmokeActivityLog[];
  todayClasses: SmokeTimetableSlot[];
  missingAttendance: SmokeTimetableSlot[];
  atRisk: Array<{
    user_id: string;
    name: string;
    risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
    metrics: { attendance_percent: number | null; grades_percent: number | null };
  }>;
  mentees: Array<{
    mentorship_id: string;
    user_id: string;
    name: string;
    full_name: string;
    student: { user_id: string; name: string; email: string };
  }>;
  pendingApprovals: {
    certificates: Array<{
      certificate_id: string;
      title: string;
      issuer: string;
      issue_date: string;
      uploaded_at: string;
      student: { user_id: string; name: string; email: string };
    }>;
    meetings: Array<{
      meeting_id: string;
      student_name: string;
      requested_time: string;
      topic: string;
      status: string;
    }>;
    leave_requests: Array<{
      interaction_id: string;
      student_name: string;
      reason: string;
      start_date: string;
      end_date: string;
      status: string;
    }>;
  };
  duties: Array<{
    assignment_id: string;
    exam_name: string;
    exam_date: string;
    room: string;
    block_name: string;
    session_label: string;
    status: string;
    excuse_status: null;
    excuse_reason: null;
    exam_cell_comment: null;
  }>;
  weeklyTests: Array<{
    test_id: string;
    course_code: string;
    course_name: string;
    test_type: string;
    is_active: boolean;
    start_time: string;
    end_time: string;
    response_count: number;
    avg_score: number;
  }>;
  hrToday: {
    shift: { start: string; end: string; progress_percent: number };
    display: { in_time: string; out_time: string; hours_worked_today: string };
    status: string;
    today: { check_in_at: string; check_out_at: string | null };
    week_hours: number;
  };
  holidays: {
    mandatory: Array<{ holiday_id: string; title: string; date: string; type: string; description?: string }>;
    restricted: Array<{ holiday_id: string; title: string; date: string; type: string; description?: string }>;
  };
  announcements: Array<{ id: string; title: string; body: string; created_at: string }>;
  recentActivity: Array<{ id: string; title: string; at: string; kind: string }>;
  upcomingEvents: Array<{ id: string; title: string; at: string; venue: string }>;
  charts: {
    attendanceTrend: Array<{ week: string; percent: number }>;
    weeklyTeachingHours: Array<{ day: string; hours: number }>;
    studentPerformance: Array<{ band: string; count: number }>;
    courseCompletion: Array<{ course_code: string; percent: number }>;
    departmentComparison: Array<{ department: string; score: number }>;
  };
  dashboardStats: {
    classesToday: number;
    attendancePercent: number;
    pendingEvaluations: number;
    upcomingExams: number;
    assignedCourses: number;
    researchProjects: number;
    leaveBalance: number;
    notifications: number;
  };
  essDocuments: {
    documents: Array<{
      document_id: string;
      document_type: string;
      file_name: string;
      verification_status: string;
      uploaded_at: string;
    }>;
    groups: Record<string, unknown>;
    categories: string[];
  };
  chatMentees: Array<{
    student_user_id: string;
    student_name: string;
    student_email: string;
    unread_count: number;
  }>;
  eligibleParticipants: Array<{
    user_id: string;
    name: string;
    email: string;
    role_name: string;
    dept_name: string;
    relation: string;
  }>;
  adjustments: Array<{
    adjustment_id: string;
    adjustment_type: string;
    status: string;
    course_code: string;
    course_name: string;
    original_date: string | null;
    new_date: string | null;
    reason: string | null;
  }>;
  timetableStats: {
    term_start: string;
    weekly_slots: number;
    courses_taught: number;
    expected_so_far: number;
    conducted_classes: number;
    remaining_classes: number;
    completion_percent: number;
    todays_classes: number;
    todays_conducted: number;
    todays_remaining: number;
    missing_attendance_today: number;
    pending_adjustments: number;
    approved_adjustments: number;
    rejected_adjustments: number;
    approved_extra_classes: number;
    courses: Array<{
      course_id: string;
      course_code: string;
      course_name: string;
      weekly_slots: number;
      expected_so_far: number;
      conducted_classes: number;
      remaining_classes: number;
      completion_percent: number;
    }>;
  };
};

function personName(rng: SeededRng): string {
  const female = rng.bool(0.45);
  const first = female ? rng.pick(FIRST_NAMES_F) : rng.pick(FIRST_NAMES_M);
  return `${first} ${rng.pick(LAST_NAMES)}`;
}

function programCode(program: string): string {
  if (program.includes('AI')) return 'AD';
  if (program.includes('IT')) return 'IT';
  if (program.includes('Mechanical')) return 'ME';
  if (program.includes('Civil')) return 'CE';
  if (program.includes('Electrical')) return 'EE';
  if (program === 'MBA') return 'MB';
  if (program === 'BBA') return 'BB';
  if (program === 'BCA') return 'BC';
  if (program === 'MCA') return 'MC';
  return 'CS';
}

function departmentForProgram(program: string): string {
  if (program.includes('AI')) return 'AI & DS';
  if (program.includes('IT')) return 'Information Technology';
  if (program.includes('Mechanical')) return 'Mechanical';
  if (program.includes('Civil')) return 'Civil';
  if (program.includes('Electrical')) return 'Electrical';
  if (program === 'MBA') return 'MBA';
  if (program === 'BBA') return 'BBA';
  if (program === 'BCA') return 'BCA';
  if (program === 'MCA') return 'MCA';
  return 'Computer Science';
}

function buildDataset(seed = 42_021): FacultySmokeDataset {
  const rng = createSeededRng(seed);
  const now = new Date();
  const sessionStart = academicSessionAnchor(now);
  const academicYear = `${sessionStart.getFullYear()}-${String(sessionStart.getFullYear() + 1).slice(-2)}`;
  const facultyName = 'Dr. Ananya Sharma';
  const facultyUserId = 'fac-demo-user-001';
  const dept = 'Computer Science';
  const empId = employeeId(rng, 'CSE');

  const courses: SmokeCourse[] = COURSE_CATALOG.map((c, i) => {
    const batch = BATCHES[i % BATCHES.length]!;
    const section = SECTIONS[i % SECTIONS.length]!;
    const enrolled = rng.int(42, 78);
    return {
      allocation_id: `alloc-${c.code}`,
      course_id: `course-${c.code.toLowerCase()}`,
      course_code: c.code,
      course_name: c.name,
      credits: c.credits,
      program_name: PROGRAMS.find((p) => p.includes(c.department.split(' ')[0]!)) ?? PROGRAMS[0]!,
      semester: String(c.semester),
      academic_year: academicYear,
      department: c.department,
      batch,
      section,
      students_enrolled: enrolled,
      attendance_percent: rng.percent(72, 96),
      completion_percent: rng.percent(45, 92),
      faculty_role: c.code.includes('Lab') ? 'Lab Instructor' : rng.bool(0.15) ? 'Co-Instructor' : 'Course Instructor',
      status: rng.bool(0.08) ? 'UPCOMING' : rng.bool(0.1) ? 'COMPLETED' : 'ACTIVE',
    };
  });

  const primaryCourses = courses.filter((c) =>
    ['Computer Science', 'AI & DS', 'Information Technology'].includes(c.department),
  );

  const students: SmokeStudent[] = [];
  for (let i = 0; i < 220; i += 1) {
    const program = PROGRAMS[i % PROGRAMS.length]!;
    const semester = [3, 4, 5, 6][i % 4]!;
    const section = SECTIONS[i % SECTIONS.length]!;
    const department = departmentForProgram(program);
    const name = personName(rng);
    const batchYear = 2022 + (i % 4);
    const matchingCourses = courses.filter(
      (c) => Number(c.semester) === semester && (c.department === department || i % 7 === 0),
    );
    const enrolledCourses =
      matchingCourses.length > 0
        ? rng.pickN(matchingCourses, Math.min(4, matchingCourses.length))
        : rng.pickN(primaryCourses, 3);
    const att = rng.percent(48, 98);
    const internal = rng.percent(35, 95, 0);
    const assignment = rng.percent(40, 98, 0);
    const practical = rng.percent(45, 98, 0);
    const overall = Math.round(internal * 0.4 + assignment * 0.3 + practical * 0.3);
    const userId = `stu-demo-${String(i + 1).padStart(4, '0')}`;
    students.push({
      student_id: userId,
      user_id: userId,
      roll_number: rollNumber(rng, programCode(program), batchYear, semester, i + 1),
      name,
      photo: avatarUrl(name),
      email: emailFor(name, 'student.sgvu.edu.in'),
      phone: indianPhone(rng),
      program,
      semester,
      section,
      department,
      course_ids: enrolledCourses.map((c) => c.course_id),
      attendance_percent: att,
      internal_marks: internal,
      assignment_score: assignment,
      practical_marks: practical,
      overall_grade: gradeFromPercent(overall),
      academic_status: academicStatusFromAttendance(att, overall),
    });
  }

  // Refresh enrolled counts from real assignments
  for (const course of courses) {
    course.students_enrolled = students.filter((s) => s.course_ids.includes(course.course_id)).length || course.students_enrolled;
  }

  const attendanceDays: SmokeAttendanceDay[] = [];
  const statuses = ['PRESENT', 'ABSENT', 'LEAVE', 'MEDICAL_LEAVE', 'LATE', 'HOLIDAY'] as const;
  for (let m = 0; m < 4; m += 1) {
    const monthAnchor = addDays(sessionStart, m * 30);
    for (let d = 0; d < 18; d += 1) {
      const date = isoDate(addDays(monthAnchor, d));
      const dayOfWeek = addDays(monthAnchor, d).getDay();
      if (dayOfWeek === 0) continue;
      const sampleStudents = rng.pickN(students, 40);
      for (const st of sampleStudents) {
        const courseId = st.course_ids[0];
        if (!courseId) continue;
        let status = rng.pick(statuses);
        if (dayOfWeek === 0) status = 'HOLIDAY';
        else if (rng.bool(0.78)) status = 'PRESENT';
        else if (rng.bool(0.5)) status = 'LATE';
        else if (rng.bool(0.4)) status = 'ABSENT';
        else if (rng.bool(0.5)) status = 'LEAVE';
        else status = 'MEDICAL_LEAVE';
        attendanceDays.push({ date, student_id: st.student_id, course_id: courseId, status });
      }
    }
  }

  const assignmentTitles = [
    'Unit Test Practice Set',
    'Case Study Report',
    'Lab Record Submission',
    'Mini Project Milestone',
    'Research Paper Review',
    'Quiz Preparation Sheet',
    'Design Document',
    'Code Walkthrough',
    'Presentation Slides',
    'Viva Preparation Notes',
  ];
  const assignments: SmokeAssignment[] = [];
  for (let i = 0; i < 40; i += 1) {
    const course = courses[i % courses.length]!;
    const enrolled = students.filter((s) => s.course_ids.includes(course.course_id));
    const created = addDays(sessionStart, 10 + i * 3);
    const due = addDays(created, rng.int(7, 21));
    const submissionCount = Math.min(enrolled.length, rng.int(Math.floor(enrolled.length * 0.55), enrolled.length || 1));
    const pending = Math.max(0, enrolled.length - submissionCount);
    assignments.push({
      assignment_id: `asgn-demo-${String(i + 1).padStart(3, '0')}`,
      title: `${rng.pick(assignmentTitles)} — ${course.course_code}`,
      course_id: course.course_id,
      course_code: course.course_code,
      course_name: course.course_name,
      due_date: isoDate(due),
      created_date: isoDate(created),
      max_marks: rng.pick([10, 15, 20, 25, 30]),
      submission_count: submissionCount,
      pending_count: pending,
      average_marks: rng.percent(10, 28, 1),
      status: due < now ? (rng.bool(0.5) ? 'PUBLISHED' : 'GRADING') : rng.bool(0.2) ? 'CLOSED' : 'OPEN',
      description: `Complete the ${course.course_name} deliverable and upload as PDF.`,
      semester: course.semester ?? '5',
      section_code: course.section,
    });
  }

  const feedbackPool = [
    'Well structured and clear.',
    'Improve diagrams and citations.',
    'Good effort; expand analysis.',
    'Late but complete.',
    'Excellent practical demonstration.',
    'Needs stronger conclusion.',
  ];
  const submissions: SmokeSubmission[] = [];
  let subIdx = 0;
  for (const asg of assignments) {
    const enrolled = students.filter((s) => s.course_ids.includes(asg.course_id));
    const sample = rng.pickN(enrolled, Math.min(enrolled.length, Math.max(8, asg.submission_count)));
    for (const st of sample) {
      subIdx += 1;
      const late = rng.bool(0.18);
      const pending = rng.bool(0.12);
      const marks = pending ? null : rng.percent(4, asg.max_marks, 1);
      const submittedOn = pending
        ? null
        : isoDate(addDays(new Date(asg.due_date), late ? rng.int(1, 4) : -rng.int(0, 5)));
      submissions.push({
        submission_id: `sub-demo-${String(subIdx).padStart(4, '0')}`,
        assignment_id: asg.assignment_id,
        student_id: st.student_id,
        student_name: st.name,
        roll_number: st.roll_number,
        submitted_on: submittedOn,
        late_submission: late && !pending,
        marks,
        feedback: marks == null ? null : rng.pick(feedbackPool),
        grade: marks == null ? null : gradeFromPercent((marks / asg.max_marks) * 100),
        status: pending ? 'PENDING' : marks != null && rng.bool(0.7) ? 'GRADED' : late ? 'LATE' : 'SUBMITTED',
      });
    }
  }
  // Ensure 300+ submissions
  while (submissions.length < 320) {
    const asg = rng.pick(assignments);
    const st = rng.pick(students);
    subIdx += 1;
    submissions.push({
      submission_id: `sub-demo-${String(subIdx).padStart(4, '0')}`,
      assignment_id: asg.assignment_id,
      student_id: st.student_id,
      student_name: st.name,
      roll_number: st.roll_number,
      submitted_on: isoDate(addDays(now, -rng.int(1, 40))),
      late_submission: rng.bool(0.2),
      marks: rng.percent(5, asg.max_marks, 1),
      feedback: rng.pick(feedbackPool),
      grade: gradeFromPercent(rng.percent(50, 95)),
      status: rng.pick(['SUBMITTED', 'LATE', 'GRADED', 'RETURNED'] as const),
    });
  }

  const examTypes = ['MID_SEMESTER', 'END_SEMESTER', 'QUIZ', 'LAB_EXAM', 'PRACTICAL', 'VIVA'] as const;
  const exams: SmokeExam[] = Array.from({ length: 28 }, (_, i) => {
    const course = courses[i % courses.length]!;
    const when = addDays(now, rng.int(-20, 45));
    return {
      exam_id: `exam-demo-${String(i + 1).padStart(3, '0')}`,
      exam_type: examTypes[i % examTypes.length]!,
      exam_date: isoDate(when),
      room: `R-${rng.int(101, 318)}`,
      start_time: rng.pick(['09:00', '10:00', '11:30', '14:00'] as const),
      end_time: rng.pick(['11:00', '12:00', '13:30', '16:00'] as const),
      invigilator: personName(rng),
      course_id: course.course_id,
      course_code: course.course_code,
      course_name: course.course_name,
      total_marks: rng.pick([20, 30, 50, 70, 100]),
      status: when < now ? 'COMPLETED' : rng.bool(0.1) ? 'CANCELLED' : 'SCHEDULED',
    };
  });

  const marks: SmokeMarks[] = [];
  for (const st of students) {
    for (const courseId of st.course_ids.slice(0, 3)) {
      const internal = rng.percent(20, 40, 0);
      const external = rng.percent(25, 60, 0);
      const assignment = rng.percent(8, 20, 0);
      const quiz = rng.percent(5, 15, 0);
      const lab = rng.percent(8, 20, 0);
      const attendance = rng.percent(3, 10, 0);
      const practical = rng.percent(8, 20, 0);
      const total = internal + external + assignment + quiz + lab + attendance + practical;
      const pct = Math.min(100, (total / 180) * 100);
      marks.push({
        student_id: st.student_id,
        course_id: courseId,
        internal,
        external,
        assignment,
        quiz,
        lab,
        attendance,
        practical,
        final_grade: gradeFromPercent(pct),
        result_status: pct < 40 ? (rng.bool(0.3) ? 'DETAINED' : 'FAIL') : rng.bool(0.02) ? 'ABSENT' : 'PASS',
      });
    }
  }

  const buildings = ['Block A', 'Block B', 'Science Block', 'Tech Tower', 'Main Academic'];
  const timeSlots = [
    ['09:00', '10:00'],
    ['10:00', '11:00'],
    ['11:00', '12:00'],
    ['12:00', '13:00'],
    ['14:00', '15:00'],
    ['15:00', '16:00'],
  ] as const;
  const timetable: SmokeTimetableSlot[] = [];
  let tt = 0;
  for (let day = 1; day <= 6; day += 1) {
    const dayCourses = rng.pickN(primaryCourses.length ? primaryCourses : courses, 4);
    dayCourses.forEach((course, idx) => {
      const slot = timeSlots[idx % timeSlots.length]!;
      tt += 1;
      timetable.push({
        timetable_id: `tt-demo-${String(tt).padStart(3, '0')}`,
        day_of_week: day,
        start_time: `${slot[0]}:00`,
        end_time: `${slot[1]}:00`,
        room: `R-${rng.int(101, 405)}`,
        building: rng.pick(buildings),
        course_id: course.course_id,
        course_code: course.course_code,
        course_name: course.course_name,
        section: course.section,
        semester: course.semester ?? '5',
        student_count: course.students_enrolled,
      });
    });
  }

  const leaveTypes = [
    { code: 'CL' as const, label: 'Casual' },
    { code: 'ML' as const, label: 'Medical' },
    { code: 'DL' as const, label: 'Duty Leave' },
    { code: 'EL' as const, label: 'Earned Leave' },
    { code: 'CONFERENCE' as const, label: 'Conference Leave' },
  ];
  const leaveStatuses = ['APPROVED', 'REJECTED', 'PENDING', 'CANCELLED'] as const;
  const leaveRequests: SmokeLeaveRequest[] = Array.from({ length: 18 }, (_, i) => {
    const lt = leaveTypes[i % leaveTypes.length]!;
    const start = addDays(now, rng.int(-60, 20));
    return {
      leave_id: `leave-demo-${String(i + 1).padStart(3, '0')}`,
      request_type: 'LEAVE',
      leave_type: lt.code,
      leave_label: lt.label,
      start_date: isoDate(start),
      end_date: isoDate(addDays(start, rng.int(0, 3))),
      status: leaveStatuses[i % leaveStatuses.length]!,
      reason: rng.pick([
        'Personal work at hometown',
        'Medical consultation',
        'University duty at affiliated campus',
        'Paper presentation at IEEE conference',
        'Family function',
      ] as const),
      applied_date: isoDate(addDays(start, -rng.int(2, 10))),
    };
  });

  const leaveBalances = [
    { leave_type: 'CL', entitled: 12, used: 3 },
    { leave_type: 'ML', entitled: 10, used: 1 },
    { leave_type: 'EL', entitled: 15, used: 4 },
    { leave_type: 'DL', entitled: 8, used: 2 },
    { leave_type: 'CONFERENCE', entitled: 5, used: 1 },
  ];

  const research: SmokeResearch[] = [
    {
      research_id: 'res-001',
      publication_title: 'Adaptive Attention for Low-Resource Indian Languages',
      journal_name: 'IEEE Transactions on Neural Networks',
      indexing_type: 'SCOPUS',
      publication_type: 'JOURNAL',
      published_date: isoDate(addDays(now, -120)),
      status: 'PUBLISHED',
      collaborators: ['Dr. Ravi Mehta', 'Prof. S. Banerjee'],
      proof_file_path: '/uploads/demo/paper-adaptive-attention.pdf',
    },
    {
      research_id: 'res-002',
      publication_title: 'Edge-Assisted Attendance Analytics for Smart Campuses',
      journal_name: 'Procedia Computer Science',
      indexing_type: 'SCOPUS',
      publication_type: 'CONFERENCE',
      published_date: isoDate(addDays(now, -80)),
      status: 'PUBLISHED',
      collaborators: ['Dr. Kunal Verma'],
    },
    {
      research_id: 'res-003',
      publication_title: 'System and Method for Proctor-Aware Early Warning',
      journal_name: null,
      indexing_type: 'IPO',
      publication_type: 'PATENT',
      published_date: isoDate(addDays(now, -200)),
      status: 'FILED',
    },
    {
      research_id: 'res-004',
      publication_title: 'UGC-funded Lab on Responsible AI Pedagogy',
      journal_name: 'UGC STRIDE',
      indexing_type: 'UGC',
      publication_type: 'PROJECT',
      published_date: isoDate(addDays(now, -40)),
      status: 'ACTIVE',
      funding_inr: 12_50_000,
      collaborators: ['IQAC Cell', 'CSE Department'],
    },
    {
      research_id: 'res-005',
      publication_title: 'Handbook of Outcome-Based Computing Labs',
      journal_name: 'SGVU Press',
      indexing_type: 'ISBN',
      publication_type: 'BOOK',
      published_date: isoDate(addDays(now, -300)),
      status: 'PUBLISHED',
    },
    {
      research_id: 'res-006',
      publication_title: 'Federated Learning for Multi-Campus Grade Prediction',
      journal_name: 'ACM COMPUTE',
      indexing_type: 'SCOPUS',
      publication_type: 'CONFERENCE',
      published_date: isoDate(addDays(now, -15)),
      status: 'UNDER_REVIEW',
      collaborators: ['Dr. Meera Nair', 'Exam Cell Analytics'],
    },
    {
      research_id: 'res-007',
      publication_title: 'Curriculum Mapping Graphs for NEP Alignment',
      journal_name: 'Journal of Engineering Education',
      indexing_type: 'UGC CARE',
      publication_type: 'JOURNAL',
      published_date: isoDate(addDays(now, -60)),
      status: 'PUBLISHED',
    },
    {
      research_id: 'res-008',
      publication_title: 'DST Seed Grant — Campus Digital Twin Prototype',
      journal_name: 'DST',
      indexing_type: 'DST',
      publication_type: 'PROJECT',
      published_date: isoDate(addDays(now, -10)),
      status: 'FUNDED',
      funding_inr: 8_75_000,
    },
  ];

  const meetingCategories = [
    'Department Meetings',
    'Academic Council',
    'Faculty Meetings',
    'Training',
    'Events',
  ];
  const meetings: SmokeMeeting[] = Array.from({ length: 12 }, (_, i) => {
    // Guarantee a couple of “today” meetings so Faculty AI / Meetings smoke is useful.
    const start =
      i === 0
        ? (() => {
            const d = new Date(now);
            d.setHours(11, 0, 0, 0);
            return d;
          })()
        : i === 1
          ? (() => {
              const d = new Date(now);
              d.setHours(15, 0, 0, 0);
              return d;
            })()
          : addDays(now, rng.int(-10, 25));
    if (i > 1) start.setHours(rng.pick([10, 11, 14, 15]), 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    const organizer = i % 3 === 0 ? facultyName : personName(rng);
    const organizerId = i % 3 === 0 ? facultyUserId : `fac-peer-${i}`;
    const participants = [
      {
        participant_id: `mp-${i}-1`,
        user_id: facultyUserId,
        name: facultyName,
        email: emailFor(facultyName),
        participant_role: organizerId === facultyUserId ? 'ORGANIZER' : 'INVITEE',
        rsvp_status: rng.pick(['ACCEPTED', 'PENDING', 'DECLINED'] as const),
      },
      {
        participant_id: `mp-${i}-2`,
        user_id: `fac-peer-${i}`,
        name: personName(rng),
        email: emailFor(`faculty${i}`),
        participant_role: 'INVITEE',
        rsvp_status: 'ACCEPTED',
      },
      {
        participant_id: `mp-${i}-3`,
        user_id: `hod-demo-001`,
        name: 'Prof. Rajesh Gupta',
        email: 'rajesh.gupta@sgvu.edu.in',
        participant_role: 'INVITEE',
        rsvp_status: 'PENDING',
      },
    ];
    return {
      meeting_id: `mtg-demo-${String(i + 1).padStart(3, '0')}`,
      title: rng.pick([
        'CSE Board of Studies Prep',
        'Academic Council Briefing',
        'Faculty Development Session',
        'Mid-term Moderation Meeting',
        'NEP Curriculum Workshop',
        'Research Cluster Sync',
      ] as const),
      venue: rng.pick(['Conference Room A', 'HOD Cabin', 'Seminar Hall 2', 'Online — Teams'] as const),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      agenda: 'Review agenda items, action owners, and follow-ups.',
      meeting_mode: i % 4 === 0 ? 'REQUESTED' : 'SCHEDULED',
      status: start < now ? 'COMPLETED' : 'SCHEDULED',
      organizer_user_id: organizerId,
      organizer_name: organizer,
      requester_user_id: organizerId,
      requester_name: organizer,
      category: meetingCategories[i % meetingCategories.length]!,
      participants,
      minutes:
        start < now
          ? {
              minutes_id: `min-${i}`,
              notes: 'Discussed syllabus coverage and attendance defaulters.',
              decisions: 'Extra class approved for Unit 4.',
              action_items: 'Upload moderated marks by Friday.',
              published_at: end.toISOString(),
            }
          : null,
    };
  });

  const notifTemplates = [
    { category: 'EXAMS', title: 'Mid-semester seating published', message: 'Seating chart for CSE401 is available.', severity: 'warning', intent: 'action_required', link: '/faculty/invigilation' },
    { category: 'ACADEMICS', title: 'Assignment deadline tomorrow', message: 'DBMS Case Study submissions close at 11:59 PM.', severity: 'info', intent: 'reminder', link: '/faculty/courses' },
    { category: 'HR', title: 'Holiday notice — Gandhi Jayanti', message: 'Campus closed on 2 October. Compensatory timetable applies.', severity: 'info', intent: 'informational', link: '/faculty/hr' },
    { category: 'MEETINGS', title: 'Department meeting rescheduled', message: 'CSE faculty meeting moved to Thursday 3 PM.', severity: 'info', intent: 'reminder', link: '/faculty/meetings' },
    { category: 'RESEARCH', title: 'Research deadline approaching', message: 'IQAC publication proof upload closes in 5 days.', severity: 'warning', intent: 'action_required', link: '/faculty/research' },
    { category: 'HR', title: 'Leave request approved', message: 'Your casual leave for 12–13 Aug is approved.', severity: 'success', intent: 'informational', link: '/faculty/hr' },
    { category: 'SYSTEM', title: 'Password rotation reminder', message: 'Update your SSO password before month end.', severity: 'warning', intent: 'action_required', link: '/faculty/settings' },
    { category: 'ACADEMICS', title: 'Attendance missing alert', message: 'Mark attendance for today\'s 10:00 OS lecture.', severity: 'warning', intent: 'action_required', link: '/faculty/attendance' },
  ];
  const notifications: SmokeNotification[] = notifTemplates.map((t, i) => ({
    notification_id: `notif-fac-${String(i + 1).padStart(3, '0')}`,
    tenant_id: 'tenant-sgvu',
    user_id: facultyUserId,
    category: t.category,
    title: t.title,
    message: t.message,
    action_link: t.link,
    severity: t.severity,
    intent: t.intent,
    action_label: 'Open',
    is_read: i % 3 === 0,
    important: i % 4 === 0,
    created_at: addDays(now, -i).toISOString(),
  }));
  // Extra volume for pagination
  for (let i = notifTemplates.length; i < 36; i += 1) {
    const t = notifTemplates[i % notifTemplates.length]!;
    notifications.push({
      notification_id: `notif-fac-${String(i + 1).padStart(3, '0')}`,
      tenant_id: 'tenant-sgvu',
      user_id: facultyUserId,
      category: t.category,
      title: `${t.title} (#${i + 1})`,
      message: t.message,
      action_link: t.link,
      severity: t.severity,
      intent: t.intent,
      action_label: 'Open',
      is_read: rng.bool(0.55),
      important: rng.bool(0.2),
      created_at: addDays(now, -i).toISOString(),
    });
  }

  const messages: SmokeMessageThread[] = [
    {
      thread_id: 'msg-1',
      counterpart: 'Prof. Rajesh Gupta',
      counterpart_role: 'HOD',
      subject: 'Board of Studies documents',
      unread: 2,
      updated_at: addDays(now, -1).toISOString(),
      messages: [
        { message_id: 'm1', sender: 'other', body: 'Please share the revised CSE401 CO-PO matrix.', sent_at: addDays(now, -2).toISOString() },
        { message_id: 'm2', sender: 'self', body: 'Uploaded to the shared drive — please review sections 3–4.', sent_at: addDays(now, -1).toISOString() },
      ],
    },
    {
      thread_id: 'msg-2',
      counterpart: students[0]!.name,
      counterpart_role: 'Student',
      subject: 'Assignment extension request',
      unread: 1,
      updated_at: now.toISOString(),
      messages: [
        { message_id: 'm3', sender: 'other', body: 'Sir/Madam, may I get 2 days extension for the DBMS report?', sent_at: now.toISOString() },
      ],
    },
    {
      thread_id: 'msg-3',
      counterpart: 'Exam Cell Desk',
      counterpart_role: 'Exam Cell',
      subject: 'Invigilation duty confirmation',
      unread: 0,
      updated_at: addDays(now, -3).toISOString(),
      messages: [
        { message_id: 'm4', sender: 'other', body: 'Kindly confirm duty for Mid-Sem Block B Room 204.', sent_at: addDays(now, -3).toISOString() },
        { message_id: 'm5', sender: 'self', body: 'Confirmed. Will report 30 minutes early.', sent_at: addDays(now, -3).toISOString() },
      ],
    },
    {
      thread_id: 'msg-4',
      counterpart: 'Office of the Registrar',
      counterpart_role: 'Registrar',
      subject: 'Faculty appraisal window',
      unread: 0,
      updated_at: addDays(now, -5).toISOString(),
      messages: [
        { message_id: 'm6', sender: 'other', body: 'Appraisal evidence upload opens next Monday.', sent_at: addDays(now, -5).toISOString() },
      ],
    },
    {
      thread_id: 'msg-5',
      counterpart: 'Dr. Kunal Verma',
      counterpart_role: 'Faculty',
      subject: 'Joint lab session',
      unread: 0,
      updated_at: addDays(now, -2).toISOString(),
      messages: [
        { message_id: 'm7', sender: 'self', body: 'Can we merge OS Lab batches on Friday?', sent_at: addDays(now, -2).toISOString() },
        { message_id: 'm8', sender: 'other', body: 'Yes — I will book Lab 3.', sent_at: addDays(now, -2).toISOString() },
      ],
    },
  ];

  const docCategories = [
    'Course Files',
    'Lecture Notes',
    'Question Banks',
    'Assignments',
    'Lab Manuals',
    'Research Papers',
    'Certificates',
  ] as const;
  const documents: SmokeDocument[] = Array.from({ length: 28 }, (_, i) => {
    const category = docCategories[i % docCategories.length]!;
    const course = courses[i % courses.length]!;
    return {
      document_id: `doc-demo-${String(i + 1).padStart(3, '0')}`,
      title: `${category} — ${course.course_code}`,
      category,
      file_name: `${course.course_code}_${category.replace(/\s+/g, '_').toLowerCase()}.pdf`,
      size_kb: rng.int(120, 4200),
      upload_date: isoDate(addDays(now, -rng.int(1, 120))),
      downloads: rng.int(2, 180),
      owner: facultyName,
      visibility: rng.pick(['PRIVATE', 'COURSE', 'DEPARTMENT', 'PUBLIC'] as const),
      document_type: rng.pick(['PAN', 'AADHAAR', 'DEGREE', 'OFFER_LETTER', 'OTHER'] as const),
      verification_status: rng.pick(['VERIFIED', 'PENDING', 'REJECTED'] as const),
      uploaded_at: addDays(now, -rng.int(1, 120)).toISOString(),
    };
  });

  const performance: SmokePerformance = {
    teaching_score: 86.4,
    student_feedback: 4.3,
    research_score: 78.0,
    attendance: 94.2,
    workload_hours: 16,
    completion_rate: 81.5,
    kpis: [
      { label: 'Teaching Score', value: '86.4', tone: 'good' },
      { label: 'Student Feedback', value: '4.3 / 5', tone: 'good' },
      { label: 'Research Score', value: '78', tone: 'neutral' },
      { label: 'Attendance', value: '94%', tone: 'good' },
      { label: 'Workload', value: '16 hrs/wk', tone: 'warn' },
      { label: 'Completion', value: '81.5%', tone: 'neutral' },
    ],
  };

  const calendar: SmokeCalendarEvent[] = [
    ...timetable.slice(0, 8).map((slot, i) => ({
      event_id: `cal-class-${i}`,
      title: `${slot.course_code} class`,
      type: 'CLASS' as const,
      starts_at: addDays(now, i % 6).toISOString(),
      ends_at: addDays(now, i % 6).toISOString(),
      location: `${slot.building} ${slot.room}`,
    })),
    ...meetings.slice(0, 5).map((m) => ({
      event_id: `cal-${m.meeting_id}`,
      title: m.title,
      type: 'MEETING' as const,
      starts_at: m.starts_at,
      ends_at: m.ends_at,
      location: m.venue,
    })),
    ...exams.slice(0, 6).map((e) => ({
      event_id: `cal-${e.exam_id}`,
      title: `${e.exam_type} — ${e.course_code}`,
      type: 'EXAM' as const,
      starts_at: `${e.exam_date}T${e.start_time}:00.000Z`,
      ends_at: `${e.exam_date}T${e.end_time}:00.000Z`,
      location: e.room,
    })),
    ...assignments.slice(0, 6).map((a) => ({
      event_id: `cal-${a.assignment_id}`,
      title: `Deadline: ${a.title}`,
      type: 'DEADLINE' as const,
      starts_at: `${a.due_date}T17:00:00.000Z`,
      ends_at: `${a.due_date}T17:30:00.000Z`,
    })),
    {
      event_id: 'cal-hol-1',
      title: 'Independence Day',
      type: 'HOLIDAY',
      starts_at: `${now.getFullYear()}-08-15T00:00:00.000Z`,
      ends_at: `${now.getFullYear()}-08-15T23:59:00.000Z`,
    },
    {
      event_id: 'cal-leave-1',
      title: 'Casual Leave',
      type: 'LEAVE',
      starts_at: leaveRequests[0]!.start_date + 'T00:00:00.000Z',
      ends_at: leaveRequests[0]!.end_date + 'T23:59:00.000Z',
    },
    {
      event_id: 'cal-event-1',
      title: 'Tech Fest Inauguration',
      type: 'EVENT',
      starts_at: addDays(now, 12).toISOString(),
      ends_at: addDays(now, 12).toISOString(),
      location: 'Main Auditorium',
    },
  ];

  const aiHistory: SmokeAiHistory = {
    conversations: [
      {
        conversation_id: 'fac-ai-1',
        title: 'Draft reminder for low attendance',
        prompt_type: 'draft',
        token_usage: 640,
        created_at: addDays(now, -2).toISOString(),
        updated_at: addDays(now, -2).toISOString(),
      },
      {
        conversation_id: 'fac-ai-2',
        title: 'Summarize today\'s teaching load',
        prompt_type: 'summary',
        token_usage: 420,
        created_at: addDays(now, -1).toISOString(),
        updated_at: addDays(now, -1).toISOString(),
      },
      {
        conversation_id: 'fac-ai-3',
        title: 'Suggest CO-PO mapping notes',
        prompt_type: 'academic',
        token_usage: 880,
        created_at: addDays(now, -5).toISOString(),
        updated_at: addDays(now, -4).toISOString(),
      },
      {
        conversation_id: 'fac-ai-4',
        title: 'Leave application wording',
        prompt_type: 'hr',
        token_usage: 310,
        created_at: addDays(now, -7).toISOString(),
        updated_at: addDays(now, -7).toISOString(),
      },
    ],
    suggested_prompts: [
      'List students below 75% attendance in my courses',
      'Draft a polite assignment extension reply',
      'Summarize pending evaluations this week',
      'Suggest viva questions for OS Lab',
    ],
    resolved_queries: [
      { query: 'How many mentees are at risk?', resolved_at: addDays(now, -3).toISOString() },
      { query: 'Show tomorrow\'s invigilation duty', resolved_at: addDays(now, -1).toISOString() },
    ],
    recent_searches: ['attendance defaulters', 'IQAC proof upload', 'mid-sem moderation', 'gate pass approvals'],
    bookmarks: [
      { title: 'Mark Attendance', href: '/faculty/attendance' },
      { title: 'Research Log', href: '/faculty/research' },
      { title: 'Mentorship', href: '/faculty/mentorship' },
    ],
  };

  const activityLogs: SmokeActivityLog[] = [
    { log_id: 'act-1', action: 'LOGIN', detail: 'Signed in from campus network', created_at: addDays(now, 0).toISOString(), ip: '10.12.4.88' },
    { log_id: 'act-2', action: 'ATTENDANCE_UPDATED', detail: 'Marked CSE401 10:00 session', created_at: addDays(now, -1).toISOString() },
    { log_id: 'act-3', action: 'MARKS_UPLOADED', detail: 'Published WT1 marks for CSE402', created_at: addDays(now, -2).toISOString() },
    { log_id: 'act-4', action: 'ASSIGNMENT_CREATED', detail: 'Created Mini Project Milestone for CSE501', created_at: addDays(now, -3).toISOString() },
    { log_id: 'act-5', action: 'COURSE_EDITED', detail: 'Updated syllabus link for CSE403', created_at: addDays(now, -4).toISOString() },
    { log_id: 'act-6', action: 'LEAVE_APPLIED', detail: 'Applied casual leave 12–13 Aug', created_at: addDays(now, -5).toISOString() },
    { log_id: 'act-7', action: 'DOCUMENTS_UPLOADED', detail: 'Uploaded IEEE acceptance letter', created_at: addDays(now, -6).toISOString() },
    { log_id: 'act-8', action: 'LOGOUT', detail: 'Signed out', created_at: addDays(now, -1).toISOString() },
    { log_id: 'act-9', action: 'LOGIN', detail: 'Signed in', created_at: addDays(now, -1).toISOString() },
    { log_id: 'act-10', action: 'ATTENDANCE_UPDATED', detail: 'Corrected late marks for Section B', created_at: addDays(now, -8).toISOString() },
  ];

  const jsDay = now.getDay() === 0 ? 1 : now.getDay(); // map Sunday → Mon sample
  const todayClasses = timetable.filter((t) => t.day_of_week === jsDay).slice(0, 4);
  const missingAttendance = todayClasses.slice(0, 2);

  const atRisk = students
    .filter((s) => s.academic_status === 'AT_RISK' || s.attendance_percent < 75)
    .slice(0, 18)
    .map((s) => ({
      user_id: s.user_id,
      name: s.name,
      risk_level: (s.attendance_percent < 55 ? 'HIGH' : s.attendance_percent < 70 ? 'MEDIUM' : 'LOW') as
        | 'HIGH'
        | 'MEDIUM'
        | 'LOW',
      metrics: {
        attendance_percent: s.attendance_percent,
        grades_percent: s.internal_marks,
      },
    }));

  const menteeStudents = students.slice(0, 16);
  const mentees = menteeStudents.map((s, i) => ({
    mentorship_id: `mentor-${String(i + 1).padStart(3, '0')}`,
    user_id: s.user_id,
    name: s.name,
    full_name: s.name,
    student: { user_id: s.user_id, name: s.name, email: s.email },
  }));

  const pendingApprovals = {
    certificates: menteeStudents.slice(0, 5).map((s, i) => ({
      certificate_id: `cert-demo-${i + 1}`,
      title: rng.pick(['NPTEL Cloud Computing', 'Hackathon Winner', 'Internship Completion'] as const),
      issuer: rng.pick(['NPTEL', 'Smart India Hackathon', 'TCS iON'] as const),
      issue_date: isoDate(addDays(now, -rng.int(10, 90))),
      uploaded_at: addDays(now, -rng.int(1, 10)).toISOString(),
      student: { user_id: s.user_id, name: s.name, email: s.email },
    })),
    meetings: menteeStudents.slice(0, 4).map((s, i) => ({
      meeting_id: `pmtg-${i + 1}`,
      student_name: s.name,
      requested_time: addDays(now, rng.int(1, 7)).toISOString(),
      topic: rng.pick(['Career guidance', 'Attendance counselling', 'Project review'] as const),
      status: 'PENDING',
    })),
    leave_requests: menteeStudents.slice(4, 8).map((s, i) => ({
      interaction_id: `pleave-${i + 1}`,
      student_name: s.name,
      reason: rng.pick(['Medical appointment', 'Family function', 'Competitive exam'] as const),
      start_date: isoDate(addDays(now, rng.int(1, 5))),
      end_date: isoDate(addDays(now, rng.int(5, 8))),
      status: 'PENDING',
    })),
  };

  const duties = exams
    .filter((e) => e.status === 'SCHEDULED')
    .slice(0, 6)
    .map((e, i) => ({
      assignment_id: `duty-${i + 1}`,
      exam_name: `${e.exam_type} — ${e.course_code}`,
      exam_date: e.exam_date,
      room: e.room,
      block_name: rng.pick(['Block A', 'Block B', 'Exam Hall'] as const),
      session_label: e.start_time < '12:00' ? 'FN' : 'AN',
      status: 'ASSIGNED',
      excuse_status: null,
      excuse_reason: null,
      exam_cell_comment: null,
    }));

  const weeklyTests = primaryCourses.slice(0, 8).map((c, i) => ({
    test_id: `wt-demo-${i + 1}`,
    course_code: c.course_code,
    course_name: c.course_name,
    test_type: i % 2 === 0 ? 'WT1' : 'WT2',
    is_active: i < 3,
    start_time: addDays(now, -i * 3).toISOString(),
    end_time: addDays(now, -i * 3 + 1).toISOString(),
    response_count: rng.int(20, c.students_enrolled),
    avg_score: rng.percent(8, 18, 1),
  }));

  const profile: SmokeFacultyProfile = {
    user_id: facultyUserId,
    name: facultyName,
    display_name: facultyName,
    honorific: 'Dr.',
    email: emailFor('ananya.sharma'),
    phone: '+91 98765 43210',
    role: 'FACULTY',
    department: dept,
    employee_id: empId,
    designation: 'Associate Professor',
    joining_date: '2016-07-18',
    profile_photo_url: avatarUrl(facultyName),
    total_teaching_experience_years: 9,
    industry_experience_years: 3,
    api_score: 312,
    active_mentees: mentees.length,
    bio: 'Associate Professor in Computer Science specializing in machine learning systems, academic analytics, and outcome-based education. Mentors undergraduate projects and contributes to IQAC digital initiatives.',
    skills: ['Machine Learning', 'Distributed Systems', 'OBE/NBA', 'Python', 'Research Mentoring'],
    research_interests: ['Responsible AI', 'Campus Analytics', 'NLP for Indic languages', 'EdTech'],
    office_hours: 'Mon & Thu 15:00–16:30 · Cabin CSE-214',
    social_links: {
      linkedin: 'https://www.linkedin.com/in/ananya-sharma-sgvu',
      google_scholar: 'https://scholar.google.com/citations?user=demoAnanya',
      orcid: 'https://orcid.org/0000-0002-1825-0097',
    },
    responsibilities: [
      { title: 'Class Advisor — CSE Sem 5', description: 'Section A mentoring', source: 'HOD' },
      { title: 'IQAC Criterion 3 Coordinator', source: 'IQAC' },
      { title: 'Research Cluster Lead — AI Systems', source: 'Dean Research' },
    ],
    personal: {
      date_of_birth: '1987-03-22',
      blood_group: 'B+',
      gender: 'Female',
      emergency_contact_name: 'Rohit Sharma',
      emergency_contact_phone: '+91 98111 22334',
      permanent_address: '14, Shanti Nagar, Jaipur, Rajasthan 302017',
      current_address: 'Faculty Quarters B-12, SGVU Campus, Jaipur',
    },
    kyc: {
      pan_masked: 'XXXXX1234A',
      aadhaar_masked: 'XXXX-XXXX-4521',
      bank_masked: 'XXXXXX7821',
      ifsc_code: 'SBIN0001234',
      pf_uan: '100012345678',
    },
    research_identifiers: {
      orcid_id: '0000-0002-1825-0097',
      scopus_id: '57212345678',
      google_scholar_url: 'https://scholar.google.com/citations?user=demoAnanya',
    },
    research_summary: {
      total_scopus_papers: 14,
      total_patents: 2,
      total_conference_papers: 11,
      total_books: 1,
      total_publications: 26,
      total_grants_inr: 21_25_000,
      total_grants_display: '₹21.25 L',
    },
    qualifications: [
      {
        qual_id: 'qual-1',
        degree_level: 'PhD',
        degree_name: 'Ph.D. Computer Science',
        university: 'IIT Delhi',
        passing_year: 2015,
        specialization: 'Machine Learning Systems',
        document_proof_url: null,
      },
      {
        qual_id: 'qual-2',
        degree_level: 'PG',
        degree_name: 'M.Tech CSE',
        university: 'NIT Trichy',
        passing_year: 2010,
        specialization: 'Distributed Systems',
        document_proof_url: null,
      },
      {
        qual_id: 'qual-3',
        degree_level: 'UG',
        degree_name: 'B.E. Computer Engineering',
        university: 'University of Rajasthan',
        passing_year: 2008,
        specialization: null,
        document_proof_url: null,
      },
    ],
    workload: {
      courses: primaryCourses.slice(0, 6).map((c) => ({
        course_id: c.course_id,
        course_code: c.course_code,
        course_name: c.course_name,
        credits: c.credits,
        session_type: c.course_code.includes('Lab') ? 'LAB' : 'THEORY',
      })),
      weekly_teaching_hours: 16,
      project_guides_count: 5,
      project_guides: students.slice(20, 25).map((s, i) => ({
        guide_id: `guide-${i + 1}`,
        project_title: rng.pick([
          'Smart Attendance Edge Gateway',
          'Indic Chat Tutor',
          'Course Outcome Dashboard',
          'Lab Equipment Tracker',
          'Alumni Mentorship Matcher',
        ] as const),
        project_type: 'MAJOR',
        student_name: s.name,
      })),
      phd_scholars_count: 2,
      phd_scholars: [
        { scholar_id: 'phd-1', current_phase: 'Coursework', scholar_name: 'Amit Kulkarni' },
        { scholar_id: 'phd-2', current_phase: 'Synopsis', scholar_name: 'Neha Banerjee' },
      ],
    },
    bank_change_pending: null,
  };

  const charts = {
    attendanceTrend: Array.from({ length: 8 }, (_, i) => ({
      week: `W${i + 1}`,
      percent: rng.percent(74, 96),
    })),
    weeklyTeachingHours: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => ({
      day,
      hours: rng.percent(1, 5, 0),
    })),
    studentPerformance: [
      { band: 'O/A+', count: 28 },
      { band: 'A/B+', count: 64 },
      { band: 'B/C', count: 41 },
      { band: 'F/At Risk', count: 12 },
    ],
    courseCompletion: primaryCourses.slice(0, 6).map((c) => ({
      course_code: c.course_code,
      percent: c.completion_percent,
    })),
    departmentComparison: [
      { department: 'CSE', score: 86 },
      { department: 'AI & DS', score: 82 },
      { department: 'IT', score: 79 },
      { department: 'ME', score: 74 },
      { department: 'EE', score: 77 },
    ],
  };

  const adjustments = [
    {
      adjustment_id: 'adj-1',
      adjustment_type: 'EXTRA_CLASS',
      status: 'PENDING_HOD',
      course_code: primaryCourses[0]!.course_code,
      course_name: primaryCourses[0]!.course_name,
      original_date: null,
      new_date: isoDate(addDays(now, 3)),
      reason: 'Cover Unit 4 backlog before mid-sem',
    },
    {
      adjustment_id: 'adj-2',
      adjustment_type: 'RESCHEDULE',
      status: 'APPROVED',
      course_code: primaryCourses[1]!.course_code,
      course_name: primaryCourses[1]!.course_name,
      original_date: isoDate(addDays(now, -2)),
      new_date: isoDate(addDays(now, 4)),
      reason: 'Clash with Academic Council',
    },
    {
      adjustment_id: 'adj-3',
      adjustment_type: 'CANCEL',
      status: 'REJECTED',
      course_code: primaryCourses[2]!.course_code,
      course_name: primaryCourses[2]!.course_name,
      original_date: isoDate(addDays(now, 1)),
      new_date: null,
      reason: 'Faculty conference travel',
    },
  ];

  const timetableStats = {
    term_start: isoDate(sessionStart),
    weekly_slots: timetable.length,
    courses_taught: primaryCourses.length,
    expected_so_far: 96,
    conducted_classes: 78,
    remaining_classes: 18,
    completion_percent: 81.3,
    todays_classes: todayClasses.length,
    todays_conducted: Math.max(0, todayClasses.length - missingAttendance.length),
    todays_remaining: missingAttendance.length,
    missing_attendance_today: missingAttendance.length,
    pending_adjustments: 1,
    approved_adjustments: 1,
    rejected_adjustments: 1,
    approved_extra_classes: 1,
    courses: primaryCourses.slice(0, 8).map((c) => ({
      course_id: c.course_id,
      course_code: c.course_code,
      course_name: c.course_name,
      weekly_slots: timetable.filter((t) => t.course_id === c.course_id).length || 2,
      expected_so_far: rng.int(10, 20),
      conducted_classes: rng.int(8, 16),
      remaining_classes: rng.int(2, 8),
      completion_percent: c.completion_percent,
    })),
  };

  return {
    profile,
    courses,
    students,
    attendanceDays,
    assignments,
    submissions,
    exams,
    marks,
    timetable,
    leaveRequests,
    leaveBalances,
    research,
    meetings,
    notifications,
    messages,
    documents,
    performance,
    calendar,
    aiHistory,
    activityLogs,
    todayClasses,
    missingAttendance,
    atRisk,
    mentees,
    pendingApprovals,
    duties,
    weeklyTests,
    hrToday: {
      shift: { start: '09:00', end: '17:00', progress_percent: 62 },
      display: { in_time: '09:08', out_time: '—', hours_worked_today: '5.4' },
      status: 'IN',
      today: (() => {
        const checkIn = new Date(now);
        checkIn.setHours(9, 8, 0, 0);
        return { check_in_at: checkIn.toISOString(), check_out_at: null };
      })(),
      week_hours: 34.5,
    },
    holidays: {
      mandatory: [
        { holiday_id: 'hol-1', title: 'Independence Day', date: `${now.getFullYear()}-08-15`, type: 'MANDATORY' },
        { holiday_id: 'hol-2', title: 'Gandhi Jayanti', date: `${now.getFullYear()}-10-02`, type: 'MANDATORY' },
      ],
      restricted: [
        { holiday_id: 'hol-3', title: 'Diwali (Restricted)', date: `${now.getFullYear()}-10-20`, type: 'RESTRICTED', description: 'Optional restricted holiday' },
      ],
    },
    announcements: [
      { id: 'ann-1', title: 'Mid-sem moderation schedule', body: 'Submit moderated scripts by Friday noon.', created_at: addDays(now, -1).toISOString() },
      { id: 'ann-2', title: 'Library orientation for faculty', body: 'New research database demo on Thursday.', created_at: addDays(now, -2).toISOString() },
      { id: 'ann-3', title: 'Campus Wi-Fi maintenance', body: 'Academic block Wi-Fi downtime 10–11 PM Sunday.', created_at: addDays(now, -3).toISOString() },
    ],
    recentActivity: activityLogs.slice(0, 8).map((a) => ({
      id: a.log_id,
      title: `${a.action.replace(/_/g, ' ')} — ${a.detail}`,
      at: a.created_at,
      kind: a.action,
    })),
    upcomingEvents: calendar
      .filter((e) => new Date(e.starts_at) >= new Date(isoDate(now)))
      .slice(0, 8)
      .map((e) => ({
        id: e.event_id,
        title: e.title,
        at: e.starts_at,
        venue: e.location ?? 'Campus',
      })),
    charts,
    dashboardStats: {
      classesToday: todayClasses.length,
      attendancePercent: 91.4,
      pendingEvaluations: assignments.filter((a) => a.status === 'GRADING' || a.status === 'OPEN').length,
      upcomingExams: exams.filter((e) => e.status === 'SCHEDULED').length,
      assignedCourses: courses.filter((c) => c.status === 'ACTIVE').length,
      researchProjects: research.filter((r) => r.publication_type === 'PROJECT').length,
      leaveBalance: leaveBalances.reduce((sum, b) => sum + (b.entitled - b.used), 0),
      notifications: notifications.filter((n) => !n.is_read).length,
    },
    essDocuments: {
      documents: documents.slice(0, 10).map((d) => ({
        document_id: d.document_id,
        document_type: d.document_type,
        file_name: d.file_name,
        verification_status: d.verification_status,
        uploaded_at: d.uploaded_at,
      })),
      groups: {},
      categories: ['PAN', 'AADHAAR', 'DEGREE', 'OFFER_LETTER', 'OTHER'],
    },
    chatMentees: mentees.map((m, i) => ({
      student_user_id: m.student.user_id,
      student_name: m.student.name,
      student_email: m.student.email,
      unread_count: i < 3 ? rng.int(1, 4) : 0,
    })),
    eligibleParticipants: [
      {
        user_id: 'hod-demo-001',
        name: 'Prof. Rajesh Gupta',
        email: 'rajesh.gupta@sgvu.edu.in',
        role_name: 'HOD',
        dept_name: 'Computer Science',
        relation: 'Reporting Officer',
      },
      {
        user_id: 'fac-peer-9',
        name: 'Dr. Kunal Verma',
        email: 'kunal.verma@sgvu.edu.in',
        role_name: 'FACULTY',
        dept_name: 'Computer Science',
        relation: 'Peer',
      },
      {
        user_id: 'exam-cell-1',
        name: 'Exam Cell Desk',
        email: 'examcell@sgvu.edu.in',
        role_name: 'EXAM_CELL',
        dept_name: 'Examination',
        relation: 'Service',
      },
    ],
    adjustments,
    timetableStats,
  };
}

let cached: FacultySmokeDataset | null = null;

export function getFacultySmokeDataset(): FacultySmokeDataset {
  if (!cached) cached = buildDataset();
  return cached;
}

export function studentsForCourse(courseId: string): SmokeStudent[] {
  return getFacultySmokeDataset().students.filter((s) => s.course_ids.includes(courseId));
}

export function attendanceAnalyticsForCourse(courseId: string) {
  const roster = studentsForCourse(courseId);
  const defaulters = roster
    .filter((s) => s.attendance_percent < 75)
    .slice(0, 12)
    .map((s) => ({
      student_user_id: s.user_id,
      name: s.name,
      roll_number: s.roll_number,
      attendance_percent: s.attendance_percent.toFixed(1),
    }));
  const habitual = roster
    .filter((s) => s.attendance_percent < 60)
    .slice(0, 8)
    .map((s) => ({
      student_user_id: s.user_id,
      name: s.name,
      roll_number: s.roll_number,
      missed_count: Math.round((100 - s.attendance_percent) / 5),
    }));
  return {
    health: {
      scheduled_classes: 42,
      conducted_classes: 36,
      average_attendance_percent:
        roster.reduce((s, r) => s + r.attendance_percent, 0) / Math.max(1, roster.length),
    },
    defaulters,
    habitual_absentees: habitual,
  };
}
