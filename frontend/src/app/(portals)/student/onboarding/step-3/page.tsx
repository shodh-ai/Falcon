'use client';

import { Clock3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function OnboardingStep3Page() {
  return (
    <Card className="border-sgvu-navy/10 shadow-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <Clock3 className="h-7 w-7 text-amber-700" />
        </div>
        <CardTitle className="text-sgvu-navy">Step 3 · Waiting Room</CardTitle>
        <CardDescription>Your profile is under review</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
        <p>
          Your profile is under review by the University Administration. You will receive an email
          once your documents are verified and your portal is unlocked.
        </p>
        <p className="text-xs">
          You cannot access the student dashboard until an administrator approves your submission.
          Please check your official email for updates.
        </p>
      </CardContent>
    </Card>
  );
}
