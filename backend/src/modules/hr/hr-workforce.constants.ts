/** Examination staff may use their own employee records without HR administration powers. */
export const EXAM_CELL_SELF_SERVICE_ROLES = [
  'ExamCell',
  'DeputyCOE',
  'ExamAdmin',
  'ExamOperator',
] as const;

/** Existing HR employee self-service roles, including Examination Cell employees. */
export const HR_EMPLOYEE_SELF_SERVICE_ROLES = [
  'Faculty',
  'HOD',
  'Dean',
  'HR',
  'HRAdmin',
  'SuperAdmin',
  ...EXAM_CELL_SELF_SERVICE_ROLES,
] as const;

/** Staff roles that may submit leave / OD / attendance self-service requests. */
export const WORKFORCE_SELF_SERVICE_ROLES = [
  'Faculty',
  'HOD',
  'Dean',
  'HR',
  'HRAdmin',
  'CampusAdmin',
  'SuperAdmin',
  'AdmissionsOfficer',
  'Registrar',
  'Accountant',
  'Warden',
  'ExamCell',
  'IQAC',
  'Librarian',
  'PlacementCell',
  'TransportOfficer',
  'DC_MEMBER',
] as const;
