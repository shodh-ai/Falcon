'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getStudentLandingPath } from '@/lib/student-access';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';

export default function StudentPortalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { user } = useAuth();
  const home = getStudentLandingPath(user?.roles?.length ? user.roles : user?.primaryRole ?? user?.role);

  return (
    <StudentPageShell width="4xl">
      <div role="alert">
        <StudentEmptyState
          icon={AlertCircle}
          title="This page could not be displayed"
          description="Try loading it again, or return to your Student Portal home."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" onClick={retry}>Try again</Button>
              <Button asChild variant="outline"><Link href={home}>Portal home</Link></Button>
            </div>
          }
        />
      </div>
    </StudentPageShell>
  );
}
