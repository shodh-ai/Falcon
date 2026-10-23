// Opt-in local setup. Never runs ordinary migrations/seeds and never updates public data.
const fs = require('fs');
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
});
const { Client } = require('pg');

async function fingerprint(client) {
  const values = [];
  for (const [table, key] of [
    ['exam_applications', 'exam_application_id'],
    ['academic_marks', 'mark_id'],
    ['academic_exam_results', 'result_id'],
    ['student_exam_reports', 'report_id'],
    ['student_course_enrollments', 'enrollment_id'],
    ['exam_result_sessions', 'session_id'],
  ]) {
    values.push(
      (
        await client.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY r.${key}),'')) AS hash FROM public.${table} r`)
      ).rows[0],
    );
  }
  return JSON.stringify(values);
}

async function main() {
  if (
    !['development', 'test'].includes(process.env.NODE_ENV || '') ||
    process.env.REEVALUATION_QA_ENABLED !== 'true' ||
    !['localhost', '127.0.0.1', '::1'].includes(
      process.env.DB_HOST || 'localhost',
    ) ||
    /prod|live/i.test(
      `${process.env.DATABASE_ENV || ''} ${process.env.DEPLOYMENT_ENV || ''}`,
    )
  ) {
    throw new Error(
      'QA setup requires an explicitly enabled development/test environment and loopback PostgreSQL host.',
    );
  }
  if (!process.argv.includes('--apply'))
    throw new Error(
      'Pass --apply to create the two isolated local QA fixtures.',
    );
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('falcon:local-reevaluation-qa-setup'))",
    );
    const before = await fingerprint(client);
    await client.query(
      fs.readFileSync(
        path.join(__dirname, '../qa/re-evaluation-demo.seed.sql'),
        'utf8',
      ),
    );
    if ((await fingerprint(client)) !== before)
      throw new Error('Public academic records changed; QA setup rolled back.');
    const fixtures = (
      await client.query(
        'SELECT request_id,status,original_marks,max_marks,revised_marks,source FROM local_reevaluation_qa.cases ORDER BY request_id',
      )
    ).rows;
    await client.query('COMMIT');
    console.log(
      JSON.stringify({ fixtures, public_records_unchanged: true }, null, 2),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
