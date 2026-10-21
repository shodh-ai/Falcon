#!/usr/bin/env node
'use strict';
// Read-only diagnostics for a disposable restore. Never receives production
// credentials, live upload mounts, HR keys, or network access. stdout contains
// PRIVATE document references and must be captured only in a root-owned file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const LIMITS = Object.freeze({ metadata: 2 * 1024 * 1024, archive: 128 * 1024 * 1024,
  members: 10000, rows: 100000, value: 65536, sample: 4 * 1024 * 1024,
  referenceBytes: 2 * 1024 * 1024, detailBytes: 512 * 1024,
  reportBytes: 2 * 1024 * 1024, imagePixels: 2 * 1024 * 1024,
  deadlineMs: 240000 });
const HASH = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const SCALARS = new Set(['file_path', 'file_key', 'file_url', 'document_url',
  'document_proof_url', 'proof_file_path', 'report_file_path', 'reference_file_path',
  'reference_file_key', 'receipt_url', 'resume_file_path', 'certificate_file_path',
  'pdf_url', 'letter_pdf_url', 'evidence_url', 'question_paper_url',
  'profile_photo_url', 'photo_url', 'signature_url', 'scorm_package_path']);
const ARRAYS = new Set(['evidence_urls', 'document_urls', 'file_urls']);
const OBJECTS = new Set(['attachments', 'documents', 'supporting_documents']);
const ADDED = new Set(['object_key', 'document_object_key', 'derivative_object_key',
  'pdf_path', 'syllabus_pdf_path', 'resume_pdf_path', 'storage_key', 'signature_image_url']);
const SUSPECT = /(?:file|document|receipt|attachment|evidence|pdf).*(?:path|url|key|files|documents)/i;
const JSON_META = new Set(['id', 'name', 'title', 'description', 'filename', 'file_name',
  'originalname', 'original_filename', 'mime', 'mimetype', 'mime_type', 'type',
  'label', 'document_type', 'status', 'uploaded_at', 'created_at', 'updated_at', 'size']);
const REFERENCE_KEYS = new Set([...SCALARS, ...ADDED, 'url', 'path', 'key']);
const EMBEDDED_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const FIXED = Object.freeze({ archive: '/inputs/uploads.tar.gz', manifest: '/inputs/manifest.json',
  mapping: '/inputs/mapping.json', seeds: '/inputs/seed-catalog.json', binding: '/inputs/binding.json' });

class Refused extends Error { constructor(code) { super(code); this.code = code; } }
function need(value, code) { if (!value) throw new Refused(code); }
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function guard(started) { need(Date.now() - started <= LIMITS.deadlineMs, 'DEADLINE_EXCEEDED'); }
function quote(value) { need(typeof value === 'string' && IDENTIFIER.test(value), 'SCHEMA_IDENTIFIER_INVALID'); return '"' + value + '"'; }
function inputJson(filename) {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    need(st.isFile() && st.nlink === 1 && st.size <= LIMITS.metadata, 'INPUT_INVALID');
    const value = JSON.parse(fs.readFileSync(fd, 'utf8'));
    need(value && typeof value === 'object' && !Array.isArray(value), 'INPUT_INVALID');
    return value;
  } finally { fs.closeSync(fd); }
}
function seedCatalog(value) {
  need(value.schema_version === 1 && /^[0-9a-f]{40}$/.test(value.source_revision) &&
    value.match_label === 'matches_repository_seed_literal' && Array.isArray(value.entries) &&
    value.entries.length <= 5000, 'SEED_CATALOG_INVALID');
  const result = new Map();
  for (const entry of value.entries) {
    need(entry && typeof entry.reference === 'string' && entry.reference.length <= 4096 &&
      !/[\0-\x1f\x7f-\x9f]/.test(entry.reference) && Array.isArray(entry.source_files) &&
      entry.source_files.length > 0 && entry.source_files.length <= 100 &&
      entry.source_files.every((name) => typeof name === 'string' && name.startsWith('backend/') &&
        !name.split('/').some((part) => !part || part === '.' || part === '..') &&
        /^[A-Za-z0-9_./-]+:[1-9][0-9]*$/.test(name)) && !result.has(entry.reference), 'SEED_CATALOG_INVALID');
    result.set(entry.reference, entry.source_files);
  }
  return result;
}
function isLegacy(item) {
  return SCALARS.has(item.column_name) || ARRAYS.has(item.column_name) || OBJECTS.has(item.column_name) ||
    (item.table_name === 'users' && item.column_name === 'onboarding_profile') ||
    (item.table_name === 'registrar_petitions' && item.column_name === 'documents_json');
}
function supported(item) {
  return ['text', 'character varying', 'character', 'json', 'jsonb'].includes(item.data_type) ||
    (item.data_type === 'ARRAY' && ['_text', '_varchar', '_bpchar'].includes(item.udt_name));
}
function generatedRoute(value, item) {
  const prefix = '/api/admin/registrar-desk/';
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if (item.table_name === 'registrar_certificate_requests' && item.column_name === 'pdf_url')
    return new RegExp('^' + prefix + 'certificates/' + uuid + '/pdf$', 'i').test(value);
  if (item.table_name === 'registrar_staff_appointments' && item.column_name === 'letter_pdf_url')
    return new RegExp('^' + prefix + 'appointments/' + uuid + '/pdf$', 'i').test(value);
  return false;
}
function embeddedAllowed(item, key) {
  return (item.table_name === 'student_documents' && item.column_name === 'file_url') ||
    (item.table_name === 'registrar_petitions' && item.column_name === 'documents_json' && key === 'data_url') ||
    (item.table_name === 'registrar_dsc_credentials' && item.column_name === 'signature_image_url');
}
function embeddedData(value) {
  need(typeof value === 'string' && value.length <= LIMITS.value, 'EMBEDDED_SIZE_LIMIT');
  const match = /^data:(application\/pdf|image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  need(match && EMBEDDED_MIMES.has(match[1]) && match[2].length > 0 && match[2].length % 4 === 0,
    'EMBEDDED_FORMAT_INVALID');
  const bytes = Buffer.from(match[2], 'base64');
  need(bytes.length > 0 && bytes.length <= LIMITS.sample && bytes.toString('base64') === match[2], 'EMBEDDED_FORMAT_INVALID');
  return { mime: match[1], bytes };
}
function jsonValues(value, item, depth = 0) {
  need(depth <= 6, 'JSON_DEPTH_LIMIT');
  if (typeof value === 'string') return { refs: [{ value, key: item.column_name }], metadata: 0 };
  if (value === null) return { refs: [], metadata: 0 };
  if (Array.isArray(value)) {
    need(value.length <= 1000, 'JSON_ARRAY_LIMIT');
    const result = { refs: [], metadata: 0 };
    for (const nested of value) { const part = jsonValues(nested, item, depth + 1); result.refs.push(...part.refs); result.metadata += part.metadata; }
    return result;
  }
  need(value && typeof value === 'object', 'JSON_PRIMITIVE_UNCLASSIFIED');
  const facultyMetadata = item.table_name === 'faculty_ai_messages' && item.column_name === 'attachments';
  const registrar = item.table_name === 'registrar_petitions' && item.column_name === 'documents_json';
  if (facultyMetadata) {
    need(Object.keys(value).every((key) => ['name', 'mime', 'size'].includes(key)) &&
      typeof value.name === 'string' && typeof value.mime === 'string' &&
      (value.size === undefined || (Number.isFinite(value.size) && value.size >= 0)), 'JSON_METADATA_UNCLASSIFIED');
    return { refs: [], metadata: 1 };
  }
  const refs = [];
  for (const [key, nested] of Object.entries(value)) {
    if (REFERENCE_KEYS.has(key) || (registrar && key === 'data_url')) {
      if (typeof nested === 'string') refs.push({ value: nested, key });
      else { const part = jsonValues(nested, item, depth + 1); refs.push(...part.refs); }
    } else if (registrar && JSON_META.has(key) &&
        (nested === null || ['string', 'number', 'boolean'].includes(typeof nested))) {
      continue; // Table-specific filename metadata is not a second original.
    } else if (nested !== null && typeof nested === 'object') {
      const part = jsonValues(nested, item, depth + 1); refs.push(...part.refs);
    } else if (typeof nested === 'string' && nested.trim()) {
      need(JSON_META.has(key) && !/^(?:https?:|s3:|\/|uploads\/)|\.(?:pdf|png|jpe?g|docx?|pptx?|xlsx?)(?:[?#]|$)/i.test(nested), 'JSON_REFERENCE_UNCLASSIFIED');
    }
  }
  return { refs, metadata: 0 };
}
function safeLocalKey(value, frozen) {
  need(typeof value === 'string' && value && value.length <= 4096 &&
    !/[\\\0-\x1f\x7f-\x9f%?#]/.test(value) && !value.startsWith('/'), 'DOWNLOAD_KEY_INVALID');
  return frozen.normalizedMember(value);
}
function normalizedReference(value, item, mapping, frozen) {
  if (typeof value !== 'string' || !value.trim()) return { kind: 'empty' };
  if (value.length > LIMITS.value || /[\\\0-\x1f\x7f-\x9f]/.test(value)) return { kind: 'invalid' };
  const source = value.trim();
  if (generatedRoute(source, item)) return { kind: 'generated_route', regeneration_verified: false };
  if (/^data:/i.test(source)) return { kind: 'embedded_unclassified' };
  // Decode only the documented shared download URL. Other API endpoints remain
  // outside coverage; query parameters are never generally stripped or fetched.
  let url;
  if (/^https?:\/\//i.test(source)) {
    try { url = new URL(source); } catch { return { kind: 'invalid' }; }
    if (url.username || url.password) return { kind: 'invalid' };
  } else if (source.startsWith('/api/uploads/download?') || source.startsWith('/uploads/download?')) {
    try { url = new URL(source, 'https://' + mapping.same_origin_hosts[0]); } catch { return { kind: 'invalid' }; }
  }
  if (url && ['/api/uploads/download', '/uploads/download'].includes(url.pathname)) {
    if (!mapping.same_origin_hosts.includes(url.host.toLowerCase())) return { kind: 'external_http' };
    const parameters = [...url.searchParams.entries()];
    if (url.hash || parameters.length !== 1 || !['key', 'path'].includes(parameters[0][0])) return { kind: 'invalid' };
    try {
      let key = parameters[0][1];
      if (parameters[0][0] === 'path') {
        if (key.startsWith('/uploads/')) key = key.slice(9);
        else if (key.startsWith('uploads/')) key = key.slice(8);
        else if (key.startsWith('/app/uploads/')) key = key.slice(13);
      }
      return { kind: 'local', member: safeLocalKey(key, frozen), alias: 'documented_download_parameter' };
    } catch { return { kind: 'invalid' }; }
  }
  return frozen.reference(source, item.column_name, mapping);
}
function mediaSignature(bytes) {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 216) return 'image/jpeg';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
function extensionMime(name) {
  return ({ '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[path.posix.extname(name).toLowerCase()] || null;
}
async function parseMedia(bytes, mime, pdf) {
  try {
    if (mime === 'application/pdf') {
      const doc = await pdf.PDFDocument.load(Uint8Array.from(bytes), { ignoreEncryption: false, throwOnInvalidObject: true });
      need(doc.getPageCount() > 0, 'PDF_NO_PAGES');
      return { result: 'pdf_parsed', raster_decoded: false };
    }
    if (mime === 'image/png') {
      need(bytes.length >= 33 && bytes.readUInt32BE(8) === 13 && bytes.subarray(12, 16).toString('ascii') === 'IHDR', 'PNG_INVALID');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if (!width || !height || width * height > LIMITS.imagePixels) return { result: 'pixel_budget_exceeded', raster_decoded: false };
      const doc = await pdf.PDFDocument.create();
      const image = await doc.embedPng(Uint8Array.from(bytes));
      need(image.width === width && image.height === height, 'PNG_INVALID');
      return { result: 'png_decoded', raster_decoded: true, width, height };
    }
    if (mime === 'image/jpeg') {
      const doc = await pdf.PDFDocument.create();
      // pdf-lib's JPEG implementation indexes imageData.buffer at offset zero.
      // Buffer pool offsets must not change the validity of identical bytes.
      const image = await doc.embedJpg(Uint8Array.from(bytes));
      need(image.width > 0 && image.height > 0, 'JPEG_INVALID');
      return { result: 'jpeg_header_opened', raster_decoded: false, width: image.width, height: image.height };
    }
    return { result: 'format_unsupported', raster_decoded: false };
  } catch (error) {
    // Never expose a parser's message. The trusted pdf-lib build can transpile
    // Error subclasses into plain Error instances; compare only its exact fresh
    // constructor signature in that case, never a substring or document value.
    if (mime === 'application/pdf' && error && typeof pdf.EncryptedPDFError === 'function') {
      let encrypted = false;
      try {
        const signature = new pdf.EncryptedPDFError();
        const trustedTypedError = error instanceof pdf.EncryptedPDFError &&
          (error.name === 'EncryptedPDFError' || error.constructor?.name === 'EncryptedPDFError');
        encrypted = trustedTypedError || (typeof signature.message === 'string' && signature.message.length > 0 &&
          typeof error.message === 'string' && error.message === signature.message);
      } catch { /* A dependency mismatch remains a fixed unproven result. */ }
      if (encrypted) return { result: 'encrypted_pdf_password_required', raster_decoded: false };
    }
    return { result: 'parser_rejected', raster_decoded: false };
  }
}
function increment(object, key, count = 1) { object[key] = (object[key] || 0) + count; }
function snapshot(st) { return [st.dev, st.ino, st.size, st.mtimeMs, st.ctimeMs].join(':'); }
function legacyEmpty() { return { values_checked: 0, empty: 0, external_http: 0, external_object: 0,
  outside_coverage: 0, invalid: 0, oversized_values: 0, unsupported_json: 0,
  possible_uncovered_columns: 0, sources_checked: 0 }; }
async function collect(client, frozen, mapping, seeds, expected, pdf, started) {
  const catalog = await client.query(`SELECT c.table_schema,c.table_name,c.column_name,c.data_type,c.udt_name,
    t.table_type FROM information_schema.columns c LEFT JOIN information_schema.tables t
    ON t.table_schema=c.table_schema AND t.table_name=c.table_name
    WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
    AND c.table_schema NOT LIKE 'pg\\_%' ESCAPE '\\'
    ORDER BY c.table_schema,c.table_name,c.ordinal_position LIMIT 10001`);
  need(catalog.rows.length <= LIMITS.members, 'SCHEMA_COLUMN_LIMIT');
  const state = { legacy: legacyEmpty(), legacyRefs: new Map(), references: new Map(), sources: [],
    embeddedSamples: [], rows: 0, referenceBytes: 0, detailBytes: 0, detailsOmitted: 0,
    normalizationChanges: 0, categories: {}, seedMatches: 0, metadataOnly: 0 };
  const note = (raw, parsed, item, source, legacyOutcome) => {
    increment(source.categories, parsed.kind); increment(state.categories, parsed.kind);
    if (seeds.has(raw)) { source.seed_literal_matches++; state.seedMatches++; }
    const id = hash([item.table_schema, item.table_name, item.column_name, raw].join('\0'));
    if (state.references.has(id)) { state.references.get(id).occurrences++; return; }
    const entry = { id, source: source.id, occurrences: 1, kind: parsed.kind,
      legacy_kind: legacyOutcome?.kind || 'not_in_legacy_catalog',
      ...(parsed.member ? { member: parsed.member, archive_present: expected.has(parsed.member) } : {}),
      ...(seeds.has(raw) ? { observation: 'matches_repository_seed_literal', seed_sources: seeds.get(raw), seed_match_proves_recovery: false } : {}) };
    // Embedded bytes are deliberately not copied into the diagnostic report.
    const rawBytes = Buffer.byteLength(raw);
    if (!/^data:/i.test(raw) && rawBytes <= 4096 && state.detailBytes + rawBytes <= LIMITS.detailBytes) {
      entry.reference = raw; state.detailBytes += rawBytes;
    } else { entry.reference_sha256 = hash(raw); entry.raw_reference_omitted = true; state.detailsOmitted++; }
    state.referenceBytes += Buffer.byteLength(JSON.stringify(entry));
    need(state.references.size < LIMITS.members && state.referenceBytes <= LIMITS.referenceBytes, 'REFERENCE_MEMORY_LIMIT');
    state.references.set(id, entry);
  };
  for (const item of catalog.rows) {
    guard(started);
    // HR encryption columns and all unrelated business values are never selected.
    if (item.table_name === 'hr_employee_profiles' && /_encrypted$/.test(item.column_name)) continue;
    for (const key of ['table_schema', 'table_name', 'column_name']) quote(item[key]);
    const legacy = isLegacy(item);
    const known = legacy || ADDED.has(item.column_name);
    const suspected = SUSPECT.test(item.column_name);
    if (!known && !suspected) continue;
    const source = { id: state.sources.length, schema: item.table_schema, table: item.table_name,
      column: item.column_name, data_type: item.data_type, table_type: item.table_type || 'unknown',
      legacy_catalog: legacy, added_catalog: !legacy && known,
      values_scanned: 0, oversized: 0, categories: {}, seed_literal_matches: 0,
      metadata_only_attachments: 0, unsupported_json: 0 };
    state.sources.push(source);
    const legacyType = ['text', 'character varying', 'character', 'json', 'jsonb'].includes(item.data_type);
    const photo = item.table_name === 'users' && item.column_name === 'onboarding_profile';
    if (!legacy || !legacyType || (photo && !['json', 'jsonb'].includes(item.data_type))) {
      if (suspected || legacy) state.legacy.possible_uncovered_columns++;
    }
    const table = quote(item.table_schema) + '.' + quote(item.table_name);
    const column = quote(item.column_name);
    if (!known || !supported(item) || (photo && !['json', 'jsonb'].includes(item.data_type))) {
      // Only bounded cursor booleans leave PostgreSQL for unclassified columns.
      await client.query(`DECLARE document_unknown NO SCROLL CURSOR FOR SELECT (${column} IS NOT NULL) AS populated FROM ${table}`);
      source.populated_values = 0; source.null_values = 0; source.coverage = 'unclassified_column';
      try { while (true) {
        guard(started); const batch = await client.query('FETCH FORWARD 100 FROM document_unknown');
        if (!batch.rows.length) break;
        state.rows += batch.rows.length; need(state.rows <= LIMITS.rows, 'ROW_LIMIT');
        for (const row of batch.rows) row.populated ? source.populated_values++ : source.null_values++;
      } } finally { await client.query('CLOSE document_unknown'); }
      continue;
    }
    if (legacy && legacyType) state.legacy.sources_checked++;
    let expression = photo ? `(${column}::jsonb ->> 'profile_photo_url')` : column;
    if (item.data_type === 'ARRAY') expression = `to_jsonb(${column})`;
    await client.query(`DECLARE document_refs NO SCROLL CURSOR FOR SELECT
      CASE WHEN octet_length(${expression}::text) <= ${LIMITS.value} THEN ${expression}::text ELSE NULL END AS value,
      octet_length(${expression}::text) > ${LIMITS.value} AS oversized FROM ${table} WHERE ${expression} IS NOT NULL`);
    try { while (true) {
      guard(started); const batch = await client.query('FETCH FORWARD 100 FROM document_refs');
      if (!batch.rows.length) break;
      state.rows += batch.rows.length; need(state.rows <= LIMITS.rows, 'ROW_LIMIT');
      for (const row of batch.rows) {
        source.values_scanned++;
        if (row.oversized) { source.oversized++; if (legacy && legacyType) state.legacy.oversized_values++; continue; }
        need(typeof row.value === 'string' && Buffer.byteLength(row.value) <= LIMITS.value, 'VALUE_INVALID');
        const structured = ARRAYS.has(item.column_name) || OBJECTS.has(item.column_name) ||
          (item.table_name === 'registrar_petitions' && item.column_name === 'documents_json') || item.data_type === 'ARRAY';
        if (legacy && legacyType) {
          let old = [row.value];
          if (structured) { try { old = frozen.jsonReferences(JSON.parse(row.value), ARRAYS.has(item.column_name)); }
            catch { state.legacy.unsupported_json++; old = []; } }
          for (const raw of old) {
            const parsed = frozen.reference(raw, item.column_name, mapping);
            state.legacy.values_checked++;
            if (parsed.kind === 'local') {
              if (!state.legacyRefs.has(parsed.member)) state.referenceBytes += Buffer.byteLength(parsed.member);
              need(state.legacyRefs.size < LIMITS.members && state.referenceBytes <= LIMITS.referenceBytes, 'REFERENCE_MEMORY_LIMIT');
              state.legacyRefs.set(parsed.member, (state.legacyRefs.get(parsed.member) || 0) + 1);
            } else increment(state.legacy, parsed.kind);
          }
        }
        let refs = [{ value: row.value, key: item.column_name }];
        if (structured) {
          try { const result = jsonValues(JSON.parse(row.value), item); refs = result.refs;
            source.metadata_only_attachments += result.metadata; state.metadataOnly += result.metadata; }
          catch { source.unsupported_json++; continue; }
        }
        for (const ref of refs) {
          guard(started);
          const old = legacy && legacyType ? frozen.reference(ref.value, item.column_name, mapping) : null;
          let parsed;
          if (/^data:/i.test(ref.value) && embeddedAllowed(item, ref.key)) {
            try {
              const embedded = embeddedData(ref.value);
              try {
                const actual = mediaSignature(embedded.bytes);
                const opened = actual === embedded.mime ? await parseMedia(embedded.bytes, actual, pdf) : { result: 'declared_mime_mismatch', raster_decoded: false };
                parsed = { kind: ['pdf_parsed', 'png_decoded'].includes(opened.result) ? 'embedded_original_validated' :
                  opened.result === 'jpeg_header_opened' ? 'embedded_original_header_only' : 'embedded_original_unproven' };
                state.embeddedSamples.push({ source: source.id, reference_sha256: hash(ref.value), bytes: embedded.bytes.length,
                  declared_mime: embedded.mime, detected_mime: actual, ...opened, original_retention: 'database_dump' });
                need(state.embeddedSamples.length <= LIMITS.members, 'SAMPLE_COUNT_LIMIT');
              } finally { embedded.bytes.fill(0); }
            } catch { parsed = { kind: 'embedded_original_invalid_or_oversized' }; }
          } else parsed = normalizedReference(ref.value, item, mapping, frozen);
          if (old && (old.kind !== parsed.kind || old.member !== parsed.member)) state.normalizationChanges++;
          note(ref.value, parsed, item, source, old);
        }
      }
    } } finally { await client.query('CLOSE document_refs'); }
  }
  return state;
}
async function archiveDiagnostics(filename, manifest, state, modules, frozen, started) {
  // First run the frozen archive/member/hash validation with exactly its legacy
  // references and selection order. Its result remains distinct and unchanged.
  const legacy = await frozen.inspectArchive(filename, manifest, state.legacyRefs, modules);
  const expected = manifest.uploads.file_sha256;
  const selected = new Set(); const typeCounts = {};
  for (const name of [...state.legacyRefs.keys()].sort()) {
    const mime = extensionMime(name);
    if (!Object.hasOwn(expected, name) || !mime || (typeCounts[mime] || 0) >= 3 || selected.size >= 9) continue;
    selected.add(name); increment(typeCounts, mime);
  }
  const archiveRecord = manifest.files.find((entry) => entry.name === 'uploads.tar.gz');
  need(archiveRecord && HASH.test(archiveRecord.sha256) && archiveRecord.bytes <= LIMITS.archive, 'ARCHIVE_RECORD_INVALID');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const info = fs.fstatSync(fd);
  need(info.isFile() && info.nlink === 1 && info.size === archiveRecord.bytes, 'ARCHIVE_INVALID');
  const identity = snapshot(info); const digest = crypto.createHash('sha256');
  const seen = new Set(); const samples = [];
  let compressed = 0, expanded = 0, inflated = 0;
  const meter = new Transform({ transform(chunk, encoding, done) {
    try { guard(started); compressed += chunk.length; need(compressed <= LIMITS.archive, 'ARCHIVE_LIMIT'); digest.update(chunk); done(null, chunk); }
    catch (error) { done(error); }
  } });
  const expansion = new Transform({ transform(chunk, encoding, done) {
    inflated += chunk.length;
    if (inflated > LIMITS.archive + LIMITS.members * 1024 + 1024 * 1024) return done(new Refused('ARCHIVE_EXPANSION_LIMIT'));
    done(null, chunk);
  } });
  const extract = modules.tar.extract();
  extract.on('entry', (header, stream, next) => {
    void (async () => {
      guard(started);
      need(['file', 'directory'].includes(header.type), 'ARCHIVE_TYPE_INVALID');
      if (header.type === 'directory') {
        need(header.size === 0, 'ARCHIVE_DIRECTORY_INVALID');
        if (!['.', './'].includes(header.name)) frozen.normalizedMember(header.name);
        for await (const chunk of stream) need(chunk.length === 0, 'ARCHIVE_DIRECTORY_INVALID');
        next(); return;
      }
      const name = frozen.normalizedMember(header.name);
      need(Object.hasOwn(expected, name) && !seen.has(name) && seen.size < LIMITS.members &&
        Number.isSafeInteger(header.size) && header.size >= 0, 'ARCHIVE_MEMBER_INVALID');
      seen.add(name);
      const hashState = crypto.createHash('sha256'); let length = 0; const chunks = [];
      const mime = extensionMime(name); const capture = Boolean(mime) && header.size <= LIMITS.sample;
      for await (const chunk of stream) {
        guard(started); length += chunk.length; expanded += chunk.length;
        need(length <= header.size && expanded <= LIMITS.archive, 'ARCHIVE_EXPANSION_LIMIT');
        hashState.update(chunk); if (capture) chunks.push(chunk);
      }
      need(length === header.size && hashState.digest('hex') === expected[name], 'ARCHIVE_MEMBER_HASH_FAILED');
      if (mime) {
        if (!capture) samples.push({ member: name, bytes: length, legacy_selected: selected.has(name), result: 'byte_budget_exceeded', raster_decoded: false });
        else {
          const bytes = Buffer.concat(chunks);
          try {
            let oldResult;
            if (selected.has(name)) { try { oldResult = await frozen.readableOriginal(bytes, path.posix.extname(name).toLowerCase(), modules.pdf); }
              catch { oldResult = 'parser_rejected'; } }
            const actual = mediaSignature(bytes);
            const parsed = await parseMedia(bytes, actual, modules.pdf);
            samples.push({ member: name, bytes: length, legacy_selected: selected.has(name),
              ...(oldResult ? { repeated_legacy_parser_result: oldResult } : {}), extension_mime: mime,
              detected_mime: actual, extension_mismatch: actual !== mime, ...parsed });
          } finally { bytes.fill(0); }
        }
      }
      next();
    })().catch(() => { extract.destroy(new Refused('ARCHIVE_DIAGNOSTIC_FAILED')); stream.destroy(); });
  });
  try {
    await pipeline(fs.createReadStream(filename, { fd, autoClose: false }), meter, zlib.createGunzip(), expansion, extract);
    need(snapshot(fs.fstatSync(fd)) === identity && compressed === archiveRecord.bytes &&
      digest.digest('hex') === archiveRecord.sha256 && seen.size === Object.keys(expected).length, 'ARCHIVE_CHANGED_OR_INCOMPLETE');
  } finally { try { fs.closeSync(fd); } catch (error) { if (error.code !== 'EBADF') throw error; } }
  return { legacy, samples, filesHashed: seen.size };
}
function assemble(state, archive, manifest, seeds) {
  const expected = new Set(Object.keys(manifest.uploads.file_sha256));
  let legacyMatched = 0, legacyMissing = 0, legacyMissingDistinct = 0;
  for (const [member, count] of state.legacyRefs) {
    if (expected.has(member)) legacyMatched += count;
    else { legacyMissing += count; legacyMissingDistinct++; }
  }
  const local = new Map();
  for (const entry of state.references.values()) if (entry.kind === 'local') local.set(entry.member, (local.get(entry.member) || 0) + entry.occurrences);
  let missingOccurrences = 0, missingDistinct = 0;
  for (const [member, count] of local) if (!expected.has(member)) { missingOccurrences += count; missingDistinct++; }
  const media = {};
  for (const item of archive.samples) increment(media, item.result);
  const diagnostics = { legacy: { ...state.legacy, ...archive.legacy,
    distinct_local_references: state.legacyRefs.size, matched_local_references: legacyMatched,
    missing_unattributed: legacyMissing, missing_distinct: legacyMissingDistinct },
    reconciliation: { sources_checked: state.sources.length, distinct_source_reference_pairs: state.references.size,
      categories: state.categories, distinct_local_references: local.size,
      missing_local_occurrences: missingOccurrences, missing_local_distinct: missingDistinct,
      normalization_changes: state.normalizationChanges, exact_seed_literal_occurrences: state.seedMatches,
      metadata_only_attachments: state.metadataOnly,
      unsupported_json_rows: state.sources.reduce((total, source) => total + source.unsupported_json, 0),
      populated_unclassified_columns: state.sources.filter((source) => source.coverage === 'unclassified_column' && source.populated_values > 0).length,
      empty_unclassified_columns: state.sources.filter((source) => source.coverage === 'unclassified_column' && source.populated_values === 0).length,
      oversized_values: state.sources.reduce((total, source) => total + source.oversized, 0),
      embedded_originals_checked: state.embeddedSamples.length, media_outcomes: media,
      extension_mismatches: archive.samples.filter((sample) => sample.extension_mismatch).length,
      diagnostic_raw_references_omitted: state.detailsOmitted },
    scope: 'Read-only reconciliation; generated route regeneration and full JPEG raster decoding remain unproven' };
  const reconciliation = diagnostics.reconciliation;
  const summary = {
    files_hashed: archive.filesHashed, legacy_missing_occurrences: legacyMissing,
    legacy_missing_distinct: legacyMissingDistinct,
    legacy_outside_coverage: state.legacy.outside_coverage,
    legacy_external_http: state.legacy.external_http,
    legacy_unsupported_json: state.legacy.unsupported_json,
    legacy_uncovered_columns: state.legacy.possible_uncovered_columns,
    sources_checked: state.sources.length, reference_pairs: state.references.size,
    local_distinct: local.size, missing_local_occurrences: missingOccurrences,
    missing_local_distinct: missingDistinct, normalization_changes: state.normalizationChanges,
    seed_literal_occurrences: state.seedMatches, metadata_only_attachments: state.metadataOnly,
    unsupported_json_rows: reconciliation.unsupported_json_rows,
    populated_unclassified_columns: reconciliation.populated_unclassified_columns,
    empty_unclassified_columns: reconciliation.empty_unclassified_columns,
    oversized_values: reconciliation.oversized_values,
    embedded_originals_checked: state.embeddedSamples.length,
    embedded_originals_validated: state.embeddedSamples.filter((sample) => ['pdf_parsed', 'png_decoded'].includes(sample.result)).length,
    pdf_parsed: media.pdf_parsed || 0, png_decoded: media.png_decoded || 0,
    jpeg_headers_opened: media.jpeg_header_opened || 0,
    parser_rejected: media.parser_rejected || 0,
    encrypted_pdf_password_required: media.encrypted_pdf_password_required || 0,
    media_budget_exceeded: (media.byte_budget_exceeded || 0) + (media.pixel_budget_exceeded || 0),
    extension_mismatches: reconciliation.extension_mismatches,
    raw_references_omitted: state.detailsOmitted,
    production_mutations: false, external_requests: false, hr_values_selected: false,
    documents_fully_recovered: false,
  };
  return { schema_version: 1, execution_complete: true, summary,
    source_binding: { run_id: manifest.run_id, uploads_archive_sha256: manifest.files.find((file) => file.name === 'uploads.tar.gz').sha256 },
    references: [...state.references.values()], sources: state.sources,
    samples: archive.samples, embedded_samples: state.embeddedSamples, diagnostics };
}
async function runCheck(inputs, modules) {
  const started = Date.now();
  const frozen = modules.frozen;
  const manifest = inputJson(inputs.manifest), mapping = frozen.mappingConfig(inputJson(inputs.mapping));
  const binding = inputJson(inputs.binding);
  need(binding.schema_version === 1 && binding.source_database === 'postgres' && HASH.test(binding.dump_sha256) &&
    Array.isArray(manifest.database_names) && manifest.database_names.includes('postgres') &&
    /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}$/.test(manifest.run_id) &&
    manifest.files.some((entry) => entry.name === 'database-postgres.dump' && entry.sha256 === binding.dump_sha256), 'SOURCE_DUMP_BINDING_INVALID');
  const seeds = seedCatalog(inputJson(inputs.seeds));
  need(manifest && manifest.uploads && manifest.uploads.file_sha256 && Array.isArray(manifest.files) &&
    Object.entries(manifest.uploads.file_sha256).every(([name, digest]) => frozen.normalizedMember(name) === name && HASH.test(digest)), 'MANIFEST_INVALID');
  need(Object.keys(manifest.uploads.file_sha256).length <= LIMITS.members, 'MANIFEST_LIMIT');
  const expected = new Set(Object.keys(manifest.uploads.file_sha256));
  const client = new modules.pg.Client({ host: '/restore-socket', port: 55432, user: 'restorecheck',
    database: 'restorecheck', password: null, ssl: false, connectionTimeoutMillis: 5000,
    query_timeout: 30000, application_name: 'falcon-isolated-document-reconciliation',
    options: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000' });
  let state;
  // Third-party parsers can log source bytes. Keep every diagnostic controlled.
  const savedConsole = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try { state = await collect(client, frozen, mapping, seeds, expected, modules.pdf, started); }
    finally { await client.query('ROLLBACK'); }
    const archive = await archiveDiagnostics(inputs.archive, manifest, state, modules, frozen, started);
    const report = assemble(state, archive, manifest, seeds);
    report.source_binding.dump_sha256 = binding.dump_sha256;
    guard(started);
    need(Buffer.byteLength(JSON.stringify(report)) <= LIMITS.reportBytes, 'PRIVATE_REPORT_LIMIT');
    return report;
  } finally { Object.assign(console, savedConsole); await client.end().catch(() => {}); }
}
async function main() {
  for (const key of Object.keys(process.env)) if (key.startsWith('PG') || key === 'DATABASE_URL' || key === 'NODE_OPTIONS') delete process.env[key];
  try {
    need(process.argv.length === 2, 'ARGUMENTS_INVALID');
    const report = await runCheck(FIXED, { frozen: require('/checks/recovery_content_check.js'),
      pg: require('/app/node_modules/pg'), pdf: require('/app/node_modules/pdf-lib'), tar: require('/app/node_modules/tar-stream') });
    process.stdout.write(JSON.stringify(report) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ schema_version: 1, execution_complete: false, error_code: 'DOCUMENT_RECONCILIATION_FAILED' }) + '\n');
    process.exitCode = 1;
  }
}
if (require.main === module) void main();
module.exports = { LIMITS, FIXED, Refused, hash, inputJson, seedCatalog, isLegacy, supported,
  generatedRoute, embeddedAllowed, embeddedData, jsonValues, normalizedReference,
  mediaSignature, parseMedia, collect, archiveDiagnostics, assemble, runCheck };
