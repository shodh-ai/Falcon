/* Bootstrap ONLY a newly provisioned, empty disposable PostgreSQL database.
 * Never loads .env, resets a database, or stamps an existing schema as safe.
 * Run npm run build first. The integration suite applies the Hall Ticket SQL.
 */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');

function validateTarget(env) {
  if (
    env.FALCON_TEST_DB !== '1' ||
    env.FALCON_EMPTY_TEST_BOOTSTRAP !== '1' ||
    env.FALCON_RESET_DB === '1'
  )
    throw new Error(
      'Explicit empty-test bootstrap flags required; reset is forbidden',
    );
  const url = new URL(env.TEST_DATABASE_URL || 'invalid');
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55432' ||
    url.pathname !== '/falcon_examcell_test' ||
    url.search ||
    url.hash
  )
    throw new Error('Refusing non-disposable PostgreSQL target');
  return url.toString();
}

function tableDefinition(file, table) {
  const sql = readFileSync(resolve(__dirname, '../migrations', file), 'utf8');
  const statement = sql.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`),
  );
  if (!statement)
    throw new Error(`Missing authoritative table definition: ${table}`);
  return statement[0];
}

function registrarExtensions() {
  const sql = readFileSync(
    resolve(
      __dirname,
      '../migrations/20260804120000_registrar_enterprise_desk.sql',
    ),
    'utf8',
  );
  const statements = sql.match(
    /ALTER TABLE exam_semester_registrations\b[^;]*;/g,
  );
  if (statements?.length !== 3)
    throw new Error('Review changed Registrar foundation before bootstrapping');
  return statements;
}

async function bootstrap(env = process.env) {
  const url = validateTarget(env);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const identity = await client.query(
      "SELECT current_database() AS name, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    );
    const objects = await client.query(
      "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')",
    );
    if (
      identity.rows[0]?.name !== 'falcon_examcell_test' ||
      identity.rows[0].marker !== null ||
      objects.rows[0].count !== 0
    )
      throw new Error(
        'Refusing to bootstrap or mark a pre-existing database; provision a NEW empty container',
      );
    require('reflect-metadata');
    const { DataSource } = require('typeorm');
    const entities = require('../dist/entities');
    // Same entity foundation as scripts/sync-schema.js, restricted to empty test DB.
    const source = new DataSource({
      type: 'postgres',
      url,
      entities: Object.values(entities).filter(
        (item) => typeof item === 'function',
      ),
      synchronize: true,
      migrationsRun: false,
      logging: false,
    });
    try {
      await source.initialize();
    } finally {
      if (source.isInitialized) await source.destroy();
    }
    await client.query('BEGIN');
    try {
      const definitions = [
        ['20260530144500_campus_os_gap_modules.sql', ['ufm_cases']],
        ['20260601120000_faculty_portal_workspaces.sql', ['academic_marks']],
        [
          '20260625120000_attendance_policy_exemptions.sql',
          [
            'attendance_threshold_requests',
            'student_attendance_exemptions',
            'attendance_eligibility_audit',
          ],
        ],
        [
          '20260730120000_exam_cell_enterprise_foundation.sql',
          ['exam_sessions', 'exam_audit_logs'],
        ],
        [
          '20260731120000_exam_cell_operations_modules.sql',
          [
            'exam_form_windows',
            'exam_semester_registrations',
            'exam_question_papers',
            'exam_day_attendance',
          ],
        ],
        [
          '20260732120000_exam_cell_enterprise_enhancements.sql',
          ['hall_ticket_approvals', 'answer_sheet_tracking'],
        ],
        [
          '20260612140000_falcon_exam_os_foundation.sql',
          [
            'exam_admit_card_runs',
            'exam_admit_card_entries',
            'exam_seating_allocations',
          ],
        ],
      ];
      // Extract only original table DDL: never execute unrelated seed statements.
      for (const [file, tables] of definitions)
        for (const table of tables)
          await client.query(tableDefinition(file, table));
      const scheduleDDL = readFileSync(
        resolve(
          __dirname,
          '../migrations/20260612140000_falcon_exam_os_foundation.sql',
        ),
        'utf8',
      )
        .split(/\r?\n/)
        .filter((line) =>
          line.startsWith(
            'ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS ',
          ),
        );
      if (scheduleDDL.length !== 4)
        throw new Error(
          'Review changed timetable foundation before bootstrapping',
        );
      for (const statement of readFileSync(
        resolve(
          __dirname,
          '../migrations/20260612140000_falcon_exam_os_foundation.sql',
        ),
        'utf8',
      )
        .split(/\r?\n/)
        .filter((line) =>
          line.startsWith('ALTER TABLE ufm_cases ADD COLUMN IF NOT EXISTS '),
        ))
        await client.query(statement);
      for (const statement of scheduleDDL) await client.query(statement);
      for (const statement of registrarExtensions())
        await client.query(statement);
      await client.query(
        "INSERT INTO roles (role_name) VALUES ('Student'), ('ExamCell'), ('Accountant') ON CONFLICT DO NOTHING",
      );
      await client.query(
        "COMMENT ON DATABASE falcon_examcell_test IS 'falcon-examcell-disposable-integration-20261021'",
      );
      await client.query('COMMIT');
      console.log(
        'Created isolated Hall Ticket test foundation: 127.0.0.1:55432/falcon_examcell_test. No application configuration loaded.',
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

module.exports = {
  validateTarget,
  tableDefinition,
  registrarExtensions,
  bootstrap,
};
if (require.main === module)
  bootstrap().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
