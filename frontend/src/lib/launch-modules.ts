/**
 * Launch toggles — flip to `true` when a module is ready to ship.
 * Hides navigation, blocks portal routes, and filters workspace switcher entries.
 */
export const LAUNCH_MODULES = {
  library: true,
  finance: true,
  admissionVault: true,
} as const;

export type LaunchModule = keyof typeof LAUNCH_MODULES;

export function isLaunchModuleEnabled(module: LaunchModule): boolean {
  return LAUNCH_MODULES[module];
}

const LIBRARY_PATH_PREFIXES = ['/library', '/library-admin', '/student/library', '/faculty/library'];

const ADMISSION_VAULT_PATH_PREFIXES = ['/student/admission-vault'];

const FINANCE_PATH_PREFIXES = [
  '/finance',
  '/student/finance',
  '/student/fees',
  '/parent/finance',
  '/parent/fees',
  '/president/finance',
  '/admin/finance',
  '/hod/funding-approvals',
];

function matchesPathPrefix(pathname: string | null | undefined, prefix: string): boolean {
  if (!pathname || !prefix) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPathHiddenForLaunch(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  if (
    !isLaunchModuleEnabled('library') &&
    LIBRARY_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))
  ) {
    return true;
  }

  if (
    !isLaunchModuleEnabled('finance') &&
    FINANCE_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))
  ) {
    return true;
  }

  if (
    !isLaunchModuleEnabled('admissionVault') &&
    ADMISSION_VAULT_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))
  ) {
    return true;
  }

  return false;
}

export function isRoleWorkspaceEnabled(role: string | undefined | null): boolean {
  const normalized = (role ?? '').trim().toLowerCase();
  if (normalized === 'accountant' && !isLaunchModuleEnabled('finance')) return false;
  if (normalized === 'librarian' && !isLaunchModuleEnabled('library')) return false;
  return true;
}

type LaunchNavItem = { href?: string | null };

type LaunchPortalConfig = {
  navGroups: { items: LaunchNavItem[] }[];
  commandItems: LaunchNavItem[];
  mobileNavItems?: LaunchNavItem[];
};

function filterNavItems<T extends LaunchNavItem>(items: T[] | null | undefined): T[] {
  if (!items?.length) return [];
  return items.filter((item) => {
    if (!item?.href) return false;
    return !isPathHiddenForLaunch(item.href);
  });
}

export function filterPortalConfigForLaunchModules<T extends LaunchPortalConfig>(config: T): T {
  const navGroups = config.navGroups
    .map((group) => ({
      ...group,
      items: filterNavItems(group.items),
    }))
    .filter((group) => group.items.length > 0);

  const commandItems = filterNavItems(config.commandItems);
  const mobileNavItems = config.mobileNavItems ? filterNavItems(config.mobileNavItems) : undefined;

  return {
    ...config,
    navGroups,
    commandItems,
    ...(mobileNavItems ? { mobileNavItems } : {}),
  };
}
