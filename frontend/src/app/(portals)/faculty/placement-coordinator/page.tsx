'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
  FacultyEmptyState,
} from '@/components/faculty';
import { FacultyPlacementCoordinatorPanel } from '@/components/faculty/FacultyPlacementCoordinatorPanel';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { isFacultyDemoModeEnabled } from '@/lib/faculty-demo-mode';

export default function FacultyPlacementCoordinatorPage() {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [isCoordinator, setIsCoordinator] = useState(false);

  useEffect(() => {
    void api
      .get<{ is_coordinator: boolean }>('/api/academics/faculty/placement/coordinator-status')
      .then((res) => setIsCoordinator(Boolean(res.is_coordinator) || isFacultyDemoModeEnabled()))
      .catch(() => setIsCoordinator(isFacultyDemoModeEnabled()))
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) {
    return (
      <FacultyPageShell>
        <div className="py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
        </div>
      </FacultyPageShell>
    );
  }

  if (!isCoordinator) {
    return (
      <FacultyPageShell>
        <FacultyPageHeader
          title="Placement Coordinator"
          description="Manage department placement drives and student registrations."
        />
        <FacultyPanel title="Access">
          <FacultyEmptyState
            title="Not assigned as coordinator"
            description="Your HOD can assign you as the department placement coordinator. Once assigned, this workspace will unlock here."
            className="py-12"
          />
          <div className="mt-4 flex justify-center">
            <Button asChild variant="outline">
              <Link href="/faculty/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </FacultyPanel>
      </FacultyPageShell>
    );
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Placement Coordinator"
        description="Publish drives, share Google Forms, and track student registrations for your department."
      />
      <FacultyPlacementCoordinatorPanel />
    </FacultyPageShell>
  );
}
