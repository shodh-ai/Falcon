export type AcademicEventCategory =
  | 'ACADEMIC'
  | 'EXAMINATION'
  | 'ADMISSIONS'
  | 'FEES'
  | 'PLACEMENT'
  | 'HOLIDAYS'
  | 'CLUBS';

export type AcademicCalendarEvent = {
  event_id: string;
  title: string;
  category: AcademicEventCategory;
  date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  description: string;
  student_tip?: string | null;
  department?: string | null;
  venue?: string | null;
  organizer?: string | null;
  attachment_url?: string | null;
  academic_year?: string | null;
};

export const ACADEMIC_EVENT_CATEGORIES: {
  id: AcademicEventCategory;
  label: string;
  shortLabel: string;
  studentHint: string;
  badgeClass: string;
  dotClass: string;
  chipClass: string;
}[] = [
  {
    id: 'ACADEMIC',
    label: 'Academic',
    shortLabel: 'Classes',
    studentHint: 'Semester start, registration, add/drop',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
    chipClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  {
    id: 'EXAMINATION',
    label: 'Exams',
    shortLabel: 'Exams',
    studentHint: 'Mid-term, practical, end-term, results',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    dotClass: 'bg-sky-500',
    chipClass: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  {
    id: 'ADMISSIONS',
    label: 'Admissions',
    shortLabel: 'Admission',
    studentHint: 'Orientation & document verification',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
    dotClass: 'bg-amber-500',
    chipClass: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  {
    id: 'FEES',
    label: 'Fees',
    shortLabel: 'Fees',
    studentHint: 'Pay dates and late fee deadlines',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
    dotClass: 'bg-violet-500',
    chipClass: 'border-violet-200 bg-violet-50 text-violet-800',
  },
  {
    id: 'PLACEMENT',
    label: 'Placements',
    shortLabel: 'Jobs',
    studentHint: 'Drives, internships, workshops',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    dotClass: 'bg-orange-500',
    chipClass: 'border-orange-200 bg-orange-50 text-orange-800',
  },
  {
    id: 'HOLIDAYS',
    label: 'Holidays & Festivals',
    shortLabel: 'Holiday',
    studentHint: 'No classes — national & festival holidays',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    dotClass: 'bg-rose-500',
    chipClass: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  {
    id: 'CLUBS',
    label: 'Clubs & Campus',
    shortLabel: 'Campus',
    studentHint: 'Fests, clubs, cultural events',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    dotClass: 'bg-teal-500',
    chipClass: 'border-teal-200 bg-teal-50 text-teal-800',
  },
];

export function categoryMeta(category: AcademicEventCategory) {
  return (
    ACADEMIC_EVENT_CATEGORIES.find((c) => c.id === category) ??
    ACADEMIC_EVENT_CATEGORIES[0]
  );
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function ymd(year: number, monthIndex: number, day: number) {
  return isoDate(new Date(year, monthIndex, day, 12, 0, 0));
}

function ev(
  id: string,
  title: string,
  category: AcademicEventCategory,
  date: string,
  extra: Partial<AcademicCalendarEvent> = {},
): AcademicCalendarEvent {
  return {
    event_id: id,
    title,
    category,
    date,
    end_date: extra.end_date ?? null,
    start_time: extra.start_time ?? null,
    end_time: extra.end_time ?? null,
    description: extra.description ?? title,
    student_tip: extra.student_tip ?? null,
    department: extra.department ?? null,
    venue: extra.venue ?? null,
    organizer: extra.organizer ?? null,
    attachment_url: extra.attachment_url ?? null,
    academic_year: extra.academic_year ?? null,
  };
}

/**
 * Full student-friendly academic year: classes, exams, fees, placements,
 * national holidays, and major festivals.
 */
export function buildMockAcademicCalendarEvents(now = new Date()): AcademicCalendarEvent[] {
  const year = now.getFullYear();
  const nextYear = year + 1;
  const academicYear =
    now.getMonth() >= 6 ? `${year}-${String(nextYear).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;

  const ay = { academic_year: academicYear };

  const events: AcademicCalendarEvent[] = [
    // —— Academic ——
    ev('acad-odd-start', 'Odd Semester Classes Begin', 'ACADEMIC', ymd(year, 7, 1), {
      ...ay,
      start_time: '09:00',
      end_time: '17:00',
      description: 'New semester classes start for all programmes.',
      student_tip: 'Check your weekly timetable and attend from day one for attendance.',
      department: 'Academics',
      venue: 'Your classrooms',
      organizer: 'Dean Academics',
    }),
    ev('acad-reg', 'Course Registration Open', 'ACADEMIC', isoDate(addDays(now, 3)), {
      ...ay,
      end_date: isoDate(addDays(now, 10)),
      description: 'Choose your subjects and electives online.',
      student_tip: 'Complete registration before the last date or you may miss classes.',
      department: 'Academics',
      venue: 'Student Portal → Courses',
      organizer: 'Registrar',
    }),
    ev('acad-add-drop', 'Add / Drop Subjects Window', 'ACADEMIC', isoDate(addDays(now, 12)), {
      ...ay,
      end_date: isoDate(addDays(now, 16)),
      description: 'Last chance to change electives with mentor approval.',
      student_tip: 'Talk to your mentor before dropping a subject.',
      department: 'Academics',
      venue: 'Student Portal',
      organizer: 'Department Office',
    }),
    ev('acad-even-start', 'Even Semester Classes Begin', 'ACADEMIC', ymd(nextYear, 0, 8), {
      ...ay,
      description: 'Even semester teaching begins after winter break.',
      student_tip: 'Update your timetable for the new semester.',
      department: 'Academics',
      organizer: 'Dean Academics',
    }),
    ev('acad-odd-end', 'Odd Semester Teaching Ends', 'ACADEMIC', ymd(year, 11, 5), {
      ...ay,
      description: 'Last teaching day before end-semester exams.',
      student_tip: 'Use this week for revision and practical submissions.',
      department: 'Academics',
      organizer: 'Dean Academics',
    }),

    // —— Exams ——
    ev('exam-mid', 'Mid-Semester Exams', 'EXAMINATION', isoDate(addDays(now, 8)), {
      ...ay,
      end_date: isoDate(addDays(now, 14)),
      start_time: '09:30',
      end_time: '12:30',
      description: 'Internal mid-term exams for theory subjects.',
      student_tip: 'Carry your ID card. Seating plan will show under Exams.',
      department: 'Exam Cell',
      venue: 'As per seating plan',
      organizer: 'Controller of Examinations',
    }),
    ev('exam-practical', 'Practical / Lab Exams', 'EXAMINATION', isoDate(addDays(now, 18)), {
      ...ay,
      end_date: isoDate(addDays(now, 22)),
      start_time: '10:00',
      end_time: '13:00',
      description: 'Lab and practical exams in your department.',
      student_tip: 'Bring lab record and required kits.',
      department: 'Your Department',
      venue: 'Department labs',
      organizer: 'Exam Cell',
    }),
    ev('exam-end', 'End-Semester Exams', 'EXAMINATION', ymd(year, 11, 10), {
      ...ay,
      end_date: ymd(year, 11, 28),
      start_time: '09:30',
      end_time: '12:30',
      description: 'Final theory exams for the semester.',
      student_tip: 'Download admit card only after fees are cleared.',
      department: 'Exam Cell',
      venue: 'Exam halls',
      organizer: 'Controller of Examinations',
    }),
    ev('exam-result', 'Semester Results Declared', 'EXAMINATION', ymd(nextYear, 0, 20), {
      ...ay,
      start_time: '11:00',
      description: 'SGPA / grades published under Results.',
      student_tip: 'Open Marks page to see subject grades and download marksheet.',
      department: 'Exam Cell',
      venue: 'Student Portal → Marks',
      organizer: 'Controller of Examinations',
    }),
    ev('exam-reval', 'Revaluation / Recheck Apply Window', 'EXAMINATION', ymd(nextYear, 0, 25), {
      ...ay,
      end_date: ymd(nextYear, 1, 5),
      description: 'Apply if you want your answer sheet rechecked.',
      student_tip: 'Apply from Exams within this window only.',
      department: 'Exam Cell',
      venue: 'Student Portal → Exams',
      organizer: 'Exam Cell',
    }),
    ev('exam-even-mid', 'Even Semester Mid Exams', 'EXAMINATION', ymd(nextYear, 2, 10), {
      ...ay,
      end_date: ymd(nextYear, 2, 16),
      start_time: '09:30',
      end_time: '12:30',
      description: 'Mid-term exams for even semester.',
      student_tip: 'Prepare early — dates can be tight around festivals.',
      department: 'Exam Cell',
      venue: 'As per seating plan',
      organizer: 'Controller of Examinations',
    }),

    // —— Admissions ——
    ev('adm-orient', 'New Student Orientation', 'ADMISSIONS', isoDate(addDays(now, 2)), {
      ...ay,
      start_time: '10:00',
      end_time: '13:00',
      description: 'Welcome session for newly admitted students and parents.',
      student_tip: 'Attend if you are a first-year / lateral entry student.',
      department: 'Admissions',
      venue: 'Main Auditorium',
      organizer: 'Dean Student Welfare',
    }),
    ev('adm-docs', 'Document Verification Camp', 'ADMISSIONS', isoDate(addDays(now, 6)), {
      ...ay,
      start_time: '09:00',
      end_time: '16:00',
      description: 'Bring originals for Aadhaar, marksheets, and category certificates.',
      student_tip: 'Keep photocopies ready. Incomplete docs delay ID card.',
      department: 'Admissions',
      venue: 'Admin Block – Counter 2',
      organizer: 'Admission Cell',
    }),

    // —— Fees ——
    ev('fee-open', 'Fee Payment Opens', 'FEES', isoDate(addDays(now, 1)), {
      ...ay,
      description: 'You can start paying semester fees online.',
      student_tip: 'Pay early to avoid last-day rush and unlock admit card.',
      department: 'Finance',
      venue: 'Student Portal → Fee Structure',
      organizer: 'Finance Office',
    }),
    ev('fee-due', 'Fee Last Date (Without Late Fee)', 'FEES', isoDate(addDays(now, 20)), {
      ...ay,
      end_time: '23:59',
      description: 'Pay full dues by this date to avoid late charges.',
      student_tip: 'If unpaid, exam admit card stays locked.',
      department: 'Finance',
      venue: 'Student Portal → Fee Structure',
      organizer: 'Finance Office',
    }),
    ev('fee-late', 'Late Fee Final Deadline', 'FEES', isoDate(addDays(now, 30)), {
      ...ay,
      description: 'Last date including late fee. After this, contact Finance desk.',
      student_tip: 'Do not wait till this day — servers can be slow.',
      department: 'Finance',
      venue: 'Student Portal → Fee Structure',
      organizer: 'Finance Office',
    }),

    // —— Placement ——
    ev('plc-resume', 'Resume Building Workshop', 'PLACEMENT', isoDate(addDays(now, 5)), {
      ...ay,
      start_time: '14:00',
      end_time: '16:00',
      description: 'Learn how to write a strong resume and LinkedIn profile.',
      student_tip: 'Useful for 2nd year onwards. Bring your laptop.',
      department: 'Training & Placement',
      venue: 'Career Lab',
      organizer: 'Placement Coordinator',
    }),
    ev('plc-drive', 'Campus Placement Drive', 'PLACEMENT', isoDate(addDays(now, 9)), {
      ...ay,
      start_time: '09:00',
      end_time: '18:00',
      description: 'Company interviews for eligible final-year students.',
      student_tip: 'Wear formals. Check eligibility on Placements hub.',
      department: 'Training & Placement',
      venue: 'Placement Cell / Seminar Hall',
      organizer: 'T&P Cell',
    }),
    ev('plc-intern', 'Internship Registration', 'PLACEMENT', isoDate(addDays(now, 11)), {
      ...ay,
      end_date: isoDate(addDays(now, 21)),
      description: 'Apply for summer / winter internship openings.',
      student_tip: 'Register even if you are in 2nd or 3rd year.',
      department: 'Training & Placement',
      venue: 'Student Portal → Placements',
      organizer: 'T&P Cell',
    }),
    ev('plc-visit', 'Company Visit / Industry Talk', 'PLACEMENT', isoDate(addDays(now, 15)), {
      ...ay,
      start_time: '11:00',
      end_time: '15:00',
      description: 'Industry session for shortlisted / interested students.',
      student_tip: 'Carry college ID. Be on time.',
      department: 'Training & Placement',
      venue: 'As informed by T&P',
      organizer: 'T&P Cell',
    }),

    // —— Holidays & Festivals (India-focused, student clear) ——
    ev('hol-republic', 'Republic Day', 'HOLIDAYS', ymd(year, 0, 26), {
      ...ay,
      description: 'National holiday. University closed.',
      student_tip: 'No classes. Flag ceremony may be held on campus.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-maha', 'Mahashivratri', 'HOLIDAYS', ymd(year, 1, 26), {
      ...ay,
      description: 'Festival holiday. University closed.',
      student_tip: 'No classes today.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-holi', 'Holi', 'HOLIDAYS', ymd(year, 2, 14), {
      ...ay,
      end_date: ymd(year, 2, 15),
      description: 'Festival holiday for Holi.',
      student_tip: 'Campus closed. Stay safe if celebrating.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-good-friday', 'Good Friday', 'HOLIDAYS', ymd(year, 3, 3), {
      ...ay,
      description: 'Holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-eid', 'Eid-ul-Fitr', 'HOLIDAYS', ymd(year, 2, 31), {
      ...ay,
      description: 'Festival holiday (date may follow government notification).',
      student_tip: 'Confirm exact date on notice board if it shifts.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-ambedkar', 'Dr. Ambedkar Jayanti', 'HOLIDAYS', ymd(year, 3, 14), {
      ...ay,
      description: 'Holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-ramzan', 'Eid-ul-Adha (Bakrid)', 'HOLIDAYS', ymd(year, 5, 7), {
      ...ay,
      description: 'Festival holiday (subject to official notification).',
      student_tip: 'No classes if declared by university.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-independence', 'Independence Day', 'HOLIDAYS', ymd(year, 7, 15), {
      ...ay,
      description: 'National holiday. University closed.',
      student_tip: 'No classes. Attend flag hoisting if invited.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-janmashtami', 'Janmashtami', 'HOLIDAYS', ymd(year, 7, 26), {
      ...ay,
      description: 'Festival holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-gandhi', 'Gandhi Jayanti', 'HOLIDAYS', ymd(year, 9, 2), {
      ...ay,
      description: 'National holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-dussehra', 'Dussehra', 'HOLIDAYS', ymd(year, 9, 11), {
      ...ay,
      description: 'Festival holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-diwali', 'Diwali Vacation', 'HOLIDAYS', ymd(year, 9, 19), {
      ...ay,
      end_date: ymd(year, 9, 22),
      description: 'Festival holidays for Diwali.',
      student_tip: 'No classes during this break. Plan travel early.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-guru-nanak', 'Guru Nanak Jayanti', 'HOLIDAYS', ymd(year, 10, 5), {
      ...ay,
      description: 'Festival holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-christmas', 'Christmas', 'HOLIDAYS', ymd(year, 11, 25), {
      ...ay,
      description: 'Holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-winter', 'Winter Break', 'HOLIDAYS', ymd(year, 11, 26), {
      ...ay,
      end_date: ymd(nextYear, 0, 5),
      description: 'Winter vacation between odd and even semester.',
      student_tip: 'Hostel rules may still apply — check warden notice.',
      department: 'University',
      organizer: 'Administration',
    }),
    ev('hol-makar', 'Makar Sankranti', 'HOLIDAYS', ymd(nextYear, 0, 14), {
      ...ay,
      description: 'Festival holiday. University closed.',
      student_tip: 'No classes.',
      department: 'University',
      organizer: 'Administration',
    }),

    // —— Clubs / campus ——
    ev('club-fest', 'Falcon Tech Fest', 'CLUBS', isoDate(addDays(now, 13)), {
      ...ay,
      end_date: isoDate(addDays(now, 15)),
      start_time: '10:00',
      end_time: '20:00',
      description: 'Technical & cultural fest with competitions and stalls.',
      student_tip: 'Register for events via Events & Clubs page.',
      department: 'Student Affairs',
      venue: 'Central Lawn & Auditorium',
      organizer: 'Student Council',
    }),
    ev('club-freshers', 'Freshers Welcome', 'CLUBS', ymd(year, 8, 12), {
      ...ay,
      start_time: '17:00',
      end_time: '21:00',
      description: 'Welcome evening for first-year students.',
      student_tip: 'Entry with college ID only.',
      department: 'Student Affairs',
      venue: 'Main Auditorium',
      organizer: 'Student Council',
    }),
    ev('club-sports', 'Annual Sports Meet', 'CLUBS', ymd(year, 10, 18), {
      ...ay,
      end_date: ymd(year, 10, 20),
      description: 'Inter-department sports competitions.',
      student_tip: 'Register with Sports Club for events.',
      department: 'Sports',
      venue: 'University Sports Ground',
      organizer: 'Sports Committee',
    }),
  ];

  // Deduplicate by id and sort
  const map = new Map<string, AcademicCalendarEvent>();
  for (const event of events) map.set(event.event_id, event);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function daysUntil(dateIso: string, now = new Date()) {
  const target = new Date(`${dateIso}T12:00:00`);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  return Math.ceil((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function isEventOnDate(event: AcademicCalendarEvent, dateIso: string) {
  const start = event.date;
  const end = event.end_date || event.date;
  return dateIso >= start && dateIso <= end;
}

export function formatEventDate(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function toIcsDate(dateIso: string, time?: string | null) {
  if (time && /^\d{2}:\d{2}/.test(time)) {
    return `${dateIso.replace(/-/g, '')}T${time.replace(':', '')}00`;
  }
  return dateIso.replace(/-/g, '');
}

export function buildIcsCalendar(events: AcademicCalendarEvent[], calendarName = 'Falcon Academic Calendar') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Falcon ERP//Academic Calendar//EN',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const dtStart = toIcsDate(event.date, event.start_time);
    const endDate = event.end_date || event.date;
    const dtEnd = toIcsDate(endDate, event.end_time || event.start_time);
    const allDay = !event.start_time;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.event_id}@falcon.sgvu`);
    lines.push(`SUMMARY:${icsEscape(event.title)}`);
    const desc = [event.description, event.student_tip ? `Tip: ${event.student_tip}` : '']
      .filter(Boolean)
      .join('\\n');
    lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    if (event.venue) lines.push(`LOCATION:${icsEscape(event.venue)}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    } else {
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
    }
    lines.push(`CATEGORIES:${event.category}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadIcsFile(events: AcademicCalendarEvent[], filename = 'falcon-academic-calendar.ics') {
  const blob = new Blob([buildIcsCalendar(events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(event: AcademicCalendarEvent) {
  const start = event.start_time
    ? `${event.date.replace(/-/g, '')}T${event.start_time.replace(':', '')}00`
    : event.date.replace(/-/g, '');
  const endDate = event.end_date || event.date;
  const end = event.end_time
    ? `${endDate.replace(/-/g, '')}T${event.end_time.replace(':', '')}00`
    : endDate.replace(/-/g, '');
  const details = [event.description, event.student_tip ? `Tip for students: ${event.student_tip}` : '']
    .filter(Boolean)
    .join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details,
    location: event.venue || '',
    dates: `${start}/${end}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function downloadAcademicCalendarPdf(events: AcademicCalendarEvent[]) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text('Falcon Student Academic Calendar', 40, 40);
  doc.setFontSize(10);
  doc.text(
    `Easy guide to classes, exams, fees, holidays & festivals · ${events.length} events · ${new Date().toLocaleDateString('en-IN')}`,
    40,
    58,
  );

  autoTable(doc, {
    startY: 72,
    head: [['Date', 'What', 'Type', 'Where', 'Tip for you']],
    body: events.map((e) => [
      e.end_date && e.end_date !== e.date
        ? `${formatShortDate(e.date)} – ${formatShortDate(e.end_date)}`
        : formatShortDate(e.date),
      e.title,
      categoryMeta(e.category).label,
      e.venue || '—',
      e.student_tip || e.description,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [8, 35, 74] },
  });

  doc.save('falcon-academic-calendar.pdf');
}

/** Merge API events with rich local catalogue so months never look empty. */
export function mergeCalendarEvents(
  apiEvents: AcademicCalendarEvent[] | undefined | null,
): AcademicCalendarEvent[] {
  const mock = buildMockAcademicCalendarEvents();
  const map = new Map<string, AcademicCalendarEvent>();
  for (const e of mock) map.set(e.event_id, e);
  for (const e of apiEvents ?? []) {
    map.set(e.event_id, {
      ...e,
      student_tip: e.student_tip ?? null,
    });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
