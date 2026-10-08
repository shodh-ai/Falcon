'use client';

import { CourseMapperPanel } from '@/components/academics/CourseMapperPanel';
import { HodPageFrame } from '@/components/hod/HodPagePrimitives';

export default function HodCourseMapperPage() {
  return (
    <HodPageFrame>
      <div className="p-4 md:p-6">
        <CourseMapperPanel />
      </div>
    </HodPageFrame>
  );
}
