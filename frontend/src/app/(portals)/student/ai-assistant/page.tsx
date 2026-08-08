'use client';

import { StudentPageShell } from '@/components/student/StudentPageShell';
import {
  StudentAiAssistantPageHero,
  StudentAiAssistantPanel,
} from '@/components/student/StudentAiAssistant';

export default function StudentAiAssistantPage() {
  return (
    <StudentPageShell width="full" className="pb-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <StudentAiAssistantPageHero />
        <StudentAiAssistantPanel />
      </div>
    </StudentPageShell>
  );
}
