'use client';

import { use } from 'react';
import StudentLibraryBookPage from './page-inner';

export default function Page({ params }: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = use(params);
  return <StudentLibraryBookPage catalogId={catalogId} />;
}
