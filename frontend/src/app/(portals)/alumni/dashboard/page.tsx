'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Profile = {
  name: string;
  verification_status: string;
  needs_career_update: boolean;
  batch_year: number;
  current_organization: string | null;
};

export default function AlumniDashboardPage() {
  const api = useAuthedApi();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    void api.get<Profile>('/api/alumni/me/profile').then(setProfile).catch(() => setProfile(null));
  }, [api]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title={`Welcome back, ${profile?.name?.split(' ')[0] ?? 'Alumni'}`}
        description="Falcon Alumni Network — stay connected, mentor students, and give back to SGVU."
      />

      {profile?.needs_career_update && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p>Your career profile is due for a 6-month update.</p>
            <Button size="sm" asChild>
              <Link href="/alumni/profile">Update now</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification</CardTitle>
          </CardHeader>
          <CardContent className="text-sm capitalize">{profile?.verification_status?.toLowerCase() ?? '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Batch</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-sgvu-navy">{profile?.batch_year ?? '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organization</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{profile?.current_organization ?? 'Not set'}</CardContent>
        </Card>
      </div>
    </div>
  );
}
