/** Realistic SGVU-style development seed data for the Examination Module. */

export const SEED = {
  ids: {
    examMid: 'a1000001-0000-4000-8000-000000000001',
    examEnd: 'a1000002-0000-4000-8000-000000000002',
    sessionEnd: 'c3000001-0000-4000-8000-000000000001',
  },
  students: [
    { user_id: 'd4000001-0000-4000-8000-000000000001', name: 'Rahul Sharma', enrollment_number: 'SGVU2022CSE001', prn_number: 'PRN2200101' },
    { user_id: 'd4000002-0000-4000-8000-000000000002', name: 'Priya Patel', enrollment_number: 'SGVU2022CSE002', prn_number: 'PRN2200102' },
    { user_id: 'd4000003-0000-4000-8000-000000000003', name: 'Amit Kumar', enrollment_number: 'SGVU2022CSE003', prn_number: 'PRN2200103' },
    { user_id: 'd4000004-0000-4000-8000-000000000004', name: 'Sneha Reddy', enrollment_number: 'SGVU2022ME001', prn_number: 'PRN2200201' },
    { user_id: 'd4000005-0000-4000-8000-000000000005', name: 'Vikram Singh', enrollment_number: 'SGVU2022EE001', prn_number: 'PRN2200301' },
  ],
  faculty: [
    { user_id: 'e5000001-0000-4000-8000-000000000001', name: 'Dr. Anil Mehta', department: 'Computer Science' },
    { user_id: 'e5000002-0000-4000-8000-000000000002', name: 'Prof. Kavita Joshi', department: 'Computer Science' },
    { user_id: 'e5000003-0000-4000-8000-000000000003', name: 'Dr. Rajesh Verma', department: 'Mechanical Engineering' },
  ],
  subjects: [
    { subject_id: 101, subject_code: 'CS401', subject_name: 'Operating Systems', semester: 4 },
    { subject_id: 102, subject_code: 'CS402', subject_name: 'Computer Networks', semester: 4 },
    { subject_id: 103, subject_code: 'CS403', subject_name: 'Database Management Systems', semester: 4 },
    { subject_id: 104, subject_code: 'CS404', subject_name: 'Machine Learning', semester: 6 },
    { subject_id: 105, subject_code: 'CS405', subject_name: 'Artificial Intelligence', semester: 6 },
  ],
  schedules: () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return [
      {
        exam_schedule_id: 'a1000001-0000-4000-8000-000000000001',
        exam_type: 'MID_TERM',
        exam_date: tomorrow,
        start_time: '09:00:00',
        end_time: '12:00:00',
        venue: 'Block A — Hall 101',
        subject_name: 'Operating Systems',
        subject_code: 'CS401',
        max_marks: 50,
        batch_label: 'B.Tech Sem 4 MID TERM',
      },
      {
        exam_schedule_id: 'a1000002-0000-4000-8000-000000000002',
        exam_type: 'END_TERM',
        exam_date: today,
        start_time: '14:00:00',
        end_time: '17:00:00',
        venue: 'Block A — Hall 102',
        subject_name: 'Database Management Systems',
        subject_code: 'CS403',
        max_marks: 100,
        batch_label: 'B.Tech Sem 4 END TERM',
      },
      {
        exam_schedule_id: 'a1000003-0000-4000-8000-000000000003',
        exam_type: 'PRACTICAL',
        exam_date: tomorrow,
        start_time: '10:00:00',
        end_time: '13:00:00',
        venue: 'Lab Block — L201',
        subject_name: 'Computer Networks',
        subject_code: 'CS402',
        max_marks: 30,
        batch_label: 'B.Tech Sem 4 PRACTICAL',
      },
    ];
  },
  blocksHalls: [
    {
      block: 'Block A',
      halls: [
        { name: 'A101', capacity: 60, rows: 6, cols: 10 },
        { name: 'A102', capacity: 60, rows: 6, cols: 10 },
      ],
    },
    {
      block: 'Block B',
      halls: [
        { name: 'B201', capacity: 80, rows: 8, cols: 10 },
        { name: 'B202', capacity: 80, rows: 8, cols: 10 },
      ],
    },
  ],
  branches: ['Computer Science', 'Mechanical Engineering', 'Civil Engineering', 'Electrical Engineering'],
  dashboard: () => ({
    upcoming_exams: 3,
    todays_exams: 1,
    active_exam_sessions: 2,
    registered_students: 248,
    students_eligible: 231,
    hall_tickets_generated: 198,
    todays_attendance: 186,
    form_registrations: 248,
    pending_hall_tickets: 33,
    pending_coe_marks: 12,
    pending_results: 4,
    re_evaluations_queue: 7,
    pending_supplementary: 15,
    invigilators_assigned_today: 8,
    open_ufm_cases: 2,
    result_status_chart: [
      { label: 'PUBLISHED', count: 412 },
      { label: 'WITHHELD', count: 3 },
      { label: 'FAIL', count: 28 },
    ],
    recent_activity: [
      { audit_id: '1', action: 'HALL_TICKET_GENERATED', resource_type: 'exam_admit_card', created_at: new Date().toISOString(), actor_name: 'Exam Cell Officer' },
      { audit_id: '2', action: 'SEATING_PUBLISHED', resource_type: 'exam_seating_plan', created_at: new Date(Date.now() - 3600000).toISOString(), actor_name: 'Exam Cell Officer' },
      { audit_id: '3', action: 'EXAM_DAY_ATTENDANCE_MARKED', resource_type: 'exam_day_attendance', created_at: new Date(Date.now() - 7200000).toISOString(), actor_name: 'Invigilator' },
    ],
  }),
  liveDashboard: () => ({
    as_of: new Date().toISOString(),
    exams_running: 2,
    students_present: 186,
    students_absent: 14,
    rooms_active: 4,
    invigilators_present: 8,
    late_entries: 6,
    ufm_cases_today: 1,
    pending_incidents: 2,
  }),
  sessions: [
    {
      session_id: 'c3000001-0000-4000-8000-000000000001',
      session_name: 'Mid Semester Examination 2025-26',
      academic_year: '2025-26',
      semester: 4,
      program_label: 'B.Tech Computer Science',
      exam_type: 'MID_TERM',
      status: 'ACTIVE',
      start_date: '2026-03-01',
      end_date: '2026-03-15',
    },
    {
      session_id: 'c3000002-0000-4000-8000-000000000002',
      session_name: 'End Semester Examination 2025-26',
      academic_year: '2025-26',
      semester: 4,
      program_label: 'B.Tech Computer Science',
      exam_type: 'END_TERM',
      status: 'OPEN',
      start_date: '2026-05-01',
      end_date: '2026-05-20',
    },
  ],
  myTasks: [
    { id: 'registrations', title: 'Review pending exam registrations — Sem 4 End Term', count: 12, priority: 'HIGH' as const, href: '/exam-cell/form-fillup' },
    { id: 'hall-tickets', title: 'Hall ticket approvals awaiting COE sign-off', count: 8, priority: 'HIGH' as const, href: '/exam-cell/hall-ticket-approvals' },
    { id: 'exam-day', title: "Today's exam sessions need attendance", count: 2, priority: 'HIGH' as const, href: '/exam-cell/exam-day' },
    { id: 'results', title: 'COE marks review — CS401 Operating Systems', count: 3, priority: 'MEDIUM' as const, href: '/exam-cell/results' },
  ],
  analytics: (semester: number) => ({
    semester,
    pass_percentage: 78.4,
    fail_percentage: 21.6,
    grade_distribution: [
      { grade: 'A+', count: 42 }, { grade: 'A', count: 68 }, { grade: 'B+', count: 85 },
      { grade: 'B', count: 52 }, { grade: 'C', count: 28 }, { grade: 'F', count: 18 },
    ],
    subject_analysis: [
      { subject_code: 'CS401', subject_name: 'Operating Systems', avg_marks: 72.5, students: 120 },
      { subject_code: 'CS402', subject_name: 'Computer Networks', avg_marks: 68.2, students: 118 },
      { subject_code: 'CS403', subject_name: 'Database Management Systems', avg_marks: 74.8, students: 122 },
    ],
    faculty_performance: [
      { name: 'Dr. Anil Mehta', submissions: 240 },
      { name: 'Prof. Kavita Joshi', submissions: 198 },
    ],
    pass_fail: [
      { label: 'PASS', count: 198 },
      { label: 'FAIL', count: 36 },
      { label: 'WITHHELD', count: 3 },
    ],
    registration_trend: [
      { month: 'Jan', count: 180 }, { month: 'Feb', count: 220 }, { month: 'Mar', count: 248 },
    ],
  }),
  admitCardAudit: () => ({
    batch_label: 'B.Tech Sem 4 END TERM',
    semester: 4,
    eligible_count: 4,
    blocked_count: 1,
    items: [
      { student_user_id: 'd4000001-0000-4000-8000-000000000001', student_id: 'SGVU2022CSE001', name: 'Rahul Sharma', semester: 4, fee_status: 'Clear' as const, attendance_percent: 82, has_exemption: false, eligible: true, block_reasons: [] as string[] },
      { student_user_id: 'd4000002-0000-4000-8000-000000000002', student_id: 'SGVU2022CSE002', name: 'Priya Patel', semester: 4, fee_status: 'Clear' as const, attendance_percent: 78, has_exemption: false, eligible: true, block_reasons: [] as string[] },
      { student_user_id: 'd4000003-0000-4000-8000-000000000003', student_id: 'SGVU2022CSE003', name: 'Amit Kumar', semester: 4, fee_status: 'Pending' as const, attendance_percent: 71, has_exemption: false, eligible: false, block_reasons: ['Fee dues pending', 'Attendance below 75%'] },
      { student_user_id: 'd4000004-0000-4000-8000-000000000004', student_id: 'SGVU2022ME001', name: 'Sneha Reddy', semester: 4, fee_status: 'Clear' as const, attendance_percent: 88, has_exemption: false, eligible: true, block_reasons: [] as string[] },
      { student_user_id: 'd4000005-0000-4000-8000-000000000005', student_id: 'SGVU2022EE001', name: 'Vikram Singh', semester: 4, fee_status: 'Clear' as const, attendance_percent: 76, has_exemption: false, eligible: true, block_reasons: [] as string[] },
    ],
  }),
  hallTicketApprovals: [
    { approval_id: '1', student_name: 'Rahul Sharma', enrollment_number: 'SGVU2022CSE001', stage: 'COE', eligibility_status: 'APPROVED', finance_status: 'APPROVED', exam_office_status: 'APPROVED', coe_status: 'PENDING', block_reasons: [] as string[] },
    { approval_id: '2', student_name: 'Priya Patel', enrollment_number: 'SGVU2022CSE002', stage: 'EXAM_OFFICE', eligibility_status: 'APPROVED', finance_status: 'APPROVED', exam_office_status: 'PENDING', coe_status: 'PENDING', block_reasons: [] as string[] },
    { approval_id: '3', student_name: 'Amit Kumar', enrollment_number: 'SGVU2022CSE003', stage: 'FINANCE', eligibility_status: 'APPROVED', finance_status: 'PENDING', exam_office_status: 'PENDING', coe_status: 'PENDING', block_reasons: ['Fee dues ₹12,500'] },
  ],
  examDayToday: () => {
    const today = new Date().toISOString().slice(0, 10);
    return SEED.schedules().filter((s) => s.exam_date === today).map((s) => ({ ...s, marked_count: 42 }));
  },
  examDayRoster: () =>
    SEED.students.slice(0, 4).map((s, i) => ({
      student_user_id: s.user_id,
      student_name: s.name,
      enrollment_number: s.enrollment_number,
      room: i < 2 ? 'A101' : 'A102',
      seat_number: String(i + 1).padStart(2, '0'),
      attendance_status: i < 2 ? 'PRESENT' : null,
      attendance_id: i < 2 ? `att-${i}` : null,
    })),
  examDayAttendance: () =>
    SEED.students.slice(0, 2).map((s, i) => ({
      attendance_id: `att-${i}`,
      student_name: s.name,
      enrollment_number: s.enrollment_number,
      status: 'PRESENT',
      marked_at: new Date().toISOString(),
    })),
  invigilationDuties: () =>
    SEED.faculty.map((f, i) => ({
      duty_id: `duty-${i}`,
      faculty_name: f.name,
      room: ['A101', 'A102', 'B201'][i],
      exam_date: new Date().toISOString().slice(0, 10),
      exam_type: 'END_TERM',
      subject_name: 'Database Management Systems',
      published: true,
    })),
  reportsSummary: (semester: number) => ({
    semester,
    pass_fail: [
      { label: 'PASS', count: 198 },
      { label: 'FAIL', count: 36 },
      { label: 'WITHHELD', count: 3 },
    ],
    pass_percentage: 84.6,
    top_rankers: SEED.students.slice(0, 5).map((s, i) => ({
      name: s.name,
      enrollment_number: s.enrollment_number,
      cgpa: 8.2 - i * 0.12,
      sgpa: 8.5 - i * 0.15,
    })),
    department_enrollment: [
      { department: 'Computer Science', students: 120 },
      { department: 'Mechanical', students: 62 },
      { department: 'Electrical', students: 52 },
    ],
    pending_backlog: 15,
  }),
  backlogApplications: () => [
    { exam_application_id: 'bl-1', student_name: 'Amit Kumar', enrollment_number: 'SGVU2022CSE003', subject_code: 'MA201', subject_name: 'Engineering Mathematics II', fee_status: 'PAID', status: 'PENDING', created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
    { exam_application_id: 'bl-2', student_name: 'Vikram Singh', enrollment_number: 'SGVU2022EE001', subject_code: 'EE301', subject_name: 'Power Systems', fee_status: 'PENDING', status: 'PENDING', created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    { exam_application_id: 'bl-3', student_name: 'Rahul Sharma', enrollment_number: 'SGVU2022CSE001', subject_code: 'CS402', subject_name: 'Computer Networks', fee_status: 'PAID', status: 'APPROVED', created_at: new Date(Date.now() - 86400000 * 12).toISOString() },
    { exam_application_id: 'bl-4', student_name: 'Priya Patel', enrollment_number: 'SGVU2022CSE002', subject_code: 'CS403', subject_name: 'Database Management Systems', fee_status: 'PAID', status: 'APPROVED', created_at: new Date(Date.now() - 86400000 * 8).toISOString() },
  ],
  gradesAggregateTable: () =>
    SEED.students.map((s, i) => ({
      student_id: s.user_id,
      student_name: s.name,
      quiz_marks: 7 + (i % 3),
      internal_marks: 8 + (i % 2),
      mid_term_marks: 22 + i * 2,
      end_term_marks: 38 + i * 3,
      aggregate: 75 + i * 4,
      grade: i === 2 ? 'BC' : i === 4 ? 'AB' : 'BB',
    })),
  reEvaluations: () => [
    { exam_application_id: 're-1', student_name: 'Rahul Sharma', subject_code: 'CS401', subject_name: 'Operating Systems', fee_status: 'PAID', status: 'PENDING', original_marks: 58, created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
    { exam_application_id: 're-2', student_name: 'Priya Patel', subject_code: 'CS403', subject_name: 'Database Management Systems', fee_status: 'PAID', status: 'UNDER_REVIEW', original_marks: 62, revised_marks: 68, faculty_name: 'Dr. Anil Mehta', report_notes: 'Re-checked end-term script. Marks increased after verification.', created_at: new Date(Date.now() - 86400000 * 6).toISOString() },
    { exam_application_id: 're-3', student_name: 'Sneha Reddy', subject_code: 'ME401', subject_name: 'Thermodynamics', fee_status: 'PAID', status: 'COMPLETED', original_marks: 55, revised_marks: 55, faculty_name: 'Dr. Rajesh Verma', report_notes: 'No change after reassessment.', created_at: new Date(Date.now() - 86400000 * 10).toISOString() },
  ],
  ufmCases: () => [
    { case_id: 'ufm-1', student_name: 'Amit Kumar', description: 'Mobile phone found during end-term examination', penalty_applied: 'Exam cancelled — UFM', status: 'OPEN', marks_locked: true, exam_type: 'END_TERM', course_scope: 'CS401', logged_at: new Date(Date.now() - 86400000 * 4).toISOString() },
    { case_id: 'ufm-2', student_name: 'Vikram Singh', description: 'Unauthorised material in exam hall', penalty_applied: 'Zero marks — UFM', status: 'OPEN', marks_locked: true, exam_type: 'MID_TERM', course_scope: 'EE301', logged_at: new Date(Date.now() - 86400000 * 18).toISOString() },
  ],
  ufmFormOptions: (semester = 4, department?: string) => ({
    students: SEED.students.filter((s) => !department || department === 'Computer Science' || s.enrollment_number.includes('CSE')),
    courses: [{ course_id: 'b2000001-0000-4000-8000-000000000001', course_code: 'CS401', course_name: 'Operating Systems', semester }],
    departments: ['Computer Science', 'Mechanical Engineering', 'Electrical Engineering'],
  }),
  questionPapers: () => [
    { qp_id: 'qp-1', subject_name: 'Operating Systems', subject_code: 'CS401', exam_date: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10), exam_type: 'END_TERM', setter_name: 'Dr. Anil Mehta', status: 'UPLOADED', notes: 'End term QP — CS401', created_at: new Date().toISOString() },
    { qp_id: 'qp-2', subject_name: 'Database Management Systems', subject_code: 'CS403', exam_date: new Date(Date.now() + 86400000 * 9).toISOString().slice(0, 10), exam_type: 'END_TERM', setter_name: 'Prof. Kavita Joshi', status: 'UNDER_MODERATION', notes: 'Awaiting COE moderation', created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  eligibilityDashboard: (semester: number) => {
    const items = SEED.admitCardAudit().items.map((item) => ({
      student_user_id: item.student_user_id,
      name: item.name,
      enrollment_number: item.student_id,
      category: item.eligible ? 'ELIGIBLE' : item.fee_status === 'Pending' ? 'FEE_PENDING' : 'ATTENDANCE_SHORTAGE',
      fee_clear: item.fee_status === 'Clear',
      attendance_percent: item.attendance_percent,
      block_reasons: item.block_reasons,
    }));
    const summary = items.reduce(
      (acc, item) => {
        acc[item.category] = (acc[item.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return { semester, total: items.length, summary, items };
  },
  calendarEvents: () => [
    { event_id: '1', title: 'Mid Term — Operating Systems', event_type: 'EXAM', event_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), start_time: '09:00', venue: 'A101', semester: 4 },
    { event_id: '2', title: 'Hall Ticket Release — Sem 4', event_type: 'DEADLINE', event_date: new Date(Date.now() + 172800000).toISOString().slice(0, 10), start_time: null, venue: null, semester: 4 },
    { event_id: '3', title: 'End Term — DBMS', event_type: 'EXAM', event_date: new Date().toISOString().slice(0, 10), start_time: '14:00', venue: 'A102', semester: 4 },
  ],
  search: (q: string) => ({
    students: SEED.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.enrollment_number.includes(q)).slice(0, 5),
    schedules: SEED.schedules().filter((s) => s.subject_name.toLowerCase().includes(q.toLowerCase())).slice(0, 5),
    subjects: SEED.subjects.filter((s) => s.subject_name.toLowerCase().includes(q.toLowerCase()) || s.subject_code.includes(q)).slice(0, 5),
    hall_tickets: [] as unknown[],
    answer_sheets: [] as unknown[],
  }),
  seatingAllocations: () =>
    SEED.students.map((s, i) => ({
      student_user_id: s.user_id,
      student_name: s.name,
      room: i < 3 ? 'A101' : 'A102',
      seat_number: String((i % 3) + 1).padStart(2, '0'),
      branch_code: 'CSE',
      exam_type: 'END_TERM',
    })),
  postSuccess: { ok: true, dev_seed: true },
};

export type ExamCellDevFallbackMeta = {
  path: string;
  method: string;
  reason: string;
  at: string;
};
