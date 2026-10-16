'use strict';

// Finish only an owned synthetic upload interrupted before its publication.
// Reuse the original LMS allocation validator; never insert visibility by SQL.
const path = require('node:path');
const { DataSource } = require('typeorm');
const { ROOT, PREFIX } = require('./core.cjs');

async function resumeMaterialPublication(ctx, material, course) {
  if (ctx.config.env.NODE_ENV !== 'test' || ctx.config.env.FALCON_SMOKE_ENABLE !== '1' || !ctx.actors.faculty?.token || ctx.actors.faculty.role !== 'Faculty' || material.tenant_id !== ctx.ids.tenantId || material.course_id !== course.course_id || material.faculty_user_id !== ctx.ids.facultyId || material.title !== `[SMOKE v1] ${course.course_code} published notes`) throw new Error('Only an owned synthetic material can be resumed.');
  const owner = (await ctx.db.query(`SELECT m.material_id FROM course_materials m JOIN course_modules cm ON cm.module_id=m.module_id AND cm.tenant_id=m.tenant_id JOIN tenants t ON t.tenant_id=m.tenant_id JOIN users u ON u.user_id=m.faculty_user_id AND u.tenant_id=m.tenant_id WHERE m.material_id=$1 AND m.tenant_id=$2 AND m.faculty_user_id=$3 AND cm.faculty_user_id=$3 AND m.deleted_at IS NULL AND cm.deleted_at IS NULL AND u.is_active=true AND u.official_email='faculty@falcon-smoke.invalid' AND t.settings->'smoke_test'->>'seed'=$4`, [material.material_id, ctx.ids.tenantId, ctx.ids.facultyId, PREFIX])).rows[0];
  if (!owner || !material.file_path) throw new Error('Interrupted material ownership/file proof failed.');
  await ctx.request(ctx.actors.faculty, 'GET', `/api/academics/faculty/courses/${course.course_id}/workspace`);
  Object.assign(process.env, { TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node', resolvePackageJsonExports: false }) });
  require('reflect-metadata');
  require('ts-node/register/transpile-only');
  const entities = require(path.join(ROOT, 'src/entities/index.ts'));
  const { CourseLmsService } = require(path.join(ROOT, 'src/modules/academics/course-lms.service.ts'));
  const db = new DataSource({ type: 'postgres', host: ctx.config.db.host, port: ctx.config.db.port, username: ctx.config.db.user, password: ctx.config.db.password, database: ctx.config.db.database, entities: Object.values(entities).filter((entity) => typeof entity === 'function'), synchronize: false, migrationsRun: false, logging: false });
  await db.initialize();
  try {
    const repo = (name) => db.getRepository(entities[name]);
    const service = new CourseLmsService(repo('CourseModule'), repo('CourseMaterial'), repo('CourseMaterialVisibility'), repo('CourseAllocation'), repo('AcademicCourse'), repo('StudentCourseEnrollment'), repo('AcademicTimetable'), repo('User'), db, null, null, null);
    await service.attachMaterialVisibility(material.material_id, [course.allocation_id], ctx.ids.facultyId, ctx.ids.tenantId, course.course_id);
    const saved = (await ctx.db.query('SELECT * FROM course_material_visibility WHERE material_id=$1 AND allocation_id=$2', [material.material_id, course.allocation_id])).rows;
    if (saved.length !== 1) throw new Error('Original publication validator did not persist exactly one visibility link.');
    await ctx.track('course_material_visibility', saved[0], 'Resumed original LMS publication', true);
    ctx.check('Interrupted own material publication resumed through original scope validator', true, { materialId: material.material_id });
  } finally { await db.destroy(); }
}

module.exports = { resumeMaterialPublication };
