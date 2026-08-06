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
    view: ['academics', 'timetables', 'exam_sessions', 'audit_logs'],
    edit: ['marks', 'seating', 'admit_cards', 'exam_sessions', 'schedules'],
    approve: ['ufm_cases', 'revaluation', 'results', 'question_papers'],
  },
  DeputyCOE: {
    view: ['academics', 'timetables', 'exam_sessions'],
    edit: ['marks', 'seating', 'admit_cards', 'exam_sessions', 'schedules'],
    approve: ['ufm_cases', 'revaluation', 'results'],
  },
  ExamAdmin: {
    view: ['academics', 'timetables', 'exam_sessions'],
    edit: ['seating', 'admit_cards', 'exam_sessions', 'schedules'],
    approve: ['revaluation'],
  },
  ExamOperator: {
    view: ['academics', 'timetables'],
    edit: ['seating', 'admit_cards'],
    approve: [],
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
  SuperAdmin: {
    view: ['*'],
    edit: ['*'],
    approve: ['*'],
  },
  CampusAdmin: {
    view: ['*'],
    edit: ['*'],
    approve: ['*'],
  },
  COO: {
    view: ['operations', 'helpdesk', 'esm', 'finance', 'labs', 'competitions', 'fellowship'],
    edit: ['operations', 'helpdesk', 'esm'],
    approve: ['operations_escalations', 'vendor_penalties'],
  },
  EstateOfficer: {
    view: ['helpdesk', 'esm', 'facilities', 'assets'],
    edit: ['helpdesk', 'esm', 'facilities'],
    approve: ['facilities_tickets'],
  },
  LabAdmin: {
    view: ['labs', 'lab_equipment', 'tokamak_budget', 'fabless'],
    edit: ['labs', 'lab_equipment', 'fabless'],
    approve: ['lab_checkout', 'tokamak_po_fastpath'],
  },
  Wrangler: {
    view: ['incubation', 'mentorship', 'fellowship', 'moonshots'],
    edit: ['mentorship', 'sprint_checkins'],
    approve: ['fellowship_trial_reviews'],
  },
  CompetitionAdmin: {
    view: ['competitions', 'bounties', 'tokamak_network', 'admissions_funnel'],
    edit: ['competitions', 'bounties', 'tokamak_network'],
    approve: ['golden_ticket', 'competition_rounds'],
  },
  PoP: {
    view: ['academics', 'incubation', 'special_programs', 'portfolio'],
    edit: ['academics', 'special_programs'],
    approve: ['portfolio_artifacts'],
  },
  FellowshipAdmin: {
    view: ['fellowship', 'incubation', 'attendance_exemptions'],
    edit: ['fellowship'],
    approve: ['hacker_filter_convert', 'elite_fellow_waiver'],
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
