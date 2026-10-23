#!/usr/bin/env node
'use strict';

// Synthetic integration fixture only. No dotenv, application credentials,
// migrations, schema synchronization, production mounts or public-table access.
// Run after `npm run build`:
// FALCON_TEST_DB=1 node scripts/test-course-material-preservation.cjs \
//   --host /tmp --user apple --database postgres
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const expectedArgs = ['--host', '/tmp', '--user', 'apple', '--database', 'postgres'];
if (
  process.env.FALCON_TEST_DB !== '1' ||
  JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expectedArgs)
) {
  console.error('Refusing: explicit FALCON_TEST_DB=1 and local /tmp/apple/postgres arguments are required.');
  process.exit(2);
}
// libpq-style environment variables must not redirect this local-only fixture.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('PG') || key === 'DATABASE_URL') delete process.env[key];
}
require('reflect-metadata');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { CourseMaterial } = require('../dist/entities/course-material.entity.js');
const { CourseModule } = require('../dist/entities/course-module.entity.js');
const { CourseMaterialVisibility } = require('../dist/entities/course-material-visibility.entity.js');
const { CourseLmsService } = require('../dist/modules/academics/course-lms.service.js');
const { AdminControlService } = require('../dist/modules/admin-control/admin-control.service.js');

const schema = `falcon_material_test_${randomUUID().replaceAll('-', '')}`;
assert.match(schema, /^falcon_material_test_[a-f0-9]{32}$/);
const quotedSchema = `"${schema}"`;
const options = {
  host: '/tmp', port: 5432, user: 'apple', database: 'postgres',
  ssl: false, connectionTimeoutMillis: 3000,
  application_name: 'falcon_synthetic_material_preservation',
  options: `-c search_path=${schema},pg_catalog -c statement_timeout=10000 -c lock_timeout=5000`,
};
const source = new DataSource({
  type: 'postgres', ...options, username: options.user,
  schema, entities: [path.join(__dirname, '../dist/entities/*.entity.js')],
  synchronize: false, dropSchema: false, migrationsRun: false,
  installExtensions: false, logging: false,
  extra: { ...options, max: 4 },
});
const setup = new Client(options);
const clients = new Set();
const passed = [];
let fileRoot;
let schemaCreated = false;

function hash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function service(manager = source.manager, db = source) {
  return new CourseLmsService(
    manager.getRepository(CourseModule),
    manager.getRepository(CourseMaterial),
    manager.getRepository(CourseMaterialVisibility),
    {}, {}, {}, {}, {}, db, {},
    { isEnabled() { throw new Error('Storage deletion must never be called'); } },
    {},
  );
}
async function denied(promise, status = 400) {
  await assert.rejects(promise, (error) => error.getStatus?.() === status);
}
async function snapshot() {
  const tables = ['academic_courses', 'course_modules', 'course_materials', 'course_material_visibility'];
  const result = {};
  for (const table of tables) {
    result[table] = await source.query(`SELECT * FROM ${quotedSchema}."${table}" ORDER BY 1`);
  }
  return result;
}
async function client() {
  const connection = new Client(options);
  await connection.connect();
  clients.add(connection);
  return connection;
}
async function closeClient(connection) {
  try { await connection.query('ROLLBACK'); } catch {}
  await connection.end();
  clients.delete(connection);
}

// PostgreSQL FK insertion takes KEY SHARE on its parent. Prove the candidate's
// stronger FOR UPDATE lock blocks a racing insertion, for both parent kinds.
async function proveForeignKeyRace(parentTable, parentColumn, kind) {
  const tenant = randomUUID();
  const course = randomUUID();
  const module = randomUUID();
  await source.query(
    `INSERT INTO ${quotedSchema}.academic_courses
       (course_id, tenant_id, course_code, course_name, credits, is_elective)
     VALUES ($1,$2,$3,'Synthetic race parent',1,false)`,
    [course, tenant, `RACE-${kind}`],
  );
  if (kind === 'module') {
    await source.query(
      `INSERT INTO ${quotedSchema}.course_modules
       (module_id,tenant_id,course_id,faculty_user_id,module_number,title)
       VALUES ($1,$2,$3,$4,1,'Synthetic race module')`,
      [module, tenant, course, randomUUID()],
    );
  }
  const parent = kind === 'module' ? module : course;
  const lockClient = await client();
  const uploadClient = await client();
  let pending;
  try {
    await lockClient.query('BEGIN');
    await uploadClient.query('BEGIN');
    await lockClient.query(
      `SELECT ${parentColumn} FROM ${quotedSchema}.${parentTable}
       WHERE ${parentColumn}=$1 FOR UPDATE`, [parent],
    );
    const [{ pid: blocker }] = (await lockClient.query('SELECT pg_backend_pid() AS pid')).rows;
    const [{ pid: waiter }] = (await uploadClient.query('SELECT pg_backend_pid() AS pid')).rows;
    let settled = false;
    pending = uploadClient.query(
      `INSERT INTO ${quotedSchema}.course_materials
       (material_id,tenant_id,course_id,module_id,faculty_user_id,title,file_path,material_type)
       VALUES ($1,$2,$3,$4,$5,'Synthetic racing upload','synthetic-only.pdf','NOTES')`,
      [randomUUID(), tenant, course, kind === 'module' ? module : null, randomUUID()],
    ).then(() => ({ inserted: true }), (error) => ({ code: error.code }))
      .finally(() => { settled = true; });
    let blocked = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const [{ blockers }] = await source.query('SELECT pg_blocking_pids($1) AS blockers', [waiter]);
      if (blockers.includes(blocker)) { blocked = true; break; }
      if (settled) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, `${kind} insertion must wait for the parent FOR UPDATE lock`);
    assert.equal(settled, false);
    await lockClient.query(
      `DELETE FROM ${quotedSchema}.${parentTable} WHERE ${parentColumn}=$1`, [parent],
    );
    await lockClient.query('COMMIT');
    assert.deepEqual(await pending, { code: '23503' }, 'A removed parent cannot acquire a late upload');
    await uploadClient.query('ROLLBACK');
    const [{ count }] = await source.query(
      `SELECT count(*)::int AS count FROM ${quotedSchema}.course_materials WHERE tenant_id=$1`, [tenant],
    );
    assert.equal(count, 0);
    passed.push(`${kind} parent lock blocks racing FK insertion; removed-parent upload is rejected`);
  } finally {
    // Release the blocker before awaiting a still-pending upload in failure paths.
    await closeClient(lockClient);
    if (pending) await pending;
    await closeClient(uploadClient);
  }
}

// Conversely, an upload that already owns the FK lock must complete before the
// actual service's parent check. Its committed material must then block deletion.
async function proveUploadFirstRace(kind) {
  const tenant = randomUUID(), course = randomUUID(), module = randomUUID();
  const faculty = randomUUID(), material = randomUUID();
  await source.query(
    `INSERT INTO ${quotedSchema}.academic_courses
       (course_id,tenant_id,course_code,course_name,credits,is_elective)
     VALUES ($1,$2,$3,'Synthetic upload-first course',1,false)`,
    [course, tenant, `UPLOAD-FIRST-${kind}`],
  );
  await source.query(
    `INSERT INTO ${quotedSchema}.course_modules
     (module_id,tenant_id,course_id,faculty_user_id,module_number,title)
     VALUES ($1,$2,$3,$4,1,'Synthetic upload-first module')`,
    [module, tenant, course, faculty],
  );
  const uploader = await client();
  let pending;
  try {
    await uploader.query('BEGIN');
    await uploader.query(
      `INSERT INTO ${quotedSchema}.course_materials
       (material_id,tenant_id,course_id,module_id,faculty_user_id,title,file_path,material_type)
       VALUES ($1,$2,$3,$4,$5,'Synthetic upload first','synthetic-only.pdf','NOTES')`,
      [material, tenant, course, module, faculty],
    );
    const [{ pid }] = (await uploader.query('SELECT pg_backend_pid() AS pid')).rows;
    const operation = kind === 'course'
      ? new AdminControlService(source, {}, {}, {}).deleteCourse(tenant, faculty, course)
      : service().deleteModule(faculty, tenant, module);
    let settled = false;
    pending = operation.then(
      () => ({ deleted: true }),
      (error) => ({ status: error.getStatus?.(), message: error.message }),
    ).finally(() => { settled = true; });
    let blocked = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const [{ waiting }] = await source.query(
        `SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE application_name=$1 AND $2=ANY(pg_blocking_pids(pid))
        ) AS waiting`, [options.application_name, pid],
      );
      if (waiting) { blocked = true; break; }
      if (settled) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, `Actual ${kind} deletion must wait for an existing upload FK lock`);
    assert.equal(settled, false);
    await uploader.query('COMMIT');
    const result = await pending;
    assert.equal(result.status, 400, `Actual ${kind} deletion must refuse the newly committed upload`);
    assert.match(result.message, /current or archived materials/);
    const [{ count }] = await source.query(
      `SELECT count(*)::int AS count FROM ${quotedSchema}.course_materials
       WHERE material_id=$1 AND tenant_id=$2 AND course_id=$3 AND module_id=$4`,
      [material, tenant, course, module],
    );
    assert.equal(count, 1);
    passed.push(`Actual ${kind} deletion waits for an upload already in flight, then preserves its committed reference`);
  } finally {
    await closeClient(uploader);
    if (pending) await pending;
  }
}

async function main() {
  await setup.connect();
  const identity = (await setup.query(
    `SELECT current_user AS username, current_database() AS database,
            inet_server_addr() IS NULL AS unix_socket, version() AS version`,
  )).rows[0];
  assert.equal(identity.username, 'apple');
  assert.equal(identity.database, 'postgres');
  assert.equal(identity.unix_socket, true);
  await setup.query(`CREATE SCHEMA ${quotedSchema}`);
  schemaCreated = true;
  // This reduced, synthetic schema preserves relevant migration FK semantics.
  // In particular, course_materials.module_id is ON DELETE SET NULL in the
  // 20260602140000 migration even though the entity has no module relation.
  await setup.query(`
    CREATE TABLE ${quotedSchema}.academic_courses (
      course_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, course_code varchar(50) NOT NULL,
      course_name varchar(255) NOT NULL, credits int NOT NULL, is_elective boolean NOT NULL DEFAULT false,
      entity_id int, min_attendance int, deleted_at timestamptz
    );
    CREATE TABLE ${quotedSchema}.course_modules (
      module_id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      course_id uuid NOT NULL REFERENCES ${quotedSchema}.academic_courses ON DELETE CASCADE,
      faculty_user_id uuid NOT NULL, module_number int NOT NULL, title varchar(255) NOT NULL,
      description text, status varchar(50) NOT NULL DEFAULT 'PENDING', completed_at timestamptz,
      planned_completion_date date, actual_completion_date date,
      hod_approval_status varchar(50) NOT NULL DEFAULT 'PENDING',
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE ${quotedSchema}.course_materials (
      material_id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      course_id uuid NOT NULL REFERENCES ${quotedSchema}.academic_courses ON DELETE CASCADE,
      faculty_user_id uuid NOT NULL, title varchar(255) NOT NULL, file_path text NOT NULL,
      file_key text, module_id uuid REFERENCES ${quotedSchema}.course_modules ON DELETE SET NULL,
      study_group_id uuid, material_type varchar(50) NOT NULL DEFAULT 'NOTES',
      uploaded_at timestamp NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE ${quotedSchema}.course_material_visibility (
      visibility_id uuid PRIMARY KEY, material_id uuid NOT NULL
        REFERENCES ${quotedSchema}.course_materials ON DELETE CASCADE,
      allocation_id uuid NOT NULL, created_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await source.initialize();
  const [{ current_schema: activeSchema }] = await source.query('SELECT current_schema()');
  assert.equal(activeSchema, schema);
  assert.equal(source.getMetadata(CourseMaterial).schema, schema);

  fileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-synthetic-material-'));
  const original = path.join(fileRoot, 'original.pdf');
  fs.writeFileSync(original, 'Synthetic course material only. No production data.\n');
  const originalHash = hash(original);
  const tenant = randomUUID(), faculty = randomUUID(), course = randomUUID();
  const module = randomUUID(), material = randomUUID(), visibility = randomUUID();
  await source.query(
    `INSERT INTO ${quotedSchema}.academic_courses
       (course_id,tenant_id,course_code,course_name,credits,is_elective)
     VALUES ($1,$2,'SYNTHETIC','Synthetic course',1,false)`, [course, tenant],
  );
  await source.query(
    `INSERT INTO ${quotedSchema}.course_modules
     (module_id,tenant_id,course_id,faculty_user_id,module_number,title)
     VALUES ($1,$2,$3,$4,1,'Original synthetic module')`, [module, tenant, course, faculty],
  );
  await source.query(
    `INSERT INTO ${quotedSchema}.course_materials
     (material_id,tenant_id,course_id,faculty_user_id,title,file_path,file_key,module_id,material_type)
     VALUES ($1,$2,$3,$4,'Original synthetic title',$5,'synthetic/original.pdf',$6,'NOTES')`,
    [material, tenant, course, faculty, original, module],
  );
  await source.query(
    `INSERT INTO ${quotedSchema}.course_material_visibility
     (visibility_id,material_id,allocation_id) VALUES ($1,$2,$3)`, [visibility, material, randomUUID()],
  );
  const repo = source.getRepository(CourseMaterial);
  const before = await snapshot();
  const queryRunner = source.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();
    await service(queryRunner.manager).deleteCourseMaterial(faculty, tenant, material);
    assert.equal(await queryRunner.manager.getRepository(CourseMaterial).count(), 0);
    assert.equal(await queryRunner.manager.getRepository(CourseMaterial).count({ withDeleted: true }), 1);
    await queryRunner.rollbackTransaction();
    assert.deepEqual(await snapshot(), before);
    assert.equal(hash(original), originalHash);
    passed.push('Real TypeORM softRemove rolls back without changing metadata, visibility or bytes');
  } finally {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
    await queryRunner.release();
  }

  const target = service();
  await denied(target.deleteCourseMaterial(faculty, randomUUID(), material), 404);
  assert.deepEqual(await snapshot(), before);
  passed.push('Foreign-tenant material deletion is denied without mutations');

  await target.deleteCourseMaterial(faculty, tenant, material);
  assert.equal(await repo.findOneBy({ material_id: material, tenant_id: tenant }), null);
  assert.deepEqual(await repo.find({ where: { tenant_id: tenant } }), []);
  await denied(target.getMaterialForStudentDownload(randomUUID(), tenant, material), 404);
  const archived = await repo.findOne({ where: { material_id: material }, withDeleted: true });
  assert(archived.deleted_at instanceof Date);
  const after = await snapshot();
  after.course_materials[0].deleted_at = null;
  assert.deepEqual(after, before);
  assert.equal(hash(original), originalHash);
  passed.push('Committed archival hides active lists/downloads while retaining original row, metadata, key, visibility and bytes');

  const archivedSnapshot = await snapshot();
  await denied(target.deleteModule(faculty, tenant, module));
  target.assertFacultyTeaches = async () => {};
  await denied(target.setupSyllabus(faculty, tenant, course, [{ module_number: 1, title: 'Replacement' }]));
  const admin = new AdminControlService(source, {}, {}, {});
  admin.writeAudit = async () => { throw new Error('A rejected deletion must not write a success audit'); };
  await denied(admin.deleteCourse(tenant, faculty, course));
  assert.deepEqual(await snapshot(), archivedSnapshot);
  assert.equal(hash(original), originalHash);
  passed.push('Actual module deletion, syllabus replacement and course deletion guards retain archived references and roll back unchanged');

  await proveForeignKeyRace('academic_courses', 'course_id', 'course');
  await proveForeignKeyRace('course_modules', 'module_id', 'module');
  await proveUploadFirstRace('course');
  await proveUploadFirstRace('module');
  console.log(JSON.stringify({
    result: 'passed', postgres: identity.version, tests: passed,
    scope: 'Local Unix socket only; dedicated random synthetic schema and synthetic file; no production data or public-table access',
  }, null, 2));
}

main().catch((error) => {
  // Never dump connection objects, environment variables or application config.
  console.error(JSON.stringify({ result: 'failed', message: error.message, code: error.code }));
  process.exitCode = 1;
}).finally(async () => {
  for (const connection of [...clients]) await closeClient(connection).catch(() => {});
  if (source.isInitialized) await source.destroy();
  if (schemaCreated) {
    try {
      await setup.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
      const remaining = (await setup.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rows;
      assert.equal(remaining.length, 0);
    } catch (error) {
      console.error(JSON.stringify({ result: 'cleanup-failed', schema, message: error.message }));
      process.exitCode = 1;
    }
  }
  await setup.end().catch(() => {});
  if (fileRoot) fs.rmSync(fileRoot, { recursive: true, force: true });
});
