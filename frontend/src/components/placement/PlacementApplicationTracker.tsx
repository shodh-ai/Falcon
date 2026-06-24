'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLACEMENT_TRACKER_STEPS, PLACEMENT_STAGE_LABELS, type PlacementPipelineStage } from '@/lib/placement';

type Props = {
  stage: PlacementPipelineStage;
  rejectedAtStage?: PlacementPipelineStage | null;
  compact?: boolean;
};

const MOBILE_STAGE_LABELS: Partial<Record<PlacementPipelineStage, string>> = {
  APTITUDE_CLEARED: 'Aptitude',
  TECH_INTERVIEW: 'Tech',
  HR_INTERVIEW: 'HR',
};

export function PlacementApplicationTracker({ stage, rejectedAtStage, compact }: Props) {
  const isRejected = stage === 'REJECTED';
  const activeIndex = isRejected
    ? PLACEMENT_TRACKER_STEPS.indexOf(rejectedAtStage ?? 'APPLIED')
    : PLACEMENT_TRACKER_STEPS.indexOf(stage);

  return (
    <div className={cn('w-full', compact ? 'py-1' : 'py-2')}>
      <div className="flex items-center">
        {PLACEMENT_TRACKER_STEPS.map((step, index) => {
          const done = !isRejected && index < activeIndex;
          const current = !isRejected && index === activeIndex;
          const rejectedHere = isRejected && index === activeIndex;
          const upcoming = index > activeIndex;

          return (
            <div key={step} className="flex flex-1 items-center">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition',
                  rejectedHere && 'border-red-500 bg-red-500 text-white',
                  current && !rejectedHere && 'border-emerald-500 bg-emerald-500 text-white',
                  done && 'border-emerald-500 bg-emerald-50 text-emerald-700',
                  upcoming && !rejectedHere && 'border-border bg-muted text-muted-foreground',
                )}
              >
                {rejectedHere ? (
                  <X className="h-3.5 w-3.5" />
                ) : done || current ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  index + 1
                )}
              </div>
              {index < PLACEMENT_TRACKER_STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-1 h-0.5 min-w-[0.35rem] flex-1 rounded-full',
                    rejectedHere ? 'bg-red-300' : done ? 'bg-emerald-400' : 'bg-border',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-1.5 flex">
          {PLACEMENT_TRACKER_STEPS.map((step, index) => {
            const done = !isRejected && index < activeIndex;
            const current = !isRejected && index === activeIndex;
            const rejectedHere = isRejected && index === activeIndex;
            const upcoming = index > activeIndex;
            const label = PLACEMENT_STAGE_LABELS[step];
            const mobileLabel = MOBILE_STAGE_LABELS[step] ?? label;

            return (
              <div key={step} className="flex flex-1 justify-center px-0.5">
                <span
                  className={cn(
                    'min-h-[2rem] max-w-[3.25rem] text-center text-[9px] font-medium leading-tight sm:max-w-[4.5rem] sm:text-[10px]',
                    rejectedHere && 'text-red-600',
                    current && !rejectedHere && 'text-emerald-700',
                    done && 'text-emerald-600',
                    upcoming && 'text-muted-foreground',
                  )}
                >
                  <span className="sm:hidden">{mobileLabel}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isRejected && !compact && (
        <p className="mt-2 text-xs font-medium text-red-600">
          Not progressed beyond {PLACEMENT_STAGE_LABELS[rejectedAtStage ?? 'APPLIED']}
        </p>
      )}
      {stage === 'OFFERED' && !compact && (
        <p className="mt-2 text-xs font-semibold text-emerald-600">Offer received</p>
      )}
    </div>
  );
}
