'use client';

import { Suspense } from 'react';
import { UniversityDirectoryHub } from '@/components/directory/UniversityDirectoryHub';
import { FalconLoader } from '@/components/brand/FalconLoader';

export default function DirectoryPage() {
  return (
    <Suspense fallback={<FalconLoader label="Loading university directory…" />}>
      <UniversityDirectoryHub />
    </Suspense>
  );
}
