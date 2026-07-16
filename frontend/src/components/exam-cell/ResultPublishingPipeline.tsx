'use client';

import { CheckCircle2, Lock, Shield, Send, ClipboardCheck, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PipelineStepKey = 'faculty_lock' | 'coe_audit' | 'dean_approval' | 'publish';

export type PipelineStep = {
  key: PipelineStepKey;
  label: string;
  description: string;
  icon: LucideIcon;
  status: 'pending' | 'active' | 'complete' | 'blocked';
  statusLabel: string;
};

type Props = {
  steps: PipelineStep[];
  compact?: boolean;
};

export function ResultPublishingPipeline({ steps, compact }: Props) {
  return (
    <div className={cn('space-y-3', compact ? '' : 'rounded-lg border bg-slate-50/50 p-4')}>
      {!compact && (
        <p className="text-sm font-semibold text-sgvu-navy">Result Publishing Pipeline</p>
      )}
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'md:grid-cols-4')}>
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.key} className="relative">
              <div
                className={cn(
                  'rounded-lg border p-3',
                  step.status === 'complete' && 'border-emerald-200 bg-emerald-50/80',
                  step.status === 'active' && 'border-sgvu-gold/50 bg-sgvu-gold/5 ring-1 ring-sgvu-gold/30',
                  step.status === 'blocked' && 'border-red-200 bg-red-50/60',
                  step.status === 'pending' && 'border-slate-200 bg-white opacity-70',
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  {step.status === 'complete' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Icon className="h-4 w-4 text-sgvu-navy" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Step {idx + 1}
                  </span>
                </div>
                <p className="text-sm font-semibold text-sgvu-navy">{step.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                <Badge
                  className="mt-2"
                  variant={
                    step.status === 'complete'
                      ? 'default'
                      : step.status === 'blocked'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {step.statusLabel}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const PIPELINE_ICONS = {
  faculty_lock: Lock,
  coe_audit: ClipboardCheck,
  dean_approval: Shield,
  publish: Send,
};
