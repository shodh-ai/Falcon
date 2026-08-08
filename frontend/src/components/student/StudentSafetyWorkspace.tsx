'use client';

import { useState } from 'react';
import {
  Bell,
  FileWarning,
  HeartHandshake,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { SafetyConcernForm } from '@/components/safety/SafetyConcernForm';
import { SafetyNoticesPanel } from '@/components/safety/SafetyNoticesPanel';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { cn } from '@/lib/utils';

const TABS = [
  {
    id: 'concerns' as const,
    label: 'Report a concern',
    short: 'Report',
    icon: FileWarning,
    hint: 'Submit confidentially',
  },
  {
    id: 'notices' as const,
    label: 'Safety notices',
    short: 'Notices',
    icon: Bell,
    hint: 'Official updates for you',
  },
];

export function StudentSafetyWorkspace() {
  const [activeTab, setActiveTab] = useState<'concerns' | 'notices'>('concerns');

  return (
    <StudentPageShell width="5xl" className="space-y-6">
      <StudentPageHeader
        title="Campus Safety"
        description="A confidential channel for ragging, bullying, and sexual harassment. Your identity is protected from the person you report."
        eyebrow="Student Welfare"
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <p className="mt-3 text-sm font-semibold text-sgvu-navy">Confidential</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Reports go to the Disciplinary Committee / ICC. Accused parties are not told who filed the case.
          </p>
        </div>
        <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sgvu-gold/20 text-sgvu-navy">
            <HeartHandshake className="h-4 w-4" />
          </div>
          <p className="mt-3 text-sm font-semibold text-sgvu-navy">Support first</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Proof is optional. You can still submit if you only know a name, hostel block, or description.
          </p>
        </div>
        <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Phone className="h-4 w-4" />
          </div>
          <p className="mt-3 text-sm font-semibold text-sgvu-navy">Need help now?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {process.env.NEXT_PUBLIC_ANTI_RAGGING_HELPLINE?.trim() ? (
              <>
                Anti-ragging helpline{' '}
                <a
                  href={`tel:${process.env.NEXT_PUBLIC_ANTI_RAGGING_HELPLINE.trim().replace(/\s/g, '')}`}
                  className="font-semibold text-sgvu-navy underline-offset-2 hover:underline"
                >
                  {process.env.NEXT_PUBLIC_ANTI_RAGGING_HELPLINE.trim()}
                </a>
                {' · '}
              </>
            ) : (
              <>Ask your warden or security desk for the published anti-ragging helpline. </>
            )}
            Campus security / warden available 24×7.
          </p>
        </div>
      </section>

      <div
        role="tablist"
        aria-label="Safety sections"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-sgvu-navy/10 bg-slate-50/80 p-1.5"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-3 text-left transition',
                active
                  ? 'bg-sgvu-navy text-white shadow-sm'
                  : 'text-sgvu-navy/80 hover:bg-white hover:text-sgvu-navy',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  active ? 'bg-white/15' : 'bg-white text-sgvu-navy',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  <span className="sm:hidden">{tab.short}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
                <span
                  className={cn(
                    'mt-0.5 hidden text-[11px] sm:block',
                    active ? 'text-white/70' : 'text-muted-foreground',
                  )}
                >
                  {tab.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="min-h-[280px]">
        {activeTab === 'concerns' ? <SafetyConcernForm /> : <SafetyNoticesPanel embedded />}
      </div>
    </StudentPageShell>
  );
}
