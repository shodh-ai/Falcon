import { getAccountSettingsHrefForPortal, getDashboardPathForRole } from '@/lib/auth-routing';

export type WorkspacePrefix = 'faculty' | 'hod' | 'dean' | 'hr';

export function workspacePrefixFromPath(pathname: string): WorkspacePrefix | null {
  if (pathname.startsWith('/dean')) return 'dean';
  if (pathname.startsWith('/hod')) return 'hod';
  if (pathname.startsWith('/faculty')) return 'faculty';
  if (pathname.startsWith('/hr')) return 'hr';
  return null;
}

export function defaultTeamScopeForPrefix(prefix: WorkspacePrefix): 'direct' | 'dept' {
  return prefix === 'hod' || prefix === 'dean' ? 'dept' : 'direct';
}

export function selfServicePaths(prefix: WorkspacePrefix) {
  const workforce =
    prefix === 'faculty' || prefix === 'hr' ? `/${prefix}/me/workforce` : `/${prefix}/attendance`;
  return {
    workforce,
    profile: `/${prefix}/profile`,
    documents: `/${prefix}/me/documents`,
    payslips: `/${prefix}/me/payslips`,
    tickets: `/${prefix}/me/tickets`,
    inbox: prefix === 'hr' ? `/${prefix}/team/inbox` : `/${prefix}/inbox`,
    policies: `/${prefix}/me/policies`,
    onboarding: `/${prefix}/me/onboarding`,
    offboarding: `/${prefix}/me/offboarding`,
    settings: getAccountSettingsHrefForPortal(`/${prefix}`),
  };
}

/** Map legacy /ess/* URLs to unified workspace routes for the signed-in role. */
export function mapEssPathToWorkspace(pathname: string, role: string): string {
  const dash = getDashboardPathForRole(role);
  const prefix: WorkspacePrefix = dash.startsWith('/dean')
    ? 'dean'
    : dash.startsWith('/hod')
      ? 'hod'
      : dash.startsWith('/hr')
        ? 'hr'
        : 'faculty';
  const paths = selfServicePaths(prefix);
  const scope = defaultTeamScopeForPrefix(prefix);

  if (pathname.startsWith('/ess/team/requests')) {
    const qs = pathname.includes('?') ? pathname.slice(pathname.indexOf('?')) : '';
    const params = new URLSearchParams(qs.replace(/^\?/, ''));
    if (!params.has('scope')) params.set('scope', scope);
    return `${paths.inbox}?${params.toString()}`;
  }
  if (pathname.startsWith('/ess/team/attendance')) {
    return `${paths.workforce}?view=team&scope=${scope}`;
  }
  if (pathname.startsWith('/ess/team/dashboard')) {
    return `${paths.inbox}?scope=${scope}`;
  }
  if (pathname.startsWith('/ess/calendar') || pathname.startsWith('/ess/leaves')) {
    return `${paths.workforce}?view=self`;
  }
  if (pathname.startsWith('/ess/documents')) {
    return prefix === 'hr' ? paths.documents : `${paths.profile}?tab=documents`;
  }
  if (pathname.startsWith('/ess/policies')) return paths.policies;
  if (pathname.startsWith('/ess/onboarding')) return paths.onboarding;
  if (pathname.startsWith('/ess/offboarding')) return paths.offboarding;
  if (pathname.startsWith('/ess/settings')) return paths.settings;
  return paths.workforce;
}
