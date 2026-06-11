'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { profile360Path } from '@/lib/directory-routes';

/** Legacy route — redirect to workspace-neutral 360° profile. */
export default function LegacyDirectoryProfileRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(profile360Path(id));
  }, [id, router]);

  return <div className="p-6 text-sm text-muted-foreground">Opening profile…</div>;
}
