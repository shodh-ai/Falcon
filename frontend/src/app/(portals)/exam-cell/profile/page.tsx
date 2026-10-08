'use client';

import Link from 'next/link';
import { Mail, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getWorkspaceLabelForRole } from '@/lib/auth-routing';

const btnPrimary =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

export default function ExamCellProfilePage() {
  const { user, isLoading } = useAuth();
  const role = user?.primaryRole ?? user?.role ?? 'Exam Cell';

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">Examination Cell profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your signed-in identity for the examination workspace.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex items-start gap-3 border-b border-sgvu-navy/10 pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/10 text-sgvu-navy">
              <User className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Profile details</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Contact HR or IT to update official name or email.
              </p>
            </div>
          </div>

          {isLoading && !user ? (
            <div className="grid animate-pulse gap-4 sm:grid-cols-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`space-y-2 ${i === 2 ? 'sm:col-span-2' : ''}`}>
                  <div className="h-3 w-16 rounded bg-sgvu-navy/10" />
                  <div className="h-5 w-48 rounded bg-sgvu-navy/10" />
                </div>
              ))}
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Name</dt>
                <dd className="mt-1.5 text-lg font-semibold text-sgvu-navy">{user?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">
                  Workspace role
                </dt>
                <dd className="mt-1.5">
                  <Badge variant="secondary">{getWorkspaceLabelForRole(role)}</Badge>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/55">Email</dt>
                <dd className="mt-1.5 flex min-w-0 items-center gap-2 font-medium text-sgvu-navy">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{user?.email ?? '—'}</span>
                </dd>
              </div>
            </dl>
          )}

          <div className="flex justify-center border-t border-sgvu-navy/10 pt-4">
            <Button asChild variant="outline" className={btnPrimary}>
              <Link href="/exam-cell/settings">Account settings</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
