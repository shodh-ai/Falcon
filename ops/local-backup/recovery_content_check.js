#!/usr/bin/env node
'use strict';
// Run directly in the reviewed, already-local API image, never through its app
// entrypoint. The dispatcher must use --network none and mount ONLY the isolated
// PG socket, finalized archive/manifest, this script and minimal private inputs.
// No source database, live uploads, application env or Docker socket is needed.
// A zero exit means a bounded aggregate report was produced, NOT that recovery
// passed. Callers must inspect both readiness booleans; partial coverage is false.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { isUtf8 } = require('node:buffer');

const LIMITS = Object.freeze({ metadata: 2 * 1024 * 1024, archive: 128 * 1024 * 1024,
  members: 10000, rows: 100000, value: 65536, sample: 4 * 1024 * 1024,
  referenceBytes: 2 * 1024 * 1024, imagePixels: 1024 * 1024,
  samplesPerType: 3, samplesTotal: 9 });
const SCALAR_COLUMNS = new Set(['file_path', 'file_key', 'file_url', 'document_url',
  'document_proof_url', 'proof_file_path', 'report_file_path', 'reference_file_path',
  'reference_file_key', 'receipt_url', 'resume_file_path', 'certificate_file_path',
  'pdf_url', 'letter_pdf_url', 'evidence_url', 'question_paper_url',
  'profile_photo_url', 'photo_url', 'signature_url', 'scorm_package_path']);
const ARRAY_COLUMNS = new Set(['evidence_urls', 'document_urls', 'file_urls']);
const OBJECT_COLUMNS = new Set(['attachments', 'documents', 'supporting_documents']);
const JSON_METADATA_KEYS = new Set(['id', 'name', 'title', 'description', 'filename',
  'file_name', 'originalname', 'original_filename', 'mime', 'mimetype', 'mime_type',
  'type', 'label', 'document_type', 'status', 'uploaded_at', 'created_at', 'updated_at']);
const HR_COLUMNS = ['pan_encrypted', 'aadhaar_encrypted', 'bank_account_encrypted'];
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const HASH = /^[0-9a-f]{64}$/;
class Refused extends Error {
  constructor(code) { super(code); this.code = code; }
}
function need(condition, code) { if (!condition) throw new Refused(code); }
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function readPrivateJson(filename, privateMode = false) {
  need(path.isAbsolute(filename) && !filename.split('/').includes('..'), 'INPUT_PATH_INVALID');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const info = fs.fstatSync(fd);
    need(info.isFile() && info.nlink === 1 && info.size <= LIMITS.metadata, 'INPUT_FILE_INVALID');
    if (privateMode) need((info.mode & 0o077) === 0, 'PRIVATE_INPUT_PERMISSIONS');
    const value = JSON.parse(fs.readFileSync(fd, 'utf8'));
    need(value && typeof value === 'object' && !Array.isArray(value), 'INPUT_JSON_INVALID');
    return value;
  } finally { fs.closeSync(fd); }
}
function normalizedMember(value) {
  need(typeof value === 'string' && value.length <= 4096 && !/[\\\0-\x1f\x7f-\x9f]/.test(value), 'ARCHIVE_PATH_INVALID');
  let name = value.replace(/^(?:\.\/)+/, '').replace(/\/$/, '');
  need(!name.startsWith('/') && !name.split('/').some((p) => p === '..' || p === '.' || p === ''), 'ARCHIVE_PATH_INVALID');
  return name;
}
function mappingConfig(value) {
  need(Object.keys(value).every((key) => ['source_upload_roots', 'working_directory',
    'same_origin_hosts', 'object_storage_enabled'].includes(key)), 'MAPPING_FIELDS_INVALID');
  need(Array.isArray(value.source_upload_roots) && value.source_upload_roots.length > 0 &&
    value.source_upload_roots.length <= 8 && value.source_upload_roots.every((root) =>
      typeof root === 'string' && root.startsWith('/') && root !== '/' &&
      !root.split('/').includes('..') && path.posix.normalize(root) === root), 'MAPPING_ROOTS_INVALID');
  need(value.working_directory === '/app' && typeof value.object_storage_enabled === 'boolean', 'MAPPING_MODE_INVALID');
  need(Array.isArray(value.same_origin_hosts) && value.same_origin_hosts.every((host) =>
    typeof host === 'string' && /^[a-z0-9.-]+(?::[0-9]+)?$/.test(host)), 'MAPPING_HOSTS_INVALID');
  return value;
}
function reference(value, column, mapping) {
  if (typeof value !== 'string' || !value.trim()) return { kind: 'empty' };
  if (value.length > LIMITS.value || /[\\\0-\x1f\x7f-\x9f]/.test(value)) return { kind: 'invalid' };
  let source = value.trim();
  if (source.startsWith('s3://')) return { kind: 'external_object' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
    if (!/^https?:\/\//i.test(source)) return { kind: 'outside_coverage' };
    try {
      const url = new URL(source);
      if (url.username || url.password) return { kind: 'invalid' };
      if (!mapping.same_origin_hosts.includes(url.host.toLowerCase()) ||
          !url.pathname.startsWith('/uploads/')) return { kind: 'external_http' };
      // Signed/query-bearing links cannot be asserted equivalent to an original.
      if (url.search || url.hash) return { kind: 'outside_coverage' };
      source = decodeURIComponent(url.pathname);
    } catch { return { kind: 'invalid' }; }
  } else {
    try { source = decodeURIComponent(source); } catch { return { kind: 'invalid' }; }
  }
  source = source.replace(/^(?:\.\/)+/, '');
  if (source.includes('?') || source.includes('#')) return { kind: 'outside_coverage' };
  if (/[\\\0-\x1f\x7f-\x9f]/.test(source) || source.split('/').some((p) => p === '..' || p === '.')) return { kind: 'invalid' };
  if (mapping.object_storage_enabled && /(?:^|_)file_key$/.test(column)) return { kind: 'external_object' };
  let member;
  if (source.startsWith('/uploads/')) member = source.slice('/uploads/'.length);
  else if (source.startsWith('uploads/')) member = source.slice('uploads/'.length);
  else if (source.startsWith('/')) {
    const root = [...mapping.source_upload_roots].sort((a, b) => b.length - a.length)
      .find((candidate) => source.startsWith(candidate + '/'));
    if (!root) return { kind: 'outside_coverage' };
    member = source.slice(root.length + 1);
  } else member = source;
  try { return { kind: 'local', member: normalizedMember(member) }; }
  catch { return { kind: 'invalid' }; }
}
function minimalKey(value) {
  need(Object.keys(value).every((key) => ['HR_ENCRYPTION_KEY', 'JWT_SECRET'].includes(key)), 'KEY_FILE_NOT_MINIMAL');
  const primary = typeof value.HR_ENCRYPTION_KEY === 'string' ? value.HR_ENCRYPTION_KEY.trim() : '';
  const fallback = typeof value.JWT_SECRET === 'string' ? value.JWT_SECRET.trim() : '';
  const secret = primary || fallback;
  need(secret && secret.length <= 16384, 'HR_KEY_UNAVAILABLE');
  return crypto.scryptSync(secret, 'falcon-hr-pii', 32);
}
function decryptProbe(value, getKey) {
  if (typeof value !== 'string' || !value.trim()) return 'empty';
  if (!value.startsWith('enc:v1:')) return /^enc:/i.test(value) ? 'unsupported_format' : 'legacy_plaintext';
  const parts = value.split(':');
  if (parts.length !== 5 || value.length > LIMITS.value) return 'malformed';
  let iv, tag, data;
  try {
    const decode = (text) => {
      need(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text), 'BASE64_INVALID');
      const decoded = Buffer.from(text, 'base64');
      need(decoded.toString('base64') === text, 'BASE64_INVALID');
      return decoded;
    };
    iv = decode(parts[2]); tag = decode(parts[3]); data = decode(parts[4]);
    if (iv.length !== 12 || tag.length !== 16 || !data.length) return 'malformed';
  } catch { return 'malformed'; }
  let key;
  try { key = getKey(); } catch { return 'key_unavailable'; }
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.length && isUtf8(plaintext) ? 'decrypted' : 'invalid_plaintext';
  } catch { return 'authentication_failed'; }
  finally { if (plaintext) plaintext.fill(0); }
}
function quoteIdentifier(value) {
  need(typeof value === 'string' && IDENTIFIER.test(value), 'RESTORED_SCHEMA_IDENTIFIER_INVALID');
  return '"' + value.replace(/"/g, '""') + '"';
}
function jsonReferences(value, arrayOnly = false, depth = 0) {
  need(depth <= 6, 'JSON_REFERENCE_DEPTH');
  const looksLikeReference = (item) => /^(?:https?:|s3:|\/|uploads\/)|\.(?:pdf|png|jpe?g|docx?|pptx?|xlsx?)(?:[?#]|$)/i.test(item);
  // A recognized document column can hold string arrays, including extensionless
  // disk keys. Treat every primitive as a reference rather than guess it away.
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    need(value.length <= 1000, 'JSON_REFERENCE_ARRAY_LIMIT');
    return value.flatMap((item) => jsonReferences(item, arrayOnly, depth + 1));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => {
    if (SCALAR_COLUMNS.has(key) || ['url', 'path', 'key'].includes(key)) {
      return typeof item === 'string' ? [item] : jsonReferences(item, true, depth + 1);
    }
    if (typeof item === 'string' && item.trim() &&
        (looksLikeReference(item) || !JSON_METADATA_KEYS.has(key))) throw new Refused('JSON_REFERENCE_UNCLASSIFIED');
    return typeof item === 'object' ? jsonReferences(item, false, depth + 1) : [];
  });
}
async function collectDatabase(client, mapping, getKey) {
  const result = { references: new Map(), documents: { sources_checked: 0, values_checked: 0,
    empty: 0, external_http: 0, external_object: 0, outside_coverage: 0, invalid: 0,
    oversized_values: 0, unsupported_json: 0, possible_uncovered_columns: 0 },
    hr: { sources_checked: 0, values_checked: 0, empty: 0, decrypted: 0,
      legacy_plaintext: 0, unsupported_format: 0, malformed: 0, key_unavailable: 0,
      authentication_failed: 0, invalid_plaintext: 0 } };
  const metadata = await client.query(`SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema')
      AND table_schema NOT LIKE 'pg\\_%' ESCAPE '\\' ORDER BY table_schema,table_name,ordinal_position LIMIT 10001`);
  need(metadata.rows.length <= LIMITS.members, 'RESTORED_SCHEMA_COLUMN_LIMIT');
  let rows = 0, referenceBytes = 0;
  for (const item of metadata.rows) {
    const hr = item.table_name === 'hr_employee_profiles' && HR_COLUMNS.includes(item.column_name);
    const profilePhoto = item.table_name === 'users' && item.column_name === 'onboarding_profile';
    const scalar = SCALAR_COLUMNS.has(item.column_name) || profilePhoto;
    const array = ARRAY_COLUMNS.has(item.column_name);
    const object = OBJECT_COLUMNS.has(item.column_name) ||
      (item.table_name === 'registrar_petitions' && item.column_name === 'documents_json');
    if (!hr && !scalar && !array && !object) {
      if (/(?:file|document|receipt|attachment|evidence|pdf).*(?:path|url|key|files|documents)/i.test(item.column_name)) result.documents.possible_uncovered_columns++;
      continue;
    }
    if (!['text', 'character varying', 'character', 'json', 'jsonb'].includes(item.data_type)) {
      result.documents.possible_uncovered_columns++; continue;
    }
    if (profilePhoto && !['json', 'jsonb'].includes(item.data_type)) {
      result.documents.possible_uncovered_columns++; continue;
    }
    const table = quoteIdentifier(item.table_schema) + '.' + quoteIdentifier(item.table_name);
    const column = quoteIdentifier(item.column_name);
    // The profile also contains business/HR text. Fetch only the deployed photo
    // fallback, never feed a complete profile through document JSON heuristics.
    const source = profilePhoto ? `(${column}::jsonb ->> 'profile_photo_url')` : column;
    await client.query(`DECLARE recovery_content NO SCROLL CURSOR FOR SELECT
      CASE WHEN octet_length(${source}::text) <= ${LIMITS.value} THEN ${source}::text ELSE NULL END AS value,
      octet_length(${source}::text) > ${LIMITS.value} AS oversized
      FROM ${table} WHERE ${source} IS NOT NULL`);
    if (hr) result.hr.sources_checked++; else result.documents.sources_checked++;
    try {
      while (true) {
        const batch = await client.query('FETCH FORWARD 100 FROM recovery_content');
        if (!batch.rows.length) break;
        rows += batch.rows.length;
        need(rows <= LIMITS.rows, 'RESTORED_REFERENCE_ROW_LIMIT');
        for (const row of batch.rows) {
          if (hr) {
            result.hr.values_checked++;
            const outcome = row.oversized ? 'malformed' : decryptProbe(row.value, getKey);
            result.hr[outcome]++;
            continue;
          }
          if (row.oversized) { result.documents.oversized_values++; continue; }
          let values = [row.value];
          if (array || object) {
            try { values = jsonReferences(JSON.parse(row.value), array); }
            catch { result.documents.unsupported_json++; continue; }
          }
          for (const value of values) {
            result.documents.values_checked++;
            const parsed = reference(value, item.column_name, mapping);
            if (parsed.kind !== 'local') { result.documents[parsed.kind]++; continue; }
            if (!result.references.has(parsed.member)) referenceBytes += Buffer.byteLength(parsed.member);
            need((result.references.has(parsed.member) || result.references.size < LIMITS.members) && referenceBytes <= LIMITS.referenceBytes,
              'RESTORED_REFERENCE_MEMORY_LIMIT');
            result.references.set(parsed.member, (result.references.get(parsed.member) || 0) + 1);
          }
        }
      }
    } finally { await client.query('CLOSE recovery_content'); }
  }
  return result;
}
async function readableOriginal(bytes, extension, pdfLib) {
  // Libraries may emit diagnostics containing source bytes. Silence them in this
  // standalone checker and expose only controlled aggregate outcomes.
  const old = { warn: console.warn, error: console.error, log: console.log };
  console.warn = console.error = console.log = () => {};
  try {
    if (extension === '.pdf') {
      const document = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true });
      need(document.getPageCount() > 0, 'PDF_NO_PAGES');
      return 'pdf_parsed';
    }
    const document = await pdfLib.PDFDocument.create();
    if (extension === '.png') {
      // Inspect the fixed IHDR before invoking a raster decoder. A tiny PNG can
      // otherwise declare an enormous image and exceed the isolated helper cap.
      need(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
        bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR', 'PNG_INVALID');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      need(width > 0 && height > 0 && width * height <= LIMITS.imagePixels, 'PNG_DIMENSION_LIMIT');
      const image = await document.embedPng(bytes);
      need(image.width > 0 && image.height > 0, 'PNG_INVALID');
      return 'png_decoded';
    }
    const image = await document.embedJpg(bytes);
    need(image.width > 0 && image.height > 0, 'JPEG_INVALID');
    return 'jpeg_header_opened'; // This is not a full JPEG raster decode.
  } finally { Object.assign(console, old); }
}
async function inspectArchive(filename, manifest, references, modules) {
  need(manifest && manifest.uploads && manifest.uploads.file_sha256 && Array.isArray(manifest.files), 'BACKUP_MANIFEST_INVALID');
  const expected = new Map(Object.entries(manifest.uploads.file_sha256));
  need(expected.size <= LIMITS.members && [...expected].every(([name, digest]) => normalizedMember(name) === name && HASH.test(digest)), 'BACKUP_INVENTORY_INVALID');
  const archiveRecord = manifest.files.find((item) => item.name === 'uploads.tar.gz');
  need(archiveRecord && HASH.test(archiveRecord.sha256) && Number.isSafeInteger(archiveRecord.bytes) && archiveRecord.bytes <= LIMITS.archive, 'ARCHIVE_RECORD_INVALID');
  const selected = new Set();
  const perType = new Map();
  for (const name of [...references.keys()].sort()) {
    const extension = path.posix.extname(name).toLowerCase();
    if (!expected.has(name) || !['.pdf', '.png', '.jpg', '.jpeg'].includes(extension)) continue;
    const type = extension === '.jpeg' ? '.jpg' : extension;
    if ((perType.get(type) || 0) >= LIMITS.samplesPerType || selected.size >= LIMITS.samplesTotal) continue;
    selected.add(name); perType.set(type, (perType.get(type) || 0) + 1);
  }
  const summary = { files_hashed: 0, readable_samples: 0, pdf_parsed: 0, png_decoded: 0,
    jpeg_header_opened: 0, unreadable_samples: 0, oversized_samples: 0,
    representative_scope: 'bounded referenced PDFs/PNGs/JPEG headers; no full UI rendering' };
  const archiveHash = crypto.createHash('sha256');
  let compressed = 0, expanded = 0;
  const seen = new Set();
  const extract = modules.tar.extract();
  extract.on('entry', (header, stream, next) => {
    void (async () => {
      need(header.type === 'file' || header.type === 'directory', 'ARCHIVE_MEMBER_TYPE');
      if (header.type === 'directory') {
        need(header.size === 0, 'ARCHIVE_DIRECTORY_BODY');
        if (header.name !== '.' && header.name !== './') normalizedMember(header.name);
        stream.on('end', next); stream.resume(); return;
      }
      const name = normalizedMember(header.name);
      need(expected.has(name) && !seen.has(name) && Number.isSafeInteger(header.size) && header.size >= 0, 'ARCHIVE_MEMBER_UNEXPECTED');
      seen.add(name);
      let bytes = 0;
      const checksum = crypto.createHash('sha256');
      const sample = [];
      const capture = selected.has(name) && header.size <= LIMITS.sample;
      if (selected.has(name) && !capture) summary.oversized_samples++;
      for await (const chunk of stream) {
        bytes += chunk.length; expanded += chunk.length;
        need(bytes <= header.size && expanded <= LIMITS.archive, 'ARCHIVE_EXPANSION_LIMIT');
        checksum.update(chunk);
        if (capture) sample.push(chunk);
      }
      need(bytes === header.size && checksum.digest('hex') === expected.get(name), 'ARCHIVE_MEMBER_HASH_FAILED');
      summary.files_hashed++;
      if (capture) {
        const buffer = Buffer.concat(sample);
        try {
          const outcome = await readableOriginal(buffer, path.posix.extname(name).toLowerCase(), modules.pdf);
          summary[outcome]++;
          // JPEG metadata acceptance cannot establish that its raster is readable.
          if (outcome !== 'jpeg_header_opened') summary.readable_samples++;
        } catch { summary.unreadable_samples++; }
        finally { buffer.fill(0); }
      }
      next();
    })().catch(() => { extract.destroy(new Refused('ARCHIVE_VALIDATION_FAILED')); stream.destroy(); });
  });
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const info = fs.fstatSync(fd);
  if (!info.isFile() || info.size !== archiveRecord.bytes) {
    fs.closeSync(fd); throw new Refused('ARCHIVE_SIZE_FAILED');
  }
  const meter = new Transform({ transform(chunk, encoding, done) {
    compressed += chunk.length;
    if (compressed > LIMITS.archive) return done(new Refused('ARCHIVE_COMPRESSED_LIMIT'));
    archiveHash.update(chunk); done(null, chunk);
  } });
  let inflated = 0;
  const expansionMeter = new Transform({ transform(chunk, encoding, done) {
    inflated += chunk.length;
    if (inflated > LIMITS.archive + LIMITS.members * 1024 + 1024 * 1024) return done(new Refused('ARCHIVE_EXPANSION_LIMIT'));
    done(null, chunk);
  } });
  try { await pipeline(fs.createReadStream(filename, { fd, autoClose: true }), meter, zlib.createGunzip(), expansionMeter, extract); }
  catch { throw new Refused('ARCHIVE_VALIDATION_FAILED'); }
  need(compressed === archiveRecord.bytes && archiveHash.digest('hex') === archiveRecord.sha256 && seen.size === expected.size, 'ARCHIVE_INVENTORY_FAILED');
  return summary;
}
function baselineHashes(value, dumpHash, archiveHash) {
  if (!value) return new Set();
  need(Object.keys(value).every((key) => ['schema_version', 'dump_sha256', 'uploads_archive_sha256',
    'observation', 'reference_hashes'].includes(key)) && value.schema_version === 1 &&
    value.dump_sha256 === dumpHash && value.uploads_archive_sha256 === archiveHash &&
    value.observation === 'preexisting_missing_on_source' && Array.isArray(value.reference_hashes) &&
    value.reference_hashes.length <= LIMITS.rows && value.reference_hashes.every((item) => HASH.test(item)), 'PREEXISTING_BASELINE_INVALID');
  return new Set(value.reference_hashes);
}
function aggregate(database, archive, manifest, baseline) {
  const expected = new Set(Object.keys(manifest.uploads.file_sha256));
  const documents = { ...database.documents, distinct_local_references: database.references.size,
    matched_local_references: 0, missing_preexisting_confirmed: 0, missing_unattributed: 0,
    matched_distinct_files: 0, ...archive };
  for (const [member, count] of database.references) {
    if (expected.has(member)) { documents.matched_local_references += count; documents.matched_distinct_files++; }
    else if (baseline.has(hash(member))) documents.missing_preexisting_confirmed += count;
    else documents.missing_unattributed += count;
  }
  const hr = { ...database.hr };
  hr.key_compatibility_proven = hr.decrypted > 0 && !['unsupported_format', 'malformed',
    'key_unavailable', 'authentication_failed', 'invalid_plaintext'].some((key) => hr[key]);
  const documentsVerified = documents.matched_distinct_files > 0 && documents.readable_samples > 0 &&
    !['external_http', 'external_object', 'outside_coverage', 'invalid', 'oversized_values',
      'unsupported_json', 'possible_uncovered_columns', 'missing_preexisting_confirmed',
      'missing_unattributed', 'unreadable_samples', 'oversized_samples'].some((key) => documents[key]);
  return { schema_version: 1, execution_complete: true,
    status: documentsVerified && hr.key_compatibility_proven ? 'passed' : 'unproven',
    source_catalog: 'deployed-d44b913 recognized scalar/JSON reference columns; not arbitrary embedded text',
    documents, hr, readiness: { documents_verified: documentsVerified,
      encrypted_fields_verified: hr.key_compatibility_proven } };
}
async function runCheck(options, modules) {
  const mapping = mappingConfig(readPrivateJson(options.mapping));
  const manifest = readPrivateJson(options.manifest);
  need(HASH.test(options.dump_sha256) && Array.isArray(manifest.database_names) &&
    manifest.database_names.includes(options.source_database), 'SOURCE_DATABASE_BINDING_INVALID');
  const dump = manifest.files.find((item) => item.name === 'database-' + options.source_database + '.dump');
  need(dump && dump.sha256 === options.dump_sha256, 'SOURCE_DUMP_HASH_MISMATCH');
  const archive = manifest.files.find((item) => item.name === 'uploads.tar.gz');
  const baseline = baselineHashes(options.baseline ? readPrivateJson(options.baseline, true) : null,
    options.dump_sha256, archive?.sha256);
  let derivedKey;
  const getKey = () => derivedKey || (derivedKey = minimalKey(readPrivateJson(options.hr_key_file, true)));
  const client = new modules.pg.Client({ host: '/restore-socket', port: 55432,
    user: 'restorecheck', database: 'restorecheck', password: null, ssl: false,
    connectionTimeoutMillis: 5000, query_timeout: 30000,
    application_name: 'falcon-isolated-content-check',
    options: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000' });
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const database = await collectDatabase(client, mapping, getKey);
    await client.query('ROLLBACK');
    const archiveSummary = await inspectArchive(options.archive, manifest, database.references, modules);
    return aggregate(database, archiveSummary, manifest, baseline);
  } finally {
    if (derivedKey) derivedKey.fill(0);
    await client.end().catch(() => {});
  }
}
function parseArguments(argv) {
  const allowed = new Set(['archive', 'manifest', 'mapping', 'hr-key-file', 'baseline',
    'source-database', 'dump-sha256']);
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    need(argv[i]?.startsWith('--') && allowed.has(key) && argv[i + 1] && !Object.hasOwn(result, key.replaceAll('-', '_')), 'ARGUMENTS_INVALID');
    result[key.replaceAll('-', '_')] = argv[i + 1];
  }
  need([...allowed].filter((key) => key !== 'baseline').every((key) => result[key.replaceAll('-', '_')]), 'ARGUMENTS_MISSING');
  return result;
}
async function main() {
  // Eliminate implicit pg driver environment fallbacks before requiring it.
  for (const key of Object.keys(process.env)) if (key.startsWith('PG') || key === 'DATABASE_URL') delete process.env[key];
  console.log = console.warn = console.error = () => {};
  try {
    const modules = { pg: require('/app/node_modules/pg'), pdf: require('/app/node_modules/pdf-lib'),
      tar: require('/app/node_modules/tar-stream') };
    const report = await runCheck(parseArguments(process.argv.slice(2)), modules);
    process.stdout.write(JSON.stringify(report) + '\n');
  } catch (error) {
    const code = error instanceof Refused ? error.code : 'CONTENT_CHECK_FAILED';
    process.stdout.write(JSON.stringify({ schema_version: 1, execution_complete: false,
      status: 'failed', error_code: code, readiness: { documents_verified: false,
        encrypted_fields_verified: false } }) + '\n');
    process.exitCode = 1;
  }
}
if (require.main === module) void main();
module.exports = { LIMITS, Refused, normalizedMember, mappingConfig, reference, minimalKey,
  decryptProbe, jsonReferences, collectDatabase, readableOriginal, inspectArchive,
  baselineHashes, aggregate, runCheck, parseArguments, hash };
