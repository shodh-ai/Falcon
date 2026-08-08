export type CampusKnowledgeArticle = {
  id: string;
  keywords: string[];
  answer: string;
  href?: string;
};

/** Curated campus FAQ used when Gemini is unavailable or as grounding context. */
export const STUDENT_CAMPUS_KNOWLEDGE: CampusKnowledgeArticle[] = [
  {
    id: 'attendance',
    keywords: [
      'attendance',
      'present',
      'absent',
      '75',
      'shortage',
      'eligibility',
      'percent',
      'percentage',
    ],
    href: '/student/attendance',
    answer:
      'Minimum attendance is 75% for each subject (university ordinance). Open Attendance & Progression to see subject-wise %. If you are below 75%, prioritize upcoming lectures — shortage can block exam eligibility. Medical exemptions need documents via the proper petition / HOD route.',
  },
  {
    id: 'fees',
    keywords: [
      'fee',
      'fees',
      'payment',
      'pay',
      'dues',
      'razorpay',
      'ledger',
      'tuition',
      'demand',
      'receipt',
    ],
    href: '/student/finance',
    answer:
      'Ask “How much fee do I owe?” for your pending amount, or open My Financial Ledger to pay online and download receipts. Unpaid dues can block registration, exams, or graduation clearance.',
  },
  {
    id: 'exams',
    keywords: [
      'exam',
      'admit',
      'hall ticket',
      'seating',
      'reval',
      'revaluation',
      'ufm',
      'semester exam',
      'midterm',
    ],
    href: '/student/exams',
    answer:
      'Use Exam Desk for admit cards, seating plans, UFM notices, and revaluation applications. Ensure fees and attendance eligibility are clear before the exam window. For result disputes, raise a Helpdesk ticket after checking Marks & Grade Cards.',
  },
  {
    id: 'grades',
    keywords: [
      'sgpa',
      'cgpa',
      'grade',
      'grades',
      'marks',
      'gpa',
      'backlog',
      'atkt',
      'fail',
      'pass',
    ],
    href: '/student/marks',
    answer:
      'SGPA is your Semester Grade Point Average (one semester). CGPA is Cumulative Grade Point Average across completed semesters. Ask “What is my CGPA?” for your live values, or open Marks & Grade Cards for the full grade sheet, credits, and backlog/ATKT status.',
  },
  {
    id: 'timetable',
    keywords: [
      'timetable',
      'schedule',
      'class',
      'lecture',
      'today',
      'room',
      'online class',
      'join link',
    ],
    href: '/student/timetable',
    answer:
      'Open Weekly Timetable for your registered classes. The Dashboard Up Next card shows the next lecture today (time, room, faculty). If the room is Online, use the Join Link when available.',
  },
  {
    id: 'registration',
    keywords: [
      'register',
      'registration',
      'cbcs',
      'elective',
      'electives',
      'credit',
      'credits',
      'subject',
      'course registration',
    ],
    href: '/student/registration',
    answer:
      'Use Subjects & Registration (CBCS) to choose electives and confirm credit load within the registration window. Incomplete registration can block timetable and attendance mapping. If a subject is full or locked, contact your HOD/Registrar via Helpdesk.',
  },
  {
    id: 'courses',
    keywords: [
      'assignment',
      'submit',
      'submission',
      'da',
      'digital assignment',
      'material',
      'materials',
      'lms',
      'course page',
      'deadline',
    ],
    href: '/student/courses',
    answer:
      'Open Course Page & DA for lesson plans, materials, and digital assignment submissions. Submit before the deadline shown on the course page. Late submissions follow faculty/course policy.',
  },
  {
    id: 'placements',
    keywords: [
      'placement',
      'placements',
      'internship',
      'job',
      'drive',
      'company',
      'resume',
      'offer',
    ],
    href: '/student/placements',
    answer:
      'Open Placements & Internships for campus and department drives. Check eligibility (CGPA/backlogs), register before the deadline, and keep your resume updated. Offers and interview updates appear in notifications.',
  },
  {
    id: 'library',
    keywords: ['library', 'book', 'books', 'fine', 'renew', 'borrow', 'opac'],
    href: '/student/library',
    answer:
      'Library & Dues shows borrowed books, renewals, and fines. Clear library dues before TC / no-dues / graduation. Search and reserve titles from the library OPAC when available.',
  },
  {
    id: 'hostel',
    keywords: [
      'hostel',
      'mess',
      'gate pass',
      'warden',
      'room',
      'campus life',
      'leave',
    ],
    href: '/student/campus-life',
    answer:
      'Use Campus Life for hostel/mess information and gate-pass requests. Approvals show under Alerts & Notifications. Follow warden rules for night-outs and leave.',
  },
  {
    id: 'transport',
    keywords: ['transport', 'bus', 'route', 'pickup', 'drop'],
    href: '/student/transport',
    answer:
      'Open Transport Hub for bus routes, pickup points, and allocation status. Report route issues via Helpdesk with your route number.',
  },
  {
    id: 'helpdesk',
    keywords: [
      'helpdesk',
      'grievance',
      'ticket',
      'complaint',
      'support',
      'issue',
      'problem',
    ],
    href: '/student/helpdesk',
    answer:
      'Raise a ticket under Grievances & Helpdesk for portal, academic, or service issues. Include screenshots and your enrollment number. Track status on the same page.',
  },
  {
    id: 'safety',
    keywords: [
      'ragging',
      'harassment',
      'posh',
      'safety',
      'bullying',
      'sexual',
    ],
    href: '/student/safety-concerns',
    answer:
      'For ragging, POSH, or safety concerns, use Safety Concerns (not the general helpdesk). Reports escalate to the designated committee. You can also contact campus security / anti-ragging helpline listed in University Policies.',
  },
  {
    id: 'profile',
    keywords: [
      'profile',
      'aadhaar',
      'photo',
      'mobile',
      'email',
      'correction',
      'abc id',
      'enrollment',
    ],
    href: '/student/profile',
    answer:
      'Update photo and viewable details under My Profile & Master Data. For name/DOB/enrollment corrections, submit a profile correction request — Registrar reviews locked fields.',
  },
  {
    id: 'documents',
    keywords: [
      'document',
      'documents',
      'vault',
      'migration',
      'tc',
      'certificate',
      'bonafide',
    ],
    href: '/student/admission-vault',
    answer:
      'Admission & Document Vault stores counseling/entrance/migration documents. Certificate requests (TC, migration, bonafide) go through Registrar workflows after eligibility checks.',
  },
  {
    id: 'graduation',
    keywords: [
      'graduation',
      'convocation',
      'degree',
      'alumni',
      'no dues',
      'exit',
    ],
    href: '/student/exit',
    answer:
      'Graduation & Alumni covers no-dues, degree eligibility, convocation, and alumni registration. Clear finance, library, and hostel dues first. Degree issue follows Exam Cell eligibility + Registrar approval.',
  },
  {
    id: 'policies',
    keywords: ['policy', 'policies', 'rules', 'ordinance', 'code of conduct'],
    href: '/student/policies',
    answer:
      'University Policies lists mandatory acknowledgements and rules. Some policies require a YES/NO acknowledgement before portal access continues.',
  },
];

export function matchCampusKnowledge(
  question: string,
): { article: CampusKnowledgeArticle; score: number } | null {
  const q = question.toLowerCase();
  const tokens = q.split(/[^a-z0-9+]+/).filter((t) => t.length > 2);
  let best: { article: CampusKnowledgeArticle; score: number } | null = null;

  for (const article of STUDENT_CAMPUS_KNOWLEDGE) {
    let score = 0;
    for (const kw of article.keywords) {
      if (q.includes(kw)) score += kw.length >= 6 ? 3 : 2;
      else if (tokens.some((t) => kw.includes(t) || t.includes(kw))) score += 1;
    }
    if (!best || score > best.score) best = { article, score };
  }

  // Soft phrase boosts for common natural-language questions
  const phraseBoosts: Array<{ re: RegExp; id: string; pts: number }> = [
    { re: /minimum\s+attendance|attendance\s+required|how\s+much\s+attendance/, id: 'attendance', pts: 4 },
    { re: /sgpa|cgpa|grade\s*point|difference\s+between\s+s/, id: 'grades', pts: 4 },
    { re: /pay\s+(my\s+)?fee|fee\s+payment|how\s+to\s+pay/, id: 'fees', pts: 4 },
    { re: /admit\s*card|hall\s*ticket/, id: 'exams', pts: 4 },
    { re: /register\s+for|cbcs|elective/, id: 'registration', pts: 3 },
    { re: /raise\s+a?\s*ticket|help\s*desk|complaint/, id: 'helpdesk', pts: 3 },
  ];
  for (const boost of phraseBoosts) {
    if (!boost.re.test(q)) continue;
    const article = STUDENT_CAMPUS_KNOWLEDGE.find((a) => a.id === boost.id);
    if (!article) continue;
    const score = (best?.article.id === boost.id ? best.score : 0) + boost.pts;
    if (!best || score >= best.score) best = { article, score };
  }

  if (!best || best.score < 2) return null;
  return best;
}

export function knowledgeContextBlock(): string {
  return STUDENT_CAMPUS_KNOWLEDGE.map(
    (a) => `- [${a.id}] ${a.answer}${a.href ? ` (page: ${a.href})` : ''}`,
  ).join('\n');
}
