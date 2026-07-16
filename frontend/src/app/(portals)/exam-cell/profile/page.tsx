'use client';

import Link from 'next/link';
import { Mail, User, Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getWorkspaceLabelForRole } from '@/lib/auth-routing';

export default function ExamCellProfilePage() {
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role ?? 'Exam Cell';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="settings" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-5 w-5 text-sgvu-gold" />
            Examination Cell profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</dt>
              <dd className="mt-1 text-lg font-semibold text-sgvu-navy">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace role</dt>
              <dd className="mt-1">
                <Badge variant="secondary">{getWorkspaceLabelForRole(role)}</Badge>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd className="mt-1 flex items-center gap-2 font-medium text-sgvu-navy">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {user?.email ?? '—'}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/exam-cell/settings">
                <Settings className="mr-2 h-4 w-4" />
                Account settings
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
