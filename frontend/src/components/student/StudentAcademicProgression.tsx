import { CalendarRange, CircleDot, Clock3, History, Minus } from 'lucide-react';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import type { StudentAttendanceData } from '@/lib/student-attendance';
import { cn } from '@/lib/utils';

type Props = {
  progression: StudentAttendanceData['progression'];
  currentSemester?: number;
};

function semesterStage(semester: number, status: string, currentSemester: number | null) {
  if (currentSemester != null) {
    return semester === currentSemester ? 'current' : semester < currentSemester ? 'previous' : 'upcoming';
  }
  if (status === 'IN_PROGRESS') return 'current';
  if (status === 'COMPLETED') return 'previous';
  if (status === 'UPCOMING') return 'upcoming';
  return 'unknown';
}

const STAGES = {
  previous: { label: 'Previous semester', icon: History },
  current: { label: 'Current semester', icon: CircleDot },
  upcoming: { label: 'Upcoming', icon: Clock3 },
  unknown: { label: 'Status unavailable', icon: Minus },
};

export function StudentAcademicProgression({ progression, currentSemester }: Props) {
  const current = Number.isInteger(currentSemester) && Number(currentSemester) > 0
    ? Number(currentSemester)
    : null;
  const semesters = progression
    .filter((row) => Number.isInteger(Number(row.semester)) && Number(row.semester) > 0)
    .sort((a, b) => Number(a.semester) - Number(b.semester));

  return (
    <StudentSectionCard
      title="Academic progression"
      description="Your previous, current, and upcoming semesters at a glance."
      icon={CalendarRange}
      action={current == null ? undefined : (
        <p className="rounded-full border border-sgvu-gold/40 bg-sgvu-gold/10 px-3 py-1.5 text-xs font-semibold text-sgvu-navy">
          Currently in Semester {current}
        </p>
      )}
    >
      {semesters.length === 0 ? (
        <StudentEmptyState title="No progression data" description="Semester progression will appear as you advance." />
      ) : (
        <ol aria-label="Semester progression" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {semesters.map((row) => {
            const semester = Number(row.semester);
            const stage = semesterStage(semester, row.status, current);
            const { label, icon: StatusIcon } = STAGES[stage];
            return (
              <li
                key={semester}
                aria-current={stage === 'current' ? 'step' : undefined}
                className={cn(
                  'min-w-0 rounded-xl border p-3 sm:p-4',
                  stage === 'current'
                    ? 'border-sgvu-gold/60 bg-sgvu-gold/10 ring-1 ring-sgvu-gold/20'
                    : stage === 'previous'
                      ? 'border-sgvu-navy/15 bg-white'
                      : 'border-slate-200 bg-slate-50/70',
                )}
              >
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      stage === 'current' ? 'bg-sgvu-navy text-white' : 'bg-sgvu-navy/5 text-sgvu-navy',
                    )}
                  >
                    {String(semester).padStart(2, '0')}
                  </span>
                  <p className="min-w-0 text-sm font-semibold text-sgvu-navy">Semester {semester}</p>
                </div>
                <p className={cn('mt-3 flex items-start gap-1.5 text-xs font-medium', stage === 'current' ? 'text-sgvu-navy' : 'text-slate-600')}>
                  <StatusIcon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {row.courses_count > 0
                    ? `${row.courses_count} ${row.courses_count === 1 ? 'course' : 'courses'} registered`
                    : 'No courses registered'}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </StudentSectionCard>
  );
}
