'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const subject = require('../document-media-proof.cjs');
const pdf = require('../../../backend/node_modules/pdf-lib');
const RUN = '20261021T150000Z-' + 'c'.repeat(32);
const ARCHIVE = subject.hash('synthetic verified source archive');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=', 'base64');

function manifestFor(entries) {
  return { run_id: RUN, files: [{ name: 'uploads.tar.gz', sha256: ARCHIVE, bytes: 123 }],
    uploads: { file_sha256: Object.fromEntries(entries.map((item) => [item.member, subject.hash(item.bytes)])) } };
}
function targetsFor(entries) {
  return { schema_version: 1, run_id: RUN, archive_sha256: ARCHIVE,
    targets: entries.map((item, index) => ({ index, member: item.member,
      sha256: subject.hash(item.bytes), bytes: item.bytes.length })) };
}
function fixture(t, entries = [{ member: 'tenant/private-synthetic.png', bytes: PNG }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-media-synthetic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputs = { manifest: path.join(root, 'manifest.json'), targets: path.join(root, 'targets.json'), files: path.join(root, 'files') };
  fs.mkdirSync(inputs.files, { mode: 0o700 });
  const manifest = manifestFor(entries), targets = targetsFor(entries);
  fs.writeFileSync(inputs.manifest, JSON.stringify(manifest)); fs.writeFileSync(inputs.targets, JSON.stringify(targets));
  entries.forEach((entry, index) => fs.writeFileSync(path.join(inputs.files, String(index)), entry.bytes));
  return { root, inputs, entries, manifest, targets };
}
function sharpFake(options = {}) {
  const state = { calls: [], rawCalls: 0, destroyCalls: 0, output: null };
  function sharp(bytes, settings) {
    state.calls.push({ bytes: Buffer.from(bytes), settings });
    const instance = {
      async metadata() {
        if (options.metadataError) throw options.metadataError;
        return { width: 1, height: 1, channels: 4, format: 'png', ...options.metadata };
      },
      raw(settings) {
        state.rawCalls++; state.rawSettings = settings;
        return { async toBuffer(settings) {
          state.bufferSettings = settings;
          if (options.decodeError) throw options.decodeError;
          const data = options.data || Buffer.from([1, 2, 3, 4]);
          state.output = data;
          return { data, info: { width: 1, height: 1, channels: 4, ...options.info } };
        } };
      },
      destroy() { state.destroyCalls++; },
    };
    return instance;
  }
  sharp.cache = (value) => { state.cache = value; };
  sharp.concurrency = (value) => { state.concurrency = value; };
  sharp.state = state;
  return sharp;
}

test('target lists bind exact run, archive and manifest member hashes', () => {
  const entries = [{ member: 'tenant/private.png', bytes: PNG }];
  const manifest = manifestFor(entries), targets = targetsFor(entries);
  assert.equal(subject.validateTargets(manifest, targets), targets);
  for (const mutation of [
    (value) => { value.run_id = 'different'; },
    (value) => { value.archive_sha256 = 'a'.repeat(64); },
    (value) => { value.targets[0].sha256 = 'a'.repeat(64); },
    (value) => { value.targets[0].member = 'tenant/not-in-manifest.png'; },
    (value) => { value.targets[0].index = 1; },
    (value) => { value.targets[0].bytes = subject.LIMITS.bytes + 1; },
    (value) => { value.targets[0].bytes = 0; },
    (value) => { value.targets[0].path = '/private/unapproved'; },
    (value) => { value.unapproved = true; },
    (value) => { value.targets = []; },
  ]) {
    const changed = structuredClone(targets); mutation(changed);
    assert.throws(() => subject.validateTargets(manifest, changed));
  }
  const duplicate = structuredClone(targets); duplicate.targets.push({ ...duplicate.targets[0], index: 1 });
  assert.throws(() => subject.validateTargets(manifest, duplicate), /TARGET_INVALID/);
});

test('unsafe members never become paths and only contiguous integer files are opened', async (t) => {
  for (const value of ['../private', '/private', 'tenant//file', 'tenant/./file', 'tenant\\file', 'tenant/..', 'tenant/\0file'])
    assert.throws(() => subject.canonicalMember(value), /MEMBER_INVALID/);
  const f = fixture(t); const sharp = sharpFake();
  const result = await subject.runProof('raster', f.inputs, sharp);
  assert.equal(result.results[0].index, 0);
  assert.equal(result.results[0].member, 'tenant/private-synthetic.png');
  await assert.rejects(subject.proveFile('raster', { ...f.targets.targets[0], index: '../private' }, f.inputs.files, sharp, Date.now()), /TARGET_INDEX_INVALID/);
});

test('input symlinks and hardlinks are refused without opening outside content', async (t) => {
  for (const style of ['symlink', 'hardlink']) {
    const f = fixture(t); const indexed = path.join(f.inputs.files, '0');
    const saved = path.join(f.root, 'private-target'); fs.renameSync(indexed, saved);
    if (style === 'symlink') fs.symlinkSync(saved, indexed); else fs.linkSync(saved, indexed);
    await assert.rejects(subject.runProof('raster', f.inputs, sharpFake()));
  }
  const f = fixture(t); const saved = path.join(f.root, 'metadata'); fs.renameSync(f.inputs.targets, saved); fs.symlinkSync(saved, f.inputs.targets);
  assert.throws(() => subject.readJson(f.inputs.targets));
});

test('file size, file hash and metadata bounds are enforced before a decoder runs', async (t) => {
  for (const changed of [Buffer.from('short'), Buffer.alloc(PNG.length, 0x35)]) {
    const f = fixture(t); const sharp = sharpFake(); fs.writeFileSync(path.join(f.inputs.files, '0'), changed);
    await assert.rejects(subject.runProof('raster', f.inputs, sharp), /TARGET_(?:SIZE|HASH_OR_IDENTITY)_FAILED/);
    assert.equal(sharp.state.calls.length, 0);
  }
  const f = fixture(t); fs.writeFileSync(f.inputs.targets, Buffer.alloc(subject.LIMITS.metadata + 1));
  assert.throws(() => subject.readJson(f.inputs.targets), /INPUT_FILE_INVALID/);
});

test('raw raster output is required, shaped, bounded and erased; metadata alone is never proof', async (t) => {
  const f = fixture(t); const sharp = sharpFake();
  const result = await subject.runProof('raster', f.inputs, sharp);
  assert.equal(result.summary.raster_decoded, 1); assert.equal(sharp.state.rawCalls, 1);
  assert.deepEqual(sharp.state.rawSettings, { depth: 'uchar' });
  assert.deepEqual(sharp.state.bufferSettings, { resolveWithObject: true });
  assert.deepEqual(sharp.state.output, Buffer.alloc(4));
  assert.equal(sharp.state.cache, false); assert.equal(sharp.state.concurrency, 1);
  assert.deepEqual(sharp.state.calls[0].settings, { failOn: 'error', sequentialRead: true,
    limitInputPixels: subject.LIMITS.pixels, pages: 1, page: 0, animated: false });
  assert.equal(sharp.state.destroyCalls, 1);
  const rejected = sharpFake({ decodeError: new Error('private raster diagnostics') });
  const noProof = await subject.runProof('raster', f.inputs, rejected);
  assert.equal(noProof.summary.raster_decoded, 0);
  assert.equal(noProof.summary.raster_decoder_rejected, 1);
  assert.equal(JSON.stringify(noProof).includes('private raster diagnostics'), false);
});

test('pixel/channel/frame bounds stop before raw allocation and unsupported formats never enter Sharp', async () => {
  for (const [metadata, expected] of [
    [{ width: 100000, height: 100000 }, 'pixel_budget_exceeded'],
    [{ channels: 5 }, 'pixel_budget_exceeded'],
    [{ pages: 2 }, 'multiple_frames_unproven'],
    [{ format: 'svg' }, 'format_mismatch'],
  ]) {
    const sharp = sharpFake({ metadata });
    const result = await subject.rasterProof(PNG, sharp);
    assert.equal(result.result, expected); assert.equal(sharp.state.rawCalls, 0);
    assert.equal(result.raster_decoded, false);
  }
  const sharp = sharpFake();
  const result = await subject.rasterProof(Buffer.from('<svg private="untrusted"/>'), sharp);
  assert.equal(result.result, 'unsupported_media_format'); assert.equal(sharp.state.calls.length, 0);
});

test('decoder output mismatch is unproven and any returned pixel buffer is erased', async () => {
  const sharp = sharpFake({ data: Buffer.from([1, 2, 3]) });
  const result = await subject.rasterProof(PNG, sharp);
  assert.equal(result.result, 'raster_decoder_rejected');
  assert.deepEqual(sharp.state.output, Buffer.alloc(3));
});

test('JPEG header-only input stays unproven when full raster decoding rejects it', async () => {
  const header = Buffer.from([255,216,255,192,0,17,8,0,1,0,1,3,1,17,0,2,17,0,3,17,0]);
  const sharp = sharpFake({ metadata: { format: 'jpeg' }, decodeError: new Error('truncated image') });
  const result = await subject.rasterProof(header, sharp);
  assert.equal(result.result, 'raster_decoder_rejected');
  assert.equal(sharp.state.rawCalls, 1); assert.equal(result.raster_decoded, false);
});

test('real bounded PDFs parse with encryption checks enabled and never claim raster rendering', async (t) => {
  const document = await pdf.PDFDocument.create(); document.addPage([12, 12]);
  const bytes = Buffer.from(await document.save());
  const f = fixture(t, [{ member: 'tenant/private.pdf', bytes }]);
  const before = fs.readFileSync(path.join(f.inputs.files, '0'));
  const result = await subject.runProof('pdf', f.inputs, pdf);
  assert.equal(result.summary.pdf_parsed, 1); assert.equal(result.results[0].pages, 1);
  assert.equal(result.results[0].raster_decoded, false);
  assert.deepEqual(fs.readFileSync(path.join(f.inputs.files, '0')), before);
  let options;
  const stub = { PDFDocument: { async load(input, settings) {
    assert.equal(input.byteOffset, 0); options = settings; return { getPageCount() { return 1; } };
  } } };
  assert.equal((await subject.pdfProof(bytes, stub)).result, 'pdf_parsed');
  assert.deepEqual(options, { ignoreEncryption: false, throwOnInvalidObject: true });
});

test('eight MiB input bound supports the larger known PDF without raising global metadata bounds', async (t) => {
  const bytes = Buffer.alloc(7069597, 0x35); bytes.write('%PDF-');
  const f = fixture(t, [{ member: 'tenant/large.pdf', bytes }]);
  const dependency = { PDFDocument: { async load(input) {
    assert.equal(input.byteLength, bytes.length); return { getPageCount() { return 1; } };
  } } };
  const result = await subject.runProof('pdf', f.inputs, dependency);
  assert.equal(result.summary.source_files_verified, 1); assert.equal(result.summary.pdf_parsed, 1);
});

test('encrypted PDFs use the exact trusted library error signature and stay unproven', async () => {
  const error = new pdf.EncryptedPDFError();
  assert.equal(error.name, 'Error'); assert.equal(error.constructor.name, 'Error');
  const library = { EncryptedPDFError: pdf.EncryptedPDFError, PDFDocument: { async load() { throw error; } } };
  const result = await subject.pdfProof(Buffer.from('%PDF-synthetic'), library);
  assert.deepEqual(result, { result: 'encrypted_pdf_password_required', raster_decoded: false });
  for (const untrusted of [new Error(error.message + ' private suffix'), Object.assign(new Error('private'), { name: 'EncryptedPDFError' })]) {
    const rejected = await subject.pdfProof(Buffer.from('%PDF-synthetic'), { ...library, PDFDocument: { async load() { throw untrusted; } } });
    assert.deepEqual(rejected, { result: 'parser_rejected', raster_decoded: false });
  }
});

test('changed input during parsing invalidates the proof and deadline aborts only helper work', async (t) => {
  const f = fixture(t, [{ member: 'tenant/private.pdf', bytes: Buffer.from('%PDF-synthetic') }]);
  const library = { PDFDocument: { async load() {
    fs.appendFileSync(path.join(f.inputs.files, '0'), 'changed'); return { getPageCount() { return 1; } };
  } } };
  await assert.rejects(subject.runProof('pdf', f.inputs, library), /TARGET_CHANGED_DURING_PARSE/);
  await assert.rejects(subject.proveFile('pdf', f.targets.targets[0], f.inputs.files, library,
    Date.now() - subject.LIMITS.deadlineMs - 1), /DEADLINE_EXCEEDED/);
});

test('mode dependency selection and aggregate output contain no raw document bytes or parser errors', async (t) => {
  const f = fixture(t);
  const sharp = sharpFake();
  const originalFetch = global.fetch; global.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); };
  t.after(() => { global.fetch = originalFetch; });
  const before = new Map(fs.readdirSync(f.root).filter((name) => name !== 'files').map((name) =>
    [name, fs.readFileSync(path.join(f.root, name))]));
  const result = await subject.runProof('raster', f.inputs, sharp);
  assert.equal(result.schema_version, 1); assert.equal(result.execution_complete, true);
  assert.equal(JSON.stringify(result.summary).includes('private-synthetic'), false);
  assert.equal(JSON.stringify(result).includes(PNG.toString('base64')), false);
  for (const value of Object.values(result.summary)) assert.ok(value === false || Number.isSafeInteger(value) && value >= 0);
  assert.equal(result.summary.source_archive_rehashed_by_helper, false);
  assert.equal(result.summary.database_access, false);
  assert.equal(Buffer.byteLength(JSON.stringify(result)) <= subject.LIMITS.report, true);
  assert.deepEqual(Object.keys(subject.FIXED).sort(), ['files', 'manifest', 'targets']);
  for (const [name, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  await assert.rejects(subject.runProof('unapproved', f.inputs, sharp), /MODE_INVALID/);
  await assert.rejects(subject.runProof('pdf', f.inputs, {}), /PDF_LIBRARY_UNAVAILABLE/);
});

test('optional real Sharp fully decodes synthetic PNG without exposing pixels', { skip: !process.env.FALCON_SHARP_MODULE }, async () => {
  const sharp = require(process.env.FALCON_SHARP_MODULE);
  sharp.cache(false); sharp.concurrency(1);
  const result = await subject.rasterProof(PNG, sharp);
  assert.equal(result.result, 'raster_decoded'); assert.equal(result.raster_decoded, true);
  assert.equal(result.width, 1); assert.equal(result.height, 1);
});
