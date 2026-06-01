'use client';

import Link from 'next/link';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
export default function IqacTasksPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <IqacPageHeader
        title="Falcon Core Tasks"
        description="Monthly AI-audited compliance submissions from faculty and staff."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task Master</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Schedule recurring monthly Falcon Core tasks by role.</p>
            <Button asChild size="sm">
              <Link href="/iqac/task-master">Open Task Master</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Document Vault</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Review Gemini PDF extractions from faculty submissions.</p>
            <Button asChild size="sm">
              <Link href="/iqac/document-vault">Open Vault</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Achievements</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Verified certificates for NAAC student outcome metrics.</p>
            <Button asChild size="sm">
              <Link href="/iqac/student-achievements">View achievements</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
