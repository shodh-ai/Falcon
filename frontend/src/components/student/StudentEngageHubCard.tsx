'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { EngageHubDestination, EngageHubLiveStat } from '@/lib/student-engage-hub';

export function EngageHubQuickPicker({
  destinations,
}: {
  destinations: EngageHubDestination[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-3 flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
        <div>
          <p className="text-sm font-bold text-sgvu-navy">What do you need?</p>
          <p className="text-xs text-muted-foreground">Tap the option that matches — we&apos;ll take you to the right place.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {destinations.map((destination, index) => {
          const Icon = destination.icon;
          return (
            <motion.div
              key={destination.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                href={destination.href}
                className="group flex items-center gap-3 rounded-xl border border-sgvu-navy/8 bg-sgvu-navy/[0.02] px-3 py-3 text-left transition hover:border-sgvu-gold/40 hover:bg-sgvu-gold/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy text-sgvu-gold">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-sgvu-navy">
                  {destination.intent}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-sgvu-gold opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function EngageHubFundingGuide() {
  return (
    <div className="rounded-[1.5rem] border border-amber-200/60 bg-amber-50/50 p-4 md:p-5">
      <p className="text-sm font-bold text-sgvu-navy">Startup funding or research grant?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        These two are often confused — here is the simple difference:
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sgvu-navy/8 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">E-Cell & Incubation</p>
          <p className="mt-1.5 text-sm font-semibold text-sgvu-navy">For startup & business ideas</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            You pitch a product or company. Includes mentors and founder workspace.
          </p>
        </div>
        <div className="rounded-xl border border-sgvu-navy/8 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">Research Grants</p>
          <p className="mt-1.5 text-sm font-semibold text-sgvu-navy">For academic research projects</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            You work with a faculty guide on a lab or paper. Not for commercial startups.
          </p>
        </div>
      </div>
    </div>
  );
}

export function StudentEngageHubCard({
  destination,
  live,
  index = 0,
  featured = false,
}: {
  destination: EngageHubDestination;
  live?: EngageHubLiveStat;
  index?: number;
  featured?: boolean;
}) {
  const Icon = destination.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + index * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={destination.href}
        className={cn(
          'group relative flex overflow-hidden rounded-[1.75rem] border bg-white transition duration-300',
          'hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:shadow-xl hover:shadow-sgvu-navy/8',
          featured
            ? 'flex-col border-sgvu-navy/12 p-0 sm:flex-row'
            : 'items-start gap-4 border-sgvu-navy/8 p-4 sm:gap-6 sm:p-5',
        )}
      >
        {featured ? (
          <>
            <div className="relative flex min-h-[140px] flex-1 flex-col justify-end bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 p-6 text-white sm:min-h-[180px] sm:max-w-[42%]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(214,182,93,0.22),transparent_55%)]" />
              <div className="absolute -right-4 -top-4 opacity-[0.07]">
                <Icon className="h-36 w-36" strokeWidth={1} />
              </div>
              <div className="relative">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Most popular</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">{destination.label}</h2>
                {live?.highlight ? (
                  <p className="mt-3 line-clamp-2 text-sm font-medium text-white/80">{live.highlight}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-4 p-6">
              <div>
                <p className="rounded-lg bg-sgvu-navy/[0.04] px-3 py-2 text-sm font-medium text-sgvu-navy">
                  {destination.whenToUse}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{destination.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-sgvu-navy">Examples:</span>{' '}
                  {destination.examples.join(' · ')}
                </p>
                {live ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-sgvu-gold/15 px-3 py-1 text-xs font-semibold text-sgvu-navy">
                      {live.primary}
                    </span>
                    {live.secondary ? (
                      <span className="rounded-full bg-sgvu-navy/5 px-3 py-1 text-xs font-medium text-muted-foreground">
                        {live.secondary}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-sgvu-navy transition group-hover:gap-2">
                {destination.ctaLabel}
                <ChevronRight className="h-4 w-4 text-sgvu-gold" />
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-sgvu-gold/[0.04] to-transparent opacity-0 transition group-hover:opacity-100" />
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sgvu-navy text-sgvu-gold shadow-md shadow-sgvu-navy/15 transition group-hover:scale-105 group-hover:shadow-lg">
              <Icon className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <div className="relative min-w-0 flex-1">
              <h2 className="text-lg font-black tracking-tight text-sgvu-navy">{destination.label}</h2>
              <p className="mt-1.5 text-sm font-medium leading-snug text-sgvu-navy/90">{destination.whenToUse}</p>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{destination.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-semibold text-sgvu-navy">Examples:</span>{' '}
                {destination.examples.join(' · ')}
              </p>
              {live ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-sgvu-navy/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-sgvu-navy">
                    {live.primary}
                  </span>
                  {live.secondary ? (
                    <span className="text-[11px] font-medium text-muted-foreground">{live.secondary}</span>
                  ) : null}
                </div>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sgvu-gold transition group-hover:gap-2">
                {destination.ctaLabel}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="relative hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sgvu-navy/10 text-sgvu-navy/40 transition group-hover:border-sgvu-gold group-hover:bg-sgvu-gold group-hover:text-sgvu-navy sm:flex">
              <ChevronRight className="h-5 w-5" />
            </div>
          </>
        )}
      </Link>
    </motion.div>
  );
}

export function StudentEngageHubCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      className={cn(
        'animate-pulse overflow-hidden rounded-[1.75rem] border border-sgvu-navy/8 bg-white',
        featured ? 'h-[180px] sm:h-[220px]' : 'h-[120px] sm:h-[140px]',
      )}
    />
  );
}
