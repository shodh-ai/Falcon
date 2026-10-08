#!/usr/bin/env node
/**
 * One-off / repeatable fix: ensure official department student CSV accounts
 * use Student role only (not Faculty from Google auto-provision).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadEnvFile, dbConfig, loadConfig, deptDir, readCsv } = require('./lib/utils');

loadEnvFile();

async function main() {
  const slug = (process.argv[2] || 'mechanical').toLowerCase();
  const cfg = loadConfig(slug);
  const base = deptDir(slug);
  const rows = readCsv(path.join(base, cfg.sources.students_csv));
  const emails = rows.map((r) => r.email.toLowerCase()).filter(Boolean);

  const client = new Client(dbConfig());
  await client.connect();

  const {
    rows: [studentRole],
  } = await client.query(`SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1`);
  if (!studentRole) throw new Error('Student role not found');

  let fixed = 0;
  for (const email of emails) {
    const {
      rows: [user],
    } = await client.query(
      `SELECT u.user_id, r.role_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE lower(u.official_email) = $1`,
      [email],
    );
    if (!user) {
      console.warn('Missing account:', email);
      continue;
    }

    const hadStaffRole = await client.query(
      `SELECT 1
       FROM user_roles ur
       INNER JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = $1
         AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin')
       LIMIT 1`,
      [user.user_id],
    );

    if (user.role_name !== 'Student' || hadStaffRole.rows.length) {
      fixed += 1;
      console.log('Fixing', email, 'was', user.role_name);
    }

    await client.query(
      `UPDATE users
       SET role_id = $1, onboarding_status = 'COMPLETED', updated_at = NOW()
       WHERE user_id = $2`,
      [studentRole.role_id, user.user_id],
    );
    await client.query(
      `DELETE FROM user_roles ur
       USING roles r
       WHERE ur.role_id = r.role_id
         AND ur.user_id = $1
         AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin')`,
      [user.user_id],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [user.user_id, studentRole.role_id],
    );
  }

  await client.end();
  console.log(`Checked ${emails.length} student email(s); corrected ${fixed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
