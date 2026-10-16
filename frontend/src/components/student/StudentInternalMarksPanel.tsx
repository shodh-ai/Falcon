import {
  formatAssessmentNumber,
  summarizeInternalMarks,
  type AssessmentMark,
  type NormalizedAssessmentMark,
} from '@/lib/student-internal-marks';

type InternalMarksSubject = {
  course_id: string;
  course_code: string;
  course_name: string;
  components: AssessmentMark[];
};

function AssessmentRows({ rows }: { rows: NormalizedAssessmentMark[] }) {
  return (
    <ul className="divide-y divide-sgvu-navy/10 overflow-hidden rounded-xl border border-sgvu-navy/10">
      {rows.map((row, index) => (
        <li key={`${row.key}-${index}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-slate-50/60 px-3 py-3 text-sm">
          <span className="min-w-0 flex-1 break-words font-medium text-sgvu-navy">{row.label || row.key}</span>
          <span className="shrink-0 font-semibold tabular-nums text-sgvu-navy">
            {row.valid
              ? `${formatAssessmentNumber(row.obtained!)}/${formatAssessmentNumber(row.maximum!)}`
              : row.marks_obtained == null && row.maximum != null && row.maximum > 0
                ? 'Awaiting marks'
                : 'Marks unavailable'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StudentInternalMarksPanel({ subjects }: { subjects: InternalMarksSubject[] }) {
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Internal percentage = total earned marks ÷ total maximum marks × 100, using recorded internal assessments only.
        Pending assessments are not counted as zero. This is not a final course grade.
      </p>
      {subjects.map((subject) => {
        const summary = summarizeInternalMarks(subject.components);
        return (
          <section key={subject.course_id} aria-label={`${subject.course_code} internal marks`} className="rounded-2xl border border-sgvu-navy/10 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sgvu-navy">{subject.course_name}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{subject.course_code}</p>
              </div>
              <div className="rounded-xl bg-sgvu-gold/15 px-4 py-2.5 sm:text-right">
                <p className="text-[11px] font-medium text-muted-foreground">Recorded internal marks</p>
                <p className="mt-0.5 text-xl font-black tabular-nums text-sgvu-navy">
                  {summary.obtained != null && summary.maximum != null
                    ? `${formatAssessmentNumber(summary.obtained)}/${formatAssessmentNumber(summary.maximum)}`
                    : '—'}
                </p>
                {summary.percentage != null ? <p className="text-xs text-sgvu-navy">{formatAssessmentNumber(summary.percentage)}% of recorded marks</p> : null}
              </div>
            </div>
            {summary.internal.length > 0 ? <AssessmentRows rows={summary.internal} /> : null}
            {summary.recordedCount === 0 ? <p className="mt-3 text-sm text-muted-foreground">No internal marks recorded yet</p> : (
              <p className="mt-2 text-xs text-muted-foreground">Based on {summary.recordedCount} recorded {summary.recordedCount === 1 ? 'assessment' : 'assessments'}.</p>
            )}
            {summary.excludedCount > 0 ? <p className="mt-2 text-xs text-muted-foreground">Pending or unavailable marks are excluded from this total.</p> : null}
            {summary.endTerm.length > 0 ? (
              <div className="mt-4 border-t border-sgvu-navy/10 pt-4">
                <h5 className="text-sm font-semibold text-sgvu-navy">End-term marks</h5>
                <p className="mb-2 text-xs text-muted-foreground">Not included in the internal total.</p>
                <AssessmentRows rows={summary.endTerm} />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
