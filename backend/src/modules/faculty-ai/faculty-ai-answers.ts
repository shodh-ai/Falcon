import { matchFacultyKnowledge } from './faculty-ai-knowledge';

export type FacultyAiOfflineContext = {
  snapshot_text?: string;
  faculty_name?: string;
  department?: string | null;
  today_classes?: Array<Record<string, unknown>>;
  pending_attendance?: Array<Record<string, unknown>>;
  meetings_today?: Array<Record<string, unknown>>;
  courses?: Array<{ code?: string; name?: string }>;
  mentee_count?: number;
};

export const FACULTY_AI_UNKNOWN_ANSWER =
  "I couldn't find enough information to answer that accurately. Please contact the relevant university administrator or refer to your institution's academic policy for clarification.";

function formatClassRow(row: Record<string, unknown>): string {
  const code = String(row.course_code ?? row.subject_code ?? '');
  const name = String(row.course_name ?? row.subject_name ?? 'Class');
  const start = String(row.start_time ?? '');
  const end = String(row.end_time ?? '');
  const room = row.room ? ` in ${row.room}` : '';
  const when =
    start && end ? `${start}–${end}` : start || 'time to be confirmed';
  return `${when}: ${code ? `${code} ` : ''}${name}${room}`.trim();
}

function liveFactsAnswer(
  q: string,
  ctx?: FacultyAiOfflineContext,
): string | null {
  if (!ctx) return null;
  const lower = q.toLowerCase();
  const classes = Array.isArray(ctx.today_classes) ? ctx.today_classes : [];
  const missing = Array.isArray(ctx.pending_attendance)
    ? ctx.pending_attendance
    : [];
  const meetings = Array.isArray(ctx.meetings_today) ? ctx.meetings_today : [];
  const courses = Array.isArray(ctx.courses) ? ctx.courses : [];
  const name = ctx.faculty_name ?? 'you';

  if (
    /today.?s?\s+class|classes\s+today|what\s+classes|my\s+timetable|schedule\s+today/.test(
      lower,
    )
  ) {
    if (!classes.length) {
      return `There are no teaching slots on your timetable for today, ${name.split(' ')[0]}. If you expected classes, your department may still need to complete course allocation or schedule adjustments.`;
    }
    return [
      `Here is your teaching schedule for today${ctx.department ? ` (${ctx.department})` : ''}:`,
      '',
      ...classes.map((c) => `• ${formatClassRow(c)}`),
      '',
      'After each session ends, recording attendance keeps student percentages and eligibility data up to date.',
    ].join('\n');
  }

  if (
    /missing\s+attendance|pending\s+attendance|attendance\s+pending|which\s+class.*(mark|attendance)/.test(
      lower,
    )
  ) {
    if (!missing.length) {
      return 'You have no pending attendance for ended classes today. When the next session finishes, submit attendance promptly so student records stay accurate for eligibility and reporting.';
    }
    return [
      'These ended sessions still need attendance recorded:',
      '',
      ...missing.map((c) => `• ${formatClassRow(c)}`),
      '',
      'Once submitted, each student’s attendance percentage updates automatically. Corrections after submission may require approval depending on university policy.',
    ].join('\n');
  }

  if (
    !/\bminutes\b/.test(lower) &&
    !/mentor|mentee|mentorship/.test(lower) &&
    (/(today|todays?).{0,24}meetings?|meetings?.{0,24}(today|todays?)/.test(
      lower,
    ) ||
      /\b(my\s+)?meetings?\b/.test(lower))
  ) {
    if (!meetings.length) {
      return 'You have no meetings scheduled for today. Upcoming department or university meetings will appear on your calendar once they are scheduled.';
    }
    return [
      'Here are your meetings for today:',
      '',
      ...meetings.map((m) => {
        const title = String(m.title ?? 'Meeting');
        const at = m.meeting_at
          ? String(m.meeting_at)
          : m.starts_at
            ? String(m.starts_at)
            : '';
        const venue = m.venue ? ` at ${m.venue}` : '';
        return `• ${title}${at ? ` — ${at}` : ''}${venue}`;
      }),
      '',
      'After the meeting, accurate minutes and action items become the reference for follow-up.',
    ].join('\n');
  }

  if (/\bleave\b|leave\s+approv|how\s+does\s+leave|apply\s+leave/.test(lower)) {
    return 'When a faculty member submits a leave request, it enters the university approval workflow. The request is reviewed by the appropriate authority, such as the Head of Department or HR, according to institutional policy. Once approved, the leave balance is updated automatically, and the leave is reflected in relevant institutional records. If the leave overlaps with scheduled classes, substitute arrangements may also be initiated.';
  }

  if (
    (/\bevents?\b/.test(lower) && /approv/.test(lower)) ||
    /event\s*approv|approv\w*\s+events?|club\s+event/.test(lower)
  ) {
    return [
      'Event approval is how faculty coordinators review club or campus event proposals—purpose, schedule, venue, and resource needs.',
      '',
      'When you approve or reject a request with a clear remark, the proposal continues through the remaining institutional workflow as required. Timely decisions help organizers plan and keep event governance transparent. Broader items waiting on you may also appear among your pending approvals.',
    ].join('\n');
  }

  if (
    /my\s+courses|which\s+courses|courses\s+am\s+i|teaching\s+load/.test(lower)
  ) {
    if (!courses.length) {
      return 'No allocated courses were found on your current teaching roster. If you expected a teaching load, please check with your Head of Department about course allocation for this term.';
    }
    return [
      'These are the courses currently associated with your teaching load:',
      '',
      ...courses
        .slice(0, 20)
        .map((c) => `• ${[c.code, c.name].filter(Boolean).join(' — ')}`),
      '',
      typeof ctx.mentee_count === 'number'
        ? `You also have approximately ${ctx.mentee_count} active mentee${ctx.mentee_count === 1 ? '' : 's'} under advising.`
        : null,
      'Course workspaces are where you share materials and manage digital assignments for each allocation.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return null;
}

/**
 * Structured faculty answers when Gemini is unavailable.
 * Prefers live portal facts + knowledge FAQ, then drafting templates.
 */
export function buildFacultyAiAnswer(
  userText: string,
  promptType?: string | null,
  ctx?: FacultyAiOfflineContext,
): string {
  const q = (userText || '').trim();
  const lower = q.toLowerCase();

  const live = liveFactsAnswer(q, ctx);
  if (live) return live;

  const matched = matchFacultyKnowledge(q);
  if (matched && matched.score >= 3 && !promptType) {
    return matched.article.answer;
  }

  if (
    /lesson\s*plan|teaching\s*plan|tomorrow.?s?\s*class/.test(lower) ||
    promptType === 'lesson_plan'
  ) {
    return [
      'Here is a practical 50-minute lesson plan you can adapt:',
      '',
      'Topic: [Replace with your topic]',
      'Course / Section: [Course code · Section]',
      'Focus: Understand → Apply → Analyze',
      '',
      'Warm-up (5 min): Recall prior concepts with two oral questions.',
      'Explain (15 min): Core idea plus one worked example.',
      'Guided practice (15 min): Pair problem set with increasing difficulty.',
      'Check (10 min): Short exit ticket or three quick questions.',
      'Close (5 min): Summarize and assign homework.',
      '',
      'Learning outcomes: students should define key terms, solve a standard problem correctly, and recognize common mistakes.',
      '',
      `Based on your request: ${q.slice(0, 280)}`,
    ].join('\n');
  }

  if (
    /mcq|multiple\s*choice|quiz/.test(lower) ||
    promptType === 'mcqs' ||
    promptType === 'create_quiz'
  ) {
    return [
      'Here is a draft quiz structure (10 MCQs, 1 mark each):',
      '',
      'Instructions: Choose the correct option.',
      '',
      '1. Which statement best defines the core concept? A) … B) … C) … D) …',
      '2. Which rule or formula applies in the standard case? A) … B) … C) … D) …',
      '3–10. Add course-specific items covering application, analysis, and common misconceptions.',
      '',
      'Answer key: 1-B · 2-A · (replace with your key)',
      '',
      `Topic hint: ${q.slice(0, 240)}`,
      '',
      'When you publish a formal weekly assessment, students can attempt it in the open window and results can feed continuous assessment.',
    ].join('\n');
  }

  if (
    (/attendance|below\s*75|warning/.test(lower) ||
      promptType === 'attendance_warning') &&
    !/how\s+to\s+mark|mark\s+attendance/.test(lower)
  ) {
    return [
      'Here is a professional attendance advisory you can adapt:',
      '',
      'Subject: Attendance below minimum — action required',
      '',
      'Dear Student / Parent,',
      '',
      'This is to inform you that the student’s attendance in [Subject / Course] is currently below the university minimum of 75%. Please ensure regular attendance for the remaining classes and meet the mentor within three working days.',
      '',
      'Regards,',
      `${ctx?.faculty_name ?? '[Faculty Name]'}`,
      `Department of ${ctx?.department ?? '[Department]'}`,
      '',
      'Before sending, verify the subject-wise percentage against official academic records.',
    ].join('\n');
  }

  if (
    /research\s*abstract|publication\s*abstract|abstract/.test(lower) ||
    promptType === 'publication_abstract'
  ) {
    return [
      'Here is an IMRaD-style abstract draft (~220 words) you can refine:',
      '',
      'Background: [Problem and gap.]',
      'Objective: This study aims to [primary aim].',
      'Methods: We used [method] and analyzed [approach].',
      'Results: Key findings include [outcomes].',
      'Conclusion: The work contributes [novelty].',
      '',
      `Seed idea: ${q.slice(0, 280)}`,
      '',
      'After finalizing, keep the publication record updated in your research profile for appraisal and accreditation evidence.',
    ].join('\n');
  }

  if (
    /meeting\s*minutes|minutes\s*template|hod\s*meeting/.test(lower) ||
    promptType === 'meeting_minutes'
  ) {
    return [
      'Here is a clear minutes structure you can use:',
      '',
      'Meeting: Department / HOD meeting',
      'Date / Time: [DD-MM-YYYY, HH:MM]',
      'Venue: [Room / Online]',
      'Chair: [Name]',
      '',
      'Record agenda items, discussion points, decisions, and action items with owner and due date.',
      '',
      'Accurate minutes become the institutional reference for follow-up and accountability.',
    ].join('\n');
  }

  if (
    /assignment|digital\s*assignment|\bda\b/.test(lower) ||
    promptType === 'assignment'
  ) {
    return [
      'Here is a concise digital assignment brief you can adapt:',
      '',
      'Title: [Assignment title]',
      'Maximum marks: 10',
      'Deadline: [Date · time]',
      '',
      'State the learning outcome, submission format, and assessment criteria clearly. Once published, students can submit by the deadline and you can evaluate with marks and feedback. Published scores contribute to internal assessment and performance analytics.',
      '',
      `From your prompt: ${q.slice(0, 240)}`,
    ].join('\n');
  }

  if (/^(hi|hello|hey|namaste)\b/.test(lower) || lower === 'help') {
    const first = ctx?.faculty_name?.split(' ')[0];
    return [
      `Hello${first ? `, ${first}` : ''}! I’m Falcon AI, your Faculty Portal assistant.`,
      '',
      'Ask me how academic processes work—attendance, assessments, mentoring, leave, meetings, events—or ask what is on your schedule today. I can also draft lesson plans, quizzes, advisories, abstracts, and minutes when you need them.',
      '',
      'I explain the process and what happens next, rather than walking you through menus.',
    ].join('\n');
  }

  if (matched) {
    return matched.article.answer;
  }

  return FACULTY_AI_UNKNOWN_ANSWER;
}
