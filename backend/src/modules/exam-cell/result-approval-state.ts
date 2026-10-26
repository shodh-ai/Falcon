import { createHash } from 'node:crypto';

type NumericValue = number | string | null | undefined;
type TimestampValue = Date | string | null | undefined;

export type ResultApprovalSession = {
  session_id: string;
  tenant_id: string;
  course_id: string;
  exam_type: string;
  semester: NumericValue;
  max_marks: NumericValue;
  pass_marks: NumericValue;
  grading_policy_id: NumericValue;
  entry_status: string;
  marks_locked: boolean;
  marks_locked_at?: TimestampValue;
  [key: string]: unknown;
};

export type ResultApprovalMark = {
  mark_id: string;
  student_user_id: string;
  marks_obtained: NumericValue;
  max_marks: NumericValue;
  status: string;
  updated_at?: TimestampValue;
  revision?: string | number | null;
  [key: string]: unknown;
};

export type ResultApprovalState = { version: 1; digest: string };

function numericValue(value: NumericValue): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && !value.trim()) {
    throw new TypeError('Empty numeric result approval input');
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError('Invalid numeric result approval input');
  }
  return number;
}

function timestampValue(value: TimestampValue): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();

  // PostgreSQL text timestamps retain microseconds that JavaScript Date drops.
  // Normalize representation/timezone without discarding that change evidence.
  const parts = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
    value,
  );
  if (!parts) return value;
  const fraction = parts[3] ?? '';
  const zone = /^[+-]\d{2}$/.test(parts[4]) ? `${parts[4]}:00` : parts[4];
  const parsed = new Date(
    `${parts[1]}T${parts[2]}.${fraction.padEnd(3, '0').slice(0, 3)}${zone}`,
  );
  if (!Number.isFinite(parsed.getTime())) return value;
  const subMilliseconds = fraction.slice(3).replace(/0+$/, '');
  return parsed.toISOString().replace(/Z$/, `${subMilliseconds}Z`);
}

function canonicalValue(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((name) => [
          name,
          canonicalValue((value as Record<string, unknown>)[name]),
        ]),
    );
  }
  return value;
}

/** Bind declaration inputs without storing raw student data in approval evidence. */
export function resultApprovalState(
  session: ResultApprovalSession,
  marks: readonly ResultApprovalMark[],
  policyRules: unknown,
  policyRevision?: string,
): ResultApprovalState {
  const inputs = {
    session: {
      session_id: session.session_id,
      tenant_id: session.tenant_id,
      course_id: session.course_id,
      exam_type: session.exam_type,
      semester: numericValue(session.semester),
      max_marks: numericValue(session.max_marks),
      pass_marks: numericValue(session.pass_marks),
      grading_policy_id: numericValue(session.grading_policy_id),
      entry_status: session.entry_status,
      marks_locked: session.marks_locked,
      marks_locked_at: timestampValue(session.marks_locked_at),
    },
    policy: { rules: policyRules, revision: policyRevision ?? null },
    marks: [...marks]
      .sort((left, right) =>
        left.mark_id < right.mark_id ? -1 : left.mark_id > right.mark_id ? 1 : 0,
      )
      .map((mark) => ({
        mark_id: mark.mark_id,
        student_user_id: mark.student_user_id,
        marks_obtained: numericValue(mark.marks_obtained),
        max_marks: numericValue(mark.max_marks),
        status: mark.status,
        updated_at: timestampValue(mark.updated_at),
        revision: mark.revision == null ? null : String(mark.revision),
      })),
  };
  return {
    version: 1,
    digest: createHash('sha256')
      .update(JSON.stringify(canonicalValue(inputs)))
      .digest('hex'),
  };
}

/** Missing/legacy snapshots deliberately cannot authorize a new declaration. */
export function matchesResultApprovalState(
  value: unknown,
  state: ResultApprovalState,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    snapshot.version === 1 &&
    typeof snapshot.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(snapshot.digest) &&
    snapshot.digest === state.digest
  );
}
