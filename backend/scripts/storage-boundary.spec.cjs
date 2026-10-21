'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { assertStorageBoundary, StorageBoundaryError, BASELINE_PATH, parseMountInfo,
  parseUniqueJson, deviceFromStat, expectedUploadRoots } = require('./storage-boundary.cjs');
const DEVICE = '8:1';
const DEV = 2049n;
const BIG_INODE = '9007199254740993';
function stat(kind = 'directory', patch = {}) {
  return { dev: DEV, ino: 1n, uid: 0n, gid: 0n, mode: kind === 'file' ? 0o100444n : 0o40755n,
    nlink: 1n, size: 0n, mtimeNs: 1n, ctimeNs: 1n,
    isDirectory: () => kind === 'directory', isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'symlink', ...patch };
}
function record(id, destination, root, { mode = 'rw', filesystem = 'xfs', device = DEVICE, superMode = 'rw' } = {}) {
  const escape = value => value.replace(/\\/g, '\\134').replace(/ /g, '\\040');
  return `${id} 1 ${device} ${escape(root)} ${escape(destination)} ${mode},relatime - ${filesystem} /dev/fixture ${superMode}\n`;
}
function fixture() {
  const baseline = { schema_version: 1,
    upload_mounts: [{ destination: '/app/uploads', mount_root: '/protected/uploads', device: DEVICE, inode: BIG_INODE }],
    readonly_mounts: [], database: { host: 'fixture-db', port: 5432, name: 'fixture', role: 'postgres', enforce_least_privilege: false } };
  const files = new Map(['/', '/app', '/run', '/run/falcon', '/data', '/home', '/home/node'].map(p => [p, stat()]));
  files.set('/app/uploads', stat('directory', { ino: BigInt(BIG_INODE) }));
  const state = { text: null, reads: 0, closes: 0, opened: [], files, baseline,
    mounts: record(1, '/', '/', { filesystem: 'overlay', device: '0:1' }) +
      record(2, BASELINE_PATH, '/protected/storage-boundary.json', { mode: 'ro' }) +
      record(3, '/app/uploads', '/protected/uploads') };
  const fsApi = {
    lstatSync(p) { if (!files.has(p)) throw new Error('secret-path-not-found'); return files.get(p); },
    openSync(p, flags) { assert.equal(p, BASELINE_PATH); state.opened.push(flags); return 7; },
    fstatSync(fd) { assert.equal(fd, 7); return files.get(BASELINE_PATH); },
    readSync(fd, buffer, offset, length) {
      assert.equal(fd, 7); const bytes = Buffer.from(state.text === null ? JSON.stringify(baseline) : state.text);
      const count = Math.min(length, Math.max(0, bytes.length - state.reads));
      bytes.copy(buffer, offset, state.reads, state.reads + count); state.reads += count; return count;
    },
    closeSync(fd) { assert.equal(fd, 7); state.closes++; },
    accessSync(p, mode) {
      assert.ok(files.has(p));
      assert.equal(mode, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    },
    readFileSync(p, encoding) { assert.equal(p, '/proc/self/mountinfo'); assert.equal(encoding, 'utf8'); return state.mounts; },
  };
  state.sync = () => files.set(BASELINE_PATH, stat('file', { ino: 10n,
    size: BigInt(Buffer.byteLength(state.text === null ? JSON.stringify(baseline) : state.text)) }));
  state.check = (options = {}) => { state.sync(); return assertStorageBoundary({ env: {}, fsApi, cwd: '/app', ...options }); };
  state.fsApi = fsApi;
  return state;
}
function denied(f, code, options) {
  assert.throws(() => f.check(options), error => error instanceof StorageBoundaryError && error.code === code,
    `expected sanitized ${code}`);
}

test('existing exact persistent uploads passes with bigint inode and one verified immutable baseline', () => {
  const f = fixture(); const result = f.check();
  assert.equal(result.storage_boundary_verified, true);
  assert.equal(result.upload_roots_verified, 1);
  assert.deepEqual(result.baseline.database, f.baseline.database);
  assert.equal(Object.isFrozen(result.baseline), true);
  assert.equal(Object.isFrozen(result.baseline.database), true);
  assert.equal(Object.isFrozen(result.baseline.upload_mounts[0]), true);
  assert.equal(f.closes, 1);
  assert.ok(f.opened[0] & fs.constants.O_NOFOLLOW);
  assert.ok(f.opened[0] & fs.constants.O_NONBLOCK);
  assert.equal(f.opened[0] & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT), 0);
  assert.throws(() => { result.baseline.database.enforce_least_privilege = true; }, TypeError);
});

test('no environment switch can bypass a missing protected baseline', () => {
  const f = fixture(); f.mounts = f.mounts.split('\n').filter(line => !line.includes(BASELINE_PATH)).join('\n');
  denied(f, 'baseline-readonly-mount', { env: { NODE_ENV: 'development', STORAGE_GUARD_DISABLED: 'true' } });
});

test('baseline must be its own readonly mount and not an ancestor mount', () => {
  for (const destination of [BASELINE_PATH, '/run/falcon']) {
    const f = fixture(); f.mounts = f.mounts.replace(`${BASELINE_PATH} ro`, `${destination} rw`);
    denied(f, 'baseline-readonly-mount');
  }
});

test('baseline metadata requires root owner, regular single-linked file, and no shared write', () => {
  for (const patch of [{ uid: 1000n }, { mode: 0o100464n }, { mode: 0o100446n }, { nlink: 2n }]) {
    const f = fixture(); const original = f.sync; f.sync = () => { original(); Object.assign(f.files.get(BASELINE_PATH), patch); };
    denied(f, 'baseline-metadata'); assert.equal(f.closes, 1);
  }
  const f = fixture(); const original = f.sync; f.sync = () => { original(); f.files.set(BASELINE_PATH, stat('directory')); };
  denied(f, 'path-kind');
});

test('all protected baseline ancestors must be root-owned and not group/world writable', () => {
  for (const target of ['/', '/run', '/run/falcon']) for (const patch of [{ uid: 1000n }, { mode: 0o40775n }, { mode: 0o40757n }]) {
    const f = fixture(); Object.assign(f.files.get(target), patch); denied(f, 'path-boundary');
  }
});

test('symlink and non-directory ancestors are rejected without following them', () => {
  for (const target of ['/run', '/run/falcon', BASELINE_PATH, '/app', '/app/uploads']) {
    const f = fixture(); const original = f.sync; f.sync = () => { original(); f.files.set(target, stat('symlink')); };
    denied(f, 'path-boundary');
  }
  const f = fixture(); f.files.set('/app', stat('file')); denied(f, 'path-boundary');
});

test('baseline is loaded from the held file descriptor and replacement/change is detected', () => {
  for (const key of ['ino', 'size', 'ctimeNs', 'mtimeNs', 'dev']) {
    const f = fixture(); const original = f.fsApi.fstatSync; let calls = 0;
    f.fsApi.fstatSync = fd => { const value = original(fd); return ++calls === 2 ? { ...value, [key]: value[key] + 1n } : value; };
    denied(f, 'baseline-changed'); assert.equal(f.closes, 1);
  }
  const f = fixture(); f.fsApi.fstatSync = () => stat('file', { ino: 999n }); denied(f, 'baseline-metadata');
});

test('baseline size, UTF8, malformed JSON, duplicate escaped keys and unknown fields fail closed', () => {
  const cases = [
    [' '.repeat(65537), 'baseline-metadata'], ['{', 'baseline-metadata'],
    ['{"schema_version":1,"schema_version":1}', 'baseline-duplicate-key'],
    ['{"a":1,"\\u0061":2}', 'baseline-duplicate-key'],
    ['{"outer":{"a":1,"a":2}}', 'baseline-duplicate-key'],
    ['{bad}', 'baseline-json'],
  ];
  for (const [text, code] of cases) { const f = fixture(); f.text = text; denied(f, code); }
  const f = fixture(); f.baseline.unreviewed = true; denied(f, 'baseline-schema');
  const g = fixture(); g.baseline.database.password = 'must-not-appear'; denied(g, 'baseline-database');
  assert.deepEqual(parseUniqueJson('{"a":1,"b":{"a":2},"c":"{fake: \\\"value\\\"}"}'),
    { a: 1, b: { a: 2 }, c: '{fake: "value"}' });
});

test('database policy block is returned once verified but malformed policy is refused', () => {
  for (const patch of [{ port: '5432' }, { host: 'x@secret' }, { role: 'x;DROP' }, { enforce_least_privilege: 'false' }]) {
    const f = fixture(); Object.assign(f.baseline.database, patch); denied(f, 'baseline-database');
  }
  const f = fixture(); f.baseline.database.enforce_least_privilege = true;
  assert.equal(f.check().baseline.database.enforce_least_privilege, true);
});

test('mount identity requires exact root, device, inode and an actual directory', () => {
  for (const change of [f => { f.baseline.upload_mounts[0].mount_root = '/wrong'; },
    f => { f.baseline.upload_mounts[0].device = '8:2'; },
    f => { f.baseline.upload_mounts[0].inode = '9007199254740992'; }]) {
    const f = fixture(); change(f); assert.throws(() => f.check(), StorageBoundaryError);
  }
  const f = fixture(); f.files.set('/app/uploads', stat('file', { ino: BigInt(BIG_INODE) })); denied(f, 'path-kind');
  const g = fixture(); g.files.get('/app/uploads').dev = 2050n; denied(g, 'inode-identity');
});

test('a normal image directory, ancestor mount or missing mount cannot satisfy the gate', () => {
  for (const replacement of ['', record(3, '/app', '/protected')]) {
    const f = fixture(); f.mounts = f.mounts.replace(record(3, '/app/uploads', '/protected/uploads'), replacement);
    assert.throws(() => f.check(), StorageBoundaryError);
  }
});

test('uploads requires read-write mount and filesystem and rejects ephemeral filesystems', () => {
  for (const options of [{ mode: 'ro' }, { superMode: 'ro' },
    ...['overlay', 'tmpfs', 'ramfs', 'fuse.fuse-overlayfs', 'proc'].map(filesystem => ({ filesystem }))]) {
    const f = fixture(); f.mounts = f.mounts.replace(record(3, '/app/uploads', '/protected/uploads'),
      record(3, '/app/uploads', '/protected/uploads', options)); denied(f, 'mount-identity');
  }
});

test('UPLOAD_PATH uses actual /app cwd and accepts equivalent default spellings only when identities match', () => {
  for (const value of [undefined, '', 'uploads', './uploads', '/app/uploads']) {
    const f = fixture(); assert.equal(f.check({ env: { UPLOAD_PATH: value } }).upload_roots_verified, 1);
  }
  const f = fixture(); denied(f, 'working-directory', { cwd: '/different' });
  for (const value of [' /app/uploads', '/app/uploads ', '\t/app/uploads', '../uploads', '/app/../uploads', '/', 'up\\loads', '/app/uploads\n']) {
    const f = fixture(); denied(f, 'upload-path', { env: { UPLOAD_PATH: value } });
  }
  const g = fixture(); denied(g, 'upload-scope', { env: { UPLOAD_PATH: '/data/uploads' } });
});

test('a second distinct UPLOAD_PATH must have a second disjoint verified mount', () => {
  const f = fixture(); f.baseline.upload_mounts.push({ destination: '/data/uploads', mount_root: '/other/uploads', device: DEVICE, inode: '200' });
  f.files.set('/data/uploads', stat('directory', { ino: 200n }));
  f.mounts += record(4, '/data/uploads', '/other/uploads');
  assert.equal(f.check({ env: { UPLOAD_PATH: '/data/uploads' } }).upload_roots_verified, 2);
  const g = fixture(); g.baseline.upload_mounts.push({ ...g.baseline.upload_mounts[0], destination: '/app/uploads/nested' });
  denied(g, 'baseline-overlap');
});

test('unknown app/data mounts and hidden descendants are refused even when readonly', () => {
  for (const destination of ['/app', '/app/config', '/app/uploads/nested', '/data', '/uploads', '/home/node/cache']) {
    for (const mode of ['rw', 'ro']) {
      const f = fixture(); f.mounts += record(4, destination, '/unreviewed', { mode }); denied(f, 'unexpected-mount');
    }
  }
});

test('explicit protected readonly config mount passes but cannot cover or nest inside uploads', () => {
  const f = fixture(); f.baseline.readonly_mounts.push({ destination: '/app/config.json', mount_root: '/protected/config.json', device: DEVICE, inode: '300', kind: 'file' });
  f.files.set('/app/config.json', stat('file', { ino: 300n }));
  f.mounts += record(4, '/app/config.json', '/protected/config.json', { mode: 'ro' });
  assert.equal(f.check().storage_boundary_verified, true);
  const g = fixture(); g.baseline.readonly_mounts.push({ destination: '/app/uploads/sub', mount_root: '/protected', device: DEVICE, inode: '300', kind: 'directory' });
  denied(g, 'baseline-overlap');
  for (const patch of [{ mode: 'rw' }, { mode: 'ro', device: '8:2' }]) {
    const h = fixture(); h.baseline.readonly_mounts = f.baseline.readonly_mounts;
    h.files.set('/app/config.json', stat('file', { ino: 300n }));
    h.mounts += record(4, '/app/config.json', '/protected/config.json', patch); denied(h, 'mount-identity');
  }
});

test('ordinary container kernel and Docker host metadata mounts are not treated as upload storage', () => {
  const f = fixture(); f.mounts += record(4, '/proc', '/', { filesystem: 'proc', device: '0:2' }) +
    record(5, '/etc/hosts', '/containers/hosts') + record(6, '/dev', '/', { filesystem: 'tmpfs', device: '0:3' });
  assert.equal(f.check().storage_boundary_verified, true);
});

test('mountinfo parser decodes kernel spaces but rejects duplicate, malformed, ambiguous and truncated records', () => {
  assert.equal(parseMountInfo(record(1, '/app/uploads', '/protected/with space'))[0].root, '/protected/with space');
  for (const text of [record(1, '/app/uploads', '/x') + record(2, '/app/uploads', '/y'),
    record(1, '/app/uploads', '/x').slice(0, -1), record(1, '/app/uploads', '/x').replace('/x', '/x\\777'),
    record(1, '/app/uploads', '/x').replace('rw,relatime', 'rw,ro'),
    record(1, '/app/uploads', '/x').replace('/app/uploads', '/app//uploads')]) {
    assert.throws(() => parseMountInfo(text), StorageBoundaryError);
  }
});

test('Linux dev_t conversion preserves high major/minor bits without Number rounding', () => {
  const major = 0x12345n, minor = 0x123456n;
  const dev = ((major & 0xfffn) << 8n) | ((major & 0xfffff000n) << 32n) |
    (minor & 0xffn) | ((minor & 0xffffff00n) << 12n);
  assert.equal(deviceFromStat(dev), `${major}:${minor}`);
  assert.deepEqual(expectedUploadRoots({}, '/app'), ['/app/uploads']);
});

test('filesystem failures are sanitized and do not echo paths or credentials', () => {
  const f = fixture(); f.fsApi.lstatSync = () => { throw new Error('postgres://user:secret@private/path'); };
  assert.throws(() => f.check(), error => error.code === 'metadata-unavailable' && !error.message.includes('secret'));
});


test('readonly directories outside standard app roots cannot hide undeclared child or ancestor mounts', () => {
  for (const destination of ['/opt/config/child', '/opt']) {
    const f = fixture();
    f.baseline.readonly_mounts.push({ destination: '/opt/config', mount_root: '/protected/config', device: DEVICE, inode: '301', kind: 'directory' });
    f.files.set('/opt', stat()); f.files.set('/opt/config', stat('directory', { ino: 301n }));
    f.mounts += record(4, '/opt/config', '/protected/config', { mode: 'ro' });
    f.mounts += record(5, destination, '/unreviewed', { mode: 'rw' });
    denied(f, 'unexpected-mount');
  }
});


test('uploads effective read/write/search permission is checked without writing', () => {
  const f = fixture(); const paths = [];
  f.fsApi.accessSync = (p, mode) => { paths.push(p); assert.equal(mode, 7); };
  f.check(); assert.deepEqual(paths, ['/app/uploads']);
  const g = fixture(); g.fsApi.accessSync = () => { throw new Error('denied-private-path'); };
  denied(g, 'metadata-unavailable');
});

test('protected Unix socket database policy and readonly PG-owned socket directory are supported', () => {
  const f = fixture(); f.baseline.database.host = '/restore-socket'; f.baseline.database.port = 55432;
  f.baseline.readonly_mounts.push({ destination: '/restore-socket', mount_root: '/private/socket', device: DEVICE, inode: '400', kind: 'directory' });
  f.files.set('/restore-socket', stat('directory', { ino: 400n, uid: 70n, gid: 70n, mode: 0o40700n }));
  f.mounts += record(4, '/restore-socket', '/private/socket', { mode: 'ro' });
  assert.equal(f.check().baseline.database.host, '/restore-socket');
  for (const host of ['/restore-socket/../other', '/restore-socket/', '/restore-socket\n']) {
    const g = fixture(); g.baseline.database.host = host; denied(g, 'baseline-database');
  }
});


test('declared mounts require root-controlled nonwritable ancestors as well as exact leaf identities', () => {
  for (const patch of [{ uid: 1000n }, { mode: 0o40775n }, { mode: 0o40757n }]) {
    const f = fixture(); Object.assign(f.files.get('/app'), patch); denied(f, 'path-boundary');
  }
  const f = fixture();
  f.baseline.readonly_mounts.push({ destination: '/opt/config', mount_root: '/protected/config', device: DEVICE, inode: '301', kind: 'directory' });
  f.files.set('/opt', stat('directory', { uid: 1000n })); f.files.set('/opt/config', stat('directory', { ino: 301n }));
  f.mounts += record(4, '/opt/config', '/protected/config', { mode: 'ro' }); denied(f, 'path-boundary');
});


test('invalid UTF8 and same-size path replacement during baseline read are rejected', () => {
  const f = fixture(); f.text = Buffer.from([0x7b, 0xff, 0x7d]); denied(f, 'baseline-encoding');
  const g = fixture(); const original = g.fsApi.readSync;
  let held;
  g.fsApi.fstatSync = () => held;
  const sync = g.sync; g.sync = () => { sync(); held = g.files.get(BASELINE_PATH); };
  g.fsApi.readSync = (...args) => {
    const count = original(...args);
    g.files.set(BASELINE_PATH, { ...held, ino: held.ino + 1n });
    return count;
  };
  denied(g, 'baseline-changed'); assert.equal(g.closes, 1);
});


test('Unix socket database host cannot omit its explicit readonly directory boundary', () => {
  const f = fixture(); f.baseline.database.host = '/restore-socket';
  f.mounts += record(4, '/restore-socket', '/unreviewed/socket', { mode: 'rw' });
  denied(f, 'baseline-socket-mount');
  const g = fixture(); g.baseline.database.host = '/restore-socket';
  g.baseline.readonly_mounts.push({ destination: '/restore-socket', mount_root: '/private/socket', device: DEVICE, inode: '400', kind: 'file' });
  denied(g, 'baseline-socket-mount');
});
