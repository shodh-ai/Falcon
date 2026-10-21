'use strict';

// Explicit disposable-recovery acceptance only. The dispatcher must bind a
// recovered copy at this fixed path; never mount the production upload source.
// Existing files are read or opened r+ without a write/truncate. All creations
// and attempted removals are confined to one caller-selected reserved directory.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const ROOT = '/app/uploads';
const INPUT = '/checks/recovery-files.json';
const MAX_FILES = 3000;
const MAX_ENTRIES = 10000;
const MAX_DEPTH = 64;
const MAX_INPUT = 2 * 1024 * 1024;
const MODES = new Set(['api', 'backup', 'backup-ro', 'outsider', 'verify']);
const IDENTITIES = {api: [61001, 61001], verify: [61001, 61001],
  backup: [999, 0], 'backup-ro': [999, 0], outsider: [999, 999]};
const OPEN_READ = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const OPEN_DIRECTORY = OPEN_READ | fs.constants.O_DIRECTORY;
const OPEN_WRITE_CHECK = fs.constants.O_RDWR | fs.constants.O_NOFOLLOW;
const OPEN_EXCLUSIVE = fs.constants.O_WRONLY | fs.constants.O_CREAT |
  fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;

class Refused extends Error {
  constructor() { super('Recovery upload permission proof failed'); }
}
function requireTrue(value) { if (!value) throw new Refused(); }
function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys(value, keys) {
  return plainObject(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
}
function validSegment(value) {
  return typeof value === 'string' && value.length > 0 && value !== '.' && value !== '..' &&
    !/[\x00-\x1f\x7f-\x9f/\\]/u.test(value) && Buffer.byteLength(value) <= 255 &&
    Buffer.from(value).toString('utf8') === value;
}
function validateRelative(value) {
  requireTrue(typeof value === 'string' && Buffer.byteLength(value) <= 4096);
  const parts = value.split('/');
  requireTrue(parts.length <= MAX_DEPTH && parts.every(validSegment));
  return parts;
}
function validateManifest(value) {
  requireTrue(exactKeys(value, ['schema_version', 'files', 'probe_directory']) && value.schema_version === 1 &&
    plainObject(value.files) && /^\.falcon-recovery-proof-[0-9a-f]{32}$/.test(value.probe_directory));
  const entries = Object.entries(value.files);
  requireTrue(entries.length > 0 && entries.length <= MAX_FILES);
  const files = new Map();
  for (const [name, metadata] of entries) {
    const parts = validateRelative(name);
    requireTrue(!parts[0].startsWith('.falcon-recovery-proof-') &&
      exactKeys(metadata, ['sha256', 'bytes', 'uid', 'gid']) &&
      typeof metadata.sha256 === 'string' && /^[0-9a-f]{64}$/.test(metadata.sha256) &&
      Number.isSafeInteger(metadata.bytes) && metadata.bytes >= 0 &&
      (metadata.uid === 0 || metadata.uid === 61001) && metadata.gid === 0);
    files.set(name, Object.freeze({...metadata}));
  }
  // No file can also be an ancestor directory.
  for (const name of files.keys()) {
    const parts = name.split('/');
    for (let index = 1; index < parts.length; index++) requireTrue(!files.has(parts.slice(0, index).join('/')));
  }
  return {files, probeDirectory: value.probe_directory};
}
function readBounded(name, limit, fsApi = fs) {
  const fd = fsApi.openSync(name, OPEN_READ);
  try {
    const info = fsApi.fstatSync(fd);
    requireTrue(info.isFile() && info.nlink === 1 && info.size <= limit);
    const result = fsApi.readFileSync(fd);
    requireTrue(result.length <= limit && result.length === info.size);
    return result;
  } finally { fsApi.closeSync(fd); }
}
function parseStatus(text) {
  requireTrue(typeof text === 'string' && text.length < 65536);
  const result = Object.create(null);
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z_]+):\s*(.*?)\s*$/.exec(line);
    if (match) { requireTrue(!Object.hasOwn(result, match[1])); result[match[1]] = match[2]; }
  }
  return result;
}
function validateStatus(text, uid, gid) {
  const status = parseStatus(text);
  for (const [field, number] of [['Uid', uid], ['Gid', gid]]) {
    requireTrue(typeof status[field] === 'string' &&
      status[field].split(/\s+/).length === 4 &&
      status[field].split(/\s+/).every(part => part === String(number)));
  }
  requireTrue(typeof status.Groups === 'string' && status.Groups.split(/\s+/).filter(Boolean)
    .every(group => group === String(gid)));
  for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
    requireTrue(typeof status[field] === 'string' && /^0{1,32}$/.test(status[field]));
  }
  requireTrue(status.NoNewPrivs === '1');
  return true;
}
function decodeMount(value) {
  requireTrue(typeof value === 'string' && !/\\(?!040|011|012|134)/.test(value));
  return value.replace(/\\(040|011|012|134)/g, (_, code) => String.fromCharCode(parseInt(code, 8)));
}
function parseMounts(text) {
  requireTrue(typeof text === 'string' && text.length <= 1024 * 1024);
  return text.trim().split('\n').map(line => {
    const split = line.indexOf(' - ');
    requireTrue(split > 0);
    const left = line.slice(0, split).split(' '), right = line.slice(split + 3).split(' ');
    requireTrue(left.length >= 6 && right.length >= 3 && /^\d+$/.test(left[0]));
    return {id: left[0], target: decodeMount(left[4]), options: new Set(left[5].split(','))};
  });
}
function validateMounts(text, mode) {
  requireTrue(MODES.has(mode));
  const mounts = parseMounts(text);
  const root = mounts.filter(mount => mount.target === '/');
  const uploads = mounts.filter(mount => mount.target === ROOT);
  requireTrue(root.length === 1 && uploads.length === 1 && root[0].options.has('ro') &&
    !root[0].options.has('rw') && uploads[0].id !== root[0].id &&
    !mounts.some(mount => mount.target.startsWith(ROOT + '/')));
  const readonly = mode === 'backup-ro';
  requireTrue(uploads[0].options.has(readonly ? 'ro' : 'rw') &&
    !uploads[0].options.has(readonly ? 'rw' : 'ro'));
  const inputMounts = mounts.filter(mount => INPUT === mount.target || INPUT.startsWith(mount.target + '/'));
  const input = inputMounts.sort((a, b) => b.target.length - a.target.length)[0];
  requireTrue(input && input.options.has('ro') && !input.options.has('rw'));
  return true;
}
function sameIdentity(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.uid === after.uid &&
    before.gid === after.gid && before.mode === after.mode && before.nlink === after.nlink &&
    before.size === after.size && before.mtimeMs === after.mtimeMs;
}
function validateFileMetadata(info, expected, device) {
  requireTrue(info.isFile() && info.nlink === 1 && info.dev === device &&
    info.uid === expected.uid && info.gid === expected.gid && info.size === expected.bytes &&
    !(info.mode & 0o7000));
}
function assertDenied(action, readonly = false) {
  try { action(); } catch (error) {
    requireTrue(error && (error.code === 'EACCES' || error.code === 'EPERM' ||
      (readonly && error.code === 'EROFS')));
    return error.code;
  }
  throw new Refused();
}
function hashOpenFile(fd, expected, fsApi = fs) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  for (;;) {
    const count = fsApi.readSync(fd, buffer, 0, Math.min(buffer.length, expected.bytes - bytes + 1), null);
    if (count === 0) break;
    bytes += count;
    requireTrue(bytes <= expected.bytes);
    hash.update(buffer.subarray(0, count));
  }
  requireTrue(bytes === expected.bytes && hash.digest('hex') === expected.sha256);
}
function syntheticPlan(probeDirectory, afterApplication = false) {
  requireTrue(/^\.falcon-recovery-proof-[0-9a-f]{32}$/.test(probeDirectory));
  requireTrue(typeof afterApplication === 'boolean');
  const plan = new Map([
    [`${probeDirectory}/nested/default.txt`, Buffer.from('falcon recovery default writer\n')],
    [`${probeDirectory}/nested/staff.txt`, Buffer.from('falcon recovery staff writer\n')],
    [`${probeDirectory}/delete-probe.txt`, Buffer.from('falcon recovery denied deletion\n')],
  ]);
  if (afterApplication) plan.set(`${probeDirectory}/application.txt`,
    Buffer.from('FALCON disposable candidate upload check\n'));
  return plan;
}
function expectedSynthetic(plan) {
  return new Map([...plan].map(([name, data]) => [name, {uid: 61001, gid: 0,
    bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex')}]));
}
function expectedInventory(manifest, includeSynthetic, afterApplication = false) {
  requireTrue(typeof includeSynthetic === 'boolean' && typeof afterApplication === 'boolean' &&
    (!afterApplication || includeSynthetic));
  const expected = new Map(manifest.files);
  if (includeSynthetic) {
    for (const entry of expectedSynthetic(syntheticPlan(manifest.probeDirectory, afterApplication))) expected.set(...entry);
  }
  return expected;
}
function expectedFile(name, expected, seen) {
  requireTrue(expected.has(name) && !seen.has(name));
  return expected.get(name);
}
function validateInvocation(mode, afterApplication) {
  requireTrue(MODES.has(mode) && typeof afterApplication === 'boolean' &&
    (!afterApplication || ['verify', 'backup', 'backup-ro'].includes(mode)) &&
    (mode !== 'verify' || afterApplication));
}

function environment(mode) {
  const [uid, gid] = IDENTITIES[mode];
  requireTrue(process.getuid() === uid && process.geteuid() === uid &&
    process.getgid() === gid && process.getegid() === gid &&
    process.getgroups().every(group => group === gid));
  validateStatus(fs.readFileSync('/proc/self/status', 'utf8'), uid, gid);
  validateStatus(fs.readFileSync('/proc/1/status', 'utf8'), uid, gid);
  validateMounts(fs.readFileSync('/proc/self/mountinfo', 'utf8'), mode);
}
function inspectTree(manifest, mode, includeSynthetic, afterApplication = false) {
  const synthetic = expectedSynthetic(syntheticPlan(manifest.probeDirectory, afterApplication));
  const expected = expectedInventory(manifest, includeSynthetic, afterApplication);
  const seen = new Set();
  let entries = 0, directories = 0, erofs = 0;
  const backup = mode === 'backup' || mode === 'backup-ro';
  const readonly = mode === 'backup-ro';
  const root = fs.openSync(ROOT, OPEN_DIRECTORY);
  const rootInfo = fs.fstatSync(root);
  function directory(fd, relative, depth) {
    const info = fs.fstatSync(fd);
    requireTrue(info.isDirectory() && info.dev === rootInfo.dev &&
      (info.uid === 0 || info.uid === 61001) && info.gid === 0 &&
      (info.mode & 0o2000) !== 0 && !(info.mode & 0o5000) && depth <= MAX_DEPTH);
    if (relative === manifest.probeDirectory || relative.startsWith(manifest.probeDirectory + '/')) {
      requireTrue(info.uid === 61001 && !(info.mode & 0o007) &&
        (relative === manifest.probeDirectory || relative === manifest.probeDirectory + '/nested'));
    }
    if (backup) assertDenied(() => fs.accessSync(`/proc/self/fd/${fd}`, fs.constants.W_OK), readonly);
    directories++;
    for (const child of fs.readdirSync(`/proc/self/fd/${fd}`)) {
      requireTrue(validSegment(child) && ++entries <= MAX_ENTRIES);
      const name = relative ? relative + '/' + child : child;
      validateRelative(name);
      const anchored = `/proc/self/fd/${fd}/${child}`;
      const before = fs.lstatSync(anchored);
      requireTrue(!before.isSymbolicLink() && before.dev === rootInfo.dev);
      if (before.isDirectory()) {
        const childFd = fs.openSync(anchored, OPEN_DIRECTORY);
        try {
          const opened = fs.fstatSync(childFd);
          requireTrue(opened.ino === before.ino && opened.dev === before.dev);
          directory(childFd, name, depth + 1);
        } finally { fs.closeSync(childFd); }
      } else {
        requireTrue(before.isFile());
        const wanted = expectedFile(name, expected, seen);
        validateFileMetadata(before, wanted, rootInfo.dev);
        if (synthetic.has(name)) requireTrue(!(before.mode & 0o007));
        const file = fs.openSync(anchored, OPEN_READ);
        try {
          requireTrue(sameIdentity(before, fs.fstatSync(file)));
          hashOpenFile(file, wanted);
          if (backup) {
            assertDenied(() => fs.accessSync(anchored, fs.constants.W_OK), readonly);
            const code = assertDenied(() => {
              const writable = fs.openSync(anchored, OPEN_WRITE_CHECK);
              fs.closeSync(writable);
            }, readonly);
            if (code === 'EROFS') erofs++;
          } else {
            const writable = fs.openSync(anchored, OPEN_WRITE_CHECK);
            try { requireTrue(sameIdentity(before, fs.fstatSync(writable))); }
            finally { fs.closeSync(writable); }
          }
          requireTrue(sameIdentity(before, fs.fstatSync(file)));
        } finally { fs.closeSync(file); }
        requireTrue(sameIdentity(before, fs.lstatSync(anchored)));
        seen.add(name);
      }
    }
    const after = fs.fstatSync(fd);
    requireTrue(after.dev === info.dev && after.ino === info.ino &&
      after.uid === info.uid && after.gid === info.gid && after.mode === info.mode);
  }
  try { directory(root, '', 0); } finally { fs.closeSync(root); }
  requireTrue(seen.size === expected.size);
  return {files: seen.size, directories, erofs};
}
function createSynthetic(manifest, fsApi = fs, setUmask = process.umask) {
  const plan = syntheticPlan(manifest.probeDirectory);
  setUmask(0o027);
  fsApi.mkdirSync(path.join(ROOT, manifest.probeDirectory));
  fsApi.mkdirSync(path.join(ROOT, manifest.probeDirectory, 'nested'));
  for (const [relative, bytes] of plan) {
    const fd = fsApi.openSync(path.join(ROOT, relative), OPEN_EXCLUSIVE,
      relative.endsWith('/staff.txt') ? 0o660 : 0o666);
    try { fsApi.writeFileSync(fd, bytes); fsApi.fsyncSync(fd); }
    finally { fsApi.closeSync(fd); }
  }
}
function backupDenials(manifest, readonly, fsApi = fs) {
  let erofs = 0;
  const destination = path.join(ROOT, manifest.probeDirectory, 'nested', 'backup-must-not-create.txt');
  const actions = [
    () => { const fd = fsApi.openSync(destination, OPEN_EXCLUSIVE, 0o666); fsApi.closeSync(fd); },
    () => fsApi.mkdirSync(path.join(ROOT, manifest.probeDirectory, 'backup-must-not-create')),
    // The only deletion attempt names an exclusively synthetic file.
    () => fsApi.unlinkSync(path.join(ROOT, manifest.probeDirectory, 'delete-probe.txt')),
  ];
  for (const action of actions) if (assertDenied(action, readonly) === 'EROFS') erofs++;
  return erofs;
}
function outsiderDenials(manifest) {
  assertDenied(() => { const fd = fs.openSync(ROOT, OPEN_DIRECTORY); fs.closeSync(fd); });
  const first = manifest.files.keys().next().value;
  for (const relative of [first, ...syntheticPlan(manifest.probeDirectory).keys()]) {
    assertDenied(() => { const fd = fs.openSync(path.join(ROOT, relative), OPEN_READ); fs.closeSync(fd); });
  }
}
function run(mode, afterApplication = false) {
  validateInvocation(mode, afterApplication);
  environment(mode);
  const manifest = validateManifest(JSON.parse(readBounded(INPUT, MAX_INPUT).toString('utf8')));
  if (mode === 'outsider') {
    outsiderDenials(manifest);
  } else if (mode === 'api') {
    inspectTree(manifest, mode, false);
    createSynthetic(manifest);
    inspectTree(manifest, mode, true);
  } else {
    const inspected = inspectTree(manifest, mode, true, afterApplication);
    if (mode === 'backup' || mode === 'backup-ro') {
      const erofs = inspected.erofs + backupDenials(manifest, mode === 'backup-ro');
      if (mode === 'backup-ro') requireTrue(erofs > 0);
      // Recheck retained originals and every synthetic byte after denied actions.
      inspectTree(manifest, mode, true, afterApplication);
    }
  }
  return {ok: true, mode, original_files: manifest.files.size, synthetic_files: afterApplication ? 4 : 3};
}

if (require.main === module) {
  try {
    requireTrue(process.argv.length === 3 ||
      (process.argv.length === 4 && process.argv[3] === 'after-application'));
    process.stdout.write(JSON.stringify(run(process.argv[2], process.argv.length === 4)) + '\n');
  } catch {
    // Never emit filenames, hashes, identities, driver errors or file contents.
    process.stderr.write('Recovery upload permission proof failed\n');
    process.exitCode = 1;
  }
}
module.exports = {validateRelative, validateManifest, parseStatus, validateStatus,
  decodeMount, parseMounts, validateMounts, validateFileMetadata, sameIdentity,
  assertDenied, hashOpenFile, syntheticPlan, expectedSynthetic, readBounded,
  createSynthetic, backupDenials, expectedInventory, expectedFile, validateInvocation,
  ROOT, INPUT, MAX_FILES, MAX_ENTRIES, MAX_DEPTH, OPEN_WRITE_CHECK, OPEN_EXCLUSIVE};
