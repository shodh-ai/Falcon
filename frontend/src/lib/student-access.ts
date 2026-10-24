type StudentRoles = string | string[] | null | undefined;

function normalizeRoles(roles: StudentRoles): string[] {
  return (Array.isArray(roles) ? roles : [roles])
    .filter((role): role is string => Boolean(role))
    .map((role) => role.trim().toLowerCase());
}

export function isApplicantOnly(roles: StudentRoles): boolean {
  const normalized = normalizeRoles(roles);
  return normalized.includes('applicant') && !normalized.includes('student');
}

/** Applicants use admission essentials until the Student role is assigned. */
export function canAccessStudentPath(roles: StudentRoles, href: string): boolean {
  const path = href.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  if (path !== '/student' && !path.startsWith('/student/')) return false;
  const normalized = normalizeRoles(roles);
  if (normalized.includes('student')) return true;
  if (!normalized.includes('applicant')) return false;
  return [
    '/student/profile',
    '/student/admission-vault',
    '/student/settings',
    '/student/onboarding/step-1',
    '/student/onboarding/step-2',
    '/student/onboarding/step-3',
  ].includes(path);
}

export function getStudentLandingPath(roles: StudentRoles): string {
  return isApplicantOnly(roles) ? '/student/profile' : '/student/dashboard';
}

type StudentNavItem = { href?: string | null };
type StudentPortalConfig = {
  navGroups: { items: StudentNavItem[] }[];
  commandItems: StudentNavItem[];
  mobileNavItems?: StudentNavItem[];
};

/** Apply the same admission policy to sidebar, mobile links and commands. */
export function filterStudentPortalConfigForRoles<T extends StudentPortalConfig>(
  config: T,
  roles: StudentRoles,
): T {
  if (!isApplicantOnly(roles)) return config;
  const filter = <Item extends StudentNavItem>(items: Item[]) =>
    items.filter((item) => item.href && canAccessStudentPath(roles, item.href));
  return {
    ...config,
    navGroups: config.navGroups
      .map((group) => ({ ...group, items: filter(group.items) }))
      .filter((group) => group.items.length > 0),
    commandItems: filter(config.commandItems),
    ...(config.mobileNavItems ? { mobileNavItems: filter(config.mobileNavItems) } : {}),
  };
}
