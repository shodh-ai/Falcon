'use strict';

const SUBDOMAIN = 'falcon-smoke-boundary';

async function seedBoundary(ctx) {
  const tenant = await ctx.ensureRow('tenants', { name: 'Falcon Synthetic Isolation Control', subdomain: SUBDOMAIN, pg_schema: 'public', settings: { smoke_test: { seed: ctx.prefix, synthetic: true, purpose: 'Negative tenant and campus access tests only' } } }, { subdomain: SUBDOMAIN }, 'Synthetic isolation control');
  if (tenant.settings?.smoke_test?.seed !== ctx.prefix || !tenant.settings.smoke_test.synthetic) throw new Error('Boundary tenant ownership mismatch.');
  ctx.allowedTenantIds.add(tenant.tenant_id);
  const campus = await ctx.ensureRow('campuses', { campus_name: '[SMOKE v1] Isolation Control Campus', campus_code: 'FSMBND', address: 'Fictional boundary-test campus; no real address' }, { campus_name: '[SMOKE v1] Isolation Control Campus' }, 'Synthetic isolation control');
  const school = await ctx.ensureRow('schools', { school_name: '[SMOKE v1] Isolation Control School', school_code: 'FSMBND', campus_id: campus.campus_id }, { school_name: '[SMOKE v1] Isolation Control School', campus_id: campus.campus_id }, 'Synthetic isolation control');
  const dept = await ctx.ensureRow('departments', { dept_name: '[SMOKE v1] Isolation Control Department', dept_code: 'FSMBND', school_id: school.school_id, description: 'Synthetic negative-access fixture only' }, { dept_name: '[SMOKE v1] Isolation Control Department' }, 'Synthetic isolation control');
  const program = await ctx.ensureRow('iam_programs', { program_name: 'FALCON BOUNDARY TEST PROGRAM', program_code: 'FSMBND', school_id: school.school_id, dept_id: dept.dept_id, duration_years: 4 }, { program_code: 'FSMBND' }, 'Synthetic isolation control');
  const subject = await ctx.ensureRow('academic_subjects', { subject_code: 'SMK-BOUNDARY-C991', subject_name: '[SMOKE v1] Private other-tenant subject', program_id: program.program_id, semester: 2, credits: 4, subject_type: 'THEORY', is_active: true }, { subject_code: 'SMK-BOUNDARY-C991' }, 'Synthetic isolation control');
  const course = await ctx.ensureRow('academic_courses', { tenant_id: tenant.tenant_id, course_code: subject.subject_code, course_name: subject.subject_name, credits: 4, is_elective: false, course_type: 'CORE', min_attendance: 75 }, { tenant_id: tenant.tenant_id, course_code: subject.subject_code }, 'Synthetic isolation control');
  ctx.ids.boundary = { tenantId: tenant.tenant_id, campusId: campus.campus_id, courseId: course.course_id };
  ctx.report.isolationControl = ctx.ids.boundary;
}

async function verifyBoundary(ctx) {
  const primaryCourse = ctx.ids.courses[0].course_id;
  for (const [name, actor, courseId] of [
    ['Unregistered fully onboarded Student cannot read primary course workspace', ctx.actors.control, primaryCourse],
    ['Primary Student cannot read other-tenant/campus course workspace', ctx.actors.student, ctx.ids.boundary.courseId],
  ]) {
    try {
      await ctx.request(actor, 'GET', `/api/academics/student/courses/${courseId}/workspace`);
      ctx.check(name, false, 'An unauthorized course workspace was returned.');
    } catch (error) { ctx.check(name, [403, 404].includes(error.status), { status: error.status }); }
  }
  try {
    const profile = await ctx.request(ctx.actors.student, 'GET', '/api/student/profile', undefined, { headers: { 'x-tenant-subdomain': SUBDOMAIN } });
    ctx.check('Spoofed tenant header cannot change authenticated student data', profile.enrollment_no === ctx.report.student.enrollment);
  } catch (error) { ctx.check('Spoofed tenant header cannot change authenticated student data', [401, 403, 404].includes(error.status), { status: error.status }); }
}

module.exports = { seedBoundary, verifyBoundary };
