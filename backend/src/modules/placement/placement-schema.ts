import type { DataSource } from 'typeorm';

export type PlacementSchema = {
  drivesTable: string;
  appsTable: string;
  driveIdCol: string;
  tenantScoped: boolean;
  companyJoin: boolean;
};

let cached: PlacementSchema | null = null;

/** Resolve which placement table family exists in this database. */
export async function resolvePlacementSchema(db: DataSource): Promise<PlacementSchema> {
  if (cached) return cached;

  const rows = await db.query<Array<{ table_name: string; column_name: string }>>(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (
         'placement_drives',
         'placement_ats_drives',
         'placement_drive_applications',
         'placement_ats_drive_applications'
       )`,
  );

  const has = (table: string, col: string) =>
    rows.some((r) => r.table_name === table && r.column_name === col);

  const legacyDrives = has('placement_drives', 'placement_drive_id');
  const atsDrives = has('placement_ats_drives', 'drive_id');
  const modernDrives = has('placement_drives', 'drive_id') && has('placement_drives', 'tenant_id');

  if (legacyDrives && atsDrives) {
    cached = {
      drivesTable: 'placement_ats_drives',
      appsTable: 'placement_ats_drive_applications',
      driveIdCol: 'drive_id',
      tenantScoped: true,
      companyJoin: true,
    };
  } else if (modernDrives) {
    cached = {
      drivesTable: 'placement_drives',
      appsTable: has('placement_drive_applications', 'application_id')
        ? 'placement_drive_applications'
        : 'placement_ats_drive_applications',
      driveIdCol: 'drive_id',
      tenantScoped: true,
      companyJoin: has('placement_drives', 'company_id'),
    };
  } else if (atsDrives) {
    cached = {
      drivesTable: 'placement_ats_drives',
      appsTable: 'placement_ats_drive_applications',
      driveIdCol: 'drive_id',
      tenantScoped: true,
      companyJoin: true,
    };
  } else {
    cached = {
      drivesTable: 'placement_drives',
      appsTable: 'placement_applications',
      driveIdCol: 'placement_drive_id',
      tenantScoped: false,
      companyJoin: false,
    };
  }

  return cached;
}

/** Reset cache (tests only). */
export function resetPlacementSchemaCache() {
  cached = null;
}

const d = 'd';

export function driveRoleExpr(s: PlacementSchema) {
  if (s.drivesTable === 'placement_ats_drives' || (s.drivesTable === 'placement_drives' && s.companyJoin)) {
    return `COALESCE(${d}.job_role, ${d}.job_profile)`;
  }
  return `COALESCE(${d}.job_role, ${d}.role_title)`;
}

export function drivePackageExpr(s: PlacementSchema) {
  if (s.drivesTable === 'placement_ats_drives' || (s.drivesTable === 'placement_drives' && s.companyJoin)) {
    return `COALESCE(${d}.package_lpa, ${d}.package_details_lpa, 0)`;
  }
  return `COALESCE(${d}.package_lpa, 0)`;
}

export function driveBacklogExpr(s: PlacementSchema) {
  return `COALESCE(${d}.max_active_backlogs, ${d}.max_backlogs, 0)`;
}

export function driveDeadlineExpr(s: PlacementSchema) {
  if (s.drivesTable === 'placement_ats_drives' || (s.drivesTable === 'placement_drives' && s.tenantScoped)) {
    return `COALESCE(${d}.deadline, ${d}.drive_date::timestamptz)`;
  }
  return `${d}.deadline`;
}
