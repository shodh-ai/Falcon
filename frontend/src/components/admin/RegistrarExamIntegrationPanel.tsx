'use client';

import Link from 'next/link';
import { ArrowRight, FileText, GraduationCap, ScrollText, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';

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
    description: 'Official transcript generation and verification (Examination Cell).',
    icon: ScrollText,
    requiredRoles: ['ExamCell', 'DeputyCOE', 'ExamAdmin', 'ExamOperator', 'SuperAdmin'],
  },
  {
    href: '/exam-cell/degree-audit',
    label: 'Degree audit',
    description: 'Degree eligibility and audit before convocation.',
    icon: GraduationCap,
    requiredRoles: ['ExamCell', 'DeputyCOE', 'ExamAdmin', 'ExamOperator', 'SuperAdmin'],
  },
  {
    href: '/exam-cell/grade-cards',
    label: 'Grade cards',
    description: 'Semester grade cards and publication workflow.',
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
    description: 'Registrar-owned certificate batches and DigiLocker export.',
    icon: GraduationCap,
    requiredRoles: [] as string[],
  },
  {
    href: '/dean/inbox',
    label: 'Dean result approvals',
    description: 'Track dean approval status before COE can declare results.',
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

export function RegistrarExamIntegrationPanel({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const roles = userRoles(user);
  const canAccessExamCell = [...EXAM_CELL_ROLES].some((role) => roles.has(role));
  const links = [...REGISTRAR_LINKS, ...EXAM_LINKS];

  return (
    <Card data-testid="registrar-exam-integration">
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <CardTitle className="text-base">Examination coordination</CardTitle>
        <CardDescription>
          Jump to existing Examination Cell and convocation workflows — no duplicate tools here.
          Examination Cell routes require COE workspace access.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => {
          const allowed = hasAnyRole(roles, link.requiredRoles);
          const slug = link.href.split('/').filter(Boolean).pop();

          if (!allowed) {
            return (
              <div
                key={link.href}
                className="rounded-xl border border-dashed bg-muted/20 p-3"
                data-testid={`registrar-exam-gate-${slug}`}
              >
                <div className="flex items-start gap-3">
                  <link.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-sgvu-navy">{link.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Requires {link.requiredRoles.join(' or ')} workspace. You are signed in as{' '}
                      {user?.primaryRole ?? user?.role ?? 'Registrar'} — coordinate with Examination Cell
                      or switch workspace if you hold a COE role.
                    </span>
                    {!canAccessExamCell ? (
                      <span className="mt-2 block text-xs font-medium text-sgvu-navy">
                        Open Examination Workspace: sign in with an Examination Cell account or ask COE
                        to run {link.label.toLowerCase()}.
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-start gap-3 rounded-xl border p-3 transition hover:border-sgvu-navy/40 hover:bg-muted/30"
              data-testid={`registrar-exam-link-${slug}`}
            >
              <link.icon className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium text-sgvu-navy group-hover:underline">
                  {link.label}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden />
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{link.description}</span>
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
