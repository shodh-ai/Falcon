/** Client-side Falcon AI answers — process-focused, no navigation guidance. */

export type FacultyAiLiveClass = {
  timetable_id?: string;
  course_id?: string;
  course_code?: string;
  course_name?: string;
  room?: string | null;
  start_time?: string;
  end_time?: string;
  student_count?: number;
  section?: string | null;
};

export type FacultyAiLiveMeeting = {
  title?: string;
  meeting_at?: string;
  starts_at?: string;
  venue?: string | null;
};

export type FacultyAiLiveContext = {
  facultyName?: string;
  todayClasses?: FacultyAiLiveClass[];
  missingAttendance?: FacultyAiLiveClass[];
  meetingsToday?: FacultyAiLiveMeeting[];
};

export const FACULTY_AI_UNKNOWN_ANSWER =
  "I couldn't find enough information to answer that accurately. Please contact the relevant university administrator or refer to your institution's academic policy for clarification.";

/** True when the answer is an unhelpful/generic fallback (old or new). */
export function isFacultyAiGenericFallback(answer: string): boolean {
  return (
    /Ask a concrete portal question for exact results/i.test(answer) ||
    /couldn't find enough information to answer that accurately/i.test(answer)
  );
}

function formatSlot(c: FacultyAiLiveClass): string {
  const code = c.course_code ? `${c.course_code} ` : '';
  const name = c.course_name ?? 'Class';
  const when =
    c.start_time && c.end_time
      ? `${c.start_time}–${c.end_time}`
      : c.start_time || 'time to be confirmed';
  const room = c.room ? ` in ${c.room}` : '';
  const students =
    typeof c.student_count === 'number' ? ` (${c.student_count} students)` : '';
  const section = c.section ? `, Sec ${c.section}` : '';
  return `${when}: ${code}${name}${section}${room}${students}`;
}

function formatMeeting(m: FacultyAiLiveMeeting): string {
  const title = m.title ?? 'Meeting';
  const when = m.meeting_at || m.starts_at || '';
  const venue = m.venue ? ` at ${m.venue}` : '';
  return `${title}${when ? ` — ${when}` : ''}${venue}`;
}

function answerTodaysClasses(ctx?: FacultyAiLiveContext): string {
  const classes = ctx?.todayClasses ?? [];
  const first = ctx?.facultyName?.split(' ')[0];
  if (!classes.length) {
    return `There are no teaching slots on your timetable for today${first ? `, ${first}` : ''}. If you expected classes, your department may still need to complete course allocation or schedule adjustments.`;
  }
  return [
    'Here is your teaching schedule for today:',
    '',
    ...classes.map((c) => `• ${formatSlot(c)}`),
    '',
    'After each session ends, recording attendance keeps student percentages and eligibility data up to date.',
  ].join('\n');
}

function answerMissingAttendance(ctx?: FacultyAiLiveContext): string {
  const missing = ctx?.missingAttendance ?? [];
  if (!missing.length) {
    return 'You have no pending attendance for ended classes today. When the next session finishes, submit attendance promptly so student records stay accurate for eligibility and reporting.';
  }
  return [
    'These ended sessions still need attendance recorded:',
    '',
    ...missing.map((c) => `• ${formatSlot(c)}`),
    '',
    'Once submitted, each student’s attendance percentage updates automatically. Corrections after submission may require approval depending on university policy.',
  ].join('\n');
}

function answerMeetingsToday(ctx?: FacultyAiLiveContext): string {
  const meetings = ctx?.meetingsToday ?? [];
  if (!meetings.length) {
    return 'You have no meetings scheduled for today. Upcoming department or university meetings will appear on your calendar once they are scheduled.';
  }
  return [
    'Here are your meetings for today:',
    '',
    ...meetings.map((m) => `• ${formatMeeting(m)}`),
    '',
    'After the meeting, accurate minutes and action items become the reference for follow-up.',
  ].join('\n');
}

function answerEventApprovals(): string {
  return [
    'Event approval is how faculty coordinators review club or campus event proposals—purpose, schedule, venue, and resource needs.',
    '',
    'When you approve or reject a request with a clear remark, the proposal continues through the remaining institutional workflow as required. Timely decisions help organizers plan and keep event governance transparent. Broader items waiting on you may also appear among your pending approvals.',
  ].join('\n');
}

function answerInboxApprovals(): string {
  return 'Pending approvals are items waiting for your decision in the university workflow—such as academic corrections, departmental requests, or related faculty actions. Review the request details carefully, then approve or reject according to institutional rules. Acting inside the formal workflow keeps an audit trail; informal approvals outside the system are not a substitute.';
}

function answerWeeklyTest(): string {
  return 'Weekly tests are continuous assessment activities you configure for an enrolled course—typically with a title, attempt window, and maximum marks. After you publish a test, students can attempt it during the open window. When the window closes, results can be reviewed and incorporated into continuous assessment. Clear instructions and a well-defined window help students prepare and reduce disputes later.';
}

function answerMarkAttendance(): string {
  return 'Attendance allows you to record whether each student was Present, Absent, Late, or on Leave for a particular class session. Once attendance is submitted, the system updates each student\'s attendance percentage automatically. This information is later used for eligibility calculations, academic reports, and student performance monitoring. Before submitting, ensure all students are marked correctly because any changes after submission may require approval depending on university policy. If you taught on behalf of another faculty member, an approved proxy arrangement is usually required before you can submit that session.';
}

function answerGrading(): string {
  return 'Marks entry lets you record assessment scores—such as internal tests, practicals, quizzes, or end-term components—against the student roster for a course. After marks are uploaded, they become part of the student\'s academic record. Depending on university workflow, they may go through verification or approval before being finalized. Once approved or published, students can usually view their results, and the data feeds reports, grade calculations, and departmental performance analysis. Corrections after publication often require a formal grade-change approval so the audit trail remains intact.';
}

function answerCourses(): string {
  return 'Each allocated course has a course workspace where you can share lesson plans, lecture notes, handouts, and other study material with enrolled students. You can also create digital assignments with clear instructions and deadlines. Once materials or assignments are published, students can access them for that course, and submissions become available for evaluation. Keeping materials organized helps students stay aligned with the teaching plan for the semester.';
}

function answerAssignments(): string {
  return 'Assignments can be evaluated by reviewing each student\'s submission and awarding marks based on the assessment criteria. Along with marks, faculty can provide written feedback to help students improve. Once the evaluation is published, students can view their marks and comments. Assignment scores also contribute to the student\'s internal assessment and performance analytics.';
}

function answerInvigilation(): string {
  return 'Invigilation duty assignments come from the examination cell and specify when and where you are expected to supervise an exam session. Completing duty as assigned supports fair conduct of examinations. Re-evaluation or related post-exam academic work follows a separate formal process so student results remain consistent and auditable.';
}

function answerIqac(): string {
  return 'Accreditation and quality tasks ask faculty to provide evidence—documents, data, or confirmations—against institutional quality criteria. Completing assigned tasks before the due date helps the university maintain audit-ready records. Submit only accurate evidence; incomplete or late submissions can delay departmental quality reporting.';
}

function answerHrLeave(): string {
  return 'When a faculty member submits a leave request, it enters the university approval workflow. The request is reviewed by the appropriate authority, such as the Head of Department or HR, according to institutional policy. Once approved, the leave balance is updated automatically, and the leave is reflected in relevant institutional records. If the leave overlaps with scheduled classes, substitute arrangements may also be initiated.';
}

/**
 * Intent-matched answer, or null when we should fall through to the server / unknown reply.
 */
export function matchFacultyAiLocalAnswer(
  question: string,
  ctx?: FacultyAiLiveContext,
): string | null {
  const q = question.trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  if (
    !/\bminutes\b/.test(lower) &&
    !/mentor|mentee|mentorship/.test(lower) &&
    (/(today|todays?).{0,24}meetings?|meetings?.{0,24}(today|todays?)/.test(lower) ||
      /\b(my\s+)?meetings?\b/.test(lower))
  ) {
    return answerMeetingsToday(ctx);
  }

  if (/\bleave\b|leave\s+approv|how\s+does\s+leave|apply\s+leave|payslip|payroll|workforce|\bhr\b/.test(lower)) {
    return answerHrLeave();
  }

  if (
    (/\bevents?\b/.test(lower) && /approv/.test(lower)) ||
    /event\s*approv|approv\w*\s+events?|club\s+event/.test(lower)
  ) {
    return answerEventApprovals();
  }

  if (
    /pending\s+approv|approv\w*\s+pending|dofa|my\s+inbox|\binbox\b/.test(lower) ||
    (/\bapprov/.test(lower) && !/\bevents?\b/.test(lower) && !/\bleave\b/.test(lower))
  ) {
    return answerInboxApprovals();
  }

  if (
    /today.?s?\s+class|classes\s+today|what\s+classes|my\s+timetable|schedule\s+today|classes?\s+today/.test(
      lower,
    )
  ) {
    return answerTodaysClasses(ctx);
  }

  if (
    /missing\s+attendance|pending\s+attendance|attendance\s+pending|which\s+class.*(mark|attendance)/.test(
      lower,
    )
  ) {
    return answerMissingAttendance(ctx);
  }

  if (/how\s+are\s+assignments|assignment\s+evaluat|evaluate\s+assignment/.test(lower)) {
    return answerAssignments();
  }

  if (/weekly\s+test|create\s+(a\s+)?test|wt1|wt2/.test(lower)) {
    return answerWeeklyTest();
  }

  if (/mark\s+attendance|how\s+(do\s+i\s+)?mark|take\s+attendance|how\s+do\s+i\s+mark\s+attendance/.test(lower)) {
    return answerMarkAttendance();
  }

  if (
    /enter\s+marks|submit\s+grades|grade\s+entry|upload\s+marks|publish\s+marks|how\s+.*(grad|mark)|cat\s+marks|fat\s+marks|what\s+happens\s+after.*marks/.test(
      lower,
    )
  ) {
    return answerGrading();
  }

  if (/course\s+page|digital\s+assignment|\bda\b|upload\s+(material|handout|lesson)|study\s+material|lecture\s+notes/.test(lower)) {
    return answerCourses();
  }

  if (/invigilat|exam\s+duty/.test(lower)) {
    return answerInvigilation();
  }

  if (/\biqac\b|naac|accreditation|falcon\s+core/.test(lower)) {
    return answerIqac();
  }

  if (/mentor|mentorship|mentee|faculty\s+advisor/.test(lower)) {
    return 'As a faculty advisor or mentor, you support a set of mentees through academic progress, attendance concerns, and related guidance. Mentoring interactions and notes create a record that helps continuity across the semester. Certificate or related mentee requests may also require your review before they move forward. Effective mentoring combines timely follow-up with accurate use of attendance and performance data.';
  }

  if (/research|publication|abstract|grant/.test(lower) && !/lesson/.test(lower)) {
    if (/abstract/.test(lower)) {
      return [
        'Here is an IMRaD-style abstract draft you can refine:',
        '',
        'Background → Objective → Methods → Results → Conclusion (about 200–250 words).',
        '',
        `Seed: ${q.slice(0, 240)}`,
        '',
        'After finalizing, keep the publication record updated in your research profile for appraisal and accreditation evidence.',
      ].join('\n');
    }
    return 'Research and publication records help document your scholarly work—journal articles, conference papers, patents, and related outputs—for appraisal and accreditation evidence. Grant workflows for student or faculty projects typically require guide or departmental review before funds or approvals proceed. Keep entries accurate and complete so institutional reports and your academic profile stay consistent.';
  }

  if (/lesson\s*plan|tomorrow.?s?\s*class/.test(lower)) {
    return [
      'Here is a practical 50-minute lesson plan you can adapt:',
      '',
      'Warm-up (5 min): Prior knowledge check.',
      'Explain (15 min): Core concept and a worked example.',
      'Practice (15 min): Pair problem set.',
      'Check (10 min): Short exit ticket.',
      'Close (5 min): Summary and homework.',
      '',
      'Add your course, topic, and section for a tighter plan. Clear outcomes help students know what success looks like by the end of the session.',
    ].join('\n');
  }

  if (/mcq|quiz|multiple\s*choice/.test(lower)) {
    return [
      'Here is a draft quiz structure you can refine:',
      '',
      'Items 1–5: conceptual recall · 6–8: application · 9–10: analysis.',
      '',
      `Topic: ${q.slice(0, 200)}`,
      '',
      'When you publish a formal weekly assessment, students can attempt it in the open window and results can feed continuous assessment.',
    ].join('\n');
  }

  if (/why.*attendance|attendance.*important/.test(lower)) {
    return 'Attendance matters for academic compliance and eligibility, helps departments monitor student engagement, and feeds institutional reporting and performance analysis. Consistent recording also supports timely mentoring when a student falls below expected participation.';
  }

  if (/can\s+i\s+edit\s+attendance|edit\s+attendance\s+after|correct\s+attendance/.test(lower)) {
    return 'Yes, attendance can generally be corrected if a mistake is identified. However, depending on university policy, modifications after submission may require approval or may be recorded in the audit history to maintain transparency.';
  }

  if ((/attendance|75%|warning/.test(lower)) && !/mark|how\s+do/.test(lower)) {
    return [
      'Here is a professional attendance advisory you can adapt:',
      '',
      'Dear Student / Parent,',
      '',
      'Attendance in [Subject] is below the 75% minimum. Please attend remaining classes and meet the mentor within three working days.',
      '',
      'Regards,',
      ctx?.facultyName ?? '[Faculty Name]',
      '',
      'Verify the subject-wise percentage against official records before sending.',
    ].join('\n');
  }

  if (/^(hi|hello|hey|namaste)\b/.test(lower) || lower === 'help') {
    const first = ctx?.facultyName?.split(' ')[0];
    const classes = ctx?.todayClasses ?? [];
    const meetings = ctx?.meetingsToday ?? [];
    const todayHint = classes.length
      ? `You have ${classes.length} class${classes.length === 1 ? '' : 'es'} on your schedule today.`
      : meetings.length
        ? `You have ${meetings.length} meeting${meetings.length === 1 ? '' : 's'} today.`
        : 'Ask me about today’s classes, meetings, attendance, assessments, or leave.';
    return [
      `Hello${first ? `, ${first}` : ''}! I’m Falcon AI, your Faculty Portal assistant.`,
      '',
      todayHint,
      '',
      'I explain how academic processes work and what happens after you act—not how to click through menus. You can also ask me to draft lesson plans, quizzes, advisories, or minutes.',
    ].join('\n');
  }

  return null;
}

/**
 * Build a Faculty Portal answer in Falcon AI’s conversational style.
 */
export function buildFacultyAiLocalAnswer(
  question: string,
  ctx?: FacultyAiLiveContext,
): string {
  return matchFacultyAiLocalAnswer(question, ctx) ?? FACULTY_AI_UNKNOWN_ANSWER;
}
