/** Remove only records created by seed-dean-smoke.js. */
if (process.env.DEAN_SMOKE_CLEAN !== 'true') {
  throw new Error('Refusing Dean smoke cleanup: set DEAN_SMOKE_CLEAN=true explicitly.');
}
const deployment = String(process.env.NODE_ENV || process.env.DATABASE_ENV || process.env.DEPLOYMENT_ENV || '').toLowerCase();
if (deployment === 'production' || deployment === 'prod') throw new Error('Refusing Dean smoke cleanup in production.');
const { Client } = require('pg');
const cfg = {
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'university_governance',
};
const dean = 'b0000010-0000-4000-8000-000000000010';
const hod = 'b0000015-0000-4000-8000-000000000015';
const faculty = 'b0000016-0000-4000-8000-000000000016';
const students = [
  'b0000011-0000-4000-8000-000000000011', 'b0000012-0000-4000-8000-000000000012',
  'b0000013-0000-4000-8000-000000000013', 'b0000014-0000-4000-8000-000000000014',
];
const smoke = {
  ticket: 'd0000010-0000-4000-8000-000000000010', safety: 'd0000011-0000-4000-8000-000000000011',
  researchProject: 'd0000012-0000-4000-8000-000000000012', researchLog: 'd0000013-0000-4000-8000-000000000013',
  budget: 'd0000014-0000-4000-8000-000000000014', programBudget: 'd0000015-0000-4000-8000-000000000015',
  phdCandidate: 'd0000016-0000-4000-8000-000000000016', fundingRequest: 'd0000017-0000-4000-8000-000000000017',
  examSession: 'd0000018-0000-4000-8000-000000000018', resultApproval: 'd0000019-0000-4000-8000-000000000019',
  event: 'd0000020-0000-4000-8000-000000000020', meeting: 'd0000021-0000-4000-8000-000000000021',
  participant: 'd0000022-0000-4000-8000-000000000022', threshold: 'd0000023-0000-4000-8000-000000000023',
  projectGuide: 'd0000024-0000-4000-8000-000000000024',
  resultSession: 'd0000025-0000-4000-8000-000000000025',
  payslip: 'd0000026-0000-4000-8000-000000000026', policy: 'd0000027-0000-4000-8000-000000000027',
};
(async () => {
  const c = new Client(cfg); await c.connect();
  try {
    await c.query('BEGIN');
    await c.query("DELETE FROM system_audit_logs WHERE table_name = 'dean_smoke_seed'");
    await c.query("DELETE FROM falcon_notifications WHERE metadata->>'smoke' = 'true' AND tenant_id = 'a0000000-0000-4000-8000-000000000001'");
    await c.query('DELETE FROM hr_policy_acknowledgements WHERE policy_id = $1', [smoke.policy]);
    await c.query('DELETE FROM hr_policy_polls WHERE policy_id = $1', [smoke.policy]);
    await c.query('DELETE FROM hr_policy_documents WHERE policy_id = $1', [smoke.policy]);
    await c.query('DELETE FROM staff_payslip_download_requests WHERE payslip_id = $1', [smoke.payslip]);
    await c.query('DELETE FROM staff_payslips WHERE payslip_id = $1', [smoke.payslip]);
    await c.query('DELETE FROM user_entity_access WHERE user_id = $1', [dean]);
    await c.query('DELETE FROM portal_meeting_participants WHERE participant_id = $1', [smoke.participant]);
    await c.query('DELETE FROM portal_meetings WHERE meeting_id = $1', [smoke.meeting]);
    await c.query('DELETE FROM campus_events WHERE event_id = $1', [smoke.event]);
    await c.query('DELETE FROM exam_result_dean_approval_requests WHERE request_id = $1', [smoke.resultApproval]);
    await c.query('DELETE FROM exam_result_sessions WHERE session_id = $1', [smoke.resultSession]);
    await c.query('DELETE FROM exam_sessions WHERE session_id = $1', [smoke.examSession]);
    await c.query('DELETE FROM attendance_threshold_requests WHERE request_id = $1', [smoke.threshold]);
    await c.query('DELETE FROM project_funding_requests WHERE request_id = $1', [smoke.fundingRequest]);
    await c.query('DELETE FROM faculty_project_guides WHERE guide_id = $1', [smoke.projectGuide]);
    await c.query('DELETE FROM phd_candidates WHERE candidate_id = $1', [smoke.phdCandidate]);
    await c.query('DELETE FROM fin_program_budgets WHERE program_id = $1', [smoke.programBudget]);
    await c.query('DELETE FROM fin_dept_budgets WHERE budget_id = $1', [smoke.budget]);
    await c.query('DELETE FROM faculty_research_logs WHERE research_id = $1', [smoke.researchLog]);
    await c.query('DELETE FROM faculty_research_projects WHERE research_project_id = $1', [smoke.researchProject]);
    await c.query('DELETE FROM student_safety_concerns WHERE concern_id = $1', [smoke.safety]);
    await c.query('DELETE FROM helpdesk_tickets WHERE ticket_id = $1', [smoke.ticket]);
    await c.query("DELETE FROM course_modules WHERE description = 'Dean smoke syllabus module'");
    await c.query("DELETE FROM academic_timetables WHERE room = 'DEAN-SMOKE-101'");
    await c.query('DELETE FROM student_course_enrollments WHERE student_user_id = ANY($1::uuid[])', [students]);
    await c.query('DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])', [students]);
    await c.query('DELETE FROM user_roles WHERE user_id = ANY($1::uuid[]) OR user_id = ANY($2::uuid[])', [students, [dean, hod, faculty]]);
    await c.query('DELETE FROM users WHERE user_id = ANY($1::uuid[]) OR user_id = ANY($2::uuid[])', [students, [dean, hod, faculty]]);
    await c.query("DELETE FROM org_entities WHERE entity_code = 'DEAN-SMOKE-HR' AND tenant_id = 'a0000000-0000-4000-8000-000000000001'");
    await c.query("DELETE FROM iam_programs WHERE program_code = 'DEAN-SMOKE-PROGRAM'");
    await c.query("DELETE FROM departments WHERE dept_name = 'Dean Smoke QA Department' AND school_id IN (SELECT school_id FROM schools WHERE school_code = 'DEAN-SMOKE')");
    await c.query("DELETE FROM schools WHERE school_code = 'DEAN-SMOKE'");
    await c.query("DELETE FROM academic_courses WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001' AND course_code IN ('DSQA101', 'DSQA102')");
    await c.query('COMMIT');
    console.log('Dean smoke records removed; existing faculty and non-smoke records were not touched.');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { await c.end(); }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
