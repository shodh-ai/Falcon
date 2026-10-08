'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type WorkflowStep = {
  completed: boolean;
  label: string;
  detail?: string;
};

type WorkflowResponse = {
  student_user_id: string;
  steps: {
    admission: WorkflowStep;
    fee: WorkflowStep;
    enrollment: WorkflowStep;
    placement: WorkflowStep;
    semester_reg: WorkflowStep;
    certificates: WorkflowStep;
    graduation: WorkflowStep;
  };
};

const STATIC_STEPS: Array<{ key: string; label: string; href: string }> = [
  { key: 'admission', label: 'Admission', href: '/admin/admissions' },
  { key: 'fee', label: 'Fee verification', href: '/admin/enrollment' },
  { key: 'enrollment', label: 'Enrollment', href: '/admin/enrollment' },
  { key: 'placement', label: 'Academic placement', href: '/admin/academic-placement' },
  { key: 'semester_reg', label: 'Semester registration', href: '/admin/semester-registrations' },
  { key: 'certificates', label: 'Certificates', href: '/admin/certificates' },
  { key: 'graduation', label: 'Graduation', href: '/admin/degree-eligibility' },
];

const STEP_ORDER: Array<keyof WorkflowResponse['steps']> = [
  'admission',
  'fee',
  'enrollment',
  'placement',
  'semester_reg',
  'certificates',
  'graduation',
];

export function RegistrarWorkflowStepper({
  studentUserId,
  orientation = 'horizontal',
  className,
}: {
  studentUserId?: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  const api = useAuthedApi();
  const [workflow, setWorkflow] = useState<WorkflowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentUserId) {
      setWorkflow(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<WorkflowResponse>(REGISTRAR_DESK.workflow(studentUserId));
      setWorkflow(data);
    } catch (e) {
      setWorkflow(null);
      setError(e instanceof Error ? e.message : 'Could not load workflow');
    } finally {
      setLoading(false);
    }
  }, [api, studentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (studentUserId && loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading student workflow…
      </div>
    );
  }

  if (studentUserId && error) {
    return (
      <p className={cn('rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive', className)}>
        {error}
      </p>
    );
  }

  const isVertical = orientation === 'vertical';

  return (
    <div
      className={cn(
        isVertical ? 'flex flex-col gap-3' : 'flex flex-wrap items-start gap-2 md:gap-0',
        className,
      )}
      aria-label="Registrar student lifecycle workflow"
    >
      {(studentUserId && workflow ? STEP_ORDER : STATIC_STEPS.map((s) => s.key)).map((key, idx, arr) => {
        const step = workflow?.steps[key as keyof WorkflowResponse['steps']];
        const staticStep = STATIC_STEPS.find((s) => s.key === key);
        const label = step?.label ?? staticStep?.label ?? String(key);
        const detail = step?.detail;
        const completed = step?.completed ?? false;
        const href = staticStep?.href;
        const isLast = idx === arr.length - 1;

        const content = (
          <>
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                completed
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                  : 'border-sgvu-navy/20 bg-white text-sgvu-navy/40',
              )}
            >
              {completed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-wide text-sgvu-navy">{label}</span>
              {detail ? (
                <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
              ) : href && !studentUserId ? (
                <span className="block text-[11px] text-sgvu-gold">Open desk →</span>
              ) : null}
            </span>
          </>
        );

        return (
          <div
            key={String(key)}
            className={cn(
              'flex items-center gap-2',
              isVertical ? 'w-full' : 'min-w-[120px] flex-1',
            )}
          >
            {href && !studentUserId ? (
              <Link
                href={href}
                className="flex flex-1 items-center gap-2 rounded-xl border border-sgvu-navy/10 bg-white p-2.5 transition hover:border-sgvu-gold/40 hover:bg-sgvu-surface/60"
              >
                {content}
              </Link>
            ) : (
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-sgvu-navy/10 bg-white p-2.5">
                {content}
              </div>
            )}
            {!isLast && !isVertical ? (
              <div className="hidden h-px flex-1 bg-sgvu-navy/15 md:block" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
