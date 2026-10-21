'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const probe = require('../recovery_upload_probe.cjs');
const name = '.falcon-recovery-proof-' + 'a'.repeat(32);
const bytes = Buffer.from('synthetic original\n');
const metadata = {sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length, uid: 0, gid: 0};
const manifest = () => ({schema_version: 1, files: {'tenant/nested/file.txt': {...metadata}}, probe_directory: name});
const status = (uid = 61001, gid = 61001) => `Name:\tprobe\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\nGid:\t${gid}\t${gid}\t${gid}\t${gid}\nGroups:\t${gid}\nCapInh:\t0000000000000000\nCapPrm:\t0000000000000000\nCapEff:\t0000000000000000\nCapBnd:\t0000000000000000\nCapAmb:\t0000000000000000\nNoNewPrivs:\t1\n`;
const mounts = (uploadMode = 'rw') => `1 0 0:1 / / ro,nosuid - overlay overlay ro\n2 1 8:1 /recovered /app/uploads ${uploadMode},nosuid - ext4 /dev/example ${uploadMode}\n3 1 8:1 /manifest /checks/recovery-files.json ro - ext4 /dev/example ro\n`;
const refused = fn => assert.throws(fn, /Recovery upload permission proof failed/);

test('strict manifest retains numeric ownership and canonical paths', () => {
  const result = probe.validateManifest(manifest());
  assert.equal(result.files.size, 1);
  assert.equal(result.files.get('tenant/nested/file.txt').uid, 0);
  assert.equal(result.probeDirectory, name);
});
test('manifest rejects extra fields, unsafe paths, bad hash/count/ownership and reserved names', () => {
  const changes = [m => {m.extra = true;}, m => {m.schema_version = 2;},
    m => {m.files = {};}, m => {m.probe_directory = '../escape';},
    m => {m.files['tenant/nested/file.txt'].uid = 999;},
    m => {m.files['tenant/nested/file.txt'].gid = 61001;},
    m => {m.files['tenant/nested/file.txt'].sha256 = 'A'.repeat(64);},
    m => {m.files['tenant/nested/file.txt'].bytes = -1;},
    m => {m.files['tenant/nested/file.txt'].bytes = Number.MAX_SAFE_INTEGER + 1;},
    m => {m.files['tenant/nested/file.txt'].other = 1;},
    m => {m.files[name + '/file'] = metadata;},
    m => {m.files.tenant = metadata;}];
  for (const change of changes) {const m = manifest(); change(m); refused(() => probe.validateManifest(m));}
  const m = manifest();
  m.files = Object.fromEntries(Array.from({length: probe.MAX_FILES + 1}, (_, index) => ['file' + index, metadata]));
  refused(() => probe.validateManifest(m));
});
test('relative path validator refuses traversal, separators, controls and excess depth', () => {
  for (const path of ['', '/absolute', '../escape', 'a/../b', 'a//b', 'a/./b', 'a\\b',
    'a\u0000b', 'a\nb', 'a\u0085b', 'a\ud800b', 'x'.repeat(256), Array(65).fill('x').join('/')]) {
    refused(() => probe.validateRelative(path));
  }
  assert.deepEqual(probe.validateRelative('tenant/合法 file.pdf'), ['tenant', '合法 file.pdf']);
});
test('kernel identity requires every uid/gid field, no foreign group, all five zero cap sets and NNP', () => {
  assert.equal(probe.validateStatus(status(), 61001, 61001), true);
  assert.equal(probe.validateStatus(status(999, 0), 999, 0), true);
  assert.equal(probe.validateStatus(status().replace('Groups:\t61001', 'Groups:\t'), 61001, 61001), true);
  for (const changed of [status().replace('61001\t61001\t61001\t61001', '61001\t0\t61001\t61001'),
    status().replace('Groups:\t61001', 'Groups:\t61001 0'), status().replace('NoNewPrivs:\t1', 'NoNewPrivs:\t0'),
    ...['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'].map(key => status().replace(key + ':\t0000000000000000', key + ':\t0000000000000001')),
    status() + 'CapEff:\t0000000000000000\n']) refused(() => probe.validateStatus(changed, 61001, 61001));
});
test('mount proof requires real exact uploads bind, rootfs RO, input RO and no nested mounts', () => {
  for (const mode of ['api', 'backup', 'verify', 'outsider']) assert.equal(probe.validateMounts(mounts(), mode), true);
  assert.equal(probe.validateMounts(mounts('ro'), 'backup-ro'), true);
  for (const [text, mode] of [[mounts(), 'backup-ro'], [mounts('ro'), 'backup'],
    [mounts().replace('/ / ro,nosuid', '/ / rw,nosuid'), 'api'],
    [mounts().replace('/app/uploads', '/app/uploads-other'), 'api'],
    [mounts().replace('/checks/recovery-files.json ro', '/checks/recovery-files.json rw'), 'api'],
    [mounts() + '4 2 8:1 /nested /app/uploads/tenant rw - ext4 /dev/example rw\n', 'api'],
    [mounts() + '5 1 8:1 /again /app/uploads rw - ext4 /dev/example rw\n', 'api']]) {
    refused(() => probe.validateMounts(text, mode));
  }
  assert.equal(probe.decodeMount('/path\\040space'), '/path space');
  refused(() => probe.decodeMount('/path\\099bad'));
});
test('metadata rejects links, unexpected ownership/device/size and special bits', () => {
  const stat = {isFile: () => true, nlink: 1, dev: 1, uid: 0, gid: 0, size: bytes.length, mode: 0o100660};
  probe.validateFileMetadata(stat, metadata, 1);
  for (const changed of [{nlink: 2}, {uid: 999}, {gid: 61001}, {dev: 2}, {size: 0},
    {mode: 0o104660}, {isFile: () => false}]) refused(() => probe.validateFileMetadata({...stat, ...changed}, metadata, 1));
});
test('hash verification uses bounded reads, detects byte changes and unexpected growth', () => {
  const source = content => {let offset = 0; return {readSync(fd, buffer, start, length) {
    const count = Math.min(length, content.length - offset);
    content.copy(buffer, start, offset, offset + count); offset += count; return count;
  }};};
  probe.hashOpenFile(1, metadata, source(bytes));
  refused(() => probe.hashOpenFile(1, metadata, source(Buffer.from('different original\n'))));
  refused(() => probe.hashOpenFile(1, metadata, source(Buffer.concat([bytes, Buffer.from('extra')]))));
  refused(() => probe.hashOpenFile(1, metadata, source(Buffer.alloc(0))));
});
test('denial checks reject unexpected success and unrelated errors; EROFS is restricted to RO proof', () => {
  for (const code of ['EACCES', 'EPERM']) assert.equal(probe.assertDenied(() => {throw {code};}), code);
  assert.equal(probe.assertDenied(() => {throw {code: 'EROFS'};}, true), 'EROFS');
  refused(() => probe.assertDenied(() => {}));
  refused(() => probe.assertDenied(() => {throw {code: 'ENOENT'};}));
  refused(() => probe.assertDenied(() => {throw {code: 'EROFS'};}));
});
test('write-open flags never truncate originals and synthetic plan is entirely reserved', () => {
  assert.equal(probe.OPEN_WRITE_CHECK & fs.constants.O_TRUNC, 0);
  assert.equal(probe.OPEN_WRITE_CHECK & fs.constants.O_CREAT, 0);
  assert.equal(probe.OPEN_WRITE_CHECK & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW);
  assert.equal(probe.OPEN_EXCLUSIVE & fs.constants.O_EXCL, fs.constants.O_EXCL);
  const plan = probe.syntheticPlan(name);
  assert.equal(plan.size, 3);
  assert([...plan.keys()].every(key => key.startsWith(name + '/')));
  assert(plan.has(name + '/delete-probe.txt'));
  for (const value of probe.expectedSynthetic(plan).values()) {assert.equal(value.uid, 61001); assert.equal(value.gid, 0);}
});
test('pre/post application inventories admit only the exact fixed fourth synthetic file', () => {
  const parsed = probe.validateManifest(manifest());
  const before = probe.expectedInventory(parsed, true);
  const after = probe.expectedInventory(parsed, true, true);
  const application = name + '/application.txt';
  assert.equal(before.size, parsed.files.size + 3);
  assert.equal(after.size, parsed.files.size + 4);
  refused(() => probe.expectedFile(application, before, new Set()));
  const expected = probe.expectedFile(application, after, new Set());
  const fixed = Buffer.from('FALCON disposable candidate upload check\n');
  assert.deepEqual(expected, {uid: 61001, gid: 0, bytes: fixed.length,
    sha256: crypto.createHash('sha256').update(fixed).digest('hex')});
  for (const inventory of [before, after]) {
    for (const unknown of [name + '/unexpected.txt', name + '/nested/application.txt',
      name + '/synthetic-random.txt', 'other/application.txt']) {
      refused(() => probe.expectedFile(unknown, inventory, new Set()));
    }
  }
  refused(() => probe.expectedFile(application, after, new Set([application])));
  refused(() => probe.expectedInventory(parsed, false, true));
  assert.equal(probe.syntheticPlan(name).size, 3);
  assert.equal(probe.syntheticPlan(name, true).size, 4);
});
test('after-application is allowed only for post verify/backup modes and verify requires it', () => {
  for (const mode of ['backup', 'backup-ro', 'verify']) probe.validateInvocation(mode, true);
  for (const mode of ['api', 'backup', 'backup-ro', 'outsider']) probe.validateInvocation(mode, false);
  for (const mode of ['api', 'outsider']) refused(() => probe.validateInvocation(mode, true));
  refused(() => probe.validateInvocation('verify', false));
  refused(() => probe.validateInvocation('backup', 'after-application'));
});
test('identity comparison detects replacement or original modification but permits read atime changes', () => {
  const stat = {dev: 1, ino: 2, uid: 0, gid: 0, mode: 0o100640, nlink: 1, size: 4, mtimeMs: 100, atimeMs: 200};
  assert.equal(probe.sameIdentity(stat, {...stat, atimeMs: 201}), true);
  for (const key of ['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size', 'mtimeMs']) {
    assert.equal(probe.sameIdentity(stat, {...stat, [key]: stat[key] + 1}), false);
  }
});
test('API creates exclusively inside reserved tree, sets umask first and retains default/staff mode requests', () => {
  const events = [];
  const fake = {mkdirSync: (...args) => events.push(['mkdir', ...args]),
    openSync: (...args) => {events.push(['open', ...args]); return 42;},
    writeFileSync: (fd, data) => events.push(['write', fd, data]),
    fsyncSync: fd => events.push(['sync', fd]), closeSync: fd => events.push(['close', fd])};
  probe.createSynthetic(probe.validateManifest(manifest()), fake, mask => events.push(['umask', mask]));
  assert.deepEqual(events[0], ['umask', 0o027]);
  const opens = events.filter(event => event[0] === 'open');
  assert.equal(opens.length, 3);
  for (const [kind, target, flags, mode] of opens) {
    assert(target.startsWith('/app/uploads/' + name + '/'));
    assert.equal(flags & fs.constants.O_EXCL, fs.constants.O_EXCL);
    assert.equal(flags & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW);
    assert.equal(mode, target.endsWith('/staff.txt') ? 0o660 : 0o666);
  }
  assert.equal(events.filter(event => event[0] === 'mkdir').length, 2);
  assert(events.filter(event => event[0] === 'mkdir').every(event => event.length === 2));
});
test('backup denial probes only create/remove reserved synthetic targets and fail if unlink succeeds', () => {
  const attempts = [];
  const denied = (kind, code = 'EACCES') => target => {attempts.push([kind, target]); throw {code};};
  const fake = {openSync: denied('open'), mkdirSync: denied('mkdir'), unlinkSync: denied('unlink')};
  assert.equal(probe.backupDenials(probe.validateManifest(manifest()), false, fake), 0);
  assert.equal(attempts.length, 3);
  assert(attempts.every(([, target]) => target.startsWith('/app/uploads/' + name + '/')));
  assert.equal(attempts.find(([kind]) => kind === 'unlink')[1], '/app/uploads/' + name + '/delete-probe.txt');
  const unexpected = {...fake, unlinkSync: target => {attempts.push(['unexpected-unlink', target]);}};
  refused(() => probe.backupDenials(probe.validateManifest(manifest()), false, unexpected));
  const ro = {openSync: denied('open', 'EROFS'), mkdirSync: denied('mkdir', 'EROFS'), unlinkSync: denied('unlink', 'EROFS')};
  assert.equal(probe.backupDenials(probe.validateManifest(manifest()), true, ro), 3);
});
test('CLI failures are fixed and do not expose supplied paths or raw exception details', () => {
  const {spawnSync} = require('node:child_process');
  const result = spawnSync(process.execPath, [require.resolve('../recovery_upload_probe.cjs'), 'secret-path-mode'], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Recovery upload permission proof failed\n');
  for (const args of [['api', 'after-application'], ['verify'], ['backup', 'unknown-flag']]) {
    const invalid = spawnSync(process.execPath, [require.resolve('../recovery_upload_probe.cjs'), ...args], {encoding: 'utf8'});
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.equal(invalid.stderr, 'Recovery upload permission proof failed\n');
  }
});
