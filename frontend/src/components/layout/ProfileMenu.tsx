'use client';

import { CreditCard, LogOut, Settings, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  getActiveWorkspaceRoleFromPath,
  getWorkspaceLabelForRole,
  resolveProfileHref,
  getSettingsHrefFromPath,
} from '@/lib/auth-routing';
import { isCampusAdminFamilyRole } from '@/lib/campus-admin.roles';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProfileMenuProps {
  profileHref?: string;
}

export function ProfileMenu({ profileHref }: ProfileMenuProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const roles = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  const pathRole = getActiveWorkspaceRoleFromPath(pathname, roles);
  const workspaceRole = pathRole ?? user?.primaryRole ?? user?.role ?? 'Student';
  const resolvedProfileHref = resolveProfileHref(pathname, workspaceRole, profileHref);
  const settingsHref = getSettingsHrefFromPath(pathname, workspaceRole);

  const headerDisplayName = (() => {
    const roleCandidates = [
      workspaceRole,
      user?.primaryRole,
      user?.role,
      ...(user?.roles ?? []),
    ].filter(Boolean) as string[];
    if (roleCandidates.some(isCampusAdminFamilyRole)) {
      return 'Campus Admin';
    }
    return user?.name ?? 'Guest';
  })();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 shrink-0 gap-2 rounded-lg px-2 hover:bg-sgvu-surface/80 touch-target">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback>{user?.name?.charAt(0) ?? 'U'}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-sgvu-navy lg:inline xl:max-w-[12rem]">
            {headerDisplayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-semibold">{headerDisplayName}</p>
          <p className="text-xs font-normal text-muted-foreground">
            {getWorkspaceLabelForRole(workspaceRole)}
          </p>
          {user?.roles && user.roles.length > 1 && !user.roles.every(isCampusAdminFamilyRole) && (
            <p className="mt-1 text-[11px] font-normal text-muted-foreground">
              Roles: {user.roles.join(', ')}
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(resolvedProfileHref)}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Coming Soon" className="justify-between">
          <span className="flex items-center">
            <CreditCard className="mr-2 h-4 w-4" />
            <span>ID Card</span>
          </span>
          <span className="text-[9px] font-bold tracking-wider text-sgvu-gold bg-sgvu-gold/10 px-1.5 py-0.5 rounded uppercase shrink-0">
            Coming Soon
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(settingsHref)}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
