'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { spawnSync } = require('node:child_process');
const { PREFIX, LABEL, SUBDOMAIN, LOCAL, ROOT, safetyConfig, createContext, redact, identifier } = require('./core.cjs');
const { seedAcademics, verifyAcademics } = require('./academics.cjs');
const { seedFinance } = require('./finance.cjs');
const { seedPortal, verifyPortal } = require('./portal.cjs');

function secretFor(secret, key, temporary = false, studentOverride) {
  return key === 'student' && !temporary ? (studentOverride || secret) : `QA!${crypto.createHmac('sha256', secret).update(`${key}:${temporary ? 'temporary' : 'final'}`).digest('base64url')}9a`;
}

async function bootstrap(ctx, masterSecret) {
  const studentOverride = ctx.config.env.FALCON_SMOKE_STUDENT_PASSWORD;
  if (studentOverride && studentOverride.length < 16) throw new Error('Synthetic Student password override must contain at least 16 characters.');
  const actorSecret = (key, temporary = false) => secretFor(masterSecret, key, temporary, studentOverride);
  const today = (await ctx.db.query("SELECT CURRENT_DATE::text AS date")).rows[0].date;
  const tenant = await ctx.ensureRow('tenants', {
    name: 'Falcon Student Smoke Test University', subdomain: SUBDOMAIN, pg_schema: 'public',
    settings: { min_attendance_percent: 75, allowed_email_domains: ['falcon-smoke.invalid'], smoke_test: { seed: PREFIX, synthetic: true, anchorDate: today } },
  }, { subdomain: SUBDOMAIN }, 'Tenant');
  if (tenant.settings?.smoke_test?.seed !== PREFIX || !tenant.settings.smoke_test.synthetic) throw new Error('Tenant ownership marker is missing.');
  ctx.ids.tenantId = tenant.tenant_id;
  ctx.allowedTenantIds.add(tenant.tenant_id);
  ctx.seedDate = tenant.settings.smoke_test.anchorDate;
  const entity = await ctx.ensureRow('org_entities', { tenant_id: tenant.tenant_id, entity_code: 'FSMOKE', entity_name: `${LABEL} Fictional Test Institution`, is_active: true, address: 'Fictional QA institution address', contact_email: 'admin@falcon-smoke.invalid' }, { tenant_id: tenant.tenant_id, entity_code: 'FSMOKE' }, 'Synthetic organization');
  ctx.ids.entityId = entity.entity_id;
  const campus = await ctx.ensureRow('campuses', { campus_name: `${LABEL} Fictional Falcon Campus`, campus_code: 'FSMOKE', address: 'Synthetic Campus, QA Block, Fictional City - not a real address' }, { campus_name: `${LABEL} Fictional Falcon Campus` }, 'Academic structure');
  const school = await ctx.ensureRow('schools', { school_name: `${LABEL} Fictional Computing School`, school_code: 'FSM-SCH', campus_id: campus.campus_id }, { school_name: `${LABEL} Fictional Computing School`, campus_id: campus.campus_id }, 'Academic structure');
  const department = await ctx.ensureRow('departments', { dept_name: `${LABEL} Fictional Computing Department`, dept_code: 'FSM-DEPT', school_id: school.school_id, description: 'Dedicated synthetic test department. No real student or faculty records.' }, { dept_name: `${LABEL} Fictional Computing Department` }, 'Academic structure');
  const program = await ctx.ensureRow('iam_programs', { program_name: 'FALCON SMOKE PROGRAM', program_code: 'FSMK01', school_id: school.school_id, dept_id: department.dept_id, duration_years: 4 }, { program_code: 'FSMK01' }, 'Academic structure');
  const batch = await ctx.ensureRow('academic_sis_batches', { batch_name: `${LABEL} 2026 Cohort`, program_id: program.program_id, academic_year: ctx.academicYear, current_semester: 2, section_count: 1 }, { batch_name: `${LABEL} 2026 Cohort`, program_id: program.program_id }, 'Academic structure');
  const section = await ctx.ensureRow('academic_sections', { tenant_id: tenant.tenant_id, program_id: program.program_id, section_name: 'S', capacity: 30 }, { tenant_id: tenant.tenant_id, program_id: program.program_id, section_name: 'S' }, 'Academic structure');
  Object.assign(ctx.ids, { campusId: campus.campus_id, schoolId: school.school_id, deptId: department.dept_id, programId: program.program_id, batchId: batch.batch_id, sectionId: section.section_id });
  if (school.campus_id !== campus.campus_id || department.school_id !== school.school_id || program.dept_id !== department.dept_id || program.school_id !== school.school_id || batch.program_id !== program.program_id || batch.current_semester !== 2 || batch.academic_year !== ctx.academicYear || section.program_id !== program.program_id) throw new Error('Synthetic academic structure drift; refusing to overwrite.');

  for (const key of ['admin', 'approver']) {
    const role = (await ctx.db.query("SELECT role_id FROM roles WHERE role_name='SuperAdmin' AND deleted_at IS NULL")).rows[0];
    if (!role) throw new Error('Existing SuperAdmin role missing.');
    const email = `${key}@falcon-smoke.invalid`;
    const row = await ctx.ensureRow('users', { tenant_id: tenant.tenant_id, name: `${LABEL} Synthetic ${key}`, official_email: email, role_id: role.role_id, dept_id: department.dept_id, is_active: true, onboarding_status: 'ACTIVE', account_status: 'ACTIVE', password_hash: await bcrypt.hash(secretFor(masterSecret, key), 10) }, { tenant_id: tenant.tenant_id, official_email: email }, 'Synthetic supporting actors');
    await ctx.ensureRow('user_roles', { user_id: row.user_id, role_id: role.role_id, is_primary: true }, { user_id: row.user_id, role_id: role.role_id }, 'Synthetic role links');
    ctx.actors[key] = { id: row.user_id, email, role: 'SuperAdmin', password: secretFor(masterSecret, key), subdomain: SUBDOMAIN };
    ctx.ids[`${key}Id`] = row.user_id;
    await login(ctx, ctx.actors[key]);
  }
  for (const feature of ['exams', 'helpdesk', 'mentorship', 'transport', 'hostel', 'iqac', 'hr']) {
    await ctx.ensureRow('tenant_subscriptions', { tenant_id: tenant.tenant_id, feature_key: feature, is_enabled: true }, { tenant_id: tenant.tenant_id, feature_key: feature }, 'Synthetic feature subscriptions');
  }
  await activate(ctx, 'admissions_onboarding');
  await activate(ctx, 'sis_academics');
  await activate(ctx, 'hrms_ess');
  for (const [key, role, name] of [['faculty', 'Faculty', 'Morgan Testfaculty'], ['dean', 'Dean', 'Taylor Testdean'], ['examCell', 'ExamCell', 'Alex Testexam'], ['student', 'Student', 'Nova Testlearner'], ['control', 'Student', 'Rowan Testcontrol']]) {
    const email = `${key.toLowerCase()}@falcon-smoke.invalid`;
    let row = (await ctx.db.query('SELECT * FROM users WHERE tenant_id=$1 AND official_email=$2', [tenant.tenant_id, email])).rows[0];
    if (!row) {
      const created = await ctx.request(ctx.actors.admin, 'POST', '/api/admin-control/users', { name: `${LABEL} ${name}`, email, role_name: role, dept_id: department.dept_id, is_active: true, temporary_password: actorSecret(key, true) });
      row = (await ctx.db.query('SELECT * FROM users WHERE tenant_id=$1 AND user_id=$2', [tenant.tenant_id, created.user_id])).rows[0];
      await ctx.track('users', row, 'Synthetic accounts', true);
    } else {
      if (row.dept_id !== department.dept_id || !row.name.startsWith(LABEL)) throw new Error('Synthetic account ownership drift.');
      await ctx.ensureRow('users', {}, { tenant_id: tenant.tenant_id, official_email: email }, 'Synthetic accounts');
      await ctx.track('users', row, 'Synthetic accounts');
    }
    const resetting = row.onboarding_status === 'PENDING_PASSWORD_RESET';
    const actor = { id: row.user_id, email, role, name: row.name, password: actorSecret(key, resetting), subdomain: SUBDOMAIN };
    ctx.actors[key] = actor;
    ctx.ids[`${key}Id`] = row.user_id;
    await login(ctx, actor);
    if (resetting) {
      await ctx.request(actor, 'POST', '/api/auth/change-password', { current_password: actor.password, new_password: actorSecret(key), confirm_password: actorSecret(key) });
      actor.password = actorSecret(key);
      await login(ctx, actor);
    }
    for (const roleRow of (await ctx.db.query('SELECT * FROM user_roles WHERE user_id=$1', [row.user_id])).rows) await ctx.track('user_roles', roleRow, 'Synthetic role links');
  }
  // Only the dedicated school is linked to its synthetic Dean.
  await ctx.db.query('UPDATE schools SET dean_user_id=$1 WHERE school_id=$2 AND school_name=$3 AND dean_user_id IS NULL', [ctx.ids.deanId, school.school_id, school.school_name]);
  const profile = (await ctx.db.query('SELECT * FROM student_profiles WHERE tenant_id=$1 AND user_id=$2', [tenant.tenant_id, ctx.ids.studentId])).rows[0];
  if (!profile) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const enrollment = `ENR-${ctx.seedDate.slice(0, 4)}-${suffix}`; // Existing Admissions fallback format.
    await ctx.ensureRow('student_profiles', { tenant_id: tenant.tenant_id, user_id: ctx.ids.studentId, enrollment_no: enrollment, enrollment_number: enrollment, student_login_id: enrollment, admission_number: `SMOKE-ADM-${suffix}`, batch: 'FALCON SMOKE PROGRAM', program_name: 'FALCON SMOKE PROGRAM', school_name: school.school_name, branch_name: department.dept_name, degree_name: 'Synthetic four-year undergraduate program', current_semester: 2, section_code: 'S', admission_type: 'REGULAR', admission_status: 'ACTIVE', migration_certificate_status: 'NOT_REQUIRED', final_result: 'IN_PROGRESS', no_dues_status: 'NOT_STARTED', degree_award_status: 'NOT_ELIGIBLE', status: 'ACTIVE', nationality: 'Indian', graduation_year: 2030 }, { tenant_id: tenant.tenant_id, user_id: ctx.ids.studentId }, 'Student profile');
  } else {
    if (profile.batch !== 'FALCON SMOKE PROGRAM' || profile.current_semester !== 2 || profile.section_code !== 'S' || profile.enrollment_no !== profile.student_login_id) throw new Error('Synthetic student profile drift.');
    await ctx.ensureRow('student_profiles', {}, { tenant_id: tenant.tenant_id, user_id: ctx.ids.studentId }, 'Student profile');
  }
  await onboard(ctx, ctx.actors.student, 'student');
  await onboard(ctx, ctx.actors.control, 'student');
  const controlProfile = (await ctx.db.query('SELECT * FROM student_profiles WHERE tenant_id=$1 AND user_id=$2', [tenant.tenant_id, ctx.ids.controlId])).rows[0];
  await ctx.track('student_profiles', controlProfile, 'Synthetic isolation control profile');
  for (const key of ['faculty', 'dean']) await onboard(ctx, ctx.actors[key], 'staff');
  for (const key of ['finance_procurement', 'examinations_credentials', 'helpdesk_esm', 'campus_operations', 'clinic_safety']) await activate(ctx, key);
  ctx.report.student = { userId: ctx.ids.studentId, email: ctx.actors.student.email, tenantId: tenant.tenant_id, subdomain: SUBDOMAIN, enrollment: (await ctx.db.query('SELECT enrollment_no FROM student_profiles WHERE tenant_id=$1 AND user_id=$2', [tenant.tenant_id, ctx.ids.studentId])).rows[0].enrollment_no, campus: campus.campus_name, program: 'FALCON SMOKE PROGRAM', semester: 2, academicYear: ctx.academicYear };
}

async function login(ctx, actor) {
  const data = await ctx.request({ subdomain: actor.subdomain }, 'POST', '/api/auth/local-login', { email: actor.email, password: actor.password });
  actor.token = data.token || data.access_token;
  if (!actor.token) throw new Error('Supported local login returned no token.');
  ctx.check(`${actor.role} real password login`, Boolean(data.user && actor.token));
  return data;
}

async function activate(ctx, key) {
  const current = (await ctx.db.query("SELECT * FROM platform_module_states WHERE tenant_id=$1 AND module_key=$2 AND scope_type='TENANT' AND scope_id IS NULL", [ctx.ids.tenantId, key])).rows[0];
  if (current?.state === 'ACTIVE') { await ctx.track('platform_module_states', current, 'Synthetic module configuration'); return; }
  const catalog = (await ctx.db.query('SELECT module_key FROM platform_module_catalog WHERE module_key=$1', [key])).rows[0];
  if (!catalog) throw new Error(`Existing module catalogue entry missing: ${key}; do not invent it.`);
  const createKey = `${PREFIX}:${key}:create`;
  let rollout = (await ctx.db.query('SELECT * FROM platform_module_rollouts WHERE tenant_id=$1 AND proposer_id=$2 AND create_idempotency_key=$3', [ctx.ids.tenantId, ctx.ids.adminId, createKey])).rows[0];
  if (!rollout) rollout = await ctx.request(ctx.actors.admin, 'POST', '/api/platform/module-rollouts', { module_key: key, scope_type: 'TENANT', desired_state: 'ACTIVE', reason: `${LABEL} Dedicated local synthetic test tenant only` }, { headers: { 'Idempotency-Key': createKey } });
  if (rollout.status === 'DRAFT') {
    await ctx.request(ctx.actors.admin, 'POST', `/api/platform/module-rollouts/${rollout.rollout_id}/submit`, undefined, { headers: { 'If-Match': String(rollout.revision), 'Idempotency-Key': `${PREFIX}:${key}:submit` } });
    rollout = (await ctx.db.query('SELECT * FROM platform_module_rollouts WHERE tenant_id=$1 AND rollout_id=$2', [ctx.ids.tenantId, rollout.rollout_id])).rows[0];
  }
  if (rollout.status === 'SUBMITTED') {
    await ctx.request(ctx.actors.approver, 'POST', `/api/platform/module-rollouts/${rollout.rollout_id}/approve`, undefined, { headers: { 'If-Match': String(rollout.revision), 'Idempotency-Key': `${PREFIX}:${key}:approve` } });
    rollout = (await ctx.db.query('SELECT * FROM platform_module_rollouts WHERE tenant_id=$1 AND rollout_id=$2', [ctx.ids.tenantId, rollout.rollout_id])).rows[0];
  }
  if (rollout.status !== 'APPLIED') throw new Error(`Module rollout did not complete: ${key}`);
  await ctx.track('platform_module_rollouts', rollout, 'Maker/checker module approvals');
  const state = (await ctx.db.query("SELECT * FROM platform_module_states WHERE tenant_id=$1 AND module_key=$2 AND scope_type='TENANT' AND scope_id IS NULL", [ctx.ids.tenantId, key])).rows[0];
  await ctx.track('platform_module_states', state, 'Synthetic module configuration');
  ctx.check(`${key}: actual maker/checker activation`, state.state === 'ACTIVE' && rollout.proposer_id !== rollout.approver_id);
}

async function onboard(ctx, actor, kind) {
  const table = kind === 'student' ? 'student_onboarding_docs' : 'staff_onboarding_docs';
  const userColumn = kind === 'student' ? 'student_user_id' : 'staff_user_id';
  const status = await ctx.request(actor, 'GET', `/api/${kind}/onboarding/status`);
  if (status.onboarding_status === 'COMPLETED' || status.status === 'COMPLETED') return;
  const body = kind === 'student' ? {
    blood_group: 'O+', parent_contact_phone: '9999990001', abc_id: actor.id === ctx.ids.studentId ? '990000000001' : '990000000002', student_mobile: actor.id === ctx.ids.studentId ? '9999990002' : '9999990003', gender: 'Other', date_of_birth: '2005-04-12', father_name: 'Fictional Test Guardian One', mother_name: 'Fictional Test Guardian Two', emergency_contact_name: 'Fictional Test Guardian One', emergency_contact_phone: '9999990001', permanent_address: 'Synthetic Address 1, QA City - not a real address', current_address: 'Synthetic Campus QA Block - not a real address', parent_occupation: 'Fictional QA profession', annual_income: '500000',
  } : {
    blood_group: 'O+', staff_mobile: '9999990010', pan_number: actor.role === 'Faculty' ? 'ZZZZZ9901Z' : 'ZZZZZ9902Z', aadhaar_number: actor.role === 'Faculty' ? '990000000011' : '990000000012', bank_account_no: actor.role === 'Faculty' ? '990000000011' : '990000000012', ifsc_code: 'TEST0000001', gender: 'Other', date_of_birth: '1985-04-12', emergency_contact_name: 'Fictional Staff Test Contact', emergency_contact_phone: '9999990011', permanent_address: 'Fictional QA Staff Address', current_address: 'Fictional QA Staff Address', orcid_id: actor.role === 'Faculty' ? '0000-0000-0000-0001' : '0000-0000-0000-0002', total_experience_years: '8', degree_level: 'Ph.D.', university: 'Fictional Smoke Test University', passing_year: '2016',
  };
  if (status.onboarding_status !== 'PENDING_ADMIN_APPROVAL') await ctx.request(actor, 'POST', `/api/${kind}/onboarding/profile`, body);
  const docs = kind === 'student' ? ['AADHAAR', '10TH_MARKSHEET', '12TH_MARKSHEET', 'PHOTO'] : ['AADHAAR', 'PAN', 'HIGHEST_DEGREE', 'PHOTO'];
  for (const docType of docs) {
    let doc = (await ctx.db.query(`SELECT * FROM ${identifier(table)} WHERE tenant_id=$1 AND ${identifier(userColumn)}=$2 AND doc_type=$3`, [ctx.ids.tenantId, actor.id, docType])).rows[0];
    if (!doc) {
      const kindForDoc = { AADHAAR: 'identity', '10TH_MARKSHEET': 'secondary', '12TH_MARKSHEET': 'senior-secondary', PHOTO: 'photo', PAN: 'identity', HIGHEST_DEGREE: 'certificate' }[docType];
      await ctx.upload(actor, `/api/${kind}/onboarding/documents/${docType}`, {}, await ctx.fixture(kindForDoc));
      doc = (await ctx.db.query(`SELECT * FROM ${identifier(table)} WHERE tenant_id=$1 AND ${identifier(userColumn)}=$2 AND doc_type=$3`, [ctx.ids.tenantId, actor.id, docType])).rows[0];
      await ctx.track(table, doc, 'Actual onboarding document uploads', true);
    } else await ctx.track(table, doc, 'Actual onboarding document uploads');
  }
  const current = (await ctx.db.query('SELECT onboarding_status FROM users WHERE tenant_id=$1 AND user_id=$2', [ctx.ids.tenantId, actor.id])).rows[0].onboarding_status;
  if (current !== 'PENDING_ADMIN_APPROVAL') await ctx.request(actor, 'POST', `/api/${kind}/onboarding/submit`, {});
  const route = kind === 'student' ? '/api/admin/student-verifications' : '/api/staff/verifications';
  await ctx.request(ctx.actors.admin, 'POST', `${route}/${actor.id}/approve`, {});
  const final = (await ctx.db.query('SELECT onboarding_status FROM users WHERE tenant_id=$1 AND user_id=$2', [ctx.ids.tenantId, actor.id])).rows[0];
  ctx.check(`${actor.role}: full onboarding approval workflow`, final.onboarding_status === 'COMPLETED');
}

async function learningAcceptance(ctx) {
  if (!(await ctx.db.query("SELECT 1 FROM platform_module_catalog WHERE module_key='lms_learning'")).rowCount) throw new Error('Missing canonical LMS catalogue entry; awaiting explicit approval before adding it.');
  const metadata = (await ctx.db.query(`SELECT COUNT(*)::int AS count FROM student_course_enrollments WHERE tenant_id=$1 AND student_user_id=$2 AND status='ENROLLED' AND deleted_at IS NULL`, [ctx.ids.tenantId, ctx.ids.studentId])).rows[0];
  const modules = await ctx.request(ctx.actors.admin, 'GET', '/api/platform/modules');
  if (!modules.some((module) => module.moduleKey === 'lms_learning')) throw new Error('Existing LMS module definition unavailable.');
  const unit = spawnSync(process.execPath, ['--test', ...['core', 'academics', 'finance', 'portal', 'browser'].map((name) => path.join(__dirname, `${name}.test.cjs`))], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
  ctx.check('Executed prelaunch fixture, ownership and workflow regression tests', unit.status === 0);
  if (unit.status !== 0 || metadata.count !== 3) throw new Error('LMS prerequisites did not pass.');
  const suites = ['modules/lms-extended/lms-extended.service.spec.ts', 'modules/academics/faculty-course-access.spec.ts', 'modules/academics/student-timetable-visibility.spec.ts', 'modules/student-portal/student-profile-file.security.spec.ts', 'modules/student-portal/student-portal.security.spec.ts', 'uploads/upload-file-access.spec.ts'];
  const regression = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/jest/bin/jest.js'), '--runInBand', '--silent', ...suites.map((name) => `src/${name}`)], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
  ctx.check('Existing LMS and Student security regression suites', regression.status === 0, { suites, summary: `${regression.stdout}\n${regression.stderr}`.slice(-1500) });
  if (regression.status !== 0) throw new Error('Existing LMS/security acceptance tests failed.');
  const doc = (await ctx.db.query("SELECT file_path FROM student_onboarding_docs WHERE tenant_id=$1 AND student_user_id=$2 AND doc_type='AADHAAR'", [ctx.ids.tenantId, ctx.ids.studentId])).rows[0];
  const url = `${ctx.config.api}/api/uploads/download?path=${encodeURIComponent(doc.file_path)}`;
  const stored = await fetch(url, { headers: { Authorization: `Bearer ${ctx.actors.student.token}`, 'x-tenant-subdomain': SUBDOMAIN }, signal: AbortSignal.timeout(10000) });
  const forbidden = await fetch(url, { headers: { Authorization: `Bearer ${ctx.actors.control.token}`, 'x-tenant-subdomain': SUBDOMAIN }, signal: AbortSignal.timeout(10000) });
  const storagePassed = stored.ok && Buffer.from(await stored.arrayBuffer()).subarray(0, 4).toString() === '%PDF' && [403, 404].includes(forbidden.status);
  ctx.check('Real prelaunch protected PDF readback and other-Student denial', storagePassed);
  if (!storagePassed) throw new Error('Protected storage acceptance did not pass.');
  const pdf = await ctx.fixture('material');
  if (pdf.buffer.subarray(0, 4).toString() !== '%PDF') throw new Error('Real PDF storage fixture missing.');
  for (const key of ['DATA_MIGRATION', 'STORAGE_HEALTH', 'LMS_SMOKE', 'SECURITY_ACCEPTANCE']) {
    const details = { synthetic: true, seed: PREFIX, stage: 'prelaunch', student_id: ctx.ids.studentId, enrollment_count: metadata.count, regression_suites: suites, evidence: key === 'LMS_SMOKE' ? 'Executed existing LMS service and course access regression tests plus fixture tests; live LMS API/browser tests run AFTER activation and are reported separately.' : key === 'STORAGE_HEALTH' ? 'Real owned onboarding PDF downloaded and parsed; another fully onboarded Student denied.' : 'Verified tenant-owned enrollment foundations; executed existing Student data/file security and LMS access regression tests.' };
    const hash = crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex');
    const existing = (await ctx.db.query("SELECT * FROM platform_module_readiness_evidence WHERE tenant_id=$1 AND module_key='lms_learning' AND scope_type='TENANT' AND check_key=$2 AND recorded_by=$3", [ctx.ids.tenantId, key, ctx.ids.adminId])).rows[0];
    if (!existing) await ctx.request(ctx.actors.admin, 'POST', '/api/platform/module-readiness/lms_learning/evidence', { scope_type: 'TENANT', check_key: key, status: 'PASS', evidence_hash: hash, details }, { headers: { 'Idempotency-Key': `${PREFIX}:lms:${key}` } });
  }
  await activate(ctx, 'lms_learning');
}

async function inventory(ctx) {
  const names = (await ctx.db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id' ORDER BY table_name")).rows.map((row) => row.table_name);
  const counts = {};
  for (const name of names) counts[name] = Number((await ctx.db.query(`SELECT COUNT(*)::int AS count FROM ${identifier(name)} WHERE tenant_id=$1`, [ctx.ids.tenantId])).rows[0].count);
  return counts;
}

async function protectedSnapshot(ctx) {
  const names = (await ctx.db.query("SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id' UNION SELECT unnest(ARRAY['campuses','schools','departments','iam_programs','academic_sis_batches','roles','platform_module_catalog']) ORDER BY 1")).rows.map((row) => row.table_name);
  const result = {};
  for (const table of names) {
    const { primary, columns } = await ctx.schema(table);
    if (!primary.length) continue;
    const hasTenant = columns.some((column) => column.column_name === 'tenant_id');
    const where = hasTenant ? 'WHERE tenant_id::text IS DISTINCT FROM $1::text' : '';
    const keys = primary.map((name) => `COALESCE(t.${identifier(name)}::text,'')`).join(", ':' ,");
    const rows = (await ctx.db.query(`SELECT concat(${keys}) AS key, md5(row_to_json(t)::text) AS checksum FROM ${identifier(table)} t ${where}`, hasTenant ? [ctx.ids.tenantId || null] : [])).rows;
    result[table] = Object.fromEntries(rows.map((row) => [row.key, row.checksum]));
  }
  return result;
}

async function verify(ctx) {
  await verifyAcademics(ctx);
  await verifyPortal(ctx, ctx.ids.portal);
  await require('./boundary.cjs').verifyBoundary(ctx);
  await require('./downloads.cjs').verifyDownloads(ctx);
  for (const route of ['/api/student/profile', '/api/student/attendance', '/api/student/marks', '/api/student/exam-desk', '/api/student/finance', '/api/student/documents', '/api/student/admission-vault', '/api/student/academic-calendar', '/api/notifications/recent', '/api/notifications/unread-count', '/api/academics/dashboard/metrics', '/api/academics/courses/my-enrollments']) {
    try { await ctx.request(ctx.actors.student, 'GET', route); ctx.check(`Live GET ${route}`, true); } catch (error) { ctx.check(`Live GET ${route}`, false, error.message); }
  }
  const profile = await ctx.request(ctx.actors.student, 'GET', '/api/student/profile');
  ctx.check('Student profile academic fields match existing API mapping', Number(profile.semester) === 2 && profile.session === 'FALCON SMOKE PROGRAM' && profile.branch === `${LABEL} Fictional Computing Department`);
  const files = (await ctx.db.query('SELECT file_path FROM student_certificates WHERE tenant_id=$1 AND student_user_id=$2 AND deleted_at IS NULL LIMIT 1', [ctx.ids.tenantId, ctx.ids.studentId])).rows;
  if (files[0]) {
    const url = `${ctx.config.api}/api/uploads/download?path=${encodeURIComponent(files[0].file_path)}`;
    const own = await fetch(url, { headers: { Authorization: `Bearer ${ctx.actors.student.token}`, 'x-tenant-subdomain': SUBDOMAIN } });
    ctx.check('Owned synthetic document download', own.ok && Buffer.from(await own.arrayBuffer()).subarray(0, 4).toString() === '%PDF');
    const denied = await fetch(url, { headers: { Authorization: `Bearer ${ctx.actors.control.token}`, 'x-tenant-subdomain': SUBDOMAIN } });
    ctx.check('Different Student cannot download test student private document', [403, 404].includes(denied.status));
    const anonymous = await fetch(url);
    ctx.check('Anonymous document access denied', [401, 403].includes(anonymous.status));
  }
  ctx.blocked('Student Library UI', 'Existing Coming Soon launch flag remains disabled; no launch setting changed.');
  ctx.blocked('Degree issuance', 'An active semester-2 student is not degree-eligible; no issued degree fabricated.');
  ctx.blocked('Surveys/feedback', 'No implemented standalone Student survey workflow was found.');
  ctx.blocked('Placements', 'Local legacy placement tables are not safely tenant-scoped; no global jobs or records reused.');
  if (process.argv.includes('--browser')) {
    const { verifyBrowser } = require('./browser.cjs');
    ctx.config.web = 'http://falcon-student-smoke.localhost:3100';
    ctx.report.browser = await verifyBrowser(ctx);
  } else ctx.blocked('Real browser smoke', 'Not requested for this run; use --browser with the isolated real frontend.');
}

async function main() {
  const config = safetyConfig();
  const secret = config.env.FALCON_SMOKE_PASSWORD;
  if (!secret || secret.length < 16) throw new Error('Provide a secure runtime FALCON_SMOKE_PASSWORD (minimum 16 characters); never commit or log it.');
  const ctx = await createContext(config);
  try {
    await ctx.db.query('BEGIN');
    // Schema was approved separately; seed never applies destructive/all migrations.
    for (const table of ['platform_module_readiness_evidence', 'academic_calendar_days', 'academic_practical_batches', 'academic_practical_batch_members']) await ctx.schema(table);
    await ctx.db.query('COMMIT');
    const existingTenant = (await ctx.db.query('SELECT tenant_id FROM tenants WHERE subdomain=$1', [SUBDOMAIN])).rows[0];
    ctx.ids.tenantId = existingTenant?.tenant_id;
    const baselineFile = path.join(LOCAL, 'protected-baseline.json');
    fs.mkdirSync(LOCAL, { recursive: true });
    const baseline = await protectedSnapshot(ctx);
    if (!fs.existsSync(baselineFile)) fs.writeFileSync(baselineFile, JSON.stringify(baseline));
    const originalBaseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    ctx.report.previousBaselineDifferences = Object.fromEntries(Object.entries(originalBaseline).map(([table, rows]) => [table, Object.entries(rows).filter(([key, checksum]) => baseline[table]?.[key] !== checksum).length]).filter(([, count]) => count));
    ctx.report.protectionBaselineStartedAt = new Date().toISOString();
    fs.writeFileSync(path.join(LOCAL, 'protected-run-baseline.json'), JSON.stringify(baseline));
    const initial = existingTenant ? await inventory(ctx) : {};
    await bootstrap(ctx, secret);
    await require('./recover-cheque.cjs').recoverApprovedCheque(ctx);
    ctx.beforeLearning = learningAcceptance;
    const before = await inventory(ctx);
    await seedAcademics(ctx);
    let financeReady = true;
    try { await seedFinance(ctx); } catch (error) {
      financeReady = false;
      ctx.blocked('Complete synthetic Finance workflow', error.message);
    }
    ctx.report.financeWorkflowReady = financeReady;
    await seedPortal(ctx);
    await require('./boundary.cjs').seedBoundary(ctx);
    ctx.report.dataSeeded = true;
    await verify(ctx);
    ctx.report.dataValidationPassed = !ctx.report.tests.some((test) => test.status === 'FAIL' && !test.name.startsWith('Browser '));
    const first = await inventory(ctx);
    if (process.argv.includes('--repeat')) {
      await seedAcademics(ctx);
      if (financeReady) await seedFinance(ctx);
      await seedPortal(ctx);
      const repeated = await inventory(ctx);
      const domainTables = ['users', 'student_profiles', 'student_course_enrollments', 'academic_timetables', 'course_attendance_logs', 'academic_assignments', 'assignment_submissions', 'finance_fee_demands', 'finance_transactions', 'exam_schedules', 'exam_result_sessions', 'academic_marks', 'student_exam_reports', 'grade_cards', 'student_documents', 'student_certificates', 'course_materials', 'helpdesk_tickets'];
      for (const table of domainTables) ctx.check(`Second seed run: no duplicate ${table}`, first[table] === repeated[table], { first: first[table] || 0, second: repeated[table] || 0 });
      ctx.report.inventory = repeated;
    } else ctx.report.inventory = first;
    ctx.report.createdSinceAcademicStage = Object.fromEntries(Object.entries(ctx.report.inventory).map(([key, count]) => [key, count - (before[key] || 0)]).filter(([, count]) => count));
    ctx.report.createdThisRun = Object.fromEntries(Object.entries(ctx.report.inventory).map(([key, count]) => [key, count - (initial[key] || 0)]).filter(([, count]) => count));
    const after = await protectedSnapshot(ctx);
    for (const [table, rows] of Object.entries(baseline)) ctx.check(`Existing non-smoke ${table} records unchanged`, Object.entries(rows).every(([key, checksum]) => after[table]?.[key] === checksum), { originalRecords: Object.keys(rows).length });
    if (ctx.report.tests.some((item) => item.status === 'FAIL')) throw new Error('One or more executed verification checks failed; see the redacted report.');
    ctx.report.completed = true;
  } catch (error) {
    await ctx.db.query('ROLLBACK').catch(() => {});
    ctx.report.completed = false;
    ctx.check('Complete seed execution', false, error.message);
    throw error;
  } finally {
    if (ctx.ids.tenantId) ctx.report.inventory = await inventory(ctx).catch(() => ({}));
    const baselineFile = path.join(LOCAL, 'protected-run-baseline.json');
    if (fs.existsSync(baselineFile)) {
      const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
      const after = await protectedSnapshot(ctx);
      for (const [table, rows] of Object.entries(baseline)) {
        const name = `Existing non-smoke ${table} records unchanged`;
        if (!ctx.report.tests.some((test) => test.name === name)) ctx.check(name, Object.entries(rows).every(([key, checksum]) => after[table]?.[key] === checksum), { originalRecords: Object.keys(rows).length });
      }
    }
    ctx.saveReport();
    await ctx.close();
    console.log(JSON.stringify({ completed: ctx.report.completed, student: ctx.report.student, tests: ctx.report.tests.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {}), report: path.join(LOCAL, 'report.json') }));
  }
}

if (require.main === module) main().catch((error) => { console.error('Guarded seed stopped:', error.message); process.exitCode = 1; });
module.exports = { bootstrap, login, activate, onboard, learningAcceptance, inventory, verify, secretFor };
