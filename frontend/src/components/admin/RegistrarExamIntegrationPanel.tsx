'use client';

import Link from 'next/link';
import { ArrowRight, FileText, GraduationCap, Lock, ScrollText, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const EXAM_CELL_ROLES = new Set([
  'ExamCell',
  'SuperAdmin',
  'DeputyCOE',
  'ExamAdmin',
  'ExamOperator',
]);

const EXAM_LINKS = [
  {
    href: '/exam-cell/transcripts',
    label: 'Transcripts',
    description: 'Official transcript generation and verification.',
    icon: ScrollText,
    requiredRoles: ['ExamCell', 'DeputyCOE', 'ExamAdmin', 'ExamOperator', 'SuperAdmin'],
  },
  {
    href: '/exam-cell/degree-audit',
    label: 'Degree audit',
    description: 'Degree eligibility checks before convocation.',
    icon: GraduationCap,
    requiredRoles: ['ExamCell', 'DeputyCOE', 'ExamAdmin', 'ExamOperator', 'SuperAdmin'],
  },
  {
    href: '/exam-cell/grade-cards',
    label: 'Grade cards',
    description: 'Semester grade cards and publication.',
    icon: FileText,
    requiredRoles: ['ExamCell', 'DeputyCOE', 'ExamAdmin', 'ExamOperator', 'SuperAdmin'],
  },
  {
    href: '/exam-cell/results',
    label: 'Results & declaration',
    description: 'Result sessions, dean approval, and COE declaration.',
    icon: ShieldCheck,
    requiredRoles: ['ExamCell', 'DeputyCOE', 'ExamAdmin', 'ExamOperator', 'SuperAdmin'],
  },
] as const;

const REGISTRAR_LINKS = [
  {
    href: '/admin-ops/convocation',
    label: 'Convocation & certificates',
    description: 'Certificate batches and DigiLocker export.',
    icon: GraduationCap,
    requiredRoles: [] as string[],
  },
  {
    href: '/dean/inbox',
    label: 'Dean result approvals',
    description: 'Dean approval status before COE declaration.',
    icon: ShieldCheck,
    requiredRoles: ['Dean', 'SuperAdmin'],
  },
] as const;

function userRoles(user: ReturnType<typeof useAuth>['user']) {
  const roles = new Set<string>();
  if (user?.role) roles.add(user.role);
  if (user?.primaryRole) roles.add(user.primaryRole);
  for (const r of user?.roles ?? []) roles.add(r);
  return roles;
}

function hasAnyRole(userRolesSet: Set<string>, required: readonly string[]) {
  if (!required.length) return true;
  return required.some((role) => userRolesSet.has(role));
}

function LinkTile({
  href,
  label,
  description,
  icon: Icon,
  slug,
}: {
  href: string;
  label: string;
  description: string;
  icon: typeof GraduationCap;
  slug: string | undefined;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-sgvu-navy/10 bg-white p-4 shadow-sm transition hover:border-sgvu-gold/50 hover:shadow-md"
      data-testid={`registrar-exam-link-${slug}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-gold">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold text-sgvu-navy">
          {label}
          <ArrowRight
            className="h-3.5 w-3.5 text-sgvu-gold opacity-0 transition group-hover:opacity-100"
            aria-hidden
          />
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}

function LockedTile({
  label,
  description,
  icon: Icon,
  slug,
}: {
  label: string;
  description: string;
  icon: typeof GraduationCap;
  slug: string | undefined;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-dashed border-sgvu-navy/15 bg-sgvu-navy/[0.02] p-4"
      data-testid={`registrar-exam-gate-${slug}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sgvu-navy/70">{label}</span>
          <Badge
            variant="outline"
            className="gap-1 border-sgvu-navy/15 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            <Lock className="h-2.5 w-2.5" aria-hidden />
            Exam Cell
          </Badge>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </div>
  );
}

export function RegistrarExamIntegrationPanel({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const roles = userRoles(user);
  const canAccessExamCell = [...EXAM_CELL_ROLES].some((role) => roles.has(role));
  const links = [...REGISTRAR_LINKS, ...EXAM_LINKS];

  const available = links.filter((link) => hasAnyRole(roles, link.requiredRoles));
  const locked = links.filter((link) => !hasAnyRole(roles, link.requiredRoles));

  return (
    <Card
      className="border-sgvu-navy/10 bg-white shadow-sm"
      data-testid="registrar-exam-integration"
    >
      <CardHeader className={cn(compact ? 'pb-3' : undefined)}>
        <CardTitle className="text-lg text-sgvu-navy">Examination coordination</CardTitle>
        <CardDescription>
          Jump into convocation and Examination Cell workflows — no duplicate tools here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!canAccessExamCell && locked.length > 0 ? (
          <div className="rounded-xl border border-sgvu-gold/30 bg-sgvu-gold/5 px-4 py-3 text-sm text-sgvu-navy">
            <p className="font-medium">Examination Cell tools need a COE workspace</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              You are signed in as {user?.primaryRole ?? user?.role ?? 'Registrar'}. Open those
              workflows with an Examination Cell account, or ask COE to run them.
            </p>
          </div>
        ) : null}

        {available.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
              Available to you
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {available.map((link) => (
                <LinkTile
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  description={link.description}
                  icon={link.icon}
                  slug={link.href.split('/').filter(Boolean).pop()}
                />
              ))}
            </div>
          </div>
        ) : null}

        {locked.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Examination Cell only
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {locked.map((link) => (
                <LockedTile
                  key={link.href}
                  label={link.label}
                  description={link.description}
                  icon={link.icon}
                  slug={link.href.split('/').filter(Boolean).pop()}
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
