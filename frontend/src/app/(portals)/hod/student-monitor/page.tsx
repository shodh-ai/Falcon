'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WorkspaceScaffold } from '@/components/workspaces/WorkspaceScaffold';
import { hodPages } from '@/lib/workspace-pages';

function StudentMonitorContent() {
  const searchParams = useSearchParams();
  const lowOnly = searchParams.get('lowAttendance') !== 'false';
  const base = hodPages.studentMonitor;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <Link
          href="/hod/student-monitor?lowAttendance=true"
          className={`rounded-lg px-3 py-1.5 border ${lowOnly ? 'bg-sgvu-navy text-white border-sgvu-navy' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          Low attendance only
        </Link>
        <Link
          href="/hod/student-monitor?lowAttendance=false"
          className={`rounded-lg px-3 py-1.5 border ${!lowOnly ? 'bg-sgvu-navy text-white border-sgvu-navy' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          All department students
        </Link>
        <Link
          href="/hod/students/defaulters"
          className="rounded-lg px-3 py-1.5 border bg-white text-sgvu-navy border-slate-200 hover:bg-slate-50"
        >
          Defaulters (&lt;75%)
        </Link>
      </div>
      <WorkspaceScaffold
        config={{
          ...base,
          endpoint: `/api/academics/hod/student-monitor?lowAttendance=${lowOnly}`,
          subtitle: lowOnly
            ? base.subtitle
            : 'All department students with attendance averages and CGPA.',
        }}
      />
    </div>
  );
}

export default function HodStudentMonitorPage() {
  return (
    <Suspense fallback={null}>
      <StudentMonitorContent />
    </Suspense>
  );
}
