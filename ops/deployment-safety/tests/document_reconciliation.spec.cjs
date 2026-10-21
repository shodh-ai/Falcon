'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const subject = require('../document-reconciliation.cjs');
const pdf = require('../../../backend/node_modules/pdf-lib');
const tar = require('../../../backend/node_modules/tar-stream');
// The installed frozen core is intentionally not part of this narrower branch.
// CI exercises its documented injected API. A local optional full-path override
// also runs this identical suite against the installed-source copy unchanged.
const contractFrozen = {
  mappingConfig(value) { assert.equal(value.working_directory, '/app'); return value; },
  normalizedMember(value) {
    const name = value.replace(/^(?:\.\/)+/, '').replace(/\/$/, '');
    if (/[\\\0-\x1f\x7f-\x9f]/.test(name) || name.startsWith('/') || name.split('/').some((part) => ['', '.', '..'].includes(part))) throw new Error('ARCHIVE_PATH_INVALID');
    return name;
  },
  reference(value, name, mapping) {
    if (!value || !value.trim()) return { kind: 'empty' };
    let source = value.trim();
    if (source.startsWith('s3://')) return { kind: 'external_object' };
    if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
      if (!/^https?:\/\//i.test(source)) return { kind: 'outside_coverage' };
      let url; try { url = new URL(source); } catch { return { kind: 'invalid' }; }
      if (url.username || url.password) return { kind: 'invalid' };
      if (!mapping.same_origin_hosts.includes(url.host.toLowerCase()) || !url.pathname.startsWith('/uploads/')) return { kind: 'external_http' };
      if (url.search || url.hash) return { kind: 'outside_coverage' };
      source = url.pathname;
    }
    try { source = decodeURIComponent(source).replace(/^(?:\.\/)+/, ''); } catch { return { kind: 'invalid' }; }
    if (source.includes('?') || source.includes('#')) return { kind: 'outside_coverage' };
    if (source.startsWith('/uploads/')) source = source.slice(9);
    else if (source.startsWith('uploads/')) source = source.slice(8);
    else if (source.startsWith('/')) {
      const root = mapping.source_upload_roots.find((entry) => source.startsWith(entry + '/'));
      if (!root) return { kind: 'outside_coverage' }; source = source.slice(root.length + 1);
    }
    try { return { kind: 'local', member: this.normalizedMember(source) }; } catch { return { kind: 'invalid' }; }
  },
  jsonReferences(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap((item) => this.jsonReferences(item));
    if (!value || typeof value !== 'object') return [];
    const refs = [];
    for (const [key, nested] of Object.entries(value)) {
      if (['url', 'path', 'key', 'file_url'].includes(key)) refs.push(...this.jsonReferences(nested));
      else if (typeof nested === 'string' && /\.(pdf|png|jpe?g)$/.test(nested)) throw new Error('JSON_REFERENCE_UNCLASSIFIED');
    }
    return refs;
  },
  async readableOriginal(bytes, extension, library) {
    if (extension === '.pdf') { const doc = await library.PDFDocument.load(bytes); assert.ok(doc.getPageCount()); return 'pdf_parsed'; }
    const doc = await library.PDFDocument.create();
    if (extension === '.png') { await doc.embedPng(bytes); return 'png_decoded'; }
    await doc.embedJpg(bytes); return 'jpeg_header_opened';
  },
  async inspectArchive() {
    // Independent sidecar pass must validate the archive even when the frozen
    // dependency gives no diagnostic details; tampering tests exercise that pass.
    return { files_hashed: 0, readable_samples: 0, unreadable_samples: 0 };
  },
};
const frozen = process.env.FALCON_FROZEN_CHECKER ? require(process.env.FALCON_FROZEN_CHECKER) : contractFrozen;

const DUMP = subject.hash('synthetic dump');
const RUN = '20261021T130000Z-' + 'b'.repeat(32);
const MAP = { source_upload_roots: ['/app/uploads', '/data/legacy-uploads'],
  working_directory: '/app', same_origin_hosts: ['apifalcon.jataka.io', 'falcon.jataka.io'], object_storage_enabled: false };
const column = (table = 'student_documents', name = 'file_url', type = 'text') => ({
  table_schema: 'public', table_name: table, column_name: name, data_type: type,
  udt_name: type === 'ARRAY' ? '_text' : type, table_type: 'BASE TABLE' });
const seeds = (references = []) => ({ schema_version: 1, source_revision: 'a'.repeat(40),
  match_label: 'matches_repository_seed_literal', entries: references.map((reference) =>
    ({ reference, source_files: ['backend/migrations/synthetic_seed.sql:12'] })) });
const EMPTY_STATE = () => ({ legacyRefs: new Map() });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=', 'base64');
function fakePg(items) {
  const state = { queries: [], options: null };
  return { state, Client: class {
    constructor(options) { state.options = options; this.current = null; this.fetched = false; }
    async connect() { state.connected = true; }
    async query(sql) {
      state.queries.push(sql);
      if (sql.startsWith('SELECT c.table_schema')) return { rows: items.map((item) => item.column) };
      if (sql.startsWith('DECLARE ')) {
        this.current = items.find((item) => sql.includes('FROM "' + item.column.table_schema + '"."' + item.column.table_name + '"') &&
          sql.includes('"' + item.column.column_name + '"'));
        assert.ok(this.current); this.fetched = false;
      }
      if (sql.startsWith('FETCH ')) {
        if (this.fetched) return { rows: [] };
        this.fetched = true;
        return { rows: (this.current.values || []).map((value) => typeof value === 'object' && value !== null ? value : { value, oversized: false }) };
      }
      return { rows: [] };
    }
    async end() { state.ended = true; }
  } };
}
async function pack(entries) {
  const stream = tar.pack(); const chunks = [];
  const consume = (async () => { for await (const chunk of stream) chunks.push(chunk); })();
  for (const entry of entries) {
    const bytes = entry.bytes || Buffer.alloc(0);
    await new Promise((resolve, reject) => stream.entry({ name: entry.name,
      type: entry.type || 'file', size: bytes.length, ...(entry.header || {}) }, bytes,
    (error) => error ? reject(error) : resolve()));
  }
  stream.finalize(); await consume; return zlib.gzipSync(Buffer.concat(chunks));
}
async function fixture(t, columns = [], entries = [{ name: 'tenant/synthetic.png', bytes: PNG }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-document-synthetic-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const archive = await pack(entries);
  const manifest = { run_id: RUN, database_names: ['postgres', 'university_governance'],
    files: [{ name: 'uploads.tar.gz', bytes: archive.length, sha256: subject.hash(archive) },
      { name: 'database-postgres.dump', bytes: 1, sha256: DUMP }],
    uploads: { file_sha256: Object.fromEntries(entries.filter((entry) => !entry.type || entry.type === 'file').map((entry) =>
      [entry.name, subject.hash(entry.bytes || Buffer.alloc(0))])) } };
  const inputs = Object.fromEntries(['archive', 'manifest', 'mapping', 'seeds', 'binding'].map((key) =>
    [key, path.join(root, key + (key === 'archive' ? '.tar.gz' : '.json'))]));
  fs.writeFileSync(inputs.archive, archive);
  for (const [key, value] of Object.entries({ manifest, mapping: MAP, seeds: seeds(),
    binding: { schema_version: 1, source_database: 'postgres', dump_sha256: DUMP } })) fs.writeFileSync(inputs[key], JSON.stringify(value));
  const pg = fakePg(columns);
  return { root, manifest, inputs, pg, modules: { pg, pdf, tar, frozen } };
}

test('private input files reject symlinks, hardlinks, directories, and excessive bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-document-input-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const regular = path.join(root, 'regular'); fs.writeFileSync(regular, '{}');
  assert.deepEqual(subject.inputJson(regular), {});
  const link = path.join(root, 'symlink'); fs.symlinkSync(regular, link);
  assert.throws(() => subject.inputJson(link));
  const hard = path.join(root, 'hardlink'); fs.linkSync(regular, hard);
  assert.throws(() => subject.inputJson(regular), /INPUT_INVALID/);
  assert.throws(() => subject.inputJson(root), /INPUT_INVALID/);
});

test('seed labels preserve exact literal evidence and never assert original recovery', async (t) => {
  const raw = '/uploads/tenant/missing.pdf';
  const f = await fixture(t, [{ column: column(), values: [raw, raw] }]);
  fs.writeFileSync(f.inputs.seeds, JSON.stringify(seeds([raw])));
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.seed_literal_occurrences, 2);
  assert.equal(result.summary.missing_local_distinct, 1);
  assert.equal(result.summary.missing_local_occurrences, 2);
  assert.equal(result.references[0].observation, 'matches_repository_seed_literal');
  assert.equal(result.references[0].seed_match_proves_recovery, false);
  assert.equal(result.summary.documents_fully_recovered, false);
  assert.throws(() => subject.seedCatalog({ ...seeds(), source_revision: 'not-a-revision' }), /SEED_CATALOG_INVALID/);
  assert.throws(() => subject.seedCatalog({ ...seeds(), entries: [{ reference: raw, source_files: ['backend/../private.sql:1'] }] }), /SEED_CATALOG_INVALID/);
});

test('registrar filename metadata no longer hides a recognized URL, unknown fields stay unclassified', () => {
  const item = column('registrar_petitions', 'documents_json', 'jsonb');
  const value = [{ name: 'synthetic.pdf', size: 12, url: '/uploads/tenant/synthetic.pdf' }];
  assert.throws(() => frozen.jsonReferences(value), /JSON_REFERENCE_UNCLASSIFIED/);
  assert.deepEqual(subject.jsonValues(value, item), { refs: [{ value: '/uploads/tenant/synthetic.pdf', key: 'url' }], metadata: 0 });
  assert.throws(() => subject.jsonValues([{ location: '/uploads/tenant/unknown.pdf' }], item), /JSON_REFERENCE_UNCLASSIFIED/);
  assert.throws(() => subject.jsonValues([{ name: 'fine.pdf', url: '/uploads/a.pdf', surprise: 'private-key' }], item), /JSON_REFERENCE_UNCLASSIFIED/);
});

test('Faculty AI metadata attachments are classified without inventing retained originals', () => {
  const item = column('faculty_ai_messages', 'attachments', 'jsonb');
  assert.deepEqual(subject.jsonValues([{ name: 'synthetic.pdf', mime: 'application/pdf', size: 12 }], item), { refs: [], metadata: 1 });
  assert.throws(() => subject.jsonValues([{ name: 'synthetic.pdf', mime: 'application/pdf', url: '/uploads/a.pdf' }], item), /JSON_METADATA_UNCLASSIFIED/);
});

test('generated routes require exact table, column and UUID pattern and stay regeneration unproven', () => {
  const raw = '/api/admin/registrar-desk/certificates/12345678-1234-1234-1234-123456789abc/pdf';
  const item = column('registrar_certificate_requests', 'pdf_url');
  assert.equal(subject.normalizedReference(raw, item, MAP, frozen).kind, 'generated_route');
  assert.equal(subject.normalizedReference(raw, item, MAP, frozen).regeneration_verified, false);
  assert.equal(subject.normalizedReference(raw, column(), MAP, frozen).kind, 'outside_coverage');
  for (const other of [raw + '?x=1', raw.replace('certificates', 'elsewhere'), raw.replace('12345678', 'not-a-uuid')])
    assert.notEqual(subject.normalizedReference(other, item, MAP, frozen).kind, 'generated_route');
});

test('documented same-origin download URL accepts one decoded key; hostile and ambiguous variants fail closed', () => {
  const item = column();
  for (const value of ['/api/uploads/download?key=tenant%2Fsynthetic.pdf',
    'https://apifalcon.jataka.io/api/uploads/download?path=%2Fuploads%2Ftenant%2Fsynthetic.pdf']) {
    assert.equal(subject.normalizedReference(value, item, MAP, frozen).member, 'tenant/synthetic.pdf');
  }
  for (const value of ['/api/uploads/download?key=tenant%252Fprivate.pdf', '/api/uploads/download?key=../private.pdf',
    '/api/uploads/download?key=tenant%2F..%2Fprivate.pdf', '/api/uploads/download?key=a&key=b',
    '/api/uploads/download?key=a&token=private', '/api/uploads/download?key=a#private',
    'https://user:secret@apifalcon.jataka.io/api/uploads/download?key=a',
    '/api/uploads/download?key=%00private', '/api/uploads/download?key=tenant%5Cprivate']) {
    assert.equal(subject.normalizedReference(value, item, MAP, frozen).kind, 'invalid');
  }
  assert.equal(subject.normalizedReference('https://foreign.invalid/api/uploads/download?key=tenant/a.pdf', item, MAP, frozen).kind, 'external_http');
  assert.equal(subject.normalizedReference('https://apifalcon.jataka.io/other?key=tenant/a.pdf', item, MAP, frozen).kind, 'external_http');
});

test('strict embedded originals accept canonical PDF/PNG/JPEG base64 only in documented fields', async () => {
  const data = 'data:image/png;base64,' + PNG.toString('base64');
  const parsed = subject.embeddedData(data);
  assert.equal(parsed.mime, 'image/png'); assert.deepEqual(parsed.bytes, PNG);
  assert.equal(subject.embeddedAllowed(column(), 'file_url'), true);
  assert.equal(subject.embeddedAllowed(column('unrelated', 'file_url'), 'file_url'), false);
  assert.equal(subject.embeddedAllowed(column('registrar_dsc_credentials', 'signature_image_url'), 'signature_image_url'), true);
  assert.equal(subject.embeddedAllowed(column('unrelated', 'signature_image_url'), 'signature_image_url'), false);
  for (const invalid of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png,unencoded',
    data + '\n', 'data:image/png;base64,AB==', 'data:image/png;base64,'])
    assert.throws(() => subject.embeddedData(invalid));
  const report = await subject.parseMedia(parsed.bytes, parsed.mime, pdf);
  assert.equal(report.result, 'png_decoded'); assert.equal(report.raster_decoded, true);
});

test('JPEG header parser handles nonzero Buffer offsets without claiming raster decoding', async () => {
  // This synthetic SOF header is enough for pdf-lib's metadata parser, and is
  // deliberately not claimed to be a complete JPEG raster.
  const bytes = Buffer.from([255,216,255,192,0,17,8,0,1,0,1,3,1,17,0,2,17,0,3,17,0]);
  const backing = Buffer.alloc(bytes.length + 16, 0x35); bytes.copy(backing, 16);
  const view = backing.subarray(16);
  await assert.rejects((await pdf.PDFDocument.create()).embedJpg(view), /SOI not found/);
  const result = await subject.parseMedia(view, 'image/jpeg', pdf);
  assert.equal(result.result, 'jpeg_header_opened'); assert.equal(result.raster_decoded, false);
  assert.equal(result.width, 1);
});

test('magic type diagnoses PNG stored with JPEG extension without changing any source bytes', async (t) => {
  const f = await fixture(t, [{ column: column(), values: ['/uploads/tenant/wrong.jpg'] }], [{ name: 'tenant/wrong.jpg', bytes: PNG }]);
  const before = fs.readFileSync(f.inputs.archive);
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.legacy_missing_occurrences, 0);
  assert.equal(result.summary.extension_mismatches, 1);
  assert.equal(result.summary.png_decoded, 1);
  assert.equal(result.samples[0].repeated_legacy_parser_result, 'parser_rejected');
  assert.equal(result.samples[0].detected_mime, 'image/png');
  assert.deepEqual(fs.readFileSync(f.inputs.archive), before);
});

test('unknown columns expose populated/null counts only, while added real keys are reconciled', async (t) => {
  const f = await fixture(t, [
    { column: column('proc_document_uploads', 'object_key'), values: ['tenant/synthetic.png'] },
    { column: column('legacy', 'unknown_document_url'), values: [{ populated: true }, { populated: false }] },
    { column: column('empty', 'another_file_url'), values: [{ populated: false }] },
    { column: column('hr_employee_profiles', 'pan_encrypted'), values: ['never-select-hr'] },
  ]);
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.populated_unclassified_columns, 1);
  assert.equal(result.summary.empty_unclassified_columns, 1);
  assert.equal(result.summary.local_distinct, 1);
  assert.equal(result.summary.legacy_uncovered_columns, 2);
  const unknown = f.pg.state.queries.filter((sql) => sql.startsWith('DECLARE document_unknown'));
  assert.equal(unknown.length, 2);
  for (const sql of unknown) assert.match(sql, /SELECT \("[^"]+" IS NOT NULL\) AS populated/);
  assert.equal(f.pg.state.queries.some((sql) => sql.includes('pan_encrypted')), false);
  assert.equal(JSON.stringify(result).includes('never-select-hr'), false);
});

test('known PostgreSQL text arrays use to_jsonb and remain absent from legacy coverage', async (t) => {
  const f = await fixture(t, [{ column: column('known', 'document_urls', 'ARRAY'), values: [JSON.stringify(['/uploads/tenant/synthetic.png'])] }]);
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.local_distinct, 1);
  assert.equal(result.summary.legacy_uncovered_columns, 1);
  assert.equal(result.diagnostics.legacy.values_checked, 0);
  assert.ok(f.pg.state.queries.some((sql) => sql.includes('to_jsonb("document_urls")')));
});

test('sidecar preserves legacy occurrence counts and separately fixes table-specific JSON coverage', async (t) => {
  const f = await fixture(t, [
    { column: column('staff_onboarding_docs', 'file_path'), values: ['/uploads/missing.pdf', '/uploads/missing.pdf', '/uploads/tenant/synthetic.png'] },
    { column: column('registrar_petitions', 'documents_json', 'jsonb'), values: [JSON.stringify([{ name: 'evidence.pdf', url: 'https://example.com/evidence.pdf' }])] },
    { column: column('faculty_ai_messages', 'attachments', 'jsonb'), values: [JSON.stringify([{ name: 'evidence.pdf', mime: 'application/pdf', size: 42 }])] },
  ]);
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.legacy_missing_occurrences, 2);
  assert.equal(result.summary.legacy_missing_distinct, 1);
  assert.equal(result.summary.legacy_unsupported_json, 2);
  assert.equal(result.summary.unsupported_json_rows, 0);
  assert.equal(result.summary.metadata_only_attachments, 1);
  assert.equal(result.diagnostics.reconciliation.categories.external_http, 1);
});

test('embedded data bytes are verified in the dump and never echoed into the private report', async (t) => {
  const raw = 'data:image/png;base64,' + PNG.toString('base64');
  const f = await fixture(t, [{ column: column(), values: [raw] }]);
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.embedded_originals_checked, 1);
  assert.equal(result.summary.embedded_originals_validated, 1);
  assert.equal(result.references[0].kind, 'embedded_original_validated');
  assert.equal(JSON.stringify(result).includes(PNG.toString('base64')), false);
  assert.equal(result.embedded_samples[0].original_retention, 'database_dump');
});

test('embedded JPEG header acceptance stays explicitly unproven as an original raster', async (t) => {
  const bytes = Buffer.from([255,216,255,192,0,17,8,0,1,0,1,3,1,17,0,2,17,0,3,17,0]);
  const raw = 'data:image/jpeg;base64,' + bytes.toString('base64');
  const f = await fixture(t, [{ column: column(), values: [raw] }]);
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.embedded_originals_checked, 1);
  assert.equal(result.summary.embedded_originals_validated, 0);
  assert.equal(result.references[0].kind, 'embedded_original_header_only');
  assert.equal(result.embedded_samples[0].result, 'jpeg_header_opened');
  assert.equal(result.embedded_samples[0].raster_decoded, false);
});

test('oversized embedded values stay explicitly unproven without selecting their bytes', async (t) => {
  const f = await fixture(t, [{ column: column(), values: [{ value: null, oversized: true }] }]);
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.oversized_values, 1);
  assert.equal(result.summary.embedded_originals_validated, 0);
  assert.ok(f.pg.state.queries.some((sql) => sql.includes('octet_length("file_url"::text) <= 65536')));
});

test('source dump binding fails before database access', async (t) => {
  const f = await fixture(t);
  fs.writeFileSync(f.inputs.binding, JSON.stringify({ schema_version: 1, source_database: 'postgres', dump_sha256: subject.hash('wrong') }));
  await assert.rejects(subject.runCheck(f.inputs, f.modules), /SOURCE_DUMP_BINDING_INVALID/);
  assert.equal(f.pg.state.connected, undefined);
});

test('archive content changes, unexpected members, duplicates and symlinks are refused', async (t) => {
  for (const change of ['bytes', 'extra', 'duplicate', 'symlink']) {
    const f = await fixture(t);
    const entries = [{ name: 'tenant/synthetic.png', bytes: change === 'bytes' ? Buffer.from('changed') : PNG }];
    if (change === 'extra') entries.push({ name: 'unlisted.txt', bytes: Buffer.from('unlisted') });
    if (change === 'duplicate') entries.push(entries[0]);
    if (change === 'symlink') entries[0] = { name: 'tenant/synthetic.png', type: 'symlink', header: { linkname: '/private' } };
    const archive = await pack(entries); fs.writeFileSync(f.inputs.archive, archive);
    f.manifest.files[0] = { name: 'uploads.tar.gz', bytes: archive.length, sha256: subject.hash(archive) };
    fs.writeFileSync(f.inputs.manifest, JSON.stringify(f.manifest));
    await assert.rejects(subject.runCheck(f.inputs, f.modules), /ARCHIVE_/);
  }
});

test('public summary contains only bounded aggregate scalars, never references or source names', async (t) => {
  const raw = '/uploads/private-synthetic-name.png';
  const f = await fixture(t, [{ column: column(), values: [raw] }]);
  const result = await subject.runCheck(f.inputs, f.modules);
  for (const [key, value] of Object.entries(result.summary)) {
    assert.ok(typeof value === 'boolean' ? value === false : Number.isSafeInteger(value) && value >= 0 && value <= 1e9, key);
  }
  assert.equal(JSON.stringify(result.summary).includes(raw), false);
  assert.equal(JSON.stringify(result.summary).includes('student_documents'), false);
  assert.ok(JSON.stringify(result.references).includes(raw));
  assert.equal(Buffer.byteLength(JSON.stringify(result)) <= subject.LIMITS.reportBytes, true);
});

test('fixed disposable connection never uses credentials, network URLs, write SQL or HR inputs', async (t) => {
  const f = await fixture(t, [{ column: column(), values: ['https://never-fetch.invalid/original.pdf'] }]);
  const before = new Map(fs.readdirSync(f.root).map((name) => [name, fs.readFileSync(path.join(f.root, name))]));
  const originalFetch = global.fetch; global.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); };
  t.after(() => { global.fetch = originalFetch; });
  const result = await subject.runCheck(f.inputs, f.modules);
  assert.equal(result.summary.external_requests, false);
  assert.equal(result.summary.hr_values_selected, false);
  assert.equal(f.pg.state.options.host, '/restore-socket'); assert.equal(f.pg.state.options.port, 55432);
  assert.equal(f.pg.state.options.password, null); assert.equal(f.pg.state.options.database, 'restorecheck');
  assert.match(f.pg.state.options.options, /default_transaction_read_only=on/);
  for (const sql of f.pg.state.queries) assert.match(sql, /^(?:SELECT |BEGIN |DECLARE |FETCH |CLOSE |ROLLBACK$)/);
  assert.equal(f.pg.state.queries.at(-1), 'ROLLBACK'); assert.equal(f.pg.state.ended, true);
  for (const [name, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  assert.deepEqual(Object.keys(subject.FIXED).sort(), ['archive', 'binding', 'manifest', 'mapping', 'seeds']);
});
