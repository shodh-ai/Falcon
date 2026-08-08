'use client';

import { Suspense } from 'react';
import { StudentAcademicCalendarWorkspace } from '@/components/student/academic-calendar/StudentAcademicCalendarWorkspace';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';

export default function StudentAcademicCalendarPage() {
  return (
    <Suspense fallback={<StudentLoadingState label="Loading academic calendar…" />}>
      <StudentAcademicCalendarWorkspace />
    </Suspense>
  );
}
