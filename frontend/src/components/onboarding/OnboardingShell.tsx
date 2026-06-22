'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Check, ShieldCheck } from 'lucide-react';
import { FalconLogo } from '@/components/brand/FalconLogo';
import { cn } from '@/lib/utils';
import type { PortalOnboardingConfig } from '@/lib/onboarding/portal-onboarding';

const STEPS = [
  { n: 1, label: 'Secure your account', sub: 'Set a new password', match: 'step-1' },
  { n: 2, label: 'Complete your profile', sub: 'Details & documents', match: 'step-2' },
  { n: 3, label: 'Admin verification', sub: 'Review & approval', match: 'step-3' },
] as const;

function useCurrentStep() {
  const pathname = usePathname() ?? '';
  return STEPS.find((s) => pathname.includes(s.match))?.n ?? 1;
}

function StepList({ vertical }: { vertical?: boolean }) {
  const current = useCurrentStep();

  return (
    <ol className={cn(vertical ? 'space-y-0' : 'flex items-start justify-between gap-2')}>
      {STEPS.map((step, idx) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <li
            key={step.n}
            className={cn(
              vertical ? 'relative flex gap-3 pb-8 last:pb-0' : 'flex min-w-0 flex-1 flex-col items-center gap-2',
            )}
          >
            {vertical && idx < STEPS.length - 1 ? (
              <div
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-20px)] w-px',
                  done ? 'bg-emerald-400/80' : 'bg-white/20',
                )}
              />
            ) : null}

            <div className={cn('flex items-start gap-3', !vertical && 'flex-col items-center')}>
              <span
                className={cn(
                  'relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                  vertical && done && 'bg-emerald-500 text-white',
                  vertical && active && 'bg-white text-sgvu-navy ring-4 ring-white/25',
                  vertical && !done && !active && 'bg-white/15 text-white/70',
                  !vertical && done && 'bg-emerald-600 text-white',
                  !vertical && active && 'bg-sgvu-navy text-white ring-4 ring-sgvu-navy/15',
                  !vertical && !done && !active && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : step.n}
              </span>

              <div className={cn(vertical ? 'min-w-0 pt-0.5' : 'text-center')}>
                <p
                  className={cn(
                    'text-xs font-semibold leading-tight sm:text-sm',
                    vertical && (active || done ? 'text-white' : 'text-white/65'),
                    !vertical && (active ? 'text-sgvu-navy' : 'text-muted-foreground'),
                  )}
                >
                  {vertical ? step.label : `Step ${step.n}`}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-[10px] leading-snug sm:text-[11px]',
                    vertical ? 'text-white/55' : 'hidden text-muted-foreground sm:block',
                  )}
                >
                  {step.sub}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MobileHeader({ config }: { config: PortalOnboardingConfig }) {
  const current = useCurrentStep();
  return (
    <header className="border-b border-border/60 bg-white/90 backdrop-blur lg:hidden">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="flex items-center gap-3">
          <FalconLogo size={36} />
          <div>
            <p className="text-sm font-semibold text-sgvu-navy">{config.portalLabel} onboarding</p>
            <p className="text-xs text-muted-foreground">Step {current} of 3</p>
          </div>
        </div>
        <div className="mt-5">
          <StepList />
        </div>
      </div>
    </header>
  );
}

export function OnboardingShell({
  config,
  children,
}: {
  config: PortalOnboardingConfig;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f4f6fa] lg:grid lg:grid-cols-[minmax(280px,320px)_1fr]">
      <aside className="relative hidden overflow-hidden bg-sgvu-navy lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sgvu-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />

        <div className="relative flex flex-1 flex-col px-8 py-10">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/95 p-1.5 shadow-sm">
              <FalconLogo size={40} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{config.portalLabel} portal</p>
              <p className="text-xs text-white/60">First-time setup</p>
            </div>
          </div>

          <div className="mt-10">
            <StepList vertical />
          </div>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sgvu-gold" />
              <div>
                <p className="text-sm font-medium text-white">Secure onboarding</p>
                <p className="mt-1 text-xs leading-relaxed text-white/60">
                  Your data is encrypted and reviewed only by authorized university staff.
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <MobileHeader config={config} />

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:max-w-4xl lg:px-10 lg:py-12">
          {children}
        </main>

        <footer className="border-t border-border/40 bg-white/70 py-4 text-center text-[11px] text-muted-foreground lg:hidden">
          Secure onboarding · {config.portalLabel} portal
        </footer>
      </div>
    </div>
  );
}
