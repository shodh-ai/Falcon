'use client';

import { PHD_PIPELINE, phdStatusLabel, type PhdCandidate } from '@/lib/phd-lifecycle';
import { cn } from '@/lib/utils';

export function PhdPipeline({ candidate }: { candidate: PhdCandidate }) {
  const stageIdx = PHD_PIPELINE.findIndex((s) => s.key === candidate.lifecycle_stage);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {PHD_PIPELINE.map((step, idx) => {
          const active = step.key === candidate.lifecycle_stage;
          const done = stageIdx > idx || candidate.lifecycle_status === 'DEGREE_AWARDED';
          return (
            <span
              key={step.key}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                done && 'bg-emerald-100 text-emerald-800',
                active && !done && 'bg-sgvu-navy text-white',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {step.label}
            </span>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        Current: <span className="font-medium text-sgvu-navy">{phdStatusLabel(candidate.lifecycle_status)}</span>
        {candidate.pending_actor_role ? (
          <> · Pending: <span className="font-medium">{candidate.pending_actor_role.replace(/_/g, ' ')}</span></>
        ) : null}
      </p>
    </div>
  );
}
