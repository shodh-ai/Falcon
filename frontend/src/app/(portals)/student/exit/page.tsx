'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { ExitAlumniPanel } from '@/components/student/ExitAlumniPanel';
import { DegreeConvocationPanel } from '@/components/student/DegreeConvocationPanel';

type Tab = 'exit' | 'degree';

function tabFromSearchParam(value: string | null): Tab {
  if (value === 'degree' || value === 'certificates' || value === 'convocation') return 'degree';
  return 'exit';
}

export default function StudentGraduationHubPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromSearchParam(searchParams.get('tab')));

  useEffect(() => {
    setTab(tabFromSearchParam(searchParams.get('tab')));
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    const query = next === 'exit' ? '' : `?tab=${next}`;
    router.replace(`/student/exit${query}`, { scroll: false });
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Graduation & Alumni"
        description="Clear no-dues, apply for your degree certificate, and transition to the Alumni network — one hub."
      />

      <StudentTabBar
        tabs={[
          { id: 'exit', label: 'Exit & Alumni', shortLabel: 'Alumni' },
          { id: 'degree', label: 'Degree & Convocation', shortLabel: 'Degree' },
        ]}
        active={tab}
        onChange={selectTab}
      />

      {tab === 'exit' ? <ExitAlumniPanel /> : <DegreeConvocationPanel />}
    </StudentPageShell>
  );
}
