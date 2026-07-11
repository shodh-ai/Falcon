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
  getActiveWorkspaceRoleFromPath,
  getDashboardPathForRole,
  getWorkspaceLabelForRole,
  getWorkspaceShortLabelForRole,
} from '@/lib/auth-routing';
import { isRoleWorkspaceEnabled } from '@/lib/launch-modules';
import { HEADER_CONTROL_CLASS } from '@/components/layout/header-styles';
import { cn } from '@/lib/utils';

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const roles = Array.from(new Set(user?.roles?.length ? user.roles : user?.role ? [user.role] : [])).filter(
    (role) => isRoleWorkspaceEnabled(role),
  );

  if (roles.length <= 1) return null;

  const pathRole = getActiveWorkspaceRoleFromPath(pathname, roles);
  const activeRole = pathRole ?? user?.primaryRole ?? user?.role ?? roles[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-10 shrink-0 gap-2 inline-flex', HEADER_CONTROL_CLASS)}
          title={getWorkspaceLabelForRole(activeRole)}
        >
          <BriefcaseBusiness className="h-4 w-4 shrink-0 text-sgvu-gold" />
          <span className="whitespace-nowrap">{getWorkspaceShortLabelForRole(activeRole)}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Falcon Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => {
          const active = role === activeRole;
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => router.push(getDashboardPathForRole(role))}
              className="cursor-pointer"
            >
              <BriefcaseBusiness className="mr-2 h-4 w-4" />
              <span className="flex-1">{getWorkspaceLabelForRole(role)}</span>
              {active && <Check className="h-4 w-4 text-sgvu-gold" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
