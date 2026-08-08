'use client';

import { BriefcaseBusiness, Check, ChevronsUpDown } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import {
  findAvailableWorkspace,
  getAvailableWorkspaces,
  resolveActiveWorkspaceRole,
} from '@/lib/available-workspaces';
import { HEADER_CONTROL_CLASS } from '@/components/layout/header-styles';
import { cn } from '@/lib/utils';

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const workspaces = getAvailableWorkspaces(user);

  if (workspaces.length <= 1) return null;

  const activeRole = resolveActiveWorkspaceRole(pathname, user, workspaces);
  const activeWorkspace = findAvailableWorkspace(workspaces, activeRole) ?? workspaces[0];
  const triggerShortLabel = activeWorkspace.shortLabel;
  const triggerTitle = activeWorkspace.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 px-0 sm:h-10 sm:w-auto sm:px-3',
            HEADER_CONTROL_CLASS,
          )}
          title={triggerTitle}
          aria-label={triggerTitle}
        >
          <BriefcaseBusiness className="h-4 w-4 shrink-0 text-sgvu-gold" />
          <span className="hidden whitespace-nowrap sm:inline">{triggerShortLabel}</span>
          <ChevronsUpDown className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Falcon Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => {
          const active = workspace.roleKey === activeWorkspace.roleKey;
          return (
            <DropdownMenuItem
              key={workspace.roleKey}
              onClick={() => router.push(workspace.href)}
              className="cursor-pointer"
            >
              <BriefcaseBusiness className="mr-2 h-4 w-4" />
              <span className="flex-1">{workspace.label}</span>
              {active && <Check className="h-4 w-4 text-sgvu-gold" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
