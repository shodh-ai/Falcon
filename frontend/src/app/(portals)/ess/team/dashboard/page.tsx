'use client';

import { Suspense } from 'react';
import { EssLegacyRedirect } from '@/components/self-service/EssLegacyRedirect';

export default function EssTeamDashboardRedirectPage() {
  return (
    <Suspense fallback={null}>
      <EssLegacyRedirect />
    </Suspense>
  );
}
