'use strict';

// This check reads metadata only. The protected baseline is supplied by the host,
// never generated or repaired by an application container.
const fs = require('node:fs');
const path = require('node:path').posix;
const { TextDecoder } = require('node:util');
const BASELINE_PATH = '/run/falcon/storage-boundary.json';
const MAX_BASELINE_BYTES = 65536;
const MAX_MOUNTINFO_BYTES = 1048576;
const APP_ROOT = '/app';
const EPHEMERAL = new Set(['overlay', 'aufs', 'fuse.fuse-overlayfs', 'tmpfs',
  'ramfs', 'devtmpfs', 'proc', 'sysfs', 'cgroup', 'cgroup2', 'devpts', 'mqueue', 'nsfs']);

class StorageBoundaryError extends Error {
  constructor(code) {
    super(`Storage boundary check failed (${code}); keep the previous healthy release`);
    this.name = 'StorageBoundaryError';
    this.code = code;
  }
}
function fail(code) { throw new StorageBoundaryError(code); }
function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function keysExactly(value, keys) {
  return plainObject(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function canonicalPath(value, allowRoot = false) {
  return typeof value === 'string' && value.length <= 4096 && value.startsWith('/') &&
    (allowRoot || value !== '/') && !/[\x00-\x1f\x7f\\]/.test(value) &&
    path.normalize(value) === value && (value === '/' || !value.endsWith('/'));
}
function overlaps(a, b) { return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`); }
function below(value, root) { return value === root || value.startsWith(`${root}/`); }
function deviceFromStat(dev) {
  if (typeof dev !== 'bigint' || dev < 0n) fail('stat-device');
  const major = ((dev >> 8n) & 0xfffn) | ((dev >> 32n) & 0xfffff000n);
  const minor = (dev & 0xffn) | ((dev >> 12n) & 0xffffff00n);
  return `${major}:${minor}`;
}
function decodeMountPath(value) {
  // Only the kernel's documented mountinfo path escapes are accepted.
  if (/\\(?!040|011|012|134)/.test(value)) fail('mountinfo-escape');
  return value.replace(/\\(040|011|012|134)/g, (_, octal) =>
    String.fromCharCode(parseInt(octal, 8)));
}
function parseMountInfo(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_MOUNTINFO_BYTES ||
      !text.endsWith('\n')) fail('mountinfo-format');
  const records = [];
  const destinations = new Set();
  for (const line of text.slice(0, -1).split('\n')) {
    if (!line || line.length > 16384 || records.length >= 10000) fail('mountinfo-format');
    const fields = line.split(' ');
    const separator = fields.indexOf('-');
    if (fields.some(x => !x) || separator < 6 || fields.length !== separator + 4 ||
        !/^[1-9][0-9]*$/.test(fields[0]) || !/^[0-9]+$/.test(fields[1]) ||
        !/^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(fields[2])) fail('mountinfo-format');
    const root = decodeMountPath(fields[3]);
    const destination = decodeMountPath(fields[4]);
    if (!canonicalPath(root, true) || !canonicalPath(destination, true) ||
        destinations.has(destination)) fail('mountinfo-path');
    const options = new Set(fields[5].split(','));
    const superOptions = new Set(fields[separator + 3].split(','));
    if (options.has('rw') === options.has('ro') ||
        superOptions.has('rw') === superOptions.has('ro')) fail('mountinfo-options');
    destinations.add(destination);
    records.push({ id: fields[0], device: fields[2], root, destination,
      options, superOptions, filesystem: fields[separator + 1] });
  }
  return records;
}
function parseUniqueJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('baseline-json'); }
  // JSON.parse silently accepts duplicate keys. Scan valid JSON tokens to refuse
  // those, including two differently escaped spellings of the same key.
  const stack = [];
  for (let offset = 0; offset < text.length; offset++) {
    const character = text[offset];
    if (character === '{') stack.push({ object: true, keys: new Set() });
    else if (character === '[') stack.push({ object: false });
    else if (character === '}' || character === ']') stack.pop();
    else if (character === '"') {
      const start = offset++;
      while (offset < text.length) {
        if (text[offset] === '\\') offset += 2;
        else if (text[offset] === '"') break;
        else offset++;
      }
      let next = offset + 1;
      while (/\s/.test(text[next] || '') && next < text.length) next++;
      if (text[next] === ':') {
        const frame = stack[stack.length - 1];
        const key = JSON.parse(text.slice(start, offset + 1));
        if (!frame || !frame.object || frame.keys.has(key)) fail('baseline-duplicate-key');
        frame.keys.add(key);
      }
    }
  }
  return parsed;
}
function validateBaseline(value) {
  if (!keysExactly(value, ['schema_version', 'upload_mounts', 'readonly_mounts', 'database']) ||
      value.schema_version !== 1 || !Array.isArray(value.upload_mounts) ||
      value.upload_mounts.length < 1 || value.upload_mounts.length > 2 ||
      !Array.isArray(value.readonly_mounts) || value.readonly_mounts.length > 16) fail('baseline-schema');
  const destinations = new Set([BASELINE_PATH]);
  for (const [items, readonly] of [[value.upload_mounts, false], [value.readonly_mounts, true]]) {
    for (const entry of items) {
      if (!keysExactly(entry, readonly ? ['destination', 'mount_root', 'device', 'inode', 'kind'] :
        ['destination', 'mount_root', 'device', 'inode']) ||
          !canonicalPath(entry.destination) || !canonicalPath(entry.mount_root, true) ||
          typeof entry.device !== 'string' || !/^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(entry.device) ||
          entry.device.split(':').some(part => BigInt(part) > 0xffffffffn) ||
          typeof entry.inode !== 'string' || !/^[1-9][0-9]*$/.test(entry.inode) ||
          entry.inode.length > 20 || BigInt(entry.inode) > 0xffffffffffffffffn ||
          destinations.has(entry.destination) ||
          (readonly && !['file', 'directory'].includes(entry.kind))) fail('baseline-entry');
      destinations.add(entry.destination);
    }
  }
  const all = [...value.upload_mounts, ...value.readonly_mounts];
  for (let i = 0; i < all.length; i++) {
    if (overlaps(all[i].destination, BASELINE_PATH) || all[i].destination === APP_ROOT) fail('baseline-overlap');
    for (let j = i + 1; j < all.length; j++) {
      if (overlaps(all[i].destination, all[j].destination)) fail('baseline-overlap');
    }
  }
  const database = value.database;
  if (!keysExactly(database, ['host', 'port', 'name', 'role', 'enforce_least_privilege']) ||
      typeof database.enforce_least_privilege !== 'boolean' ||
      !Number.isInteger(database.port) || database.port < 1 || database.port > 65535 ||
      typeof database.host !== 'string' ||
      !(canonicalPath(database.host) || (database.host.length <= 253 &&
        /^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(database.host))) ||
      !['name', 'role'].every(key => typeof database[key] === 'string' &&
        /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(database[key]))) fail('baseline-database');
  if (database.host.startsWith('/') && !value.readonly_mounts.some(entry =>
    entry.destination === database.host && entry.kind === 'directory')) fail('baseline-socket-mount');
  return value;
}
function freezeTree(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
function sameStat(a, b) {
  return ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every(key => a[key] === b[key]);
}
function checkPath(fsApi, target, { trustedParents = false, kind } = {}) {
  const segments = target.split('/').filter(Boolean);
  let current = '/';
  let stat;
  for (let index = -1; index < segments.length; index++) {
    if (index >= 0) current = path.join(current, segments[index]);
    stat = fsApi.lstatSync(current, { bigint: true });
    const leaf = index === segments.length - 1;
    if (stat.isSymbolicLink() || (!leaf && !stat.isDirectory()) ||
        (trustedParents && !leaf && (stat.uid !== 0n || (stat.mode & 0o022n) !== 0n))) fail('path-boundary');
  }
  if (kind === 'file' && !stat.isFile() || kind === 'directory' && !stat.isDirectory()) fail('path-kind');
  return stat;
}
function loadBaseline(fsApi, mounts) {
  const mount = mounts.find(item => item.destination === BASELINE_PATH);
  if (!mount || !mount.options.has('ro')) fail('baseline-readonly-mount');
  const beforePath = checkPath(fsApi, BASELINE_PATH, { trustedParents: true, kind: 'file' });
  let fd;
  try {
    fd = fsApi.openSync(BASELINE_PATH, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW |
      fs.constants.O_NONBLOCK);
    const before = fsApi.fstatSync(fd, { bigint: true });
    if (!sameStat(beforePath, before) || !before.isFile() || before.uid !== 0n ||
        before.nlink !== 1n || (before.mode & 0o022n) !== 0n || before.size < 2n ||
        before.size > BigInt(MAX_BASELINE_BYTES) || deviceFromStat(before.dev) !== mount.device) fail('baseline-metadata');
    const buffer = Buffer.alloc(MAX_BASELINE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fsApi.readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    const after = fsApi.fstatSync(fd, { bigint: true });
    const afterPath = checkPath(fsApi, BASELINE_PATH, { trustedParents: true, kind: 'file' });
    if (length !== Number(before.size) || length > MAX_BASELINE_BYTES ||
        !sameStat(before, after) || !sameStat(before, afterPath)) fail('baseline-changed');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)); }
    catch { fail('baseline-encoding'); }
    return freezeTree(validateBaseline(parseUniqueJson(text)));
  } finally {
    if (fd !== undefined) fsApi.closeSync(fd);
  }
}
function expectedUploadRoots(env, cwd) {
  if (cwd !== APP_ROOT) fail('working-directory');
  const configured = env.UPLOAD_PATH === undefined || env.UPLOAD_PATH === '' ? './uploads' : env.UPLOAD_PATH;
  if (typeof configured !== 'string' || configured.trim() !== configured ||
      /[\x00-\x1f\x7f\\]/.test(configured) || configured.split('/').includes('..')) fail('upload-path');
  const resolved = path.resolve(APP_ROOT, configured);
  if (!canonicalPath(resolved)) fail('upload-path');
  return [...new Set(['/app/uploads', resolved])].sort();
}
function verifyMount(fsApi, mounts, entry, readonly) {
  const actual = mounts.find(item => item.destination === entry.destination);
  if (!actual || actual.root !== entry.mount_root || actual.device !== entry.device ||
      EPHEMERAL.has(actual.filesystem) || (readonly ? !actual.options.has('ro') :
        (!actual.options.has('rw') || !actual.superOptions.has('rw')))) fail('mount-identity');
  const stat = checkPath(fsApi, entry.destination, { trustedParents: true, kind: readonly ? entry.kind : 'directory' });
  if (deviceFromStat(stat.dev) !== entry.device || stat.ino.toString() !== entry.inode) fail('inode-identity');
  if (readonly && ((entry.kind === 'file' && stat.uid !== 0n) ||
      (stat.mode & 0o022n) !== 0n)) fail('readonly-metadata');
  if (!readonly) fsApi.accessSync(entry.destination, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
}
function assertStorageBoundary({ env = process.env, fsApi = fs, mountInfoText,
  cwd = process.cwd() } = {}) {
  try {
    const text = mountInfoText === undefined ? fsApi.readFileSync('/proc/self/mountinfo', 'utf8') : mountInfoText;
    const mounts = parseMountInfo(text);
    const baseline = loadBaseline(fsApi, mounts);
    const expected = expectedUploadRoots(env, cwd);
    if (baseline.upload_mounts.map(item => item.destination).sort().join('\0') !== expected.join('\0')) fail('upload-scope');
    const declared = new Set([BASELINE_PATH, ...baseline.upload_mounts.map(item => item.destination),
      ...baseline.readonly_mounts.map(item => item.destination)]);
    const boundaryPaths = [BASELINE_PATH, ...baseline.upload_mounts.map(item => item.destination),
      ...baseline.readonly_mounts.map(item => item.destination)];
    for (const mount of mounts) {
      const appData = ['/app', '/data', '/uploads', '/home/node'].some(root => below(mount.destination, root));
      const related = boundaryPaths.some(destination => overlaps(destination, mount.destination));
      // The container root is the ordinary overlay ancestor, never upload proof.
      if (mount.destination !== '/' && (appData || related) && !declared.has(mount.destination)) fail('unexpected-mount');
    }
    for (const entry of baseline.upload_mounts) verifyMount(fsApi, mounts, entry, false);
    for (const entry of baseline.readonly_mounts) verifyMount(fsApi, mounts, entry, true);
    return Object.freeze({ storage_boundary_verified: true, upload_roots_verified: expected.length, baseline });
  } catch (error) {
    if (error instanceof StorageBoundaryError) throw error;
    fail('metadata-unavailable');
  }
}
if (require.main === module) {
  try {
    const result = assertStorageBoundary();
    console.log(JSON.stringify({ storage_boundary_verified: true, upload_roots_verified: result.upload_roots_verified }));
  } catch (error) {
    console.error(error instanceof StorageBoundaryError ? error.message : 'Storage boundary check failed');
    process.exitCode = 1;
  }
}
module.exports = { assertStorageBoundary, StorageBoundaryError, BASELINE_PATH,
  parseMountInfo, parseUniqueJson, validateBaseline, deviceFromStat, expectedUploadRoots };
