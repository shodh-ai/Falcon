'use client';

import { Suspense, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FacultyPanel } from '@/components/faculty/FacultyPagePrimitives';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { cn } from '@/lib/utils';

function MultiDepartmentSummaryInner() {
  const { loading, isMultiDepartment, departments, activeDeptId, setActiveDeptId } =
    useTeachingDepartment();

  if (loading || !isMultiDepartment || departments.length < 2) return null;

  return (
    <FacultyPanel
      title={`Teaching in ${departments.length} departments`}
      description="Switch context to manage courses, timetable, and attendance per department."
    >
      <div className="flex flex-wrap gap-2">
        {departments.map((dept) => {
          const active = dept.dept_id === activeDeptId;
          return (
            <button
              key={dept.dept_id}
              type="button"
              onClick={() => setActiveDeptId(dept.dept_id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                active
                  ? 'border-sgvu-gold bg-sgvu-gold/10 text-sgvu-navy'
                  : 'border-sgvu-navy/10 bg-white text-sgvu-navy/80 hover:border-sgvu-gold/40',
              )}
            >
              <Building2 className="h-4 w-4 shrink-0 text-sgvu-gold" />
              <span className="font-medium">{dept.dept_name}</span>
              <Badge variant={active ? 'default' : 'secondary'}>{dept.course_count} courses</Badge>
              <span className="text-xs text-muted-foreground">{dept.weekly_hours}h/week</span>
            </button>
          );
        })}
      </div>
    </FacultyPanel>
  );
}

export function MultiDepartmentTeachingSummary() {
  return (
    <Suspense fallback={null}>
      <MultiDepartmentSummaryInner />
    </Suspense>
  );
}

export function TeachingDepartmentProviderBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={children}>{children}</Suspense>;
}
