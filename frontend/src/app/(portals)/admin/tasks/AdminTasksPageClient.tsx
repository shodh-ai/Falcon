'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BrandedDashboard from '@/components/BrandedDashboard';
import { FalconLoader } from '@/components/brand/FalconLoader';

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

  return <BrandedDashboard hideShell />;
}
