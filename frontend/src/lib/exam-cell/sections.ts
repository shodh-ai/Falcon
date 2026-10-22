import { collectNavHrefs, examCellPortal, resolveActiveNavHref } from '@/lib/navigation';

const SECTION_DESCRIPTIONS: Record<string, string> = {
  Dashboard: 'Review examination activity, assigned work, and student records.',
  'Exam Planning': 'Manage the examination calendar, sessions, timetable, deadlines, and registration windows.',
  'Students & Eligibility': 'Review eligibility, attendance exceptions, and supplementary applications.',
  'Admit Cards': 'Approve hall tickets, arrange seating, and prepare examination documents.',
  'Exam Operations': 'Coordinate invigilation, question papers, attendance, and answer sheets.',
  'Marks & Results': 'Review marks, approve and publish results, and manage post-result requests.',
  'Reports & Compliance': 'Review reports, audit records, transcripts, and examination communications.',
  'Master Data & Settings': 'Review examination rooms and manage your workspace preferences and account.',
};

/** Use the existing navigation as the single source of route membership. */
export function getExamCellSection(pathname: string) {
  const activeHref = resolveActiveNavHref(pathname, collectNavHrefs(examCellPortal.navGroups));
  const group = examCellPortal.navGroups.find((candidate) =>
    candidate.items.some((item) => item.href === activeHref),
  );
  if (!group) return null;
  return { ...group, description: SECTION_DESCRIPTIONS[group.title] ?? '' };
}
