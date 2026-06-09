'use client';

import { Suspense } from 'react';
import { EssLegacyRedirect } from '@/components/self-service/EssLegacyRedirect';

export default function EssOnboardingRedirectPage() {
  return (
    <Suspense fallback={null}>
      <EssLegacyRedirect />
    </Suspense>
  );
}
