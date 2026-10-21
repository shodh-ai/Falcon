#!/usr/bin/env node
'use strict';
// Follow-up proof on indexed copies extracted by the host from a frozen-core
// validated archive. Files are individually bound read-only; the helper receives
// no archive, production path, database socket, network, key or writable mount.
// stdout is PRIVATE and must be captured only in a root-owned on-server file.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const LIMITS = Object.freeze({ metadata: 2 * 1024 * 1024, bytes: 8 * 1024 * 1024,
  archive: 128 * 1024 * 1024, members: 10000, targets: 256,
  pixels: 16 * 1024 * 1024, rawBytes: 64 * 1024 * 1024,
  report: 2 * 1024 * 1024, deadlineMs: 240000 });
const FIXED = Object.freeze({ manifest: '/inputs/manifest.json', targets: '/inputs/targets.json',
  files: '/inputs/files' });
const HASH = /^[0-9a-f]{64}$/;
const RUN = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}$/;
class Refused extends Error { constructor(code) { super(code); this.code = code; } }
function need(condition, code) { if (!condition) throw new Refused(code); }
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function guard(started) { need(Date.now() - started <= LIMITS.deadlineMs, 'DEADLINE_EXCEEDED'); }
function identity(info) { return [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs, info.nlink].join(':'); }
function ordinary(info, maximum) {
  need(info.isFile() && info.nlink === 1 && Number.isSafeInteger(info.size) && info.size >= 0 &&
    info.size <= maximum, 'INPUT_FILE_INVALID');
}
function boundedRead(fd, size) {
  const buffer = Buffer.alloc(size + 1);
  let used = 0;
  while (used < buffer.length) {
    const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
    if (!count) break;
    used += count;
  }
  if (used !== size) { buffer.fill(0); throw new Refused('INPUT_SIZE_CHANGED'); }
  return buffer.subarray(0, used);
}
function readJson(filename) {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd); ordinary(before, LIMITS.metadata);
    const bytes = boundedRead(fd, before.size);
    need(bytes.length === before.size && identity(fs.fstatSync(fd)) === identity(before), 'INPUT_CHANGED');
    const value = JSON.parse(bytes.toString('utf8'));
    need(value && typeof value === 'object' && !Array.isArray(value), 'INPUT_JSON_INVALID');
    return value;
  } finally { fs.closeSync(fd); }
}
function canonicalMember(value) {
  need(typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 4096 &&
    !/[\\\0-\x1f\x7f-\x9f]/.test(value) && !value.startsWith('/') &&
    !value.split('/').some((part) => ['', '.', '..'].includes(part)), 'MEMBER_INVALID');
  return value;
}
function validateTargets(manifest, value) {
  need(manifest && manifest.uploads && manifest.uploads.file_sha256 &&
    typeof manifest.uploads.file_sha256 === 'object' && !Array.isArray(manifest.uploads.file_sha256) &&
    Array.isArray(manifest.files) && RUN.test(manifest.run_id), 'MANIFEST_INVALID');
  const members = Object.entries(manifest.uploads.file_sha256);
  need(members.length <= LIMITS.members && members.every(([member, checksum]) =>
    canonicalMember(member) === member && typeof checksum === 'string' && HASH.test(checksum)), 'MANIFEST_INVENTORY_INVALID');
  const archives = manifest.files.filter((file) => file && file.name === 'uploads.tar.gz');
  need(archives.length === 1 && HASH.test(archives[0].sha256) && Number.isSafeInteger(archives[0].bytes) &&
    archives[0].bytes > 0 && archives[0].bytes <= LIMITS.archive, 'MANIFEST_ARCHIVE_INVALID');
  need(value && value.schema_version === 1 && value.run_id === manifest.run_id &&
    value.archive_sha256 === archives[0].sha256 && Array.isArray(value.targets) &&
    value.targets.length > 0 && value.targets.length <= LIMITS.targets &&
    Object.keys(value).every((key) => ['schema_version', 'run_id', 'archive_sha256', 'targets'].includes(key)), 'TARGET_BINDING_INVALID');
  const seen = new Set();
  for (let index = 0; index < value.targets.length; index++) {
    const target = value.targets[index];
    need(target && typeof target === 'object' && !Array.isArray(target) &&
      Object.keys(target).length === 4 && ['index', 'member', 'sha256', 'bytes'].every((key) => Object.hasOwn(target, key)) &&
      target.index === index && canonicalMember(target.member) === target.member && !seen.has(target.member) &&
      HASH.test(target.sha256) && Object.hasOwn(manifest.uploads.file_sha256, target.member) &&
      target.sha256 === manifest.uploads.file_sha256[target.member] && Number.isSafeInteger(target.bytes) &&
      target.bytes > 0 && target.bytes <= LIMITS.bytes, 'TARGET_INVALID');
    seen.add(target.member);
  }
  return value;
}
function signature(bytes) {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 216) return 'image/jpeg';
  return 'unsupported';
}
function encryptedPdf(error, library) {
  if (!error || typeof library.EncryptedPDFError !== 'function') return false;
  try {
    const trusted = new library.EncryptedPDFError();
    return (error instanceof library.EncryptedPDFError &&
      (error.name === 'EncryptedPDFError' || error.constructor?.name === 'EncryptedPDFError')) ||
      (typeof trusted.message === 'string' && trusted.message.length > 0 &&
        typeof error.message === 'string' && error.message === trusted.message);
  } catch { return false; }
}
async function pdfProof(bytes, library) {
  if (signature(bytes) !== 'application/pdf') return { result: 'format_mismatch', raster_decoded: false };
  try {
    const document = await library.PDFDocument.load(Uint8Array.from(bytes), {
      ignoreEncryption: false, throwOnInvalidObject: true,
    });
    const pages = document.getPageCount();
    need(Number.isSafeInteger(pages) && pages > 0 && pages <= LIMITS.members, 'PDF_PAGE_LIMIT');
    return { result: 'pdf_parsed', pages, raster_decoded: false };
  } catch (error) {
    return { result: encryptedPdf(error, library) ? 'encrypted_pdf_password_required' : 'parser_rejected', raster_decoded: false };
  }
}
function boundedDimension(value) { return Number.isSafeInteger(value) && value > 0; }
async function rasterProof(bytes, sharp) {
  const mime = signature(bytes);
  if (!['image/png', 'image/jpeg'].includes(mime)) return { result: 'unsupported_media_format', raster_decoded: false };
  let pipeline;
  let decoded;
  try {
    pipeline = sharp(bytes, { failOn: 'error', sequentialRead: true,
      limitInputPixels: LIMITS.pixels, pages: 1, page: 0, animated: false });
    const metadata = await pipeline.metadata();
    if (!['png', 'jpeg'].includes(metadata.format) ||
        (metadata.format === 'png' ? 'image/png' : 'image/jpeg') !== mime)
      return { result: 'format_mismatch', raster_decoded: false };
    if (metadata.pages !== undefined && metadata.pages !== 1)
      return { result: 'multiple_frames_unproven', raster_decoded: false };
    if (!boundedDimension(metadata.width) || !boundedDimension(metadata.height) ||
        metadata.width * metadata.height > LIMITS.pixels ||
        !Number.isSafeInteger(metadata.channels) || metadata.channels < 1 || metadata.channels > 4 ||
        metadata.width * metadata.height * metadata.channels > LIMITS.rawBytes)
      return { result: 'pixel_budget_exceeded', raster_decoded: false };
    // Header/metadata acceptance is insufficient. Force full pixels out of the
    // decoder, bound their shape, then erase the pixel buffer before returning.
    decoded = await pipeline.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
    const info = decoded?.info;
    need(Buffer.isBuffer(decoded?.data) && info && info.width === metadata.width && info.height === metadata.height &&
      Number.isSafeInteger(info.channels) && info.channels >= 1 && info.channels <= 4 &&
      decoded.data.length > 0 && decoded.data.length <= LIMITS.rawBytes &&
      decoded.data.length === info.width * info.height * info.channels, 'RASTER_OUTPUT_INVALID');
    return { result: 'raster_decoded', raster_decoded: true, width: info.width, height: info.height,
      channels: info.channels, decoded_bytes: decoded.data.length, detected_mime: mime };
  } catch { return { result: 'raster_decoder_rejected', raster_decoded: false }; }
  finally {
    if (Buffer.isBuffer(decoded?.data)) decoded.data.fill(0);
    if (pipeline && typeof pipeline.destroy === 'function') {
      try { pipeline.destroy(); } catch { /* No source-derived diagnostic. */ }
    }
  }
}
async function proveFile(mode, target, filesRoot, dependency, started) {
  guard(started);
  // Target.member is report metadata, never a filesystem path opened by this
  // process. Only the reviewed contiguous integer index selects an input file.
  need(Number.isSafeInteger(target.index) && target.index >= 0 && target.index < LIMITS.targets, 'TARGET_INDEX_INVALID');
  const filename = path.join(filesRoot, String(target.index));
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let bytes;
  try {
    const before = fs.fstatSync(fd); ordinary(before, LIMITS.bytes);
    need(before.size === target.bytes, 'TARGET_SIZE_FAILED');
    bytes = boundedRead(fd, before.size);
    need(bytes.length === target.bytes && hash(bytes) === target.sha256 &&
      identity(fs.fstatSync(fd)) === identity(before), 'TARGET_HASH_OR_IDENTITY_FAILED');
    const proof = mode === 'pdf' ? await pdfProof(bytes, dependency) : await rasterProof(bytes, dependency);
    guard(started);
    need(identity(fs.fstatSync(fd)) === identity(before), 'TARGET_CHANGED_DURING_PARSE');
    return { index: target.index, member: target.member, bytes: target.bytes,
      sha256: target.sha256, source_bytes_verified: true, ...proof };
  } finally { if (bytes) bytes.fill(0); fs.closeSync(fd); }
}
async function runProof(mode, inputs, dependency) {
  need(['pdf', 'raster'].includes(mode), 'MODE_INVALID');
  const started = Date.now();
  const manifest = readJson(inputs.manifest);
  const targets = validateTargets(manifest, readJson(inputs.targets));
  if (mode === 'raster') {
    need(typeof dependency === 'function' && typeof dependency.cache === 'function' &&
      typeof dependency.concurrency === 'function', 'DECODER_UNAVAILABLE');
    dependency.cache(false); dependency.concurrency(1);
  } else need(dependency && typeof dependency.PDFDocument?.load === 'function', 'PDF_LIBRARY_UNAVAILABLE');
  const results = [];
  for (const target of targets.targets) results.push(await proveFile(mode, target, inputs.files, dependency, started));
  const count = (result) => results.filter((item) => item.result === result).length;
  const summary = { targets_checked: results.length,
    source_files_verified: results.filter((item) => item.source_bytes_verified).length,
    pdf_parsed: count('pdf_parsed'), encrypted_pdf_password_required: count('encrypted_pdf_password_required'),
    parser_rejected: count('parser_rejected'), raster_decoded: count('raster_decoded'),
    raster_decoder_rejected: count('raster_decoder_rejected'), pixel_budget_exceeded: count('pixel_budget_exceeded'),
    multiple_frames_unproven: count('multiple_frames_unproven'), format_mismatch: count('format_mismatch'),
    unsupported_media_format: count('unsupported_media_format'),
    production_mutations: false, external_requests: false, database_access: false,
    source_archive_rehashed_by_helper: false, jpeg_header_only_is_raster_proof: false };
  const report = { schema_version: 1, execution_complete: true, mode,
    source_binding: { run_id: targets.run_id, archive_sha256: targets.archive_sha256 }, summary, results };
  guard(started);
  need(Buffer.byteLength(JSON.stringify(report)) <= LIMITS.report, 'PRIVATE_REPORT_LIMIT');
  return report;
}
async function main() {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    need(process.argv.length === 3 && ['pdf', 'raster'].includes(process.argv[2]), 'ARGUMENTS_INVALID');
    const mode = process.argv[2];
    // Dependencies are fixed and mode-specific; no target value controls require.
    const dependency = mode === 'pdf' ? require('/app/node_modules/pdf-lib') : require('/app/node_modules/sharp');
    const report = await runProof(mode, FIXED, dependency);
    process.stdout.write(JSON.stringify(report) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ schema_version: 1, execution_complete: false,
      error_code: 'DOCUMENT_MEDIA_PROOF_FAILED' }) + '\n');
    process.exitCode = 1;
  } finally { Object.assign(console, saved); }
}
if (require.main === module) void main();
module.exports = { LIMITS, FIXED, Refused, hash, readJson, canonicalMember,
  validateTargets, signature, encryptedPdf, pdfProof, rasterProof, proveFile, runProof };
