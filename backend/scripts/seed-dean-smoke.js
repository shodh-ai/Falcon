/**
 * Additive Dean smoke data for local/QA testing.
 *
 * This script never deletes or rewrites existing faculty/student records. It
 * creates one isolated school, one department, one Dean account, four smoke
 * students, two courses, and low-attendance enrollments for that scope.
 *
 * Run only with an explicit opt-in:
 *   DEAN_SMOKE_SEED=true npm run db:seed:dean-smoke
 */
const { Client } = require('pg');

if (process.env.DEAN_SMOKE_SEED !== 'true') {
  throw new Error('Refusing Dean smoke seed: set DEAN_SMOKE_SEED=true explicitly.');
}

const deployment = String(
  process.env.NODE_ENV || process.env.DATABASE_ENV || process.env.DEPLOYMENT_ENV || '',
).toLowerCase();
if (deployment === 'production' || deployment === 'prod') {
  throw new Error('Refusing Dean smoke seed in production.');
}

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'university_governance',
};

const TENANT = 'a0000000-0000-4000-8000-000000000001';
const DEAN = 'b0000010-0000-4000-8000-000000000010';
const HOD = 'b0000015-0000-4000-8000-000000000015';
const FACULTY = 'b0000016-0000-4000-8000-000000000016';
const STUDENTS = [
  ['b0000011-0000-4000-8000-000000000011', 'Dean Smoke Student 1', 'dean.smoke.student1@mygyanvihar.com', 0],
  ['b0000012-0000-4000-8000-000000000012', 'Dean Smoke Student 2', 'dean.smoke.student2@mygyanvihar.com', 35],
  ['b0000013-0000-4000-8000-000000000013', 'Dean Smoke Student 3', 'dean.smoke.student3@mygyanvihar.com', 43.5],
  ['b0000014-0000-4000-8000-000000000014', 'Dean Smoke Student 4', 'dean.smoke.student4@mygyanvihar.com', 58],
];
const PASSWORD_HASH = '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';
// Fixed IDs make reruns and cleanup safe. Every record below is smoke-owned.
const SMOKE = {
  ticket: 'd0000010-0000-4000-8000-000000000010',
  safety: 'd0000011-0000-4000-8000-000000000011',
  researchProject: 'd0000012-0000-4000-8000-000000000012',
  researchLog: 'd0000013-0000-4000-8000-000000000013',
  budget: 'd0000014-0000-4000-8000-000000000014',
  programBudget: 'd0000015-0000-4000-8000-000000000015',
  phdCandidate: 'd0000016-0000-4000-8000-000000000016',
  fundingRequest: 'd0000017-0000-4000-8000-000000000017',
  examSession: 'd0000018-0000-4000-8000-000000000018',
  resultApproval: 'd0000019-0000-4000-8000-000000000019',
  event: 'd0000020-0000-4000-8000-000000000020',
  meeting: 'd0000021-0000-4000-8000-000000000021',
  participant: 'd0000022-0000-4000-8000-000000000022',
  threshold: 'd0000023-0000-4000-8000-000000000023',
  projectGuide: 'd0000024-0000-4000-8000-000000000024',
  resultSession: 'd0000025-0000-4000-8000-000000000025',
  payslip: 'd0000026-0000-4000-8000-000000000026',
  policy: 'd0000027-0000-4000-8000-000000000027',
};

async function first(client, sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0];
}

async function run() {
  const client = new Client(cfg);
  await client.connect();
  try {
    await client.query('BEGIN');
    const tenant = await first(client, 'SELECT tenant_id FROM tenants WHERE tenant_id = $1', [TENANT]);
    if (!tenant) throw new Error(`Tenant ${TENANT} was not found`);
    let hrEntity = await first(client, `SELECT entity_id FROM org_entities WHERE tenant_id = $1 AND entity_code = 'DEAN-SMOKE-HR' AND is_active = true`, [TENANT]);
    if (!hrEntity) {
      hrEntity = await first(client, `INSERT INTO org_entities (tenant_id, entity_code, entity_name) VALUES ($1, 'DEAN-SMOKE-HR', 'Dean Smoke QA HR Entity') RETURNING entity_id`, [TENANT]);
    }
    // Keep reruns idempotent for smoke-owned records only.
    await client.query("DELETE FROM system_audit_logs WHERE table_name = 'dean_smoke_seed'");
    await client.query("DELETE FROM falcon_notifications WHERE metadata->>'smoke' = 'true' AND tenant_id = $1", [TENANT]);
    await client.query('DELETE FROM hr_policy_acknowledgements WHERE policy_id = $1', [SMOKE.policy]);
    await client.query('DELETE FROM hr_policy_polls WHERE policy_id = $1', [SMOKE.policy]);
    await client.query('DELETE FROM hr_policy_documents WHERE policy_id = $1', [SMOKE.policy]);
    await client.query('DELETE FROM staff_payslip_download_requests WHERE payslip_id = $1', [SMOKE.payslip]);
    await client.query('DELETE FROM staff_payslips WHERE payslip_id = $1', [SMOKE.payslip]);
    await client.query('DELETE FROM portal_meeting_participants WHERE meeting_id = $1', [SMOKE.meeting]);
    await client.query('DELETE FROM portal_meetings WHERE meeting_id = $1', [SMOKE.meeting]);
    await client.query('DELETE FROM campus_events WHERE event_id = $1', [SMOKE.event]);
    await client.query('DELETE FROM exam_result_dean_approval_requests WHERE request_id = $1', [SMOKE.resultApproval]);
    await client.query('DELETE FROM exam_result_sessions WHERE session_id = $1', [SMOKE.resultSession]);
    await client.query('DELETE FROM exam_sessions WHERE session_id = $1', [SMOKE.examSession]);
    await client.query('DELETE FROM attendance_threshold_requests WHERE request_id = $1', [SMOKE.threshold]);
    await client.query('DELETE FROM project_funding_requests WHERE request_id = $1', [SMOKE.fundingRequest]);
    await client.query('DELETE FROM faculty_project_guides WHERE guide_id = $1', [SMOKE.projectGuide]);
    await client.query('DELETE FROM phd_candidates WHERE candidate_id = $1', [SMOKE.phdCandidate]);
    await client.query('DELETE FROM fin_program_budgets WHERE program_id = $1', [SMOKE.programBudget]);
    await client.query('DELETE FROM fin_dept_budgets WHERE budget_id = $1', [SMOKE.budget]);
    await client.query('DELETE FROM faculty_research_logs WHERE research_id = $1', [SMOKE.researchLog]);
    await client.query('DELETE FROM faculty_research_projects WHERE research_project_id = $1', [SMOKE.researchProject]);
    await client.query('DELETE FROM student_safety_concerns WHERE concern_id = $1', [SMOKE.safety]);
    await client.query('DELETE FROM helpdesk_tickets WHERE ticket_id = $1', [SMOKE.ticket]);
    await client.query("DELETE FROM course_modules WHERE description = 'Dean smoke syllabus module'");
    await client.query("DELETE FROM academic_timetables WHERE room = 'DEAN-SMOKE-101'");

    const deanRole = await first(client, "SELECT role_id FROM roles WHERE role_name = 'Dean' LIMIT 1");
    const studentRole = await first(client, "SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1");
    const hodRole = await first(client, "SELECT role_id FROM roles WHERE role_name = 'HOD' LIMIT 1");
    const facultyRole = await first(client, "SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1");
    if (!deanRole || !studentRole || !hodRole || !facultyRole) throw new Error('Dean, HOD, Faculty, or Student role is missing');

    await client.query(
      `INSERT INTO users (user_id, tenant_id, name, official_email, role_id, password_hash, entity_id, is_active, onboarding_status, account_status)
       VALUES ($1, $2, 'Dean Smoke QA', 'dean.smoke@mygyanvihar.com', $3, $4, $5, true, 'ACTIVE', 'ACTIVE')
       ON CONFLICT (tenant_id, official_email) DO UPDATE SET
         name = EXCLUDED.name, role_id = EXCLUDED.role_id, password_hash = EXCLUDED.password_hash,
         entity_id = EXCLUDED.entity_id, is_active = true, onboarding_status = 'ACTIVE', account_status = 'ACTIVE', updated_at = NOW()`,
      [DEAN, TENANT, deanRole.role_id, PASSWORD_HASH, hrEntity.entity_id],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true`,
      [DEAN, deanRole.role_id],
    );
    await client.query(
      `INSERT INTO user_entity_access (user_id, entity_id, granted_by_user_id) VALUES ($1, $2, $1)
       ON CONFLICT (user_id, entity_id) DO NOTHING`,
      [DEAN, hrEntity.entity_id],
    );

    let school = await first(client, `SELECT school_id FROM schools WHERE school_code = 'DEAN-SMOKE' AND deleted_at IS NULL`);
    if (!school) {
      school = await first(
        client,
        `INSERT INTO schools (school_name, school_code, dean_user_id)
         VALUES ('Dean Smoke QA School', 'DEAN-SMOKE', $1)
         RETURNING school_id`,
        [DEAN],
      );
    }

    let department = await first(client, `SELECT dept_id FROM departments WHERE dept_name = 'Dean Smoke QA Department' AND school_id = $1 AND deleted_at IS NULL`, [school.school_id]);
    if (!department) {
      department = await first(
        client,
        `INSERT INTO departments (dept_name, description, school_id)
         VALUES ('Dean Smoke QA Department', 'Isolated Dean portal smoke-test scope', $1)
         RETURNING dept_id`,
        [school.school_id],
      );
    }

    await client.query(
      `INSERT INTO users (user_id, tenant_id, name, official_email, role_id, dept_id, is_active, onboarding_status, account_status)
       VALUES ($1, $2, 'Dean Smoke HOD', 'dean.smoke.hod@mygyanvihar.com', $3, $4, true, 'ACTIVE', 'ACTIVE')
       ON CONFLICT (tenant_id, official_email) DO UPDATE SET name = EXCLUDED.name, role_id = EXCLUDED.role_id,
         dept_id = EXCLUDED.dept_id, is_active = true, onboarding_status = 'ACTIVE', account_status = 'ACTIVE', updated_at = NOW()`,
      [HOD, TENANT, hodRole.role_id, department.dept_id],
    );
    await client.query(
      `INSERT INTO users (user_id, tenant_id, name, official_email, role_id, dept_id, is_active, onboarding_status, account_status)
       VALUES ($1, $2, 'Dean Smoke Faculty', 'dean.smoke.faculty@mygyanvihar.com', $3, $4, true, 'ACTIVE', 'ACTIVE')
       ON CONFLICT (tenant_id, official_email) DO UPDATE SET name = EXCLUDED.name, role_id = EXCLUDED.role_id,
         dept_id = EXCLUDED.dept_id, is_active = true, onboarding_status = 'ACTIVE', account_status = 'ACTIVE', updated_at = NOW()`,
      [FACULTY, TENANT, facultyRole.role_id, department.dept_id],
    );
    await client.query('UPDATE departments SET hod_user_id = $1, updated_at = NOW() WHERE dept_id = $2', [HOD, department.dept_id]);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary) VALUES ($1, $2, true), ($3, $4, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true`,
      [HOD, hodRole.role_id, FACULTY, facultyRole.role_id],
    );

    await client.query(
      `INSERT INTO iam_programs (program_name, program_code, duration_years, school_id, dept_id)
       VALUES ('Dean Smoke QA Program', 'DEAN-SMOKE-PROGRAM', 4, $1, $2)
       ON CONFLICT DO NOTHING`,
      [school.school_id, department.dept_id],
    );

    for (const [id, name, email] of STUDENTS) {
      await client.query(
        `INSERT INTO users (user_id, tenant_id, name, official_email, role_id, dept_id, is_active, onboarding_status, account_status)
         VALUES ($1, $2, $3, $4, $5, $6, true, 'ACTIVE', 'ACTIVE')
         ON CONFLICT (tenant_id, official_email) DO UPDATE SET
           name = EXCLUDED.name, role_id = EXCLUDED.role_id, dept_id = EXCLUDED.dept_id,
           is_active = true, onboarding_status = 'ACTIVE', account_status = 'ACTIVE', updated_at = NOW()`,
        [id, TENANT, name, email, studentRole.role_id, department.dept_id],
      );
      await client.query(
        `INSERT INTO student_profiles (user_id, tenant_id, branch_name, batch, admission_status, status)
         VALUES ($1, $2, 'Dean Smoke QA', '2026', 'ACTIVE', 'ACTIVE')
         ON CONFLICT (user_id) DO UPDATE SET branch_name = EXCLUDED.branch_name, batch = EXCLUDED.batch, updated_at = NOW()`,
        [id, TENANT],
      );
    }

    const courses = [];
    for (const [code, name, credits] of [['DSQA101', 'Dean Smoke Attendance', 3], ['DSQA102', 'Dean Smoke Analytics', 4]]) {
      const course = await first(
        client,
        `INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
         VALUES ($1, $2, $3, $4, false, 'CORE')
         ON CONFLICT (tenant_id, course_code) DO UPDATE SET course_name = EXCLUDED.course_name, credits = EXCLUDED.credits
         RETURNING course_id`,
        [TENANT, code, name, credits],
      );
      courses.push(course.course_id);
    }

    for (const [id, , , attendance] of STUDENTS) {
      for (const courseId of courses) {
        await client.query(
          `INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
           VALUES ($1, $2, $3, 1, 'ENROLLED', $4)
           ON CONFLICT DO NOTHING`,
          [TENANT, id, courseId, attendance],
        );
      }
    }

    const timetableRows = [
      ['c0000011-0000-4000-8000-000000000011', courses[0], 1, '09:00', '10:00'],
      ['c0000012-0000-4000-8000-000000000012', courses[1], 3, '11:00', '12:00'],
    ];
    for (const [id, courseId, day, start, end] of timetableRows) {
      await client.query(
        `INSERT INTO academic_timetables (timetable_id, tenant_id, course_id, day_of_week, start_time, end_time, room, faculty_user_id, section)
         VALUES ($1, $2, $3, $4, $5, $6, 'DEAN-SMOKE-101', $7, 'A')
         ON CONFLICT (timetable_id) DO NOTHING`,
        [id, TENANT, courseId, day, start, end, FACULTY],
      );
    }
    for (const [courseId, title, status] of [[courses[0], 'Attendance and student support', 'COMPLETED'], [courses[1], 'Analytics and reporting', 'PENDING']]) {
      await client.query(
        `INSERT INTO course_modules (tenant_id, course_id, faculty_user_id, module_number, title, description, status, hod_approval_status)
         VALUES ($1, $2, $3, 1, $4, 'Dean smoke syllabus module', $5, 'APPROVED')
         ON CONFLICT DO NOTHING`,
        [TENANT, courseId, FACULTY, title, status],
      );
    }

    // Cross-module records used by the Dean intelligence, student affairs,
    // research, budget, PhD, events, meetings and approval pages.
    const student = STUDENTS[0][0];
    await client.query(
      `INSERT INTO helpdesk_tickets (ticket_id, student_user_id, category, subject, description, status, assigned_to_user_id, conversation, tenant_id, escalation_level, ticket_ref)
       VALUES ($1, $2, 'ACADEMICS', 'Dean smoke academic support', 'Smoke ticket for Dean inbox and helpdesk testing.', 'PENDING', $3, $4, $5, 1, 'DEAN-SMOKE-HELP-001')`,
      [SMOKE.ticket, student, DEAN, JSON.stringify([{ from: 'student', message: 'Please review my attendance support request.' }]), TENANT],
    );
    await client.query(
      `INSERT INTO student_safety_concerns (concern_id, tenant_id, reporter_user_id, concern_type, accused_type, incident_description, incident_location, incident_date, is_hostel_related, evidence_urls, status, routed_to_roles)
       VALUES ($1, $2, $3, 'RAGGING', 'OTHER', 'Smoke safety concern for Dean review.', 'Dean Smoke QA classroom', CURRENT_DATE, false, '[]', 'SUBMITTED', ARRAY['Dean'])`,
      [SMOKE.safety, TENANT, student],
    );
    await client.query(
      `INSERT INTO faculty_research_projects (research_project_id, tenant_id, principal_investigator_user_id, title, funding_agency, grant_amount, start_date, status)
       VALUES ($1, $2, $3, 'Dean Smoke Student Success Study', 'Dean Smoke QA Grant', 250000, CURRENT_DATE, 'ONGOING')`,
      [SMOKE.researchProject, TENANT, FACULTY],
    );
    await client.query(
      `INSERT INTO faculty_research_logs (research_id, tenant_id, faculty_user_id, publication_title, journal_name, indexing_type, publication_type, published_date)
       VALUES ($1, $2, $3, 'Dean Smoke Attendance Analytics', 'Dean Smoke QA Journal', 'UGC_CARE', 'JOURNAL', CURRENT_DATE)`,
      [SMOKE.researchLog, TENANT, FACULTY],
    );
    await client.query(
      `INSERT INTO fin_dept_budgets (budget_id, tenant_id, financial_year, department_id, allocated_amount, encumbered_amount, utilized_amount, allocated_by, status, capex_allocated, opex_allocated, budget_limit_mode)
       VALUES ($1, $2, '2026-2027', $3, 1000000, 150000, 250000, $4, 'ACTIVE', 400000, 600000, 'SOFT_WARNING')`,
      [SMOKE.budget, TENANT, department.dept_id, DEAN],
    );
    await client.query(
      `INSERT INTO fin_program_budgets (program_id, tenant_id, budget_id, program_name, program_type, allocated_amount, encumbered_amount, utilized_amount, status)
       VALUES ($1, $2, $3, 'Dean Smoke QA Program', 'ACADEMIC', 300000, 50000, 75000, 'ACTIVE')`,
      [SMOKE.programBudget, TENANT, SMOKE.budget],
    );
    await client.query(
      `INSERT INTO phd_candidates (candidate_id, tenant_id, user_id, applicant_name, applicant_email, application_type, proposed_topic, dept_id, guide_user_id, lifecycle_stage, lifecycle_status, pending_actor_role, semester_count, fee_paid, documents_verified, metadata)
       VALUES ($1, $2, $3, 'Dean Smoke Researcher', 'dean.smoke.phd@mygyanvihar.com', 'PET', 'Attendance analytics in higher education', $4, $5, 'VIVA', 'VIVA_RECOMMENDED', 'Dean', 3, true, true, '{"smoke":true}')`,
      [SMOKE.phdCandidate, TENANT, student, department.dept_id, FACULTY],
    );
    await client.query(
      `INSERT INTO faculty_project_guides (guide_id, tenant_id, faculty_user_id, student_user_id, project_title, program, status, funding_allocated, funding_consumed)
       VALUES ($1, $2, $3, $4, 'Dean Smoke Guided Project', 'Dean Smoke QA Program', 'ACTIVE', 100000, 25000)`,
      [SMOKE.projectGuide, TENANT, FACULTY, student],
    );
    await client.query(
      `INSERT INTO project_funding_requests (request_id, tenant_id, guide_id, requested_by, amount, purpose, status, hod_user_id, dean_user_id)
       VALUES ($1, $2, $3, $4, 75000, 'Dean smoke research materials', 'APPROVED_HOD', $5, $6)`,
      [SMOKE.fundingRequest, TENANT, SMOKE.projectGuide, FACULTY, HOD, DEAN],
    );
    await client.query(
      `INSERT INTO attendance_threshold_requests (request_id, tenant_id, dept_id, requested_min_percent, reason, status, requested_by)
       VALUES ($1, $2, $3, 65, 'Dean smoke threshold workflow test', 'PENDING_DEAN', $4)`,
      [SMOKE.threshold, TENANT, department.dept_id, HOD],
    );
    await client.query(
      `INSERT INTO exam_sessions (session_id, tenant_id, academic_year, session_name, cycle_type, semester, program_label, status, created_by)
       VALUES ($1, $2, '2026-2027', 'Dean Smoke End Semester', 'END_SEMESTER', 1, 'Dean Smoke QA Program', 'ACTIVE', $3)`,
      [SMOKE.examSession, TENANT, DEAN],
    );
    await client.query(
      `INSERT INTO exam_result_sessions (session_id, tenant_id, course_id, exam_type, semester, max_marks, entry_status, marks_locked, pass_marks)
       VALUES ($1, $2, $3, 'END_TERM', 1, 100, 'LOCKED', true, 40)`,
      [SMOKE.resultSession, TENANT, courses[0]],
    );
    await client.query(
      `INSERT INTO exam_result_dean_approval_requests (request_id, tenant_id, session_id, status, requested_by, requested_at, request_summary)
       VALUES ($1, $2, $3, 'PENDING', $4, NOW(), '{"smoke":true,"courses":2}')`,
      [SMOKE.resultApproval, TENANT, SMOKE.resultSession, HOD],
    );
    await client.query(
      `INSERT INTO campus_events (event_id, tenant_id, title, description, venue, event_date, total_slots, available_slots, pending_holds, is_paid, ticket_price, status, advisor_approval, estate_approval, finance_approval, funds_needed, hod_approval, dean_approval)
       VALUES ($1, $2, 'Dean Smoke Academic Showcase', 'Smoke event for Dean approvals and reports.', 'Dean Smoke Hall', NOW() + INTERVAL '14 days', 100, 100, 0, false, 0, 'PENDING_HOD', 'APPROVED', 'NOT_REQUIRED', 'NOT_REQUIRED', 0, 'PENDING', 'PENDING')`,
      [SMOKE.event, TENANT],
    );
    await client.query(
      `INSERT INTO portal_meetings (meeting_id, tenant_id, organizer_user_id, requester_user_id, title, venue, starts_at, ends_at, agenda, meeting_mode, status, scope_note)
       VALUES ($1, $2, $3, $4, 'Dean Smoke Review Meeting', 'Dean Smoke Board Room', NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 1 hour', 'Review smoke academic metrics and requests.', 'SCHEDULED', 'PENDING', 'DEAN-SMOKE')`,
      [SMOKE.meeting, TENANT, DEAN, HOD],
    );
    await client.query(
      `INSERT INTO portal_meeting_participants (participant_id, meeting_id, user_id, participant_role, rsvp_status)
       VALUES ($1, $2, $3, 'INVITEE', 'PENDING')`,
      [SMOKE.participant, SMOKE.meeting, FACULTY],
    );
    await client.query(
      `INSERT INTO staff_payslips (payslip_id, tenant_id, staff_user_id, month, year, gross_pay, net_pay, working_days, lwp_days, file_path, is_published, published_at)
       VALUES ($1, $2, $3, 'September', 2026, 125000, 102500, 22, 0, '/uploads/payslips/dean-smoke.pdf', true, NOW())`,
      [SMOKE.payslip, TENANT, DEAN],
    );
    await client.query(
      `INSERT INTO hr_policy_documents (policy_id, tenant_id, entity_id, title, category, file_url, version, is_mandatory, is_active, created_by_user_id)
       VALUES ($1, $2, $3, 'Dean Smoke QA Code of Conduct', 'COMPLIANCE', '/policies/dean-smoke-code-of-conduct.pdf', '1.0', true, true, $4)`,
      [SMOKE.policy, TENANT, hrEntity.entity_id, DEAN],
    );
    await client.query(
      `INSERT INTO falcon_notifications (tenant_id, user_id, category, title, message, action_link, severity, intent, action_label, metadata)
       VALUES ($1, $2, 'ACADEMICS', 'Dean smoke approval', 'Smoke notification for Dean workflow testing.', '/dean/inbox', 'info', 'action', 'Open inbox', '{"smoke":true}')
       ON CONFLICT DO NOTHING`,
      [TENANT, DEAN],
    );
    await client.query(
      `INSERT INTO system_audit_logs (table_name, record_id, action, new_value, changed_by_user_id)
       VALUES ('dean_smoke_seed', $1, 'INSERT', '{"smoke":true,"scope":"DEAN-SMOKE"}', $2)
       ON CONFLICT DO NOTHING`,
      [DEAN, DEAN],
    );

    await client.query('COMMIT');
    console.log(JSON.stringify({
      ok: true,
      dean: 'dean.smoke@mygyanvihar.com',
      password: 'password123',
      school: 'DEAN-SMOKE',
      students: STUDENTS.length,
      courses: courses.length,
      hod: 'dean.smoke.hod@mygyanvihar.com',
      faculty: 'dean.smoke.faculty@mygyanvihar.com',
      note: 'Existing faculty and student records were not deleted or modified.',
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
