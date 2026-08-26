/**
 * Master Requirements — role capability matrix (view / edit / approve).
 */
export type RoleCapability = {
  view: string[];
  edit: string[];
  approve: string[];
  readOnlyPortal?: boolean;
};

export const ROLE_PERMISSIONS: Record<string, RoleCapability> = {
  Registrar: {
    view: ['global_data', 'all_policies', 'admin_ops', 'academics'],
    edit: ['admin_ops', 'academic_rules', 'policy_vault'],
    approve: ['student_expulsion'],
  },
  ExamCell: {
    view: ['academics', 'timetables'],
    edit: ['marks', 'seating', 'admit_cards'],
    approve: ['ufm_cases', 'revaluation'],
  },
  DC_MEMBER: {
    view: ['discipline', 'students'],
    edit: ['demerit_incidents'],
    approve: ['demerit_incidents'],
  },
  PlacementCell: {
    view: ['student_resumes', 'marks', 'placements'],
    edit: ['drives', 'companies', 'offers'],
    approve: ['placement_eligibility'],
  },
  Incubation_Admin: {
    view: ['incubation', 'startup_portfolio', 'grant_ledger'],
    edit: ['incubation', 'cohorts', 'mentor_network'],
    approve: ['incubation_grants', 'startup_pipeline'],
  },
  ECellAdmin: {
    view: ['incubation', 'startup_portfolio', 'grant_ledger'],
    edit: ['incubation', 'cohorts', 'mentor_network'],
    approve: ['incubation_grants', 'startup_pipeline'],
  },
  Parent: {
    view: ['own_child'],
    edit: [],
    approve: [],
    readOnlyPortal: true,
  },
  Accountant: {
    view: ['finance', 'reports'],
    edit: ['finance'],
    approve: ['fee_waivers'],
  },
  Faculty: {
    view: ['academics', 'students', 'timetables', 'attendance', 'marks'],
    edit: ['attendance', 'marks'],
    approve: [],
  },
  HOD: {
    view: ['academics', 'students', 'timetables', 'faculty', 'departments', 'reports'],
    edit: ['academics', 'timetables', 'faculty', 'departments'],
    approve: ['leave_requests', 'marks'],
  },
  Dean: {
    view: ['academics', 'students', 'programs', 'faculty', 'departments', 'reports'],
    edit: ['academics', 'programs', 'departments'],
    approve: ['academic_rules', 'leave_requests'],
  },
  Student: {
    view: ['academics', 'timetables', 'announcements', 'events', 'own_profile'],
    edit: ['own_profile'],
    approve: [],
    readOnlyPortal: true,
  },
  Warden: {
    view: ['hostel', 'students', 'discipline'],
    edit: ['hostel'],
    approve: ['hostel_requests'],
  },
  Librarian: {
    view: ['library'],
    edit: ['library'],
    approve: [],
  },
  LabAdmin: {
    view: ['labs', 'academics', 'facilities'],
    edit: ['labs', 'facilities'],
    approve: [],
  },
  TransportOfficer: {
    view: ['transport'],
    edit: ['transport'],
    approve: [],
  },
  HR: {
    view: ['faculty', 'staff', 'reports'],
    edit: ['staff'],
    approve: ['leave_requests'],
  },
  HRAdmin: {
    view: ['faculty', 'staff', 'reports'],
    edit: ['faculty', 'staff'],
    approve: ['leave_requests', 'staff'],
  },
  SuperAdmin: {
    view: ['*'],
    edit: ['*'],
    approve: ['*'],
  },
  CampusAdmin: {
    view: [
      'academics',
      'students',
      'faculty',
      'departments',
      'programs',
      'timetables',
      'announcements',
      'events',
      'helpdesk',
      'reports',
      'campus_profile',
      'users',
    ],
    edit: [
      'academics',
      'departments',
      'programs',
      'announcements',
      'helpdesk',
      'users',
      'role_permissions',
    ],
    approve: ['events_estate', 'helpdesk'],
  },
};

export function roleCanEdit(role: string, resource: string): boolean {
  const key = Object.keys(ROLE_PERMISSIONS).find(
    (r) => r.toLowerCase() === role.toLowerCase(),
  );
  if (!key) return false;
  const cap = ROLE_PERMISSIONS[key];
  if (cap.edit.includes('*')) return true;
  return cap.edit.includes(resource);
}

export function isReadOnlyRole(role: string): boolean {
  const key = Object.keys(ROLE_PERMISSIONS).find(
    (r) => r.toLowerCase() === role.toLowerCase(),
  );
  return Boolean(key && ROLE_PERMISSIONS[key].readOnlyPortal);
}
