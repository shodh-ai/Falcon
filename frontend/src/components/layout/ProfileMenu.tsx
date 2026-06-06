'use client';

import { CreditCard, LogOut, Settings, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getActiveWorkspaceRoleFromPath, getWorkspaceLabelForRole } from '@/lib/auth-routing';
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

export function ProfileMenu({ profileHref = '/student/profile' }: ProfileMenuProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const roles = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  const pathRole = getActiveWorkspaceRoleFromPath(pathname, roles);
  const workspaceRole = pathRole ?? user?.primaryRole ?? user?.role ?? 'Student';

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 shrink-0 gap-2 px-2 touch-target">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback>{user?.name?.charAt(0) ?? 'U'}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-sgvu-navy lg:inline xl:max-w-[12rem]">
            {user?.name ?? 'Guest'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-semibold">{user?.name ?? 'Guest'}</p>
          <p className="text-xs font-normal text-muted-foreground">
            {getWorkspaceLabelForRole(workspaceRole)}
          </p>
          {user?.roles && user.roles.length > 1 && (
            <p className="mt-1 text-[11px] font-normal text-muted-foreground">
              Roles: {user.roles.join(', ')}
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(profileHref)}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(profileHref)}>
          <CreditCard className="mr-2 h-4 w-4" />
          ID Card
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
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
