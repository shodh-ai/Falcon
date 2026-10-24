#!/usr/bin/env node
/* Opt-in operational recovery. Preview first; never run this from application startup.
 * NODE_ENV=production node scripts/staff-profile-recovery.js --tenant <uuid> --email <exact email>
 * Add --apply --snapshot-hash <preview hash> --backup-reference <verified backup set> to activate ONE account.
 * Reads the actual DB_DATABASE environment; no default database or guessed cohort.
 */
'use strict';
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { ConfigService } = require('@nestjs/config');
const { ObjectStorageService } = require('../dist/storage/object-storage.service');
const { StaffProfileReviewService } = require('../dist/modules/student-onboarding/staff-profile-review.service');
const { invalidRecoveryFields } = require('../dist/modules/student-onboarding/staff-profile-recovery.util');
const { requirePersistentUploadRoot } = require('../dist/modules/student-onboarding/persistent-upload-root.util');

async function main() {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const tenant = value('--tenant'); const email = value('--email'); const apply = args.includes('--apply');
  if (!tenant || !/^[a-f0-9-]{36}$/i.test(tenant) || !email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error('Exact --tenant UUID and --email are required. No bulk/default target is allowed.');
  }
  for (const key of ['DB_HOST', 'DB_DATABASE', 'DB_PASSWORD']) if (!process.env[key]) throw new Error(`${key} must be explicitly configured`);
  const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, synchronize: false, logging: false });
  await db.initialize();
  try {
    const people = await db.query(`SELECT u.user_id, u.official_email, u.dept_id, u.onboarding_status, r.role_name
      FROM users u JOIN roles r ON r.role_id=u.role_id
      JOIN departments d ON d.dept_id=u.dept_id AND d.deleted_at IS NULL
      JOIN schools s ON s.school_id=d.school_id AND s.deleted_at IS NULL
      WHERE u.tenant_id=$1 AND lower(u.official_email)=lower($2) AND u.deleted_at IS NULL AND u.is_active=true
        AND lower(r.role_name) IN ('faculty','hod','dean') AND lower(d.dept_name) LIKE '%pharm%'`, [tenant, email]);
    if (people.length !== 1) throw new Error('Expected exactly one active Pharmacy staff account in this tenant');
    const person = people[0];
    const storage = new ObjectStorageService(new ConfigService());
    if (!storage.isEnabled()) await requirePersistentUploadRoot();
    // Do not initialize application modules, notifications, schedulers or buckets.
    const reviews = new StaffProfileReviewService(db, undefined, undefined, storage);
    const snapshot = await reviews.snapshot(tenant, person.user_id);
    const requiredDocuments = [];
    for (const type of ['PHOTO', 'AADHAAR', 'PAN', 'HIGHEST_DEGREE']) {
      const doc = snapshot.documentManifest.find(item => item.doc_type === type);
      try { if (!doc?.file_path) throw new Error('absent'); await reviews.documentDigest(tenant, doc.file_path, type); }
      catch { requiredDocuments.push(type); }
    }
    const preview = { ...person, tenant_id: tenant, snapshot_hash: snapshot.hash,
      important_missing_fields: invalidRecoveryFields(snapshot.profile, snapshot.user.phone),
      replacement_documents: requiredDocuments, applies_to_one_account_only: true };
    if (!apply) { console.log(JSON.stringify({ mode: 'PREVIEW_ONLY', ...preview }, null, 2)); return; }
    const hash = value('--snapshot-hash'); const backup = value('--backup-reference');
    if (hash !== snapshot.hash || !backup?.trim()) throw new Error('Matching --snapshot-hash and verified --backup-reference are required');
    const result = await reviews.activateRecovery(tenant, person.user_id, hash, backup, null);
    console.log(JSON.stringify({ mode: 'APPLIED_ONE_ACCOUNT', ...preview, ...result }, null, 2));
  } finally { await db.destroy(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
