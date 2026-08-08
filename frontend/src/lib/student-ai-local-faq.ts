import { formatInr, type StudentAiContext } from '@/lib/student-ai-context';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

export type StudentAiAnswer = {
  answer: string;
  href: string | null;
  personalized: boolean;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function greetingName(ctx?: StudentAiContext | null) {
  return ctx?.name?.split(' ')[0] || 'there';
}

/** Intent-based personal answers using the student's live/demo context. */
export function personalStudentAnswer(
  question: string,
  ctx: StudentAiContext | null,
): StudentAiAnswer | null {
  if (!ctx) return null;
  const q = question.toLowerCase().trim();
  if (!q || q.length < 2) return null;

  // Nonsense / too short noise
  if (/^[a-z]{1,4}$/.test(q) && !/^(hi|hey|fees?|cgpa|sgpa|gpa)$/.test(q)) {
    return {
      personalized: false,
      href: '/student/helpdesk',
      answer: `I didn't catch that, ${greetingName(ctx)}. Try asking about your CGPA, fees, attendance, today's classes, exams, or placements.`,
    };
  }

  if (/^(hi|hello|hey|namaste|good\s*(morning|afternoon|evening))\b/.test(q)) {
    return {
      personalized: true,
      href: '/student/dashboard',
      answer: `Hello ${greetingName(ctx)}! I'm Falcon AI. I can tell you your CGPA (${ctx.cgpa.toFixed(2)}), attendance (${ctx.attendance_percent}%), fee dues (${formatInr(ctx.fee_outstanding)}), today's classes, exams, and more. What would you like to know?`,
    };
  }

  if (/who am i|my (name|profile|enrollment|details)/.test(q)) {
    return {
      personalized: true,
      href: '/student/profile',
      answer: `You are ${ctx.name} (${ctx.enrollment_no}), enrolled in ${ctx.program} — ${ctx.branch}, Semester ${ctx.semester}, Section ${ctx.section}.`,
    };
  }

  if (/\b(cgpa|overall\s*gpa|cumulative)\b/.test(q) || /\bmy\s+gpa\b/.test(q)) {
    if (!isStudentDemoModeEnabled() && ctx.source === 'live' && ctx.cgpa <= 0 && !ctx.current_sgpa) {
      return {
        personalized: true,
        href: '/student/marks',
        answer: `${greetingName(ctx)}, I don't have published CGPA/SGPA on your record yet. Open Results once they are available.`,
      };
    }
    const sgpaLine =
      ctx.current_sgpa != null
        ? ` Your current semester (Sem ${ctx.semester}) SGPA is ${ctx.current_sgpa.toFixed(2)}.`
        : '';
    return {
      personalized: true,
      href: '/student/marks',
      answer: `${ctx.name}, your overall CGPA is ${ctx.cgpa.toFixed(2)}.${sgpaLine} You have completed ${ctx.credits_completed} of ${ctx.credits_required} credits. Open Results for the full grade sheet.`,
    };
  }

  if (/\b(sgpa|this\s*sem|current\s*sem|semester\s*gpa)\b/.test(q)) {
    if (ctx.current_sgpa == null) {
      return {
        personalized: true,
        href: '/student/marks',
        answer: `I don't have a published SGPA for Semester ${ctx.semester} yet. Your overall CGPA is ${ctx.cgpa.toFixed(2)}. Check Results once they are published.`,
      };
    }
    return {
      personalized: true,
      href: '/student/marks',
      answer: `Your Semester ${ctx.semester} SGPA is ${ctx.current_sgpa.toFixed(2)}. Overall CGPA across completed semesters is ${ctx.cgpa.toFixed(2)}.`,
    };
  }

  if (/\b(credit|credits)\b/.test(q)) {
    const pct = Math.round((ctx.credits_completed / Math.max(1, ctx.credits_required)) * 100);
    return {
      personalized: true,
      href: '/student/marks',
      answer: `You have completed ${ctx.credits_completed} credits out of ${ctx.credits_required} required (~${pct}%). Remaining for degree completion: ${Math.max(0, ctx.credits_required - ctx.credits_completed)} credits.`,
    };
  }

  if (/\b(fee|fees|payment|dues|pay|outstanding|ledger|tuition)\b/.test(q)) {
    if (ctx.fee_clear || ctx.fee_outstanding <= 0) {
      return {
        personalized: true,
        href: '/student/finance',
        answer: `Good news, ${greetingName(ctx)} — your fee account is clear. No outstanding dues right now. You can still download receipts from My Financial Ledger.`,
      };
    }
    const due = formatDate(ctx.next_fee_due);
    const heads =
      ctx.pending_fee_heads.length > 0
        ? `\n\nPending:\n• ${ctx.pending_fee_heads.slice(0, 4).join('\n• ')}`
        : '';
    return {
      personalized: true,
      href: '/student/finance',
      answer: `${ctx.name}, your pending fee amount is ${formatInr(ctx.fee_outstanding)}${due ? ` (next due ${due})` : ''}.${heads}\n\nPay online from My Financial Ledger to avoid blocks on admit card / registration.`,
    };
  }

  if (/\b(attendance|present|absent|shortage|75\s*%|percent)\b/.test(q)) {
    const status =
      ctx.attendance_percent >= 75
        ? 'You are above the 75% minimum — keep it up.'
        : 'You are below the 75% minimum — attend upcoming classes to avoid exam eligibility issues.';
    const weak = [...ctx.subject_attendance]
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 3)
      .map((s) => `${s.course_code} ${s.course_name}: ${s.percent}%`)
      .join('\n• ');
    return {
      personalized: true,
      href: '/student/attendance',
      answer: `Your overall attendance is ${ctx.attendance_percent}%. ${status}${
        weak ? `\n\nSubject-wise (lowest first):\n• ${weak}` : ''
      }`,
    };
  }

  if (/\b(today|timetable|schedule|class|lecture|next\s*class)\b/.test(q)) {
    if (!ctx.today_classes.length) {
      return {
        personalized: true,
        href: '/student/timetable',
        answer: `No classes are listed for today on your timetable. Open Timetable for the full Mon–Sat schedule.`,
      };
    }
    const lines = ctx.today_classes
      .map((c) => `${c.start}–${c.end} · ${c.subject} · ${c.room} · ${c.faculty}`)
      .join('\n• ');
    return {
      personalized: true,
      href: '/student/timetable',
      answer: `Here are your classes today (${ctx.today_classes.length}):\n• ${lines}`,
    };
  }

  if (/\b(exam|admit|hall\s*ticket|seating|mid\s*sem|end\s*sem)\b/.test(q)) {
    if (!ctx.upcoming_exams.length) {
      return {
        personalized: true,
        href: '/student/exams',
        answer: `No upcoming exams are listed right now. Open Exams for admit cards, seating, and schedules when published.`,
      };
    }
    const lines = ctx.upcoming_exams
      .map((e) => `${formatDate(e.exam_date)} · ${e.subject} · ${e.hall}`)
      .join('\n• ');
    return {
      personalized: true,
      href: '/student/exams',
      answer: `You have ${ctx.upcoming_exams.length} upcoming exam(s):\n• ${lines}\n\nClear fees and keep attendance above 75% before the exam window.`,
    };
  }

  if (/\b(assignment|da|homework|submission)\b/.test(q)) {
    return {
      personalized: true,
      href: '/student/courses',
      answer:
        ctx.pending_assignments > 0
          ? `You have ${ctx.pending_assignments} pending assignment(s). Open Course Page & DA to submit before the due date.`
          : `You have no pending assignments right now. Nice work — check Course Page & DA for new DAs.`,
    };
  }

  if (/\b(placement|internship|job|drive|offer|company)\b/.test(q)) {
    return {
      personalized: true,
      href: '/student/placements',
      answer: `Placement status: ${ctx.placement_label}. With CGPA ${ctx.cgpa.toFixed(2)}, open Placements & Internships to view eligible companies and apply.`,
    };
  }

  if (/\b(hostel|room|gate\s*pass|mess)\b/.test(q)) {
    return {
      personalized: true,
      href: '/student/campus-life',
      answer: `For hostel room details, mess status, and gate pass requests, open Campus Life. I can also help with fees, attendance, and exams if you ask.`,
    };
  }

  if (/\b(library|book|fine|renew)\b/.test(q)) {
    return {
      personalized: true,
      href: '/student/library',
      answer: `Open Library & Dues to see issued books, due dates, and fines. Renew before the due date to avoid late charges.`,
    };
  }

  if (/who are you|what can you do|your name/.test(q)) {
    return {
      personalized: true,
      href: '/student/ai-assistant',
      answer: `I'm Falcon AI for ${ctx.name}. I can answer with your real portal data — CGPA, SGPA, fees, attendance, today's classes, exams, assignments, and placements — and link you to the right page when needed.`,
    };
  }

  return null;
}

type LocalFaq = { keywords: RegExp; answer: string; href: string };

const LOCAL_FAQ: LocalFaq[] = [
  {
    keywords: /register|cbcs|elective/,
    href: '/student/registration',
    answer:
      'Use Courses to choose electives within the registration window. Incomplete registration can block timetable mapping.',
  },
  {
    keywords: /helpdesk|ticket|grievance|complaint/,
    href: '/student/helpdesk',
    answer:
      'Raise a ticket under Grievances & Helpdesk and track status there. Include your enrollment number for faster routing.',
  },
];

/** Generic FAQ when no personal intent matched. */
export function localStudentFaqAnswer(
  question: string,
  ctx?: StudentAiContext | null,
): StudentAiAnswer | null {
  const personal = personalStudentAnswer(question, ctx ?? null);
  if (personal) return personal;

  const q = question.toLowerCase().trim();
  if (!q) return null;

  for (const row of LOCAL_FAQ) {
    if (row.keywords.test(q)) {
      return { answer: row.answer, href: row.href, personalized: false };
    }
  }

  if (ctx) {
    return {
      personalized: true,
      href: '/student/dashboard',
      answer: `${greetingName(ctx)}, I can share your CGPA (${ctx.cgpa.toFixed(2)}), attendance (${ctx.attendance_percent}%), pending fees (${formatInr(ctx.fee_outstanding)}), today's classes, exams, or placements. Ask one of those, or open Helpdesk for human support.`,
    };
  }

  return null;
}
