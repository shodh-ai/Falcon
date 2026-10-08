/**
 * Falcon Student Portal — production-style demo data for university project demos.
 * Prefer live API responses; use these only when the API returns empty / fails.
 */

export type DemoStudentProfile = {
  name: string;
  enrollment_no: string;
  student_id: string;
  program: string;
  department: string;
  branch: string;
  semester: number;
  section: string;
  batch: string;
  session: string;
  email: string;
  mobile: string;
  address: string;
  guardian_name: string;
  blood_group: string;
  admission_year: number;
  gender: string;
  category: string;
  profile_photo_url: string | null;
};

export type DemoSubject = {
  course_id: string;
  course_code: string;
  course_name: string;
  course_type: 'CORE' | 'ELECTIVE' | 'LAB';
  credits: number;
  faculty_name: string;
  semester: number;
};

export type DemoAttendanceRow = {
  course_code: string;
  course_name: string;
  semester: number;
  present_count: number;
  absent_count: number;
  total_classes: number;
  attendance_percent: string;
  status: string;
  minimum_required: number;
};

export type DemoAssignment = {
  id: string;
  subject: string;
  title: string;
  faculty: string;
  dueAt: string;
  courseId: string;
  status: 'Submitted' | 'Pending' | 'Due soon';
};

export type DemoExam = {
  exam_id: string;
  subject: string;
  course_code: string;
  exam_type: 'MID_TERM' | 'END_TERM' | 'PRACTICAL';
  exam_date: string;
  start_time: string;
  end_time: string;
  hall: string;
  seat: string;
};

export type DemoTimetableSlot = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string;
  faculty_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_virtual: boolean;
  live_join_url: string | null;
  session_date: string | null;
  attendance_status: 'PRESENT' | 'ABSENT' | 'PENDING' | null;
};

export type DemoFeeDemand = {
  demand_id: string;
  fee_head: string;
  academic_year: string;
  semester: number | null;
  amount: number;
  fee_concession: number;
  scholarship: number;
  discount: number;
  credit: number;
  paid_amount: number;
  payable_amount: number;
  due_date: string;
  status: string;
};

export type DemoLibraryLoan = {
  loan_id: string;
  title: string;
  author: string;
  accession_no: string;
  issue_date: string;
  due_date: string;
  fine_amount: number;
  renew_status: 'Available' | 'Renewed' | 'Not allowed';
  status: 'ISSUED' | 'OVERDUE' | 'RETURNED';
};

export type DemoPlacementCompany = {
  drive_id: string;
  company_name: string;
  job_role: string;
  package_lpa: number;
  drive_type: 'PLACEMENT' | 'INTERNSHIP';
  status: 'OPEN' | 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED';
  location: string;
  description?: string;
  deadline?: string;
  min_cgpa?: number;
};

export type DemoNotification = {
  id: string;
  title: string;
  body: string;
  type: 'fee' | 'warning' | 'success' | 'exam' | 'placement' | 'library' | 'info';
  unread: boolean;
  created_at: string;
};

function isoPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDateTimePlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Primary demo student used across the portal */
export const DEMO_STUDENT: DemoStudentProfile = {
  name: 'Aarav Sharma',
  enrollment_no: 'SGVU/CSE/2023/0142',
  student_id: 'STU-2023-CSE-142',
  program: 'B.Tech Computer Science & Engineering',
  department: 'Computer Science & Engineering',
  branch: 'CSE',
  semester: 5,
  section: 'A',
  batch: '2023–27',
  session: '2023–27',
  email: 'aarav.sharma@mygyanvihar.com',
  mobile: '+91 98765 43210',
  address: '12-B, Vaishali Nagar, Jaipur, Rajasthan 302021',
  guardian_name: 'Rajesh Sharma',
  blood_group: 'B+',
  admission_year: 2023,
  gender: 'Male',
  category: 'General',
  profile_photo_url: null,
};

/** Admission & Document Vault smoke payload (matches `/api/student/admission-vault`). */
export function buildDemoAdmissionVault() {
  const iso = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };
  return {
    profile: {
      admission_type: 'Regular (Merit)',
      admission_number: 'SGVU-ADM-2023-0142',
      migration_certificate_status: 'VERIFIED',
      admission_status: 'ENROLLED',
      degree_award_status: null,
    },
    application: {
      application_id: 'demo-app-0142',
      application_no: 'APP/SGVU/2023/CSE/0142',
      program_applied: DEMO_STUDENT.program,
      admission_type: 'Regular (Merit)',
      status: 'ALLOTTED',
      submitted_at: iso(980),
    },
    entrance_exams: [
      {
        exam_name: 'JEE Main 2023',
        roll_number: 'RJ08031234',
        exam_date: '2023-04-12',
        score: '92.4 percentile',
        percentile: 92.4,
        rank_obtained: 18420,
        result_status: 'QUALIFIED',
      },
      {
        exam_name: 'SGVU Entrance (Engineering)',
        roll_number: 'SGVU-ENT-23142',
        exam_date: '2023-05-28',
        score: '178 / 200',
        percentile: null,
        rank_obtained: 86,
        result_status: 'QUALIFIED',
      },
    ],
    counseling_rounds: [
      {
        round_no: 1,
        counseling_date: '2023-06-18',
        allotted_program: 'B.Tech Computer Science & Engineering',
        seat_category: 'General',
        decision: 'ACCEPTED',
        remarks: 'Seat confirmed with fee payment',
      },
      {
        round_no: 2,
        counseling_date: '2023-07-02',
        allotted_program: 'B.Tech Computer Science & Engineering — Section A',
        seat_category: 'General',
        decision: 'CONFIRMED',
        remarks: 'Document verification completed',
      },
    ],
    documents: [
      {
        certificate_id: 'demo-doc-10th',
        title: 'Class 10 Marksheet',
        issuer: 'RBSE / CBSE',
        verification_status: 'VERIFIED',
        file_path: null,
        uploaded_at: iso(950),
      },
      {
        certificate_id: 'demo-doc-12th',
        title: 'Class 12 Marksheet',
        issuer: 'RBSE / CBSE',
        verification_status: 'VERIFIED',
        file_path: null,
        uploaded_at: iso(949),
      },
      {
        certificate_id: 'demo-doc-photo',
        title: 'Passport-size Photograph',
        issuer: 'Student upload',
        verification_status: 'VERIFIED',
        file_path: null,
        uploaded_at: iso(948),
      },
      {
        certificate_id: 'demo-doc-tc',
        title: 'Transfer Certificate / School Leaving',
        issuer: 'Previous school',
        verification_status: 'VERIFIED',
        file_path: null,
        uploaded_at: iso(947),
      },
      {
        certificate_id: 'demo-doc-aadhaar',
        title: 'Aadhaar (masked copy)',
        issuer: 'UIDAI',
        verification_status: 'VERIFIED',
        file_path: null,
        uploaded_at: iso(946),
      },
      {
        certificate_id: 'demo-doc-migration',
        title: 'Migration Certificate',
        issuer: 'Previous board',
        verification_status: 'VERIFIED',
        file_path: null,
        uploaded_at: iso(940),
      },
    ],
    admission_fee_receipts: [
      {
        demand_id: 'demo-fee-adm',
        fee_head: 'Admission Fee (2023–24)',
        total_amount: 25000,
        paid_amount: 25000,
        status: 'PAID',
        due_date: '2023-07-15',
        receipt_url: '#',
        receipt_no: 'RCP-ADM-2023-0142',
      },
      {
        demand_id: 'demo-fee-tuit',
        fee_head: 'Tuition Fee — Sem 1',
        total_amount: 62500,
        paid_amount: 62500,
        status: 'PAID',
        due_date: '2023-08-01',
        receipt_url: '#',
        receipt_no: 'RCP-TUIT-2023-S1-0142',
      },
    ],
    timeline: [
      { label: 'Application submitted', date: iso(980) },
      { label: 'Entrance exams qualified', date: iso(960) },
      { label: 'Counseling allotment accepted', date: iso(945) },
      { label: 'Documents verified', date: iso(940) },
      { label: 'Admission fee paid', date: iso(938) },
      { label: 'Enrollment confirmed', date: iso(930) },
    ],
  };
}

/** Official transcripts smoke rows (matches `/api/student/transcripts`). */
export const DEMO_TRANSCRIPTS = [
  {
    transcript_id: 'demo-tr-sem4',
    semester: 4,
    status: 'ARCHIVED',
    verification_code: 'SGVU-TR-2025-S4-0142',
    pdf_url: null as string | null,
    generated_at: new Date(Date.now() - 120 * 86400000).toISOString(),
    archived_at: new Date(Date.now() - 118 * 86400000).toISOString(),
  },
  {
    transcript_id: 'demo-tr-sem3',
    semester: 3,
    status: 'ARCHIVED',
    verification_code: 'SGVU-TR-2024-S3-0142',
    pdf_url: null as string | null,
    generated_at: new Date(Date.now() - 300 * 86400000).toISOString(),
    archived_at: new Date(Date.now() - 298 * 86400000).toISOString(),
  },
  {
    transcript_id: 'demo-tr-sem2',
    semester: 2,
    status: 'ISSUED',
    verification_code: 'SGVU-TR-2024-S2-0142',
    pdf_url: null as string | null,
    generated_at: new Date(Date.now() - 480 * 86400000).toISOString(),
    archived_at: null as string | null,
  },
  {
    transcript_id: 'demo-tr-sem1',
    semester: 1,
    status: 'ARCHIVED',
    verification_code: 'SGVU-TR-2023-S1-0142',
    pdf_url: null as string | null,
    generated_at: new Date(Date.now() - 660 * 86400000).toISOString(),
    archived_at: new Date(Date.now() - 655 * 86400000).toISOString(),
  },
] as const;

/** Fee receipts for Document Vault (`/api/student/documents` FEE_RECEIPTS). */
export const DEMO_FEE_RECEIPT_DOCS = [
  {
    title: 'Admission Fee Receipt — RCP-ADM-2023-0142',
    file_url: '#',
    created_at: new Date(Date.now() - 938 * 86400000).toISOString(),
    category: 'FEE_RECEIPTS',
  },
  {
    title: 'Tuition Fee Receipt (Sem 1) — RCP-TUIT-2023-S1-0142',
    file_url: '#',
    created_at: new Date(Date.now() - 900 * 86400000).toISOString(),
    category: 'FEE_RECEIPTS',
  },
  {
    title: 'Tuition Fee Receipt (Sem 5) — RCP-TUIT-2025-S5-0142',
    file_url: '#',
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    category: 'FEE_RECEIPTS',
  },
] as const;

export const DEMO_FACULTY = [
  'Dr. Meera Krishnan',
  'Prof. Arjun Desai',
  'Dr. Kavita Rao',
  'Dr. Neha Gupta',
  'Prof. Rohan Mehta',
  'Dr. Sneha Iyer',
  'Prof. Vikram Singh',
  'Dr. Ananya Joshi',
] as const;

export const DEMO_SUBJECTS: DemoSubject[] = [
  {
    course_id: 'cse-501',
    course_code: 'CSE501',
    course_name: 'Design & Analysis of Algorithms',
    course_type: 'CORE',
    credits: 4,
    faculty_name: 'Dr. Meera Krishnan',
    semester: 5,
  },
  {
    course_id: 'cse-502',
    course_code: 'CSE502',
    course_name: 'Operating Systems',
    course_type: 'CORE',
    credits: 4,
    faculty_name: 'Prof. Arjun Desai',
    semester: 5,
  },
  {
    course_id: 'cse-503',
    course_code: 'CSE503',
    course_name: 'Database Management Systems',
    course_type: 'CORE',
    credits: 4,
    faculty_name: 'Dr. Kavita Rao',
    semester: 5,
  },
  {
    course_id: 'cse-504',
    course_code: 'CSE504',
    course_name: 'Computer Networks',
    course_type: 'CORE',
    credits: 3,
    faculty_name: 'Prof. Rohan Mehta',
    semester: 5,
  },
  {
    course_id: 'cse-505',
    course_code: 'CSE505',
    course_name: 'Machine Learning',
    course_type: 'ELECTIVE',
    credits: 3,
    faculty_name: 'Dr. Neha Gupta',
    semester: 5,
  },
  {
    course_id: 'cse-506',
    course_code: 'CSE506',
    course_name: 'Software Engineering',
    course_type: 'CORE',
    credits: 3,
    faculty_name: 'Dr. Sneha Iyer',
    semester: 5,
  },
  {
    course_id: 'cse-507',
    course_code: 'CSE507',
    course_name: 'OS Laboratory',
    course_type: 'LAB',
    credits: 1,
    faculty_name: 'Prof. Arjun Desai',
    semester: 5,
  },
  {
    course_id: 'cse-508',
    course_code: 'CSE508',
    course_name: 'DBMS Laboratory',
    course_type: 'LAB',
    credits: 1,
    faculty_name: 'Dr. Kavita Rao',
    semester: 5,
  },
  {
    course_id: 'cse-509',
    course_code: 'HUM501',
    course_name: 'Professional Communication',
    course_type: 'ELECTIVE',
    credits: 2,
    faculty_name: 'Dr. Ananya Joshi',
    semester: 5,
  },
  {
    course_id: 'cse-510',
    course_code: 'CSE510',
    course_name: 'Digital Signal Processing',
    course_type: 'ELECTIVE',
    credits: 3,
    faculty_name: 'Prof. Vikram Singh',
    semester: 5,
  },
];

export const DEMO_DASHBOARD_METRICS = {
  cgpa: 8.42,
  credits_completed: 92,
  credits_required: 160,
  attendance_percent: 86.5,
  fee_clear: false,
  fee_outstanding: 34000,
  pending_assignments: 5,
  unread_notifications: 7,
  placement_status: 'Eligible — 2 applications in progress',
};

/** CBCS Subjects & Registration demo payload (matches `/api/student/registration`). */
export function buildDemoRegistration() {
  const core = DEMO_SUBJECTS.filter(
    (s) => s.course_type === 'CORE' || s.course_type === 'LAB',
  ).map((s) => ({
    course_id: s.course_id,
    course_code: s.course_code,
    course_name: s.course_name,
    credits: s.credits,
    semester: s.semester,
    course_type: s.course_type,
  }));

  const electives = DEMO_SUBJECTS.filter((s) => s.course_type === 'ELECTIVE');
  const registeredElective = electives[0];
  const available = electives.slice(1);

  return {
    current_semester: DEMO_STUDENT.semester,
    credits_earned: DEMO_DASHBOARD_METRICS.credits_completed,
    credits_required: DEMO_DASHBOARD_METRICS.credits_required,
    electives_needed: Math.max(0, 2 - (registeredElective ? 1 : 0)),
    electives_max: 2,
    core_enrollments: core,
    elective_enrollments: registeredElective
      ? [
          {
            course_id: registeredElective.course_id,
            course_code: registeredElective.course_code,
            course_name: registeredElective.course_name,
            credits: registeredElective.credits,
            semester: registeredElective.semester,
            course_type: registeredElective.course_type,
          },
        ]
      : [],
    available_electives: available.map((s) => ({
      course_id: s.course_id,
      course_code: s.course_code,
      course_name: s.course_name,
      credits: s.credits,
    })),
  };
}

/** Monday=1 … Saturday=6 */
export const DEMO_WEEKLY_TIMETABLE: DemoTimetableSlot[] = [
  // Monday
  slot(1, 'CSE501', 'Design & Analysis of Algorithms', 'Dr. Meera Krishnan', 'C-402', '09:00', '10:00'),
  slot(1, 'CSE502', 'Operating Systems', 'Prof. Arjun Desai', 'A-118', '10:00', '11:00'),
  slot(1, 'CSE503', 'Database Management Systems', 'Dr. Kavita Rao', 'B-210', '11:00', '12:00'),
  slot(1, 'CSE505', 'Machine Learning', 'Dr. Neha Gupta', 'Lab-3', '14:00', '15:00'),
  // Tuesday
  slot(2, 'CSE504', 'Computer Networks', 'Prof. Rohan Mehta', 'C-301', '09:00', '10:00'),
  slot(2, 'CSE506', 'Software Engineering', 'Dr. Sneha Iyer', 'A-205', '10:00', '11:00'),
  slot(2, 'CSE507', 'OS Laboratory', 'Prof. Arjun Desai', 'Lab-204', '11:00', '12:00'),
  slot(2, 'HUM501', 'Professional Communication', 'Dr. Ananya Joshi', 'Seminar-1', '15:00', '16:00'),
  // Wednesday
  slot(3, 'CSE501', 'Design & Analysis of Algorithms', 'Dr. Meera Krishnan', 'C-402', '09:00', '10:00'),
  slot(3, 'CSE510', 'Digital Signal Processing', 'Prof. Vikram Singh', 'B-112', '10:00', '11:00'),
  slot(3, 'CSE503', 'Database Management Systems', 'Dr. Kavita Rao', 'B-210', '14:00', '15:00'),
  slot(3, 'CSE505', 'Machine Learning', 'Dr. Neha Gupta', 'Online', '15:00', '16:00', true),
  // Thursday
  slot(4, 'CSE502', 'Operating Systems', 'Prof. Arjun Desai', 'A-118', '09:00', '10:00'),
  slot(4, 'CSE504', 'Computer Networks', 'Prof. Rohan Mehta', 'C-301', '10:00', '11:00'),
  slot(4, 'CSE508', 'DBMS Laboratory', 'Dr. Kavita Rao', 'Lab-105', '11:00', '12:00'),
  slot(4, 'CSE506', 'Software Engineering', 'Dr. Sneha Iyer', 'A-205', '14:00', '15:00'),
  // Friday
  slot(5, 'CSE510', 'Digital Signal Processing', 'Prof. Vikram Singh', 'B-112', '09:00', '10:00'),
  slot(5, 'CSE501', 'Design & Analysis of Algorithms', 'Dr. Meera Krishnan', 'C-402', '10:00', '11:00'),
  slot(5, 'CSE502', 'Operating Systems', 'Prof. Arjun Desai', 'A-118', '14:00', '15:00'),
  slot(5, 'HUM501', 'Professional Communication', 'Dr. Ananya Joshi', 'Seminar-1', '15:00', '16:00'),
  // Saturday
  slot(6, 'CSE505', 'Machine Learning', 'Dr. Neha Gupta', 'Lab-3', '09:00', '10:00'),
  slot(6, 'CSE504', 'Computer Networks', 'Prof. Rohan Mehta', 'C-301', '10:00', '11:00'),
  slot(6, 'CSE506', 'Software Engineering', 'Dr. Sneha Iyer', 'A-205', '11:00', '12:00'),
];

function slot(
  day: number,
  code: string,
  name: string,
  faculty: string,
  room: string,
  start: string,
  end: string,
  isVirtual = false,
): DemoTimetableSlot {
  const subject = DEMO_SUBJECTS.find((s) => s.course_code === code);
  return {
    timetable_id: `tt-${day}-${code}-${start}`,
    course_id: subject?.course_id ?? code.toLowerCase(),
    course_code: code,
    course_name: name,
    room: isVirtual ? 'Online' : room,
    faculty_name: faculty,
    day_of_week: day,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    is_virtual: isVirtual,
    live_join_url: isVirtual ? 'https://meet.falcon.edu/ml-cse505' : null,
    session_date: null,
    attendance_status: null,
  };
}

export const DEMO_ATTENDANCE: DemoAttendanceRow[] = DEMO_SUBJECTS.map((s, i) => {
  const totals = [42, 40, 38, 36, 34, 32, 20, 18, 28, 30];
  const presents = [38, 35, 34, 30, 31, 29, 18, 17, 25, 26];
  const total = totals[i] ?? 36;
  const present = presents[i] ?? 30;
  const absent = total - present;
  const pct = Number(((present / total) * 100).toFixed(1));
  return {
    course_code: s.course_code,
    course_name: s.course_name,
    semester: s.semester,
    present_count: present,
    absent_count: absent,
    total_classes: total,
    attendance_percent: String(pct),
    status: 'ENROLLED',
    minimum_required: 75,
  };
});

export const DEMO_ATTENDANCE_SUMMARY = {
  overall_percent: 86.5,
  current_semester: 5,
  progression: Array.from({ length: 8 }, (_, i) => {
    const sem = i + 1;
    return {
      semester: sem,
      status: sem < 5 ? 'COMPLETED' : sem === 5 ? 'IN_PROGRESS' : 'UPCOMING',
      courses_count: sem === 5 ? DEMO_SUBJECTS.length : sem < 5 ? 6 : 0,
    };
  }),
};

export const DEMO_ASSIGNMENTS: DemoAssignment[] = [
  {
    id: 'asg-1',
    subject: 'CSE501',
    title: 'Divide & Conquer Assignment Set',
    faculty: 'Dr. Meera Krishnan',
    dueAt: isoDateTimePlus(1),
    courseId: 'cse-501',
    status: 'Due soon',
  },
  {
    id: 'asg-2',
    subject: 'CSE502',
    title: 'Process Scheduling Simulator',
    faculty: 'Prof. Arjun Desai',
    dueAt: isoDateTimePlus(2),
    courseId: 'cse-502',
    status: 'Pending',
  },
  {
    id: 'asg-3',
    subject: 'CSE503',
    title: 'ER Diagram for Hospital DBMS',
    faculty: 'Dr. Kavita Rao',
    dueAt: isoDateTimePlus(4),
    courseId: 'cse-503',
    status: 'Pending',
  },
  {
    id: 'asg-4',
    subject: 'CSE504',
    title: 'Subnetting Worksheet',
    faculty: 'Prof. Rohan Mehta',
    dueAt: isoDateTimePlus(5),
    courseId: 'cse-504',
    status: 'Pending',
  },
  {
    id: 'asg-5',
    subject: 'CSE505',
    title: 'Linear Regression Lab Notebook',
    faculty: 'Dr. Neha Gupta',
    dueAt: isoDateTimePlus(0),
    courseId: 'cse-505',
    status: 'Due soon',
  },
  {
    id: 'asg-6',
    subject: 'CSE506',
    title: 'SRS Document — Library App',
    faculty: 'Dr. Sneha Iyer',
    dueAt: isoDateTimePlus(7),
    courseId: 'cse-506',
    status: 'Pending',
  },
  {
    id: 'asg-7',
    subject: 'CSE510',
    title: 'FIR Filter Design Report',
    faculty: 'Prof. Vikram Singh',
    dueAt: isoDateTimePlus(-2),
    courseId: 'cse-510',
    status: 'Submitted',
  },
  {
    id: 'asg-8',
    subject: 'HUM501',
    title: 'Group Presentation Slides',
    faculty: 'Dr. Ananya Joshi',
    dueAt: isoDateTimePlus(9),
    courseId: 'cse-509',
    status: 'Pending',
  },
];

export const DEMO_EXAMS: DemoExam[] = [
  {
    exam_id: 'ex-mid-1',
    subject: 'Design & Analysis of Algorithms',
    course_code: 'CSE501',
    exam_type: 'MID_TERM',
    exam_date: isoPlus(8),
    start_time: '09:30',
    end_time: '11:00',
    hall: 'Block C — Hall A',
    seat: 'C-A-24',
  },
  {
    exam_id: 'ex-mid-2',
    subject: 'Operating Systems',
    course_code: 'CSE502',
    exam_type: 'MID_TERM',
    exam_date: isoPlus(9),
    start_time: '09:30',
    end_time: '11:00',
    hall: 'Block A — Hall B',
    seat: 'B-A-18',
  },
  {
    exam_id: 'ex-prac-1',
    subject: 'OS Laboratory',
    course_code: 'CSE507',
    exam_type: 'PRACTICAL',
    exam_date: isoPlus(18),
    start_time: '10:00',
    end_time: '13:00',
    hall: 'Block D — Lab 204',
    seat: 'Bench-07',
  },
  {
    exam_id: 'ex-prac-2',
    subject: 'DBMS Laboratory',
    course_code: 'CSE508',
    exam_type: 'PRACTICAL',
    exam_date: isoPlus(19),
    start_time: '10:00',
    end_time: '13:00',
    hall: 'Block B — Lab 105',
    seat: 'Bench-12',
  },
  {
    exam_id: 'ex-end-1',
    subject: 'Database Management Systems',
    course_code: 'CSE503',
    exam_type: 'END_TERM',
    exam_date: isoPlus(45),
    start_time: '09:30',
    end_time: '12:30',
    hall: 'Main Campus — Exam Hall',
    seat: 'M-42',
  },
  {
    exam_id: 'ex-end-2',
    subject: 'Machine Learning',
    course_code: 'CSE505',
    exam_type: 'END_TERM',
    exam_date: isoPlus(47),
    start_time: '14:00',
    end_time: '17:00',
    hall: 'Block B — Hall D',
    seat: 'D-B-11',
  },
];

export const DEMO_MARKS = {
  cgpa: 8.42,
  total_credits_earned: 92,
  semesters: [
    {
      semester_number: 4,
      sgpa: 8.1,
      credits: 22,
      courses: [
        {
          course_id: 'cse-401',
          course_code: 'CSE401',
          course_name: 'Theory of Computation',
          course_type: 'CORE',
          credits: 4,
          grade: 'A',
          status: 'PASS',
        },
        {
          course_id: 'cse-402',
          course_code: 'CSE402',
          course_name: 'Computer Organisation',
          course_type: 'CORE',
          credits: 4,
          grade: 'B+',
          status: 'PASS',
        },
      ],
    },
    {
      semester_number: 5,
      sgpa: 8.6,
      credits: 28,
      courses: DEMO_SUBJECTS.map((s, i) => ({
        course_id: s.course_id,
        course_code: s.course_code,
        course_name: s.course_name,
        course_type: s.course_type,
        credits: s.credits,
        grade: ['A+', 'A', 'A', 'B+', 'A', 'B+', 'A', 'A', 'B+', 'A'][i] ?? 'B+',
        status: i < 8 ? 'PASS' : 'ENROLLED',
      })),
    },
  ],
  component_marks_by_semester: [
    {
      semester_number: 5,
      subjects: DEMO_SUBJECTS.slice(0, 6).map((s, i) => ({
        course_id: s.course_id,
        course_code: s.course_code,
        course_name: s.course_name,
        components: [
          { key: 'WT1', label: 'WT1', marks_obtained: [4, 5, 3, 4, 5, 4][i] ?? 4, max_marks: 5 },
          { key: 'WT2', label: 'WT2', marks_obtained: [5, 4, 4, 3, 5, 4][i] ?? 4, max_marks: 5 },
          { key: 'GA1', label: 'GA1', marks_obtained: [4, 5, 4, 4, 5, 3][i] ?? 4, max_marks: 5 },
          { key: 'GA2', label: 'GA2', marks_obtained: [5, 4, 5, 4, 4, 4][i] ?? 4, max_marks: 5 },
          { key: 'MT1', label: 'MT1', marks_obtained: [8, 7, 9, 8, 8, 7][i] ?? 8, max_marks: 10 },
          { key: 'MT2', label: 'MT2', marks_obtained: [7, 8, 8, 7, 9, 8][i] ?? 8, max_marks: 10 },
          { key: 'ETE', label: 'ETE', marks_obtained: [32, 30, 34, 28, 33, 29][i] ?? 30, max_marks: 40 },
        ],
        total_internal_obtained: 18 + i,
        total_internal_max: 30,
      })),
    },
  ],
  backlogs: { uncleared: [], cleared: [] },
};

export const DEMO_FEE_STRUCTURE = [
  {
    demand_id: 'fee-sem1',
    fee_head: 'SEMESTER_FEE',
    academic_year: '2023-24',
    semester: 1,
    amount: 90000,
    fee_concession: 10000,
    scholarship: 10000,
    discount: 0,
    credit: 0,
    paid_amount: 80000,
    payable_amount: 0,
    due_date: '2023-08-15',
    status: 'PAID',
  },
  {
    demand_id: 'fee-sem2',
    fee_head: 'SEMESTER_FEE',
    academic_year: '2023-24',
    semester: 2,
    amount: 90000,
    fee_concession: 10000,
    scholarship: 10000,
    discount: 0,
    credit: 0,
    paid_amount: 80000,
    payable_amount: 0,
    due_date: '2024-01-15',
    status: 'PAID',
  },
  {
    demand_id: 'fee-sem3',
    fee_head: 'SEMESTER_FEE',
    academic_year: '2024-25',
    semester: 3,
    amount: 92000,
    fee_concession: 12000,
    scholarship: 12000,
    discount: 0,
    credit: 0,
    paid_amount: 80000,
    payable_amount: 0,
    due_date: '2024-08-15',
    status: 'PAID',
  },
  {
    demand_id: 'fee-sem4',
    fee_head: 'SEMESTER_FEE',
    academic_year: '2025-26',
    semester: 4,
    amount: 95000,
    fee_concession: 15000,
    scholarship: 15000,
    discount: 0,
    credit: 0,
    paid_amount: 80000,
    payable_amount: 0,
    due_date: '2025-12-15',
    status: 'PAID',
  },
  {
    demand_id: 'fee-sem5',
    fee_head: 'SEMESTER_FEE',
    academic_year: '2026-27',
    semester: 5,
    amount: 98000,
    fee_concession: 20000,
    scholarship: 18000,
    discount: 2000,
    credit: 0,
    paid_amount: 44000,
    payable_amount: 34000,
    due_date: isoPlus(6),
    status: 'PARTIAL',
  },
  {
    demand_id: 'fee-exam',
    fee_head: 'EXAM_FEE',
    academic_year: '2026-27',
    semester: 5,
    amount: 3500,
    fee_concession: 0,
    scholarship: 0,
    discount: 0,
    credit: 0,
    paid_amount: 0,
    payable_amount: 3500,
    due_date: isoPlus(25),
    status: 'PENDING',
  },
] satisfies DemoFeeDemand[];

export const DEMO_FEE_PAYMENTS = [
  {
    transaction_id: 'txn-demo-1',
    amount: '44000',
    payment_mode: 'UPI',
    receipt_url: null,
    created_at: isoDateTimePlus(-18),
    gateway_payment_id: 'pay_demo_RCP44000',
    fee_head: 'SEMESTER_FEE',
    demand_id: 'fee-sem5',
    semester: 5,
  },
  {
    transaction_id: 'txn-demo-2',
    amount: '80000',
    payment_mode: 'Net Banking',
    receipt_url: null,
    created_at: isoDateTimePlus(-120),
    gateway_payment_id: 'pay_demo_RCP80000',
    fee_head: 'SEMESTER_FEE',
    demand_id: 'fee-sem4',
    semester: 4,
  },
  {
    transaction_id: 'txn-demo-3',
    amount: '80000',
    payment_mode: 'UPI',
    receipt_url: null,
    created_at: isoDateTimePlus(-280),
    gateway_payment_id: 'pay_demo_RCP80000B',
    fee_head: 'SEMESTER_FEE',
    demand_id: 'fee-sem3',
    semester: 3,
  },
  {
    transaction_id: 'txn-demo-4',
    amount: '80000',
    payment_mode: 'Card',
    receipt_url: null,
    created_at: isoDateTimePlus(-450),
    gateway_payment_id: 'pay_demo_RCP80000C',
    fee_head: 'SEMESTER_FEE',
    demand_id: 'fee-sem2',
    semester: 2,
  },
  {
    transaction_id: 'txn-demo-5',
    amount: '80000',
    payment_mode: 'UPI',
    receipt_url: null,
    created_at: isoDateTimePlus(-620),
    gateway_payment_id: 'pay_demo_RCP80000D',
    fee_head: 'SEMESTER_FEE',
    demand_id: 'fee-sem1',
    semester: 1,
  },
];

export const DEMO_LIBRARY_LOANS: DemoLibraryLoan[] = [
  {
    loan_id: 'lib-1',
    title: 'Introduction to Algorithms',
    author: 'Cormen, Leiserson, Rivest, Stein',
    accession_no: 'LIB-CSE-10428',
    issue_date: isoPlus(-12),
    due_date: isoPlus(2),
    fine_amount: 0,
    renew_status: 'Available',
    status: 'ISSUED',
  },
  {
    loan_id: 'lib-2',
    title: 'Operating System Concepts',
    author: 'Silberschatz, Galvin, Gagne',
    accession_no: 'LIB-CSE-08912',
    issue_date: isoPlus(-20),
    due_date: isoPlus(-1),
    fine_amount: 20,
    renew_status: 'Renewed',
    status: 'OVERDUE',
  },
  {
    loan_id: 'lib-3',
    title: 'Database System Concepts',
    author: 'Korth, Sudarshan',
    accession_no: 'LIB-CSE-06641',
    issue_date: isoPlus(-8),
    due_date: isoPlus(6),
    fine_amount: 0,
    renew_status: 'Available',
    status: 'ISSUED',
  },
];

export const DEMO_PLACEMENTS = {
  open_drives: [
    {
      drive_id: 'drv-tcs',
      company_name: 'Tata Consultancy Services',
      job_role: 'Assistant System Engineer',
      package_lpa: 3.6,
      drive_type: 'PLACEMENT' as const,
      status: 'OPEN' as const,
      location: 'Pan India',
      min_cgpa: 6.5,
      deadline: isoPlus(12),
      description:
        'Ninja hiring for Assistant System Engineer. Online aptitude, technical interview, and HR discussion. Bond-free campus offer.',
    },
    {
      drive_id: 'drv-wipro',
      company_name: 'Wipro',
      job_role: 'Project Engineer',
      package_lpa: 3.5,
      drive_type: 'PLACEMENT' as const,
      status: 'OPEN' as const,
      location: 'Bengaluru / Hyderabad',
      min_cgpa: 6.0,
      deadline: isoPlus(18),
      description:
        'Elite National Talent Hunt — coding assessment followed by technical and HR rounds. Open to CSE and allied branches.',
    },
    {
      drive_id: 'drv-infosys',
      company_name: 'Infosys',
      job_role: 'Systems Engineer',
      package_lpa: 4.0,
      drive_type: 'PLACEMENT' as const,
      status: 'APPLIED' as const,
      location: 'Mysore / Pune',
      min_cgpa: 6.5,
      deadline: isoPlus(-5),
      description:
        'Infosys Springboard campus drive. Aptitude test completed — awaiting technical interview shortlist.',
    },
    {
      drive_id: 'drv-amazon-intern',
      company_name: 'Amazon',
      job_role: 'SDE Intern',
      package_lpa: 1.2,
      drive_type: 'INTERNSHIP' as const,
      status: 'INTERVIEW' as const,
      location: 'Hyderabad',
      min_cgpa: 7.0,
      deadline: isoPlus(-20),
      description:
        '6-month SDE internship. Online assessment cleared; technical interview scheduled with the hiring team.',
    },
  ] satisfies DemoPlacementCompany[],
  applications: 2,
  interviews: 1,
  offers: 0,
  summary_label: 'Eligible for campus drives · 2 applications active',
};

/** Exit / alumni hub fallback when GET /api/student/exit is unavailable. */
export const DEMO_EXIT = {
  no_dues: [
    { key: 'library', label: 'Library', cleared: true, not_applicable: false },
    { key: 'finance', label: 'Finance', cleared: true, not_applicable: false },
    {
      key: 'hostel',
      label: 'Hostel (not applicable)',
      cleared: true,
      not_applicable: true,
    },
    { key: 'dept', label: 'Department', cleared: false, not_applicable: false },
  ],
  progress_percent: 75,
  degree_issued_date: null as string | null,
  degree_award_status: 'PENDING',
  final_result: 'Pass — CGPA 8.42',
  alumni_converted: false,
  linkedin_url: null as string | null,
  placement_organization: null as string | null,
  conversion_requested_at: null as string | null,
  alumni_request: null as null,
  clearance_tasks: [
    {
      task_name: 'Department no-dues sign-off',
      owner_department: 'CSE Department',
      status: 'PENDING',
    },
  ],
  alumni_eligibility: {
    eligible: false,
    current_semester: 8,
    max_semester: 8,
    no_dues: {
      finance: true,
      library: true,
      hostel: true,
      hostel_applicable: false,
      dept: false,
      all_cleared: false,
    },
    final_semester_results_published: true,
    active_backlogs: 0,
    blockers: ['Department no-dues pending'],
    alumni_converted: false,
    request_pending: false,
  },
};

export const DEMO_TRANSPORT = {
  allocation_id: 'tr-demo-1',
  bus_number: 'SGVU-BUS-12',
  route_name: 'Vaishali Nagar → Main Campus',
  stop_name: 'Vaishali Nagar Circle',
  pickup_time: '07:35 AM',
  drop_time: '05:40 PM',
  driver_name: 'Suresh Yadav',
  driver_phone: '+91 98290 11223',
  fee_amount: '18000',
  payment_status: 'PAID',
  pass_status: 'ACTIVE',
  route_id: 'route-vaishali',
};

export const DEMO_HOSTEL = {
  hostel_block: 'Tagore Boys Hostel — Block B',
  room_number: 'B-214',
  bed_number: '2',
  floor: '2nd Floor',
  mess_plan: 'Vegetarian — Monthly',
  mess_status: 'Active',
  warden: { name: 'Dr. Rakesh Chauhan' },
};

export const DEMO_NOTIFICATIONS: DemoNotification[] = [
  {
    id: 'n1',
    title: 'Assignment due tomorrow',
    body: 'CSE505 Linear Regression Lab Notebook is due tomorrow by 11:59 PM.',
    type: 'warning',
    unread: true,
    created_at: isoDateTimePlus(0),
  },
  {
    id: 'n2',
    title: 'Attendance reminder',
    body: 'Your Computer Networks attendance is 83.3%. Stay above 75%.',
    type: 'info',
    unread: true,
    created_at: isoDateTimePlus(-1),
  },
  {
    id: 'n3',
    title: 'Fee payment reminder',
    body: '₹34,000 is pending for Semester 5. Pay before the due date to unlock admit card.',
    type: 'fee',
    unread: true,
    created_at: isoDateTimePlus(-1),
  },
  {
    id: 'n4',
    title: 'Mid-semester exam schedule released',
    body: 'CSE501 Algorithms mid-term is on ' + isoPlus(8) + ' in Hall A. Seat C-A-24.',
    type: 'exam',
    unread: true,
    created_at: isoDateTimePlus(-2),
  },
  {
    id: 'n5',
    title: 'Placement drive: Infosys',
    body: 'Infosys campus drive applications close in 3 days. Check eligibility on Placements.',
    type: 'placement',
    unread: true,
    created_at: isoDateTimePlus(-2),
  },
  {
    id: 'n6',
    title: 'Library book due soon',
    body: '“Introduction to Algorithms” is due on ' + isoPlus(2) + '. Renew online if needed.',
    type: 'library',
    unread: true,
    created_at: isoDateTimePlus(-3),
  },
  {
    id: 'n7',
    title: 'Independence Day holiday',
    body: 'University will remain closed on 15 August for Independence Day.',
    type: 'info',
    unread: true,
    created_at: isoDateTimePlus(-3),
  },
  {
    id: 'n8',
    title: 'Course registration window open',
    body: 'Complete elective registration for Semester 5 before the add/drop deadline.',
    type: 'info',
    unread: false,
    created_at: isoDateTimePlus(-4),
  },
  {
    id: 'n9',
    title: 'Weekly test WT2 scheduled',
    body: 'Operating Systems WT2 opens this Friday in full-screen proctored mode.',
    type: 'exam',
    unread: false,
    created_at: isoDateTimePlus(-5),
  },
  {
    id: 'n10',
    title: 'Hostel mess menu updated',
    body: 'This week’s dinner special: Paneer Lababdar (Thu) and Dal Makhani (Sat).',
    type: 'info',
    unread: false,
    created_at: isoDateTimePlus(-5),
  },
  {
    id: 'n11',
    title: 'Transport route delay',
    body: 'Bus SGVU-BUS-12 may run 10 minutes late tomorrow morning due to road work.',
    type: 'warning',
    unread: false,
    created_at: isoDateTimePlus(-6),
  },
  {
    id: 'n12',
    title: 'Mentor meeting scheduled',
    body: 'Proctor meeting with Dr. Meera Krishnan on Friday at 3:00 PM in Cabin C-12.',
    type: 'info',
    unread: false,
    created_at: isoDateTimePlus(-6),
  },
  {
    id: 'n13',
    title: 'Amazon internship shortlist',
    body: 'You are shortlisted for the Amazon SDE Intern interview round.',
    type: 'placement',
    unread: false,
    created_at: isoDateTimePlus(-7),
  },
  {
    id: 'n14',
    title: 'Grade card published',
    body: 'Semester 4 final grade card is available under Marks & Results.',
    type: 'success',
    unread: false,
    created_at: isoDateTimePlus(-10),
  },
  {
    id: 'n15',
    title: 'Diwali vacation notice',
    body: 'Diwali holidays are scheduled from 19–22 October. Hostel stay requires warden approval.',
    type: 'info',
    unread: false,
    created_at: isoDateTimePlus(-12),
  },
];

export const DEMO_TODAY_SCHEDULE = [
  {
    id: 'today-1',
    subject: 'Design & Analysis of Algorithms',
    faculty: 'Dr. Meera Krishnan',
    room: 'C-402',
    start: '09:00',
    end: '10:00',
  },
  {
    id: 'today-2',
    subject: 'Operating Systems',
    faculty: 'Prof. Arjun Desai',
    room: 'A-118',
    start: '10:00',
    end: '11:00',
  },
  {
    id: 'today-3',
    subject: 'Database Management Systems',
    faculty: 'Dr. Kavita Rao',
    room: 'B-210',
    start: '11:00',
    end: '12:00',
  },
  {
    id: 'today-4',
    subject: 'Machine Learning',
    faculty: 'Dr. Neha Gupta',
    room: 'Lab-3',
    start: '14:00',
    end: '15:00',
  },
];

/** Prefer live data; fall back to demo when empty. */
export function demoFallback<T>(
  live: T | null | undefined,
  demo: T,
  isEmpty?: (value: T) => boolean,
): T {
  if (live == null) return demo;
  if (isEmpty?.(live)) return demo;
  return live;
}

export function isEmptyArray<T>(value: T): boolean {
  return Array.isArray(value) && value.length === 0;
}

const DEMO_NOTIF_CATEGORY: Record<DemoNotification['type'], string> = {
  fee: 'FINANCE',
  warning: 'ACADEMICS',
  success: 'ACADEMICS',
  exam: 'EXAMS',
  placement: 'PLACEMENT',
  library: 'LIBRARY',
  info: 'GENERAL',
};

const DEMO_NOTIF_LINK: Record<DemoNotification['type'], string> = {
  fee: '/student/finance',
  warning: '/student/attendance',
  success: '/student/marks',
  exam: '/student/exams',
  placement: '/student/placements',
  library: '/student/library',
  info: '/student/dashboard',
};

/** Map demo notifications into the FalconNotification API shape for inbox / bell / dashboard. */
export function demoNotificationsAsFalcon(userId = 'demo-student') {
  return DEMO_NOTIFICATIONS.map((n) => ({
    notification_id: n.id,
    tenant_id: 'demo',
    user_id: userId,
    category: DEMO_NOTIF_CATEGORY[n.type],
    title: n.title,
    message: n.body,
    action_link: DEMO_NOTIF_LINK[n.type],
    severity: n.type === 'warning' || n.type === 'fee' ? 'warning' : 'info',
    intent: n.unread && (n.type === 'fee' || n.type === 'warning' || n.type === 'exam')
      ? 'action_required'
      : 'informational',
    action_label: null,
    metadata: { demo: true },
    is_read: !n.unread,
    created_at: n.created_at,
  }));
}

export function isDemoNotificationId(id: string) {
  if (!id) return false;
  if (id.startsWith('n') && /^n\d+$/.test(id)) return true;
  // Faculty / cross-portal smoke notification IDs
  return /^(notif-fac-|notif-demo-|demo-notif-)/i.test(id);
}
