import { Suspense } from 'react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import AdminTasksPageClient from './AdminTasksPageClient';

export default function AdminTasksPage() {
  return (
    <Suspense fallback={<FalconLoader label="Loading governance tasks…" className="min-h-[40vh]" />}>
      <AdminTasksPageClient />
    </Suspense>
  );
}
