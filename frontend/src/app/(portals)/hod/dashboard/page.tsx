'use client';

import { Suspense } from 'react';
import { HodCommandCenter } from '@/components/hod/HodCommandCenter';
import { FalconLoader } from '@/components/brand/FalconLoader';

export default function HodDashboardPage() {
  return (
    <Suspense fallback={<FalconLoader label="Loading Department Command Center…" className="min-h-[40vh]" />}>
      <HodCommandCenter />
    </Suspense>
  );
}
