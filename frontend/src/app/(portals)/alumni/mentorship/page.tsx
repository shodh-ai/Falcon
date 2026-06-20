'use client';

import { useEffect, useState } from 'react';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { EcellMentorInbox } from '@/components/ecell/EcellMentorInbox';

type Profile = { opt_in_mentorship: boolean };

export default function AlumniMentorshipPage() {
  const api = useAuthedApi();
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    void api.get<Profile>('/api/alumni/me/profile').then((p) => setOptIn(p.opt_in_mentorship));
  }, [api]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="Mentorship Program"
        description="When enabled, current students can discover you in their Mentorship tab and request career guidance."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mentor availability</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            Status:{' '}
            <span className={optIn ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>
              {optIn ? 'Active — visible to students' : 'Not opted in'}
            </span>
          </p>
          <p className="text-muted-foreground">
            Toggle mentorship on your{' '}
            <a href="/alumni/profile" className="text-sgvu-navy underline">
              Career Profile
            </a>
            .
          </p>
        </CardContent>
      </Card>
      <EcellMentorInbox />
    </div>
  );
}
