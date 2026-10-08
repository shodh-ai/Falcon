export type FacultyKnowledgeArticle = {
  id: string;
  keywords: string[];
  answer: string;
  /** Internal reference only — never surface paths in faculty-facing answers. */
  href?: string;
};

/** Curated Faculty Portal FAQ — conversational process explanations for grounding. */
export const FACULTY_PORTAL_KNOWLEDGE: FacultyKnowledgeArticle[] = [
  {
    id: 'attendance',
    keywords: [
      'attendance',
      'mark attendance',
      'present',
      'absent',
      'missing attendance',
      'proxy',
      '75',
    ],
    href: '/faculty/attendance',
    answer:
      "Attendance allows you to record whether each student was Present, Absent, Late, or on Leave for a particular class session. Once attendance is submitted, the system updates each student's attendance percentage automatically. This information is later used for eligibility calculations, academic reports, and student performance monitoring. Before submitting, ensure all students are marked correctly because any changes after submission may require approval depending on university policy. If you taught on behalf of another faculty member, an approved proxy arrangement is usually required before you can submit that session.",
  },
  {
    id: 'timetable',
    keywords: [
      'timetable',
      'schedule',
      'today',
      'class',
      'classes',
      'lecture',
      'room',
      'extra class',
    ],
    href: '/faculty/timetable',
    answer:
      'Your timetable reflects the teaching slots allocated to you for the term, including course, section, time, and room where available. Extra or adjusted classes typically go through a departmental approval workflow before they become part of the official schedule. After a scheduled session ends, attendance for that slot can be recorded so student percentages stay current. Ask what classes you have today if you need your live roster for the day.',
  },
  {
    id: 'courses',
    keywords: [
      'course',
      'courses',
      'course page',
      'handout',
      'lesson plan',
      'material',
      'digital assignment',
      'da',
      'study material',
      'lecture notes',
    ],
    href: '/faculty/courses',
    answer:
      'Each allocated course has a course workspace where you can share lesson plans, lecture notes, handouts, and other study material with enrolled students. You can also create digital assignments with clear instructions and deadlines. Once materials or assignments are published, students can access them for that course, and submissions become available for evaluation. Keeping materials organized helps students stay aligned with the teaching plan for the semester.',
  },
  {
    id: 'grading',
    keywords: [
      'grade',
      'grades',
      'grading',
      'marks',
      'cat',
      'fat',
      'exam',
      'marks entry',
      'grade change',
      'internal marks',
      'practical marks',
      'quiz marks',
      'result',
    ],
    href: '/faculty/grading',
    answer:
      "Marks entry lets you record assessment scores—such as internal tests, practicals, quizzes, or end-term components—against the student roster for a course. After marks are uploaded, they become part of the student's academic record. Depending on university workflow, they may go through verification or approval before being finalized. Once approved or published, students can usually view their results, and the data feeds reports, grade calculations, and departmental performance analysis. Corrections after publication often require a formal grade-change approval so the audit trail remains intact.",
  },
  {
    id: 'assignments',
    keywords: [
      'assignment',
      'assignments',
      'evaluate',
      'evaluation',
      'submission',
      'feedback',
    ],
    href: '/faculty/courses',
    answer:
      "Assignments can be evaluated by reviewing each student's submission and awarding marks based on the assessment criteria. Along with marks, faculty can provide written feedback to help students improve. Once the evaluation is published, students can view their marks and comments. Assignment scores also contribute to the student's internal assessment and performance analytics.",
  },
  {
    id: 'weekly_tests',
    keywords: [
      'weekly test',
      'weekly tests',
      'wt1',
      'wt2',
      'create test',
      'quiz',
    ],
    href: '/faculty/weekly-tests',
    answer:
      'Weekly tests are continuous assessment activities you configure for an enrolled course—typically with a title, attempt window, and maximum marks. After you publish a test, students can attempt it during the open window. When the window closes, results can be reviewed and incorporated into continuous assessment. Clear instructions and a well-defined window help students prepare and reduce disputes later.',
  },
  {
    id: 'analytics',
    keywords: [
      'analytics',
      'at risk',
      'at-risk',
      'slow learner',
      'defaulter',
      'weak student',
      'performance',
      'student performance',
      'course progress',
    ],
    href: '/faculty/analytics',
    answer:
      'Performance analytics bring together attendance, assessment, and related academic signals so you can see which students may need early support. At-risk or defaulter indicators help you prioritize mentoring and academic counseling before problems compound. Use these insights to plan interventions; always verify figures against the official records before communicating with students or parents.',
  },
  {
    id: 'mentorship',
    keywords: [
      'mentor',
      'mentorship',
      'mentee',
      'proctor',
      'counsel',
      'faculty advisor',
      'advising',
    ],
    href: '/faculty/mentorship',
    answer:
      'As a faculty advisor or mentor, you support a set of mentees through academic progress, attendance concerns, and related guidance. Mentoring interactions and notes create a record that helps continuity across the semester. Certificate or related mentee requests may also require your review before they move forward. Effective mentoring combines timely follow-up with accurate use of attendance and performance data.',
  },
  {
    id: 'research',
    keywords: [
      'research',
      'publication',
      'scopus',
      'patent',
      'grant',
      'abstract',
      'research project',
    ],
    href: '/faculty/research',
    answer:
      'Research and publication records help document your scholarly work—journal articles, conference papers, patents, and related outputs—for appraisal and accreditation evidence. Grant workflows for student or faculty projects typically require guide or departmental review before funds or approvals proceed. Keep entries accurate and complete so institutional reports and your academic profile stay consistent.',
  },
  {
    id: 'phd',
    keywords: ['phd', 'ph.d', 'scholar', 'scholars', 'thesis', 'guide'],
    href: '/faculty/phd/scholars',
    answer:
      'Doctoral guidance tracks the scholars under your supervision, including progress reviews, thesis milestones, and related academic checkpoints. Recording reviews on time helps scholars stay aligned with program expectations and gives the department a clear view of research progress.',
  },
  {
    id: 'invigilation',
    keywords: [
      'invigilation',
      'exam duty',
      'supervisor',
      'duty',
      'examinations',
    ],
    href: '/faculty/invigilation',
    answer:
      'Invigilation duty assignments come from the examination cell and specify when and where you are expected to supervise an exam session. Completing duty as assigned supports fair conduct of examinations. Re-evaluation or related post-exam academic work follows a separate formal process so student results remain consistent and auditable.',
  },
  {
    id: 'iqac',
    keywords: ['iqac', 'naac', 'evidence', 'falcon core', 'accreditation'],
    href: '/faculty/iqac',
    answer:
      'Accreditation and quality tasks ask faculty to provide evidence—documents, data, or confirmations—against institutional quality criteria. Completing assigned tasks before the due date helps the university maintain audit-ready records. Submit only accurate evidence; incomplete or late submissions can delay departmental quality reporting.',
  },
  {
    id: 'inbox',
    keywords: ['approval', 'approvals', 'inbox', 'pending', 'dofa'],
    href: '/faculty/inbox',
    answer:
      'Pending approvals are items waiting for your decision in the university workflow—such as academic corrections, departmental requests, or related faculty actions. Review the request details carefully, then approve or reject according to institutional rules. Acting inside the formal workflow keeps an audit trail; informal approvals outside the system are not a substitute.',
  },
  {
    id: 'meetings',
    keywords: [
      'meeting',
      'meetings',
      'minutes',
      'agenda',
      'hod meeting',
      'department activities',
    ],
    href: '/faculty/meetings',
    answer:
      'Meetings help coordinate department and university activities through scheduled sessions with agendas, participation, and minutes. After a meeting, recorded decisions and action items become the institutional reference for follow-up. Keeping minutes accurate ensures accountability for owners and due dates.',
  },
  {
    id: 'events',
    keywords: [
      'event',
      'events',
      'event approval',
      'event approvals',
      'club event',
      'approve event',
    ],
    href: '/faculty/event-approvals',
    answer:
      'Event approvals let faculty coordinators review club or campus event proposals—typically including purpose, schedule, venue, and resource needs. When you approve or reject a request with a clear remark, the proposal continues through the remaining institutional workflow as required. Timely decisions help organizers plan and keep event governance transparent.',
  },
  {
    id: 'library',
    keywords: ['library', 'opac', 'book', 'hold', 'borrow', 'documents'],
    href: '/faculty/library',
    answer:
      'The faculty library catalog supports searching academic resources and placing holds according to faculty borrowing rules. Loan periods and quotas for faculty are typically more flexible than student rules, subject to library policy. Return or renew items on time so resources remain available to colleagues and students.',
  },
  {
    id: 'safety',
    keywords: ['safety', 'ragging', 'harassment', 'discipline', 'incident'],
    href: '/faculty/safety-notices',
    answer:
      'Safety notices and discipline reports are formal channels for escalating concerns such as misconduct, ragging, or harassment. Use official workflows rather than informal messages so cases are documented and routed to the appropriate authority. Accurate reporting protects students and upholds university standards.',
  },
  {
    id: 'hr',
    keywords: [
      'leave',
      'payslip',
      'payroll',
      'hr',
      'workforce',
      'ticket',
      'leave management',
      'profile',
      'faculty profile',
    ],
    href: '/faculty/me/workforce',
    answer:
      'When a faculty member submits a leave request, it enters the university approval workflow. The request is reviewed by the appropriate authority, such as the Head of Department or HR, according to institutional policy. Once approved, the leave balance is updated automatically, and the leave is reflected in relevant institutional records. If the leave overlaps with scheduled classes, substitute arrangements may also be initiated. Personal profile and workforce details should be kept current; do not rely on unofficial figures for salary or balances.',
  },
  {
    id: 'notifications',
    keywords: [
      'notification',
      'notifications',
      'message',
      'messages',
      'announcement',
      'announcements',
      'academic calendar',
    ],
    href: '/faculty/dashboard',
    answer:
      'Notifications, messages, and announcements keep you informed about academic deadlines, departmental updates, and workflow actions that need attention. The academic calendar provides the institutional timeline for teaching, examinations, and related events. Reviewing these updates regularly helps you respond on time and avoid missing approval or teaching obligations.',
  },
  {
    id: 'dashboard',
    keywords: [
      'dashboard',
      'workload',
      'teaching load',
      'activity log',
      'reports',
    ],
    href: '/faculty/dashboard',
    answer:
      'The faculty workspace summary highlights what needs attention—such as upcoming classes, pending attendance, approvals, or alerts—so you can prioritize the day. Teaching load and related reports reflect your allocated academic responsibilities for the term. Use these signals to plan teaching, mentoring, and administrative work without inventing figures that are not shown in your official records.',
  },
  {
    id: 'ai_assistant',
    keywords: ['ai', 'assistant', 'falcon ai', 'help'],
    href: '/faculty/ai',
    answer:
      'I am Falcon AI, your Faculty Portal assistant. I can explain how academic processes work—attendance, assessments, mentoring, leave, meetings, and related workflows—and I can help draft teaching or administrative documents when you ask. I focus on process and outcomes rather than clicking through menus. If a question needs institution-specific policy detail I do not have, I will tell you clearly rather than guess.',
  },
];

export function matchFacultyKnowledge(
  question: string,
): { article: FacultyKnowledgeArticle; score: number } | null {
  const q = question.toLowerCase();
  const tokens = q.split(/[^a-z0-9+/]+/).filter((t) => t.length > 2);
  let best: { article: FacultyKnowledgeArticle; score: number } | null = null;

  for (const article of FACULTY_PORTAL_KNOWLEDGE) {
    let score = 0;
    for (const kw of article.keywords) {
      if (q.includes(kw)) score += kw.length >= 8 ? 4 : kw.length >= 5 ? 3 : 2;
      else if (tokens.some((t) => kw.includes(t) || t.includes(kw))) score += 1;
    }
    if (!best || score > best.score) best = { article, score };
  }

  const phraseBoosts: Array<{ re: RegExp; id: string; pts: number }> = [
    {
      re: /mark\s+attendance|missing\s+attendance|how\s+to\s+mark/,
      id: 'attendance',
      pts: 5,
    },
    {
      re: /today.?s?\s+class|what\s+classes|my\s+timetable/,
      id: 'timetable',
      pts: 5,
    },
    {
      re: /enter\s+marks|submit\s+grades|grade\s+entry|upload\s+marks|publish\s+marks/,
      id: 'grading',
      pts: 4,
    },
    {
      re: /how\s+are\s+assignments|assignment\s+evaluat|evaluate\s+assignment/,
      id: 'assignments',
      pts: 5,
    },
    { re: /weekly\s+test|create\s+(a\s+)?test/, id: 'weekly_tests', pts: 4 },
    {
      re: /my\s+mentees|mentorship|faculty\s+advisor/,
      id: 'mentorship',
      pts: 4,
    },
    { re: /pending\s+approval|dofa/, id: 'inbox', pts: 4 },
    { re: /leave\s+approv|how\s+does\s+leave|apply\s+leave/, id: 'hr', pts: 5 },
    {
      re: /(today|todays?).{0,24}meetings?|meetings?.{0,24}(today|todays?)|\bmeetings?\b/,
      id: 'meetings',
      pts: 4,
    },
    {
      re: /event\s*approv|approv\w*\s+events?|club\s+event|\bevents?\b.*approv|approv.*\bevents?\b/,
      id: 'events',
      pts: 5,
    },
  ];
  for (const boost of phraseBoosts) {
    if (!boost.re.test(q)) continue;
    const article = FACULTY_PORTAL_KNOWLEDGE.find((a) => a.id === boost.id);
    if (!article) continue;
    const score = (best?.article.id === boost.id ? best.score : 0) + boost.pts;
    if (!best || score >= best.score) best = { article, score };
  }

  if (!best || best.score < 2) return null;
  return best;
}

export function facultyKnowledgeContextBlock(): string {
  return FACULTY_PORTAL_KNOWLEDGE.map((a) => `- [${a.id}] ${a.answer}`).join(
    '\n',
  );
}
