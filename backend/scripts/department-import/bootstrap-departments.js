#!/usr/bin/env node
/**
 * One-shot bootstrap for department CSV imports (production / Coolify post-deploy).
 * Uses committed CSVs — no PDF parse step required.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const IMPORT = path.join(__dirname, 'import-department.js');
const SYNC = path.join(__dirname, 'sync-student-enrollments.js');

const DEPARTMENTS = (process.env.BOOTSTRAP_DEPARTMENTS || 'mechanical,agriculture')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function run(nodeScript, args) {
  const result = spawnSync(process.execPath, [nodeScript, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Bootstrap departments: ${DEPARTMENTS.join(', ')}`);

for (const slug of DEPARTMENTS) {
  console.log(`\n=== Import ${slug} ===`);
  run(IMPORT, [slug, '--skip-parse']);
  console.log(`\n=== Sync enrollments ${slug} ===`);
  run(SYNC, [slug]);
}

console.log('\nDepartment bootstrap complete.');
