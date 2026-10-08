const path = require('path');
const { Client } = require('pg');
const { loadEnvFile, dbConfig, loadConfig, writeMarkdown, renderReport, DOCS_ROOT } = require('./lib/utils');

loadEnvFile();

async function rollbackDepartment(slug, runIdArg) {
  const cfg = loadConfig(slug);
  const client = new Client(dbConfig());
  await client.connect();

  try {
    let runId = runIdArg;
    if (!runId) {
      const latest = await client.query(
        `SELECT run_id, status, summary FROM department_import_runs
         WHERE department_slug = $1 AND status = 'COMPLETED'
         ORDER BY completed_at DESC NULLS LAST
         LIMIT 1`,
        [slug],
      );
      if (!latest.rows[0]) {
        throw new Error(`No completed import run found for department: ${slug}`);
      }
      runId = latest.rows[0].run_id;
    }

    const run = await client.query(
      `SELECT * FROM department_import_runs WHERE run_id = $1 AND department_slug = $2`,
      [runId, slug],
    );
    if (!run.rows[0]) throw new Error(`Import run not found: ${runId}`);
    if (run.rows[0].status === 'ROLLED_BACK') {
      throw new Error(`Import run already rolled back: ${runId}`);
    }

    const summary = run.rows[0].summary || {};
    const rollbackMeta = summary.rollback || {};

    await client.query('BEGIN');

    if (rollbackMeta.allocation_ids?.length) {
      await client.query(
        `DELETE FROM academic_course_allocations
         WHERE allocation_id = ANY($1::uuid[]) AND import_run_id = $2`,
        [rollbackMeta.allocation_ids, runId],
      );
    } else {
      await client.query(
        `DELETE FROM academic_course_allocations WHERE import_run_id = $1`,
        [runId],
      );
    }

    for (const userId of rollbackMeta.student_user_ids || []) {
      await client.query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
        [userId],
      );
    }

    for (const userId of rollbackMeta.faculty_user_ids || []) {
      await client.query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
        [userId],
      );
    }

    for (const snap of rollbackMeta.student_snapshots || []) {
      await client.query(
        `UPDATE student_profiles
         SET batch = $2,
             current_semester = $3,
             section_code = $4,
             updated_at = NOW()
         WHERE user_id = $1`,
        [snap.user_id, snap.before.batch, snap.before.current_semester, snap.before.section_code],
      );
    }

    await client.query(
      `UPDATE department_import_runs
       SET status = 'ROLLED_BACK', rolled_back_at = NOW()
       WHERE run_id = $1`,
      [runId],
    );

    await client.query('COMMIT');

    const body = [
      `- Department: ${cfg.department_name}`,
      `- Run ID: ${runId}`,
      `- Allocations removed: ${rollbackMeta.allocation_ids?.length || 'by import_run_id'}`,
      `- Student snapshots restored: ${rollbackMeta.student_snapshots?.length || 0}`,
    ].join('\n');

    writeMarkdown(
      path.join(DOCS_ROOT, 'MIGRATION_SUMMARY.md'),
      renderReport('Migration Rollback Summary', [['Rollback', body]]),
    );

    console.log(`Rollback complete for ${slug} (${runId})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  const slug = process.argv[2];
  const runId = process.argv[3];
  if (!slug) {
    console.error('Usage: node rollback-department.js <department-slug> [run-id]');
    process.exit(1);
  }
  await rollbackDepartment(slug.toLowerCase(), runId);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { rollbackDepartment };
