/** Authenticated runtime catalogue used by navigation and route gates. */
export const BUSINESS_MODULE_KEYS = [
  "admissions_onboarding",
  "sis_academics",
  "examinations_credentials",
  "hrms_ess",
  "finance_procurement",
  "inventory_assets",
  "library",
  "hostel_mess",
  "transport",
  "helpdesk_esm",
  "research_innovation",
  "placements_alumni",
  "iqac_compliance",
  "clinic_safety",
  "campus_operations",
  "leadership_reporting",
] as const;

export type BusinessModuleKey = (typeof BUSINESS_MODULE_KEYS)[number];
export type ModuleLaunchState =
  "OFF" | "SHADOW" | "PILOT" | "ACTIVE" | "DRAINING" | "PAUSED";
export type RuntimeModule = {
  moduleKey: BusinessModuleKey;
  displayName: string;
  state: ModuleLaunchState;
  available: boolean;
  revision: number;
  sourceScope: string;
  updatedAt: string | null;
};
export type RuntimeModuleManifest = {
  revision: string;
  generatedAt: string;
  cacheSeconds: number;
  modules: RuntimeModule[];
};

/** Compatibility aliases for old server-rendered call sites. */
export const LAUNCH_MODULES = {
  library: true,
  finance: true,
  admissionVault: true,
  acquisitions: true,
} as const;

export type LaunchModule = keyof typeof LAUNCH_MODULES;

export function isLaunchModuleEnabled(module: LaunchModule): boolean {
  return LAUNCH_MODULES[module];
}

const ROUTES: Array<{ moduleKey: BusinessModuleKey; prefixes: string[] }> = [
  {
    moduleKey: "inventory_assets",
    prefixes: [
      "/finance/inventory",
      "/finance/product-verification",
      "/finance/consumables",
      "/finance/returns",
      "/finance/asset-service",
      "/finance/asset-retirement",
      "/finance/physical-identity",
      "/inventory",
      "/product-verification",
      "/asset-service",
      "/asset-retirement",
      "/physical-identity",
      "/consumables",
    ],
  },
  {
    moduleKey: "admissions_onboarding",
    prefixes: [
      "/campus-admin/admissions",
      "/admin/admissions",
      "/president/admissions",
      "/admissions-crm",
      "/admissions",
      "/student/onboarding",
      "/student/admission-vault",
    ],
  },
  {
    moduleKey: "sis_academics",
    prefixes: [
      "/admin/academics",
      "/admin/student",
      "/dean/academics",
      "/hod/academics",
      "/parent/academics",
      "/academics",
      "/student/academics",
      "/faculty",
      "/lms",
    ],
  },
  {
    moduleKey: "examinations_credentials",
    prefixes: [
      "/admin/certificates",
      "/admin/degree-eligibility",
      "/exam-cell",
      "/exams",
      "/student/exams",
      "/student/certificates",
      "/student/transcripts",
      "/certificates",
    ],
  },
  {
    moduleKey: "hrms_ess",
    prefixes: [
      "/admin/hr",
      "/faculty/hr",
      "/faculty/me",
      "/hod/hr",
      "/hod/me",
      "/dean/me",
      "/president/hr",
      "/ess",
      "/hr",
      "/employee",
      "/staff",
    ],
  },
  {
    moduleKey: "finance_procurement",
    prefixes: [
      "/admin/finance",
      "/leadership/finance",
      "/president/finance",
      "/finance",
      "/student/finance",
      "/student/fees",
      "/parent/finance",
      "/parent/fees",
      "/hod/funding-approvals",
    ],
  },
  {
    moduleKey: "library",
    prefixes: [
      "/library",
      "/library-admin",
      "/student/library",
      "/faculty/library",
    ],
  },
  {
    moduleKey: "hostel_mess",
    prefixes: [
      "/hostel-admin",
      "/student/hostel",
      "/student/mess",
      "/student/dining",
      "/hostel",
      "/mess",
    ],
  },
  {
    moduleKey: "transport",
    prefixes: [
      "/admin-ops/transport",
      "/admin-ops/fleet",
      "/student/transport",
      "/transport",
    ],
  },
  {
    moduleKey: "helpdesk_esm",
    prefixes: [
      "/student/helpdesk",
      "/operations/esm",
      "/tickets",
      "/helpdesk",
      "/esm",
    ],
  },
  {
    moduleKey: "research_innovation",
    prefixes: [
      "/faculty/research",
      "/faculty/phd",
      "/dean/research",
      "/dean/phd",
      "/president/research",
      "/incubation",
      "/research",
      "/phd",
      "/academic-rnd",
    ],
  },
  {
    moduleKey: "placements_alumni",
    prefixes: [
      "/student/placements",
      "/faculty/placement",
      "/dean/placement",
      "/president/placements",
      "/leadership/placements",
      "/placement",
      "/placements",
      "/alumni",
    ],
  },
  {
    moduleKey: "iqac_compliance",
    prefixes: [
      "/admin/iqac",
      "/faculty/iqac",
      "/hod/iqac",
      "/president/compliance",
      "/leadership/compliance",
      "/iqac-admin",
      "/iqac",
      "/compliance",
    ],
  },
  {
    moduleKey: "clinic_safety",
    prefixes: [
      "/clinic-admin",
      "/student/safety",
      "/faculty/safety",
      "/hod/safety",
      "/dean/safety",
      "/student-safety",
      "/clinic",
      "/safety",
    ],
  },
  {
    moduleKey: "campus_operations",
    prefixes: [
      "/campus-admin/operations",
      "/admin/operations",
      "/admin-ops",
      "/student/venues",
      "/operations",
      "/labs",
      "/venues",
      "/campus-events",
    ],
  },
  {
    moduleKey: "leadership_reporting",
    prefixes: ["/leadership", "/president", "/reports"],
  },
];

function matchesPathPrefix(
  pathname: string | null | undefined,
  prefix: string,
): boolean {
  if (!pathname || !prefix) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPathHiddenForLaunch(
  pathname: string | null | undefined,
): boolean {
  // Server-rendered legacy call sites cannot see the authenticated runtime
  // manifest. RoleGate and AppShell apply the real client-side decision.
  return false;
}

export function isRoleWorkspaceEnabled(
  role: string | undefined | null,
): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  if (normalized === "accountant" && !isLaunchModuleEnabled("finance"))
    return false;
  if (normalized === "librarian" && !isLaunchModuleEnabled("library"))
    return false;
  return true;
}

export function resolvePathModule(
  pathname: string | null | undefined,
): BusinessModuleKey | undefined {
  if (!pathname) return undefined;
  return ROUTES.flatMap((item) =>
    item.prefixes.map((prefix) => ({ moduleKey: item.moduleKey, prefix })),
  )
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(({ prefix }) => matchesPathPrefix(pathname, prefix))?.moduleKey;
}

export function runtimeModuleForPath(
  manifest: RuntimeModuleManifest | null,
  pathname: string | null | undefined,
) {
  const moduleKey = resolvePathModule(pathname);
  return moduleKey
    ? manifest?.modules.find((item) => item.moduleKey === moduleKey)
    : undefined;
}

type LaunchNavItem = { href?: string | null; moduleKey?: BusinessModuleKey };

type LaunchPortalConfig = {
  navGroups: { items: LaunchNavItem[] }[];
  commandItems: LaunchNavItem[];
  mobileNavItems?: LaunchNavItem[];
};

function filterNavItems<T extends LaunchNavItem>(
  items: T[] | null | undefined,
  manifest: RuntimeModuleManifest | null,
): T[] {
  if (!items?.length) return [];
  return items.filter((item) => {
    if (!item?.href) return false;
    const moduleKey = item.moduleKey ?? resolvePathModule(item.href);
    if (!moduleKey) return true;
    return (
      manifest?.modules.find((module) => module.moduleKey === moduleKey)
        ?.available ?? true
    );
  });
}

export function filterPortalConfigForLaunchModules<
  T extends LaunchPortalConfig,
>(config: T, manifest: RuntimeModuleManifest | null = null): T {
  const navGroups = config.navGroups
    .map((group) => ({
      ...group,
      items: filterNavItems(group.items, manifest),
    }))
    .filter((group) => group.items.length > 0);

  const commandItems = filterNavItems(config.commandItems, manifest);
  const mobileNavItems = config.mobileNavItems
    ? filterNavItems(config.mobileNavItems, manifest)
    : undefined;

  return {
    ...config,
    navGroups,
    commandItems,
    ...(mobileNavItems ? { mobileNavItems } : {}),
  };
}
