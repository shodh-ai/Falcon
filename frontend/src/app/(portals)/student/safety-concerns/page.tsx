'use client';

import { useState } from 'react';
import { SafetyConcernForm } from '@/components/safety/SafetyConcernForm';
import { SafetyNoticesPanel } from '@/components/safety/SafetyNoticesPanel';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { cn } from '@/lib/utils';

export default function StudentSafetyPage() {
  const [activeTab, setActiveTab] = useState<'concerns' | 'notices'>('concerns');

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Safety & Welfare"
        description="Report safety concerns, ragging, or sexual harassment, and view official notices."
      />
      <div className="flex w-full overflow-hidden rounded-xl bg-muted/40 p-1 lg:w-[400px]">
        <button
          onClick={() => setActiveTab('concerns')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            activeTab === 'concerns'
              ? 'bg-sgvu-navy text-white shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          )}
        >
          Report a Concern
        </button>
        <button
          onClick={() => setActiveTab('notices')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            activeTab === 'notices'
              ? 'bg-sgvu-navy text-white shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          )}
        >
          Safety Notices
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'concerns' ? (
          <SafetyConcernForm />
        ) : (
          <SafetyNoticesPanel
            title="Safety Notices"
            description="Official notices when a safety concern involving you is under review or has been closed by the Disciplinary Committee. Do not contact any student about these matters."
          />
        )}
      </div>
    </StudentPageShell>
  );
}
