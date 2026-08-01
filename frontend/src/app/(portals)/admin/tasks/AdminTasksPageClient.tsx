'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { GovernanceTasksPanel } from '@/components/admin/GovernanceTasksPanel';

export default function AdminTasksPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = searchParams.get('section');

  useEffect(() => {
    if (section === 'uploads') {
      router.replace('/admin/upload-history');
    }
  }, [section, router]);

  if (section === 'uploads') {
    return <FalconLoader label="Opening upload history…" className="min-h-[40vh]" />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <GovernanceTasksPanel />
    </div>
  );
}
