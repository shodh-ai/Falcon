'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const tar = require('tar-stream');
const pdf = require('pdf-lib');
const checker = require('../recovery_content_check.js');
const modules = { tar, pdf };
const MAPPING = { source_upload_roots: ['/app/uploads', '/data/legacy-uploads'],
  working_directory: '/app', same_origin_hosts: ['apifalcon.jataka.io'], object_storage_enabled: false };
const SECRET = 'synthetic-recovery-key-never-a-real-secret';
const PLAINTEXT = 'synthetic-pan-AAAAA0000Z';
const DOCUMENT = 'synthetic-private/receipt-original.pdf';
const DUMP = checker.hash('synthetic database dump');

function encrypt(plaintext = PLAINTEXT, secret = SECRET) {
  const key = crypto.scryptSync(secret, 'falcon-hr-pii', 32);
  const iv = Buffer.alloc(12, 7);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const bytes = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  key.fill(0);
  return ['enc:v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), bytes.toString('base64')].join(':');
}
async function pdfBytes() {
  const document = await pdf.PDFDocument.create();
  document.addPage([10, 10]);
  return Buffer.from(await document.save());
}
async function packed(entries) {
  const pack = tar.pack();
  const chunks = [];
  const consumed = (async () => { for await (const chunk of pack) chunks.push(chunk); })();
  for (const entry of entries) {
    const bytes = entry.bytes || Buffer.alloc(0);
    await new Promise((resolve, reject) => pack.entry({ name: entry.name,
      type: entry.type || 'file', size: bytes.length, ...(entry.header || {}) }, bytes,
    (error) => error ? reject(error) : resolve()));
  }
  pack.finalize(); await consumed;
  return zlib.gzipSync(Buffer.concat(chunks));
}
function manifestFor(entries, archive) {
  const files = entries.filter((item) => !item.type || item.type === 'file');
  return { schema_version: 1, database_names: ['postgres', 'university_governance'],
    files: [{ name: 'database-postgres.dump', sha256: DUMP, bytes: 1 },
      { name: 'uploads.tar.gz', bytes: archive.length, sha256: checker.hash(archive) }],
    uploads: { members: files.length, file_sha256: Object.fromEntries(files.map((item) =>
      [item.name.replace(/^\.\//, ''), checker.hash(item.bytes || Buffer.alloc(0))])) } };
}
async function temporary(t) {
  const root = path.resolve(__dirname, '../../../work');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'synthetic-recovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function saveJson(dir, name, value, mode = 0o600) {
  const filename = path.join(dir, name);
  fs.writeFileSync(filename, JSON.stringify(value), { mode });
  return filename;
}
function fakePg(columns) {
  const state = { queries: [], options: null, ended: false };
  return { state, Client: class {
    constructor(options) { state.options = options; this.index = -1; this.fetched = false; }
    async connect() { state.connected = true; }
    async query(sql) {
      state.queries.push(sql);
      if (sql.startsWith('SELECT table_schema')) return { rows: columns.map((item) => ({
        table_schema: 'public', table_name: item.table || 'staff_onboarding_docs',
        column_name: item.column || 'file_path', data_type: item.type || 'text' })) };
      if (sql.startsWith('DECLARE ')) {
        this.index = columns.findIndex((item) => sql.includes('FROM "public"."' +
          (item.table || 'staff_onboarding_docs') + '"') &&
          sql.includes('"' + (item.column || 'file_path') + '"'));
        assert.ok(this.index >= 0); this.fetched = false;
      }
      if (sql.startsWith('FETCH ')) {
        if (this.fetched) return { rows: [] };
        this.fetched = true;
        return { rows: (columns[this.index].values || []).map((value) => typeof value === 'object' && value !== null ? value : { value, oversized: false }) };
      }
      return { rows: [] };
    }
    async end() { state.ended = true; }
  } };
}
async function fixture(t, columns, key = { HR_ENCRYPTION_KEY: SECRET }) {
  const dir = await temporary(t);
  const entries = [{ name: DOCUMENT, bytes: await pdfBytes() }];
  const archiveBytes = await packed(entries);
  const archive = path.join(dir, 'uploads.tar.gz'); fs.writeFileSync(archive, archiveBytes);
  const manifest = manifestFor(entries, archiveBytes);
  const pg = fakePg(columns);
  const options = { archive, manifest: saveJson(dir, 'manifest.json', manifest),
    mapping: saveJson(dir, 'mapping.json', MAPPING), hr_key_file: saveJson(dir, 'hr-key.json', key),
    source_database: 'postgres', dump_sha256: DUMP };
  return { dir, entries, manifest, pg, options, modules: { ...modules, pg } };
}
const hrColumn = (values) => ({ table: 'hr_employee_profiles', column: 'pan_encrypted', values });

test('local path aliases map to one member without opening a referenced path', () => {
  for (const value of [`/uploads/${DOCUMENT}`, `uploads/${DOCUMENT}`, `./uploads/${DOCUMENT}`,
    `/app/uploads/${DOCUMENT}`, `/data/legacy-uploads/${DOCUMENT}`,
    `https://apifalcon.jataka.io/uploads/${DOCUMENT}`, DOCUMENT]) {
    assert.deepEqual(checker.reference(value, 'file_path', MAPPING), { kind: 'local', member: DOCUMENT });
  }
});
test('traversal, URL credentials, escaped separators and ambiguous queries fail closed', () => {
  for (const value of ['/uploads/../private.pdf', '/uploads/%2e%2e/private.pdf',
    'uploads/a\\secret.pdf', 'https://user:password@apifalcon.jataka.io/uploads/a.pdf', '/uploads/a%00.pdf']) {
    assert.equal(checker.reference(value, 'file_path', MAPPING).kind, 'invalid');
  }
  assert.equal(checker.reference('/app/uploads-other/file.pdf', 'file_path', MAPPING).kind, 'outside_coverage');
  assert.equal(checker.reference('/uploads/a.pdf?token=synthetic', 'file_path', MAPPING).kind, 'outside_coverage');
  assert.equal(checker.reference('https://apifalcon.jataka.io/uploads/a.pdf#view', 'file_path', MAPPING).kind, 'outside_coverage');
});
test('external originals are counted separately and never fetched', () => {
  assert.equal(checker.reference('https://elsewhere.invalid/receipt.pdf', 'file_url', MAPPING).kind, 'external_http');
  assert.equal(checker.reference('s3://synthetic/file.pdf', 'file_key', MAPPING).kind, 'external_object');
  assert.equal(checker.reference(DOCUMENT, 'file_key', { ...MAPPING, object_storage_enabled: true }).kind, 'external_object');
  assert.throws(() => checker.mappingConfig({ ...MAPPING, password: 'synthetic' }), /MAPPING_FIELDS_INVALID/);
});
test('deployed AES-GCM format, scrypt salt and key fallback decrypt without returning plaintext', () => {
  const key = checker.minimalKey({ HR_ENCRYPTION_KEY: ` ${SECRET} `, JWT_SECRET: 'ignored' });
  assert.equal(checker.decryptProbe(encrypt(), () => key), 'decrypted');
  assert.deepEqual(checker.minimalKey({ HR_ENCRYPTION_KEY: ' ', JWT_SECRET: SECRET }), key);
  assert.throws(() => checker.minimalKey({ HR_ENCRYPTION_KEY: SECRET, DATABASE_URL: 'forbidden' }), /KEY_FILE_NOT_MINIMAL/);
  assert.throws(() => checker.minimalKey({}), /HR_KEY_UNAVAILABLE/);
  key.fill(0);
});
test('wrong keys, altered authentication tags and malformed payloads cannot prove recovery', () => {
  const key = checker.minimalKey({ HR_ENCRYPTION_KEY: 'wrong-synthetic-key' });
  assert.equal(checker.decryptProbe(encrypt(), () => key), 'authentication_failed'); key.fill(0);
  const correct = checker.minimalKey({ HR_ENCRYPTION_KEY: SECRET });
  const parts = encrypt().split(':'); parts[3] = Buffer.alloc(16, 9).toString('base64');
  assert.equal(checker.decryptProbe(parts.join(':'), () => correct), 'authentication_failed');
  for (const value of ['enc:v1:bad:bad:bad', 'enc:v1:AAAA:AAAA:AAAA', 'enc:v1:a:b:c:d']) {
    assert.equal(checker.decryptProbe(value, () => correct), 'malformed');
  }
  assert.equal(checker.decryptProbe('enc:v2:anything', () => correct), 'unsupported_format');
  assert.equal(checker.decryptProbe(PLAINTEXT, () => correct), 'legacy_plaintext');
  assert.equal(checker.decryptProbe('', () => correct), 'empty'); correct.fill(0);
});
test('JSON attachment shapes retain references and unclassified path-like fields stay unproven', () => {
  assert.deepEqual(checker.jsonReferences([{ name: 'display title', url: `/uploads/${DOCUMENT}` }]), [`/uploads/${DOCUMENT}`]);
  assert.deepEqual(checker.jsonReferences([`/uploads/${DOCUMENT}`], true), [`/uploads/${DOCUMENT}`]);
  assert.deepEqual(checker.jsonReferences([`/uploads/${DOCUMENT}`]), [`/uploads/${DOCUMENT}`]);
  assert.throws(() => checker.jsonReferences({ unreviewedLocation: '/uploads/private.pdf' }), /JSON_REFERENCE_UNCLASSIFIED/);
  assert.throws(() => checker.jsonReferences({ unreviewedLocation: 'extensionless-private-key' }), /JSON_REFERENCE_UNCLASSIFIED/);
});
test('streamed archive requires all manifest hashes and opens a referenced PDF', async (t) => {
  const f = await fixture(t, []);
  const result = await checker.inspectArchive(f.options.archive, f.manifest, new Map([[DOCUMENT, 1]]), modules);
  assert.equal(result.files_hashed, 1); assert.equal(result.pdf_parsed, 1);
  assert.equal(result.readable_samples, 1); assert.equal(result.unreadable_samples, 0);
});
test('archive member hashes cannot be replaced by a matching compressed-file hash', async (t) => {
  const f = await fixture(t, []);
  f.manifest.uploads.file_sha256[DOCUMENT] = checker.hash('different synthetic bytes');
  await assert.rejects(checker.inspectArchive(f.options.archive, f.manifest, new Map(), modules), /ARCHIVE_VALIDATION_FAILED/);
});
test('missing, duplicate, symlink and unexpected members are rejected without extraction', async (t) => {
  const f = await fixture(t, []);
  for (const entries of [[], [f.entries[0], f.entries[0]],
    [{ name: DOCUMENT, type: 'symlink', header: { linkname: '/private/secret' } }],
    [{ name: 'unlisted.txt', bytes: Buffer.from('synthetic') }]]) {
    const bytes = await packed(entries); fs.writeFileSync(f.options.archive, bytes);
    f.manifest.files[1] = { name: 'uploads.tar.gz', bytes: bytes.length, sha256: checker.hash(bytes) };
    await assert.rejects(checker.inspectArchive(f.options.archive, f.manifest, new Map(), modules), /ARCHIVE_(?:VALIDATION|INVENTORY)_FAILED/);
  }
});
test('unreadable originals remain hashed but do not count as readable samples', async (t) => {
  const f = await fixture(t, []);
  const entries = [{ name: DOCUMENT, bytes: Buffer.from('synthetic invalid PDF') }];
  const bytes = await packed(entries); fs.writeFileSync(f.options.archive, bytes);
  const manifest = manifestFor(entries, bytes);
  const result = await checker.inspectArchive(f.options.archive, manifest, new Map([[DOCUMENT, 1]]), modules);
  assert.equal(result.files_hashed, 1); assert.equal(result.readable_samples, 0);
  assert.equal(result.unreadable_samples, 1);
});
test('PNG dimensions are bounded before a raster decoder is invoked', async () => {
  const bytes = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(100000, 16); bytes.writeUInt32BE(100000, 20);
  let decoded = false;
  await assert.rejects(checker.readableOriginal(bytes, '.png', { PDFDocument: { async create() {
    return { async embedPng() { decoded = true; return { width: 1, height: 1 }; } };
  } } }), /PNG_DIMENSION_LIMIT/);
  assert.equal(decoded, false);
});
test('a bounded real PNG is decoded as an original', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=', 'base64');
  assert.equal(await checker.readableOriginal(bytes, '.png', pdf), 'png_decoded');
});
test('JPEG headers alone never establish readable originals', async (t) => {
  const f = await fixture(t, []);
  const name = 'synthetic-private/header-only.jpg';
  const entries = [{ name, bytes: Buffer.from('synthetic JPEG header stand-in') }];
  const bytes = await packed(entries); fs.writeFileSync(f.options.archive, bytes);
  const manifest = manifestFor(entries, bytes);
  const result = await checker.inspectArchive(f.options.archive, manifest, new Map([[name, 1]]),
    { ...modules, pdf: { PDFDocument: { async create() { return { async embedJpg() { return { width: 1, height: 1 }; } }; } } } });
  assert.equal(result.jpeg_header_opened, 1); assert.equal(result.readable_samples, 0);
  const database = await checker.collectDatabase(new (fakePg([{ values: [`/uploads/${name}`] }]).Client)(), MAPPING, () => null);
  const report = checker.aggregate(database, result, manifest, new Set());
  assert.equal(report.readiness.documents_verified, false);
});
test('preexisting absence requires a private independently supplied exact-set baseline', () => {
  const archive = checker.hash('synthetic archive'); const missing = 'legacy/missing.pdf';
  const value = { schema_version: 1, dump_sha256: DUMP, uploads_archive_sha256: archive,
    observation: 'preexisting_missing_on_source', reference_hashes: [checker.hash(missing)] };
  assert.equal(checker.baselineHashes(value, DUMP, archive).has(checker.hash(missing)), true);
  assert.equal(checker.baselineHashes(null, DUMP, archive).size, 0);
  assert.throws(() => checker.baselineHashes(value, checker.hash('another dump'), archive), /PREEXISTING_BASELINE_INVALID/);
  assert.throws(() => checker.baselineHashes({ ...value, observation: 'assumed' }, DUMP, archive), /PREEXISTING_BASELINE_INVALID/);
});
test('runCheck uses only the fixed disposable socket and a read-only transaction', async (t) => {
  const cipher = encrypt();
  const f = await fixture(t, [{ values: [`/uploads/${DOCUMENT}`] }, hrColumn([cipher])]);
  const previous = process.env.PGHOST; process.env.PGHOST = 'must-never-be-used.invalid';
  t.after(() => { if (previous === undefined) delete process.env.PGHOST; else process.env.PGHOST = previous; });
  const report = await checker.runCheck(f.options, f.modules);
  assert.deepEqual(report.readiness, { documents_verified: true, encrypted_fields_verified: true });
  assert.equal(report.status, 'passed');
  assert.equal(f.pg.state.options.host, '/restore-socket'); assert.equal(f.pg.state.options.port, 55432);
  assert.equal(f.pg.state.options.user, 'restorecheck'); assert.equal(f.pg.state.options.database, 'restorecheck');
  assert.equal(f.pg.state.options.password, null); assert.equal(f.pg.state.options.ssl, false);
  assert.match(f.pg.state.options.options, /default_transaction_read_only=on/);
  assert.equal(f.pg.state.queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(f.pg.state.queries.at(-1), 'ROLLBACK'); assert.equal(f.pg.state.ended, true);
  for (const sql of f.pg.state.queries) assert.match(sql, /^(?:BEGIN |SELECT |DECLARE |FETCH |CLOSE |ROLLBACK$)/);
  const output = JSON.stringify(report);
  for (const forbidden of [SECRET, PLAINTEXT, cipher, DOCUMENT, '/uploads/', 'staff_onboarding_docs', 'pan_encrypted']) {
    assert.equal(output.includes(forbidden), false);
  }
});
test('uncovered, preexisting and unattributed documents have separate aggregate counts', async (t) => {
  const before = 'legacy/already-missing.pdf', unknown = 'unattributed/missing.pdf';
  const f = await fixture(t, [{ values: [`/uploads/${DOCUMENT}`, `/uploads/${before}`, `/uploads/${unknown}`,
    'https://elsewhere.invalid/original.pdf', 's3://elsewhere/original.pdf'] }, hrColumn([encrypt()])]);
  f.options.baseline = saveJson(f.dir, 'baseline.json', { schema_version: 1, dump_sha256: DUMP,
    uploads_archive_sha256: f.manifest.files[1].sha256, observation: 'preexisting_missing_on_source',
    reference_hashes: [checker.hash(before)] });
  const report = await checker.runCheck(f.options, f.modules);
  assert.equal(report.documents.matched_local_references, 1);
  assert.equal(report.documents.missing_preexisting_confirmed, 1);
  assert.equal(report.documents.missing_unattributed, 1);
  assert.equal(report.documents.external_http, 1); assert.equal(report.documents.external_object, 1);
  assert.equal(report.readiness.documents_verified, false); assert.equal(report.status, 'unproven');
  assert.equal(JSON.stringify(report).includes(before), false); assert.equal(JSON.stringify(report).includes(unknown), false);
});
test('no encrypted values or an unreadable/wrong key never claim HR compatibility', async (t) => {
  for (const [values, key, mode, expected] of [
    [[PLAINTEXT], { HR_ENCRYPTION_KEY: SECRET }, 0o600, 'legacy_plaintext'],
    [[encrypt()], { HR_ENCRYPTION_KEY: 'incorrect-synthetic' }, 0o600, 'authentication_failed'],
    [[encrypt()], { HR_ENCRYPTION_KEY: SECRET }, 0o644, 'key_unavailable'],
    [[], { HR_ENCRYPTION_KEY: SECRET }, 0o600, 'empty']]) {
    const f = await fixture(t, [{ values: [`/uploads/${DOCUMENT}`] }, hrColumn(values)], key);
    fs.chmodSync(f.options.hr_key_file, mode);
    const report = await checker.runCheck(f.options, f.modules);
    assert.equal(report.readiness.encrypted_fields_verified, false);
    if (values.length) assert.equal(report.hr[expected], 1);
  }
});
test('source-dump mismatch fails before connecting to any database', async (t) => {
  const f = await fixture(t, []); f.options.dump_sha256 = checker.hash('different dump');
  await assert.rejects(checker.runCheck(f.options, f.modules), /SOURCE_DUMP_HASH_MISMATCH/);
  assert.equal(f.pg.state.connected, undefined);
});
test('key symlinks and full environment documents are refused without leaking their contents', async (t) => {
  for (const style of ['symlink', 'environment']) {
    const f = await fixture(t, [{ values: [`/uploads/${DOCUMENT}`] }, hrColumn([encrypt()])]);
    if (style === 'symlink') {
      const target = path.join(f.dir, 'private-key-target.json'); fs.renameSync(f.options.hr_key_file, target);
      fs.symlinkSync(target, f.options.hr_key_file);
    } else fs.writeFileSync(f.options.hr_key_file, JSON.stringify({ HR_ENCRYPTION_KEY: SECRET, DATABASE_URL: 'synthetic-private-connection' }));
    const report = await checker.runCheck(f.options, f.modules);
    assert.equal(report.hr.key_unavailable, 1); assert.equal(report.readiness.encrypted_fields_verified, false);
    assert.equal(JSON.stringify(report).includes(SECRET), false);
    assert.equal(JSON.stringify(report).includes('synthetic-private-connection'), false);
  }
});
test('unclassified columns and attachment keys leave document coverage unproven', async (t) => {
  const f = await fixture(t, [{ values: [`/uploads/${DOCUMENT}`] },
    { column: 'unreviewed_file_url', values: [] },
    { column: 'attachments', type: 'jsonb', values: [JSON.stringify({ location: '/uploads/unclassified.pdf' })] }, hrColumn([encrypt()])]);
  const report = await checker.runCheck(f.options, f.modules);
  assert.equal(report.documents.possible_uncovered_columns, 1);
  assert.equal(report.documents.unsupported_json, 1);
  assert.equal(report.readiness.documents_verified, false);
});
test('object-column string arrays cannot hide missing paths or extensionless keys behind a valid PDF', async (t) => {
  for (const missing of ['/uploads/missing.pdf', 'private/missing-extensionless-key']) {
    const f = await fixture(t, [{ values: [`/uploads/${DOCUMENT}`] },
      { column: 'attachments', type: 'jsonb', values: [JSON.stringify([missing])] }, hrColumn([encrypt()])]);
    const report = await checker.runCheck(f.options, f.modules);
    assert.equal(report.documents.matched_local_references, 1);
    assert.equal(report.documents.missing_unattributed, 1);
    assert.equal(report.readiness.documents_verified, false);
  }
});
test('known profile photo fallback and registrar documents are reconciled without scanning profile text', async (t) => {
  const f = await fixture(t, [{ values: [`/uploads/${DOCUMENT}`] },
    { table: 'users', column: 'onboarding_profile', type: 'jsonb', values: ['/uploads/missing-photo.png'] },
    { table: 'registrar_petitions', column: 'documents_json', type: 'jsonb', values: [JSON.stringify([{ url: '/uploads/missing-petition.pdf' }])] }, hrColumn([encrypt()])]);
  const report = await checker.runCheck(f.options, f.modules);
  assert.equal(report.documents.matched_local_references, 1);
  assert.equal(report.documents.missing_unattributed, 2);
  assert.equal(report.readiness.documents_verified, false);
  const profileQuery = f.pg.state.queries.find((sql) => sql.includes('FROM "public"."users"'));
  assert.match(profileQuery, /"onboarding_profile"::jsonb ->> 'profile_photo_url'/);
  assert.equal(profileQuery.includes('THEN "onboarding_profile"::text'), false);
});
test('CLI accepts only explicit metadata/path arguments, no implicit credentials', () => {
  const argv = ['--archive', '/backup/uploads.tar.gz', '--manifest', '/backup/manifest.json',
    '--mapping', '/private/mapping.json', '--hr-key-file', '/private/hr-key.json',
    '--source-database', 'postgres', '--dump-sha256', DUMP];
  assert.equal(checker.parseArguments(argv).source_database, 'postgres');
  assert.throws(() => checker.parseArguments([...argv, '--password', 'forbidden']), /ARGUMENTS_INVALID/);
  assert.throws(() => checker.parseArguments([...argv, '--archive', '/other']), /ARGUMENTS_INVALID/);
  assert.throws(() => checker.parseArguments(argv.slice(2)), /ARGUMENTS_MISSING/);
});
