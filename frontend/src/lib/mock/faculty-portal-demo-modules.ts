/**
 * Extra Faculty Portal smoke adapters for modules not covered by the core dashboard pack.
 */

import type { FacultyWorkspace } from '@/lib/api/lms';
import { getFacultySmokeDataset, studentsForCourse } from '@/lib/mock/faculty-smoke/dataset';

function pack() {
  return getFacultySmokeDataset();
}

function demoCourses() {
  return pack().courses.map((c) => ({
    allocation_id: c.allocation_id,
    course_id: c.course_id,
    course_code: c.course_code,
    course_name: c.course_name,
    credits: c.credits,
    program_name: c.program_name,
    semester: c.semester,
    academic_year: c.academic_year,
  }));
}

function demoTimetable() {
  return pack().timetable.map((t) => ({
    timetable_id: t.timetable_id,
    day_of_week: t.day_of_week,
    start_time: t.start_time,
    end_time: t.end_time,
    room: `${t.building} · ${t.room}`,
    course_code: t.course_code,
    course_name: t.course_name,
  }));
}

export function facultyDemoScheduleData() {
  const courses = demoCourses();
  const profile = pack().profile;
  const allocations = courses.map((c) => ({
    allocation_id: c.allocation_id ?? `alloc-${c.course_id}`,
    course_id: c.course_id,
    course_code: c.course_code,
    course_name: c.course_name,
    faculty_user_id: profile.user_id,
    faculty_name: profile.name,
  }));
  const timetables = demoTimetable().map((t, i) => {
    const course = courses[i % courses.length]!;
    return {
      timetable_id: t.timetable_id,
      course_id: course.course_id,
      faculty_user_id: profile.user_id,
      course_code: t.course_code,
      course_name: t.course_name,
      faculty_name: profile.name,
      day_of_week: t.day_of_week,
      start_time: t.start_time.endsWith(':00') && t.start_time.length === 8 ? t.start_time : `${t.start_time.slice(0, 5)}:00`,
      end_time: t.end_time.endsWith(':00') && t.end_time.length === 8 ? t.end_time : `${t.end_time.slice(0, 5)}:00`,
      room: t.room,
      section: pack().courses.find((c) => c.course_code === t.course_code)?.section ?? 'A',
    };
  });
  return { allocations, timetables, faculty: [] as Array<{ user_id: string; name: string }> };
}

export function facultyDemoCourseWorkspace(courseId: string): FacultyWorkspace {
  const course =
    pack().courses.find((c) => c.course_id === courseId) ??
    pack().courses[0]!;
  const docs = pack().documents.filter((d) => d.title.includes(course.course_code)).slice(0, 4);
  return {
    course: {
      course_id: course.course_id,
      course_code: course.course_code,
      course_name: course.course_name,
      credits: course.credits,
    },
    syllabus_configured: true,
    syllabus_materials: [
      {
        material_id: `syl-${course.course_id}`,
        title: `${course.course_code} Syllabus.pdf`,
        material_type: 'PDF',
        uploaded_at: course.academic_year ? `${course.academic_year}-07-20` : undefined,
      },
    ],
    modules: [1, 2, 3, 4].map((n) => ({
      module_id: `mod-${course.course_id}-${n}`,
      module_number: n,
      title: `Unit ${n} — ${course.course_name}`,
      description: `Outcome-based coverage for unit ${n}.`,
      status: n <= 2 ? 'ACTIVE' : 'DRAFT',
      materials: (docs[n - 1]
        ? [
            {
              material_id: docs[n - 1]!.document_id,
              title: docs[n - 1]!.file_name,
              material_type: 'PDF',
              uploaded_at: docs[n - 1]!.upload_date,
            },
          ]
        : [
            {
              material_id: `mat-${course.course_id}-${n}`,
              title: `Lecture notes unit ${n}.pdf`,
              material_type: 'PDF',
            },
          ]),
    })),
  };
}

export function facultyDemoAnnouncements(courseId: string) {
  const course = pack().courses.find((c) => c.course_id === courseId) ?? pack().courses[0]!;
  return pack().announcements.map((a, i) => ({
    announcement_id: `${a.id}-${course.course_id}`,
    title: `${a.title} (${course.course_code})`,
    body: a.body,
    created_at: a.created_at,
    course_id: course.course_id,
    pinned: i === 0,
  }));
}

export function facultyDemoProjects() {
  const students = pack().students.slice(30, 38);
  return [
    {
      guide_id: 'proj-1',
      project_title: 'Campus Edge Attendance Gateway',
      program: 'B.Tech CSE',
      status: 'ACTIVE',
      start_date: '2025-08-01',
      end_date: '2026-04-30',
      funding_allocated: 75000,
      funding_consumed: 22000,
      students: students.slice(0, 3).map((s) => ({
        student_user_id: s.user_id,
        name: s.name,
        official_email: s.email,
        department: s.department,
        grade: s.overall_grade,
      })),
      funding_requests: [
        {
          request_id: 'fr-1',
          amount: 15000,
          purpose: 'Raspberry Pi kits and sensors',
          status: 'PENDING_HOD' as const,
          created_at: new Date().toISOString(),
        },
      ],
    },
    {
      guide_id: 'proj-2',
      project_title: 'Indic Tutoring Chatbot for Lab Hours',
      program: 'B.Tech AI & DS',
      status: 'ACTIVE',
      start_date: '2025-09-01',
      end_date: '2026-05-15',
      funding_allocated: 50000,
      funding_consumed: 8000,
      students: students.slice(3, 6).map((s) => ({
        student_user_id: s.user_id,
        name: s.name,
        official_email: s.email,
        department: s.department,
        grade: s.overall_grade,
      })),
      funding_requests: [],
    },
    {
      guide_id: 'proj-3',
      project_title: 'NEP Outcome Dashboard (Completed)',
      program: 'MCA',
      status: 'COMPLETED',
      start_date: '2024-08-01',
      end_date: '2025-05-30',
      funding_allocated: 40000,
      funding_consumed: 38500,
      students: students.slice(6, 8).map((s) => ({
        student_user_id: s.user_id,
        name: s.name,
        official_email: s.email,
        department: s.department,
        grade: s.overall_grade,
      })),
      funding_requests: [
        {
          request_id: 'fr-2',
          amount: 5000,
          purpose: 'Conference poster printing',
          status: 'APPROVED_HOD' as const,
          created_at: '2025-03-10T10:00:00.000Z',
        },
      ],
    },
  ];
}

export function facultyDemoDirectoryStudents() {
  return {
    items: pack()
      .students.slice(0, 80)
      .map((s) => ({
        user_id: s.user_id,
        name: s.name,
        official_email: s.email,
        department_name: s.department,
        batch: `20${s.roll_number.slice(0, 2)}`,
      })),
  };
}

export function facultyDemoDisciplineOptions() {
  return {
    students: pack()
      .students.slice(0, 40)
      .map((s) => ({
        user_id: s.user_id,
        name: s.name,
        enrollment_number: s.roll_number,
      })),
    courses: demoCourses().map((c) => ({
      course_id: c.course_id,
      course_code: c.course_code,
      course_name: c.course_name,
    })),
  };
}

export function facultyDemoDisciplineHistory() {
  const students = pack().students.slice(10, 18);
  const courses = demoCourses();
  return students.map((s, i) => ({
    incident_id: `inc-demo-${i + 1}`,
    student_name: s.name,
    course_code: courses[i % courses.length]!.course_code,
    course_name: courses[i % courses.length]!.course_name,
    category: (['BEHAVIORAL', 'ACADEMIC', 'ATTENDANCE'] as const)[i % 3],
    points: [2, 3, 5][i % 3],
    description: 'Reported for classroom disruption / repeated late arrival.',
    status: i % 2 === 0 ? 'PENDING_DC_REVIEW' : 'CLOSED',
    evidence_urls: [],
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
  }));
}

export function facultyDemoSafetyNotices() {
  return [
    {
      concern_id: 'safe-1',
      concern_type: 'RAGGING',
      status: 'UNDER_REVIEW',
      accused_notified_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      resolution_summary: null,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      concern_id: 'safe-2',
      concern_type: 'SEXUAL_HARASSMENT',
      status: 'RESOLVED',
      accused_notified_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      resolution_summary: 'Committee closed after counselling and written undertaking.',
      created_at: new Date(Date.now() - 42 * 86400000).toISOString(),
    },
  ];
}

export function facultyDemoLibraryAccount() {
  return {
    active_loans: [
      {
        transaction_id: 'loan-1',
        title: 'Operating System Concepts',
        author: 'Silberschatz',
        due_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
        accession_number: 'ACC-88421',
      },
      {
        transaction_id: 'loan-2',
        title: 'Pattern Recognition and ML',
        author: 'Bishop',
        due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        accession_number: 'ACC-90112',
      },
    ],
    holds: [{ title: 'Deep Learning', status: 'READY', queue_position: 1 }],
    history: [
      {
        title: 'Computer Networks',
        returned_at: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
      },
    ],
    library_dues: [] as Array<{ fee_head: string; total_amount: string; status: string }>,
    patron_role: 'FACULTY',
    borrowing_privileges: {
      max_books: 8,
      max_days: 90,
      fine_per_day: 5,
      label: 'Faculty borrowing',
    },
  };
}

export function facultyDemoLibraryCatalog() {
  return [
    {
      catalog_id: 'cat-1',
      isbn: '9781118063330',
      title: 'Operating System Concepts',
      author: 'Abraham Silberschatz',
      category: 'Computer Science',
      cover_image_url: null,
      total_copies: 12,
      available_copies: 4,
    },
    {
      catalog_id: 'cat-2',
      isbn: '9780262035613',
      title: 'Deep Learning',
      author: 'Ian Goodfellow',
      category: 'AI & DS',
      cover_image_url: null,
      total_copies: 6,
      available_copies: 1,
    },
    {
      catalog_id: 'cat-3',
      isbn: '9780133594140',
      title: 'Computer Networks',
      author: 'Andrew S. Tanenbaum',
      category: 'Information Technology',
      cover_image_url: null,
      total_copies: 10,
      available_copies: 7,
    },
  ];
}

export function facultyDemoDigitalResources() {
  return [
    {
      resource_id: 'dig-1',
      title: 'IEEE Xplore (Campus)',
      resource_type: 'DATABASE',
      category: 'Research',
      external_url: 'https://ieeexplore.ieee.org',
    },
    {
      resource_id: 'dig-2',
      title: 'NPTEL Courseware Mirror',
      resource_type: 'COURSEWARE',
      category: 'Teaching',
      external_url: 'https://nptel.ac.in',
    },
  ];
}

export function facultyDemoReEvaluations() {
  const students = pack().students.slice(40, 48);
  const courses = demoCourses();
  return students.map((s, i) => ({
    exam_application_id: `reeval-${i + 1}`,
    student_name: s.name,
    subject_name: courses[i % courses.length]!.course_name,
    subject_code: courses[i % courses.length]!.course_code,
    status: (['ASSIGNED', 'UNDER_REVIEW', 'COMPLETED'] as const)[i % 3],
    original_marks: 35 + (i % 20),
    revised_marks: i % 3 === 2 ? 40 + (i % 15) : null,
    report_notes: i % 3 === 2 ? 'Marks revised after script recheck.' : null,
  }));
}

export function facultyDemoResearchApprovals() {
  return pack()
    .students.slice(50, 56)
    .map((s, i) => ({
      application_id: `rnd-${i + 1}`,
      config_id: 'cfg-seed',
      project_title: `${s.name.split(' ')[0]} — ${['IoT Lab Kit', 'NLP Corpus', 'Smart Irrigation'][i % 3]}`,
      student_name: s.name,
      documents: {},
      status: 'PENDING_GUIDE',
      budget_approved: false,
      submitted_at: new Date(Date.now() - i * 86400000).toISOString(),
    }));
}

export function facultyDemoPhdScholars() {
  return pack().profile.workload.phd_scholars.map((p, i) => ({
    candidate_id: p.scholar_id,
    candidate_name: p.scholar_name,
    applicant_name: p.scholar_name,
    proposed_topic:
      i === 0
        ? 'Federated Learning for Multi-Campus Grade Prediction'
        : 'Responsible AI Pedagogy for OBE Labs',
    dept_name: pack().profile.department,
    guide_name: pack().profile.name,
    lifecycle_status: i === 0 ? 'GUIDE_ACCEPTANCE_SUBMITTED' : 'COURSEWORK_IN_PROGRESS',
    lifecycle_stage: p.current_phase,
  }));
}

export function facultyDemoIqacTasks() {
  return [
    {
      assignment_id: 'iqac-1',
      status: 'PENDING',
      due_date: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
      task: {
        task_name: 'Criterion 3 — Research evidence upload',
        task_description: 'Upload Scopus-indexed publication proofs for AY.',
        month: 'Aug 2026',
      },
      submissions: [],
    },
    {
      assignment_id: 'iqac-2',
      status: 'SUBMITTED',
      due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      task: {
        task_name: 'Criterion 2 — Teaching innovations',
        task_description: 'Share innovative pedagogy notes and student feedback.',
        month: 'Jul 2026',
      },
      submissions: [
        {
          submission_id: 'sub-iqac-1',
          file_name: 'teaching-innovation.pdf',
          ai_status: 'VALIDATED' as const,
          ai_remarks: 'Matches task keywords.',
        },
      ],
    },
    {
      assignment_id: 'iqac-3',
      status: 'PENDING',
      due_date: new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10),
      task: {
        task_name: 'Criterion 5 — Mentorship logs',
        task_description: 'Upload mentorship interaction summaries.',
        month: 'Sep 2026',
      },
      submissions: [],
    },
  ];
}

export function facultyDemoEventApprovals() {
  return [
    {
      event_id: 'evt-1',
      title: 'Hackathon: Build for Campus',
      club_name: 'CSE Coding Club',
      venue: 'Seminar Hall 2',
      event_date: new Date(Date.now() + 14 * 86400000).toISOString(),
      total_slots: 120,
      description: '24-hour campus problem hackathon.',
      guest_speakers: 'Industry mentors from TCS',
      is_paid: false,
      ticket_price: 0,
      funds_needed: 25000,
    },
    {
      event_id: 'evt-2',
      title: 'Research Paper Writing Workshop',
      club_name: 'IEEE Student Branch',
      venue: 'Tech Tower Lab 3',
      event_date: new Date(Date.now() + 21 * 86400000).toISOString(),
      total_slots: 60,
      description: 'Hands-on workshop on Scopus-ready writing.',
      guest_speakers: null,
      is_paid: true,
      ticket_price: 100,
      funds_needed: 8000,
    },
  ];
}

export function facultyDemoPlacementDrives() {
  return [
    {
      drive_id: 'drive-1',
      company_name: 'Infosys',
      job_role: 'Systems Engineer',
      drive_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      drive_time: '10:00',
      semester: 7,
      form_url: 'https://forms.gle/demo-infosys',
      form_type: 'GOOGLE',
      status: 'UPCOMING',
      description: 'Campus drive for 2026 batch.',
      response_count: 42,
    },
    {
      drive_id: 'drive-2',
      company_name: 'TCS Digital',
      job_role: 'Digital Cadre',
      drive_date: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
      drive_time: '11:30',
      semester: 7,
      form_url: 'https://forms.gle/demo-tcs',
      form_type: 'GOOGLE',
      status: 'UPCOMING',
      description: null,
      response_count: 28,
    },
  ];
}

export function facultyDemoAtRiskStudents() {
  return pack()
    .atRisk.slice(0, 24)
    .map((s, i) => {
      const full = pack().students.find((x) => x.user_id === s.user_id);
      return {
        user_id: s.user_id,
        name: s.name,
        email: full?.email ?? `${s.name.toLowerCase().replace(/\s+/g, '.')}@student.sgvu.edu.in`,
        enrollment_no: full?.roll_number ?? `25CS${String(100 + i)}`,
        department: full?.department ?? 'Computer Science',
        batch: full ? `20${full.roll_number.slice(0, 2)}` : '2023',
        risk_score: s.risk_level === 'HIGH' ? 88 : s.risk_level === 'MEDIUM' ? 67 : 45,
        risk_level: s.risk_level,
        risk_factors:
          s.metrics.attendance_percent != null && s.metrics.attendance_percent < 75
            ? ['Attendance <75%', 'Low internal average']
            : ['Low internal average'],
        metrics: s.metrics,
      };
    });
}

export function facultyDemoLogbook() {
  const slots = pack().timetable.slice(0, 12);
  return slots.map((t, i) => ({
    logbook_id: `lb-${i + 1}`,
    class_date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
    topic_summary: `Covered ${t.course_name} — lecture ${i + 1} outcomes and worked examples.`,
    course_code: t.course_code,
    course_name: t.course_name,
  }));
}

export function facultyDemoGradeChanges() {
  const students = pack().students.slice(0, 8);
  const courses = demoCourses();
  return students.map((s, i) => ({
    change_id: `gc-${i + 1}`,
    course_code: courses[i % courses.length]!.course_code,
    from_grade: ['C', 'B', 'D', 'B+'][i % 4],
    to_grade: ['B', 'B+', 'C', 'A'][i % 4],
    status: (['PENDING_DOFA', 'AWAITING_COE', 'APPLIED', 'REJECTED'] as const)[i % 4],
    dofa_awaiting_role: i % 4 === 0 ? 'HOD' : null,
    student_name: s.name,
    student_user_id: s.user_id,
    reason: 'Post-final correction after recheck / totaling error.',
  }));
}

export function facultyDemoDofaInbox() {
  return {
    cases: [
      {
        case_id: 'dofa-1',
        domain: 'SIS',
        title: 'Grade change CSE401 — Riya Sharma',
        awaiting_role: 'FACULTY',
        awaiting_step: 1,
      },
      {
        case_id: 'dofa-2',
        domain: 'ACADEMICS',
        title: 'Course outline amendment AID401',
        awaiting_role: 'HOD',
        awaiting_step: 2,
      },
    ],
    p2p_projections: [
      {
        source_id: 'pr-1',
        title: 'Lab equipment indent',
        amount: 25000,
        status: 'PENDING',
      },
    ],
  };
}

export function facultyDemoTeamRequests() {
  return [
    {
      id: 'tr-1',
      leave_id: 'tr-1',
      request_type: 'LEAVE',
      leave_type: 'CL',
      applied_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      raised_on: new Date(Date.now() - 86400000).toISOString(),
      start_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      regularization_date: null,
      reason: 'Personal work at hometown',
      status: 'PENDING',
      employee: {
        user_id: 'ta-demo-1',
        name: 'Aman Verma',
        email: 'aman.verma@sgvu.edu.in',
        employee_id: 'FAC-CSE-2211',
      },
    },
    {
      id: 'tr-2',
      leave_id: 'tr-2',
      request_type: 'ON_DUTY',
      leave_type: 'DL',
      applied_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      raised_on: new Date(Date.now() - 2 * 86400000).toISOString(),
      start_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      regularization_date: null,
      reason: 'University duty — affiliated campus visit',
      status: 'PENDING',
      employee: {
        user_id: 'ta-demo-2',
        name: 'Sneha Patel',
        email: 'sneha.patel@sgvu.edu.in',
        employee_id: 'FAC-CSE-2188',
      },
    },
  ];
}

export function facultyDemoHelpdeskTickets() {
  return [
    {
      ticket_id: 'TKT-DEMO-1042',
      ticket_ref: 'HD-1042',
      category: 'IT',
      status: 'IN_PROGRESS',
      subject: 'VPN access for research download',
    },
    {
      ticket_id: 'TKT-DEMO-1055',
      ticket_ref: 'HD-1055',
      category: 'FACILITIES',
      status: 'OPEN',
      subject: 'AC not cooling in CSE-214',
    },
    {
      ticket_id: 'TKT-DEMO-0991',
      ticket_ref: 'HD-0991',
      category: 'HR',
      status: 'RESOLVED',
      subject: 'Form 16 download link broken',
    },
  ];
}

/** Detail payload for smoke ticket links (matches list IDs above). */
export function facultyDemoHelpdeskTicketDetail(ticketId: string) {
  const row = facultyDemoHelpdeskTickets().find((t) => t.ticket_id === ticketId);
  if (!row) return null;
  return {
    ticket_id: row.ticket_id,
    ticket_ref: row.ticket_ref,
    category: row.category,
    subject: row.subject,
    description:
      'Demo helpdesk ticket for Faculty Portal smoke testing. Reply locally when the live helpdesk API is unavailable.',
    status: row.status,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    resolved_at: row.status === 'RESOLVED' ? new Date(Date.now() - 86400000).toISOString() : null,
    rejection_reason: null,
    assigned_to_name: 'IT Helpdesk',
    conversation: [
      {
        sender_user_id: 'faculty-demo',
        sender_role: 'FACULTY',
        message: row.subject,
        sent_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        sender_user_id: 'helpdesk-demo',
        sender_role: 'AGENT',
        message: 'We have received your request and are checking with the concerned team.',
        sent_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ],
  };
}

export function facultyDemoPayslips() {
  const now = new Date();
  return [0, 1, 2, 3, 4, 5].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return {
      payslip_id: `pay-${year}-${month}`,
      month,
      year,
      net_pay: 82000 + offset * 350,
      gross_pay: 110000 + offset * 400,
      period_key: `${year}-${month}`,
    };
  });
}

export function facultyDemoReportStudents(courseId: string) {
  return studentsForCourse(courseId).map((s) => ({
    name: s.name,
    roll_number: s.roll_number,
    attendance_percent: s.attendance_percent,
  }));
}
