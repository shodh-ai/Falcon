#!/usr/bin/env python3
"""Reviewed, fixed-scope Linux uploads ACL adoption. No content/owner changes.

The root-preparation release must be the only application RW consumer: umask0027,
explicit persistent stream mode0660, default-mode other persistent writers, and
no persistent rename/chmod/copy-in. This is an operational/source-review gate,
not a claim that arbitrary concurrent filesystem writers can be made atomic.
The separately pinned existing administrative ancestor bind requires its explicit
identity, process and read-only denial proof; Docker admin authority is acknowledged.

Evidence and synthetic fixtures are retained. There is NO automatic rollback,
deletion, chown, recursive pathname chmod, generic setfacl --restore, or retry of
unsafe inode/name changes. Rollback is only for unchanged journaled inodes and
must be reviewed separately before later UID61001 writers are introduced.
"""
import argparse
import base64
import contextlib
import errno
import grp
import hashlib
import json
import os
import pwd
import re
import select
import signal
import stat
import struct
import subprocess
import sys
import time
import uuid

SOURCE = '/data/coolify/applications/pmy0ybhwzco11kocu0zloqk0/uploads'
EVIDENCE_BASE = '/data/falcon-backups'
API_UID = API_GID = 61001
BACKUP_UID, BACKUP_GID = 999, 0
ACL_ACCESS = 'system.posix_acl_access'
ACL_DEFAULT = 'system.posix_acl_default'
UOBJ, USER, GOBJ, MASK, OTHER = 1, 2, 4, 16, 32
UNDEFINED = 0xffffffff
MAX_ENTRIES, MAX_PASSES = 3000, 4
IMAGE_RE = re.compile(r'^sha256:[0-9a-f]{64}$')
REV_RE = re.compile(r'^[0-9a-f]{40}$')
DOCKER = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
SAFE_ENV = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}
CONTROL_ID = '780b6fe7ae612e6b42c432d2ddb3bbd4f97a1099ad93dd0a066b1a4c55d2cee1'
CONTROL_IMAGE = 'sha256:7c54f42d64c0d20fed4a8f4561df9018a561fecba9931ed3f64a4f3e0d34a3be'
CONTROL_SOURCE = '/data/coolify/applications'
CONTROL_DEST = '/var/www/html/storage/app/applications'
CONTROL_UPLOADS = CONTROL_DEST + '/pmy0ybhwzco11kocu0zloqk0/uploads'
CONTROL_UID = CONTROL_GID = 9999

CONTROL_PHP = r'''$p='/var/www/html/storage/app/applications/pmy0ybhwzco11kocu0zloqk0/uploads';
if(!function_exists('posix_geteuid')||!function_exists('posix_getgroups')){exit(2);}
clearstatcache(true,$p);$s=@lstat($p);if($s===false){exit(2);}
$text=@file_get_contents('/proc/self/status');$caps=[];
foreach(['CapInh','CapPrm','CapEff','CapAmb','CapBnd','NoNewPrivs'] as $k){
 if(!preg_match('/^'.$k.':\s*([0-9a-f]+)\s*$/m',$text,$m)){exit(2);}$caps[$k]=$m[1];}
echo json_encode(['uid'=>posix_getuid(),'euid'=>posix_geteuid(),
 'gid'=>posix_getgid(),'egid'=>posix_getegid(),'groups'=>array_values(posix_getgroups()),
 'device'=>$s['dev'],'inode'=>$s['ino'],'owner'=>$s['uid'],'group'=>$s['gid'],
 'mode'=>$s['mode'],'searchable'=>is_executable($p),'writable'=>is_writable($p),
 'caps'=>$caps],JSON_THROW_ON_ERROR);'''


class Refused(Exception):
    """Only fixed, non-sensitive codes reach stdout."""


def require(condition, code):
    if not condition:
        raise Refused(code)


def script_digest():
    with open(__file__, 'rb') as source:
        return hashlib.sha256(source.read()).hexdigest()


def script_unchanged(expected):
    require(re.fullmatch('[0-9a-f]{64}', expected) and script_digest() == expected,
            'helper-code-digest')


@contextlib.contextmanager
def operation_deadline(seconds=180):
    # A single dispatcher process only. Filesystem D-state is a kernel limit:
    # no userspace timeout can promise immediate interruption of such an I/O.
    def expired(_signum, _frame):
        raise Refused('operation-timeout')
    old_alarm = signal.signal(signal.SIGALRM, expired)
    old_term = signal.signal(signal.SIGTERM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old_alarm)
        signal.signal(signal.SIGTERM, old_term)


def encode_acl(entries):
    return struct.pack('<I', 2) + b''.join(
        struct.pack('<HHI', tag, permissions, ident)
        for tag, permissions, ident in entries)


def decode_acl(blob):
    require(isinstance(blob, bytes) and len(blob) >= 28 and
            (len(blob) - 4) % 8 == 0 and struct.unpack('<I', blob[:4])[0] == 2,
            'acl-encoding')
    entries = [struct.unpack('<HHI', blob[i:i + 8])
               for i in range(4, len(blob), 8)]
    require(all(p <= 7 for _, p, _ in entries), 'acl-permissions')
    return entries


def access_acl(owner, group, other, directory):
    # Existing group/other entry stays EXACT. Mode group bits become mask bits.
    return encode_acl([(UOBJ, owner, UNDEFINED),
                       (USER, 7 if directory else 6, API_UID),
                       (GOBJ, group, UNDEFINED),
                       (MASK, 7 if directory else 6, UNDEFINED),
                       (OTHER, other, UNDEFINED)])


def default_acl(group):
    # NEW objects are private to API and original group0, matching umask0027.
    return encode_acl([(UOBJ, 7, UNDEFINED), (USER, 7, API_UID),
                       (GOBJ, group, UNDEFINED), (MASK, 7, UNDEFINED),
                       (OTHER, 0, UNDEFINED)])


def get_acl(fd, name):
    try:
        return os.getxattr(fd, name)
    except OSError as error:
        if error.errno == errno.ENODATA:
            return None
        raise Refused('acl-read') from None


def set_acl(fd, name, blob):
    # Python3.9 passes this fd to fsetxattr; no pathname resolution/magic links.
    if blob is None:
        try:
            os.removexattr(fd, name)
        except OSError as error:
            if error.errno != errno.ENODATA:
                raise
    else:
        os.setxattr(fd, name, blob)


def b64(blob):
    return None if blob is None else base64.b64encode(blob).decode('ascii')


def identity(st):
    return [st.st_dev, st.st_ino, stat.S_IFMT(st.st_mode), st.st_uid, st.st_gid]


def mount_id(fd):
    with open('/proc/self/fdinfo/{}'.format(fd), 'r', encoding='ascii') as stream:
        values = [line.split(':', 1)[1].strip() for line in stream
                  if line.startswith('mnt_id:')]
    require(len(values) == 1 and values[0].isdigit(), 'fd-mount-id')
    return int(values[0])


def named_source_matches(root):
    parent = trusted_directory(os.path.dirname(SOURCE))
    try:
        named = os.open(os.path.basename(SOURCE), os.O_RDONLY | os.O_DIRECTORY |
                        os.O_NOFOLLOW, dir_fd=parent)
        try:
            require(identity(os.fstat(named)) == identity(os.fstat(root)) and
                    mount_id(named) == mount_id(root), 'named-source-changed')
        finally:
            os.close(named)
    finally:
        os.close(parent)


def open_child(parent, name, expected_mount):
    # O_PATH first is inert even for a swapped device/FIFO/symlink. Only reopen
    # the validated pinned regular/directory inode through our own held procFD.
    inert = os.open(name, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
    try:
        st = os.fstat(inert)
        require(stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode), 'source-type-before-open')
        require(mount_id(inert) == expected_mount, 'source-child-mount')
        flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NONBLOCK
        if stat.S_ISDIR(st.st_mode):
            flags |= os.O_DIRECTORY
        fd = os.open('/proc/self/fd/{}'.format(inert), flags)
        try:
            require(identity(os.fstat(fd)) == identity(st) and
                    mount_id(fd) == expected_mount, 'source-open-race')
        except BaseException:
            os.close(fd)
            raise
        return fd
    finally:
        os.close(inert)


def trusted_directory(path, private=False):
    require(os.path.isabs(path) and os.path.normpath(path) == path, 'directory-path')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in path.split('/')[1:]:
            new_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                             dir_fd=fd)
            os.close(fd)
            fd = new_fd
            st = os.fstat(fd)
            require(st.st_uid == 0 and not st.st_mode & 0o022,
                    'untrusted-directory-ancestor')
        if private:
            require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700,
                    'evidence-not-private')
        return fd
    except BaseException:
        os.close(fd)
        raise


def check_no_nested_mounts():
    with open('/proc/self/mountinfo', 'r', encoding='ascii') as stream:
        for line in stream:
            fields = line.split()
            require(len(fields) >= 10, 'mountinfo')
            dest = re.sub(r'\\([0-7]{3})',
                          lambda m: chr(int(m.group(1), 8)), fields[4])
            require(not dest.startswith(SOURCE + '/'), 'nested-source-mount')


def run_json(command, limit=4 * 1024 * 1024):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=20, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
    require(result.returncode == 0 and len(result.stdout) <= limit, 'command-failed')
    try:
        return json.loads(result.stdout)
    except (ValueError, UnicodeError):
        raise Refused('command-json') from None


def source_overlaps(path):
    if not isinstance(path, str) or not path.startswith('/'):
        return False
    # Normalize components and collapse the special POSIX double-leading slash;
    # '/' is an ancestor too, and must never disappear behind a '//' prefix test.
    normalized = os.path.normpath('/' + path.lstrip('/'))
    common = os.path.commonpath((normalized, SOURCE))
    return common in (normalized, SOURCE)


def control_processes(container_id, leader):
    result = subprocess.run(DOCKER + ['top', container_id, '-eo', 'pid'],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=10, env=SAFE_ENV)
    require(result.returncode == 0 and len(result.stdout) <= 65536, 'control-plane-process-list')
    lines = result.stdout.decode('ascii').splitlines()
    require(lines and lines[0].strip() == 'PID', 'control-plane-process-header')
    pids = [line.strip() for line in lines[1:] if line.strip()]
    require(0 < len(pids) <= 200 and len(pids) == len(set(pids)) and
            all(p.isdigit() and int(p) > 1 for p in pids) and str(leader) in pids,
            'control-plane-process-pids')
    snapshots = {}
    def starttime(pid):
        with open('/proc/{}/stat'.format(pid), 'r', encoding='ascii') as stream:
            raw = stream.read(8192)
        require(raw.startswith(pid + ' (') and ') ' in raw, 'control-plane-process-stat')
        fields = raw[raw.rfind(') ') + 2:].split()
        require(len(fields) >= 20 and fields[19].isdigit(), 'control-plane-process-starttime')
        return fields[19]
    for pid in pids:
        started = starttime(pid)
        with open('/proc/{}/status'.format(pid), 'r', encoding='ascii') as stream:
            raw = stream.read(16384)
        fields = dict(line.split(':', 1) for line in raw.splitlines() if ':' in line)
        require(fields.get('Uid', '').split() == [str(CONTROL_UID)] * 4 and
                fields.get('Gid', '').split() == [str(CONTROL_GID)] * 4 and
                fields.get('Groups', '').split() and
                all(g == str(CONTROL_GID) for g in fields['Groups'].split()),
                'control-plane-process-identity')
        for cap in ('CapInh', 'CapPrm', 'CapEff', 'CapAmb'):
            value = fields.get(cap, '').strip()
            require(re.fullmatch('[0-9a-f]{1,16}', value) and int(value, 16) == 0,
                    'control-plane-process-active-caps')
        bounding = fields.get('CapBnd', '').strip()
        nnp = fields.get('NoNewPrivs', '').strip()
        require(re.fullmatch('[0-9a-f]{1,16}', bounding) and nnp in ('0', '1'),
                'control-plane-process-metadata')
        require(starttime(pid) == started, 'control-plane-process-reused')
        snapshots[pid] = {'starttime': started, 'bounding': bounding, 'nnp': nnp}
    return snapshots


def verify_control_plane(container, overlapping, device, inode):
    require(container.get('Id') == CONTROL_ID and container.get('Image') == CONTROL_IMAGE and
            container.get('State', {}).get('Running') is True and
            container.get('Config', {}).get('User') == 'www-data' and len(overlapping) == 1 and
            overlapping[0].get('Source') == CONTROL_SOURCE and
            overlapping[0].get('Destination') == CONTROL_DEST and overlapping[0].get('RW') is True,
            'control-plane-exception-identity')
    require(isinstance(device, int) and isinstance(inode, int) and device >= 0 and inode > 0,
            'control-plane-source-identity-required')
    # Other mounts may not shadow this application's mapped uploads root. A
    # broader parent mount above CONTROL_DEST does not override its child bind.
    for mount in container.get('Mounts', []):
        if mount is overlapping[0]:
            continue
        dest = mount.get('Destination', '')
        require(isinstance(dest, str) and dest.startswith('/'), 'control-plane-mount-destination')
        normalized = os.path.normpath('/' + dest.lstrip('/'))
        if normalized == CONTROL_DEST or normalized.startswith(CONTROL_DEST + '/'):
            common = os.path.commonpath((normalized, CONTROL_UPLOADS))
            require(common not in (normalized, CONTROL_UPLOADS), 'control-plane-shadowed-uploads')
    leader = container['State'].get('Pid')
    require(isinstance(leader, int) and leader > 1, 'control-plane-leader')
    before = control_processes(CONTROL_ID, leader)
    proof = run_json(DOCKER + ['exec', CONTROL_ID, 'php', '-r', CONTROL_PHP], limit=4096)
    require(proof.get('uid') == proof.get('euid') == CONTROL_UID and
            proof.get('gid') == proof.get('egid') == CONTROL_GID and
            isinstance(proof.get('groups'), list) and proof['groups'] and
            all(g == CONTROL_GID for g in proof['groups']) and
            proof.get('device') == device and proof.get('inode') == inode and
            proof.get('owner') == proof.get('group') == 0 and
            isinstance(proof.get('mode'), int) and stat.S_ISDIR(proof['mode']) and
            proof.get('searchable') is False and proof.get('writable') is False,
            'control-plane-uploads-denial')
    caps = proof.get('caps', {})
    for cap in ('CapInh', 'CapPrm', 'CapEff', 'CapAmb'):
        value = caps.get(cap, '')
        require(isinstance(value, str) and re.fullmatch('[0-9a-f]{1,16}', value) and
                int(value, 16) == 0, 'control-plane-probe-active-caps')
    require(re.fullmatch('[0-9a-f]{1,16}', caps.get('CapBnd', '')) and
            caps.get('NoNewPrivs') in ('0', '1'), 'control-plane-probe-metadata')
    after = control_processes(CONTROL_ID, leader)
    for pid in before.keys() & after.keys():
        require(before[pid]['starttime'] == after[pid]['starttime'], 'control-plane-process-reused')
    current = run_json(DOCKER + ['inspect', CONTROL_ID])
    require(len(current) == 1 and current[0].get('Id') == CONTROL_ID and
            current[0].get('Image') == CONTROL_IMAGE and
            current[0].get('State', {}).get('Running') is True and
            current[0]['State'].get('Pid') == leader and
            current[0].get('Mounts') == container.get('Mounts'),
            'control-plane-changed-during-proof')
    return {'container_id': CONTROL_ID, 'image': CONTROL_IMAGE, 'uid': CONTROL_UID,
            'gid': CONTROL_GID, 'before_process_count': len(before),
            'after_process_count': len(after), 'uploads_same_inode': True,
            'uploads_search_write_denied': True, 'active_capability_sets_zero': True,
            'bounding_sets_observed': sorted({x['bounding'] for x in after.values()}),
            'no_new_privs_observed': sorted({x['nnp'] for x in after.values()}),
            'existing_docker_admin_authority_acknowledged': True}


def runtime_precondition(image, revision, control_container=None, control_image=None,
                         expected_device=None, expected_inode=None):
    require(IMAGE_RE.fullmatch(image) and REV_RE.fullmatch(revision), 'release-identity')
    approved_control = control_container is not None or control_image is not None
    if approved_control:
        require(control_container == CONTROL_ID and control_image == CONTROL_IMAGE,
                'control-plane-approval-pins')
    try:
        pwd.getpwuid(API_UID)
    except KeyError:
        pass
    else:
        raise Refused('host-uid-collision')
    try:
        grp.getgrgid(API_GID)
    except KeyError:
        pass
    else:
        raise Refused('host-gid-collision')
    inspected = run_json(DOCKER + ['image', 'inspect', image])
    require(len(inspected) == 1 and inspected[0]['Id'] == image and
            inspected[0].get('Config', {}).get('Labels', {}).get(
                'org.opencontainers.image.revision') == revision,
            'root-prep-image-revision')
    image_config = inspected[0]['Config']
    listed = subprocess.run(DOCKER + ['ps', '-q', '--no-trunc'],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=10, env=SAFE_ENV)
    ids = listed.stdout.decode('ascii').split()
    require(listed.returncode == 0 and 0 < len(ids) <= 200 and
            all(re.fullmatch('[0-9a-f]{64}', cid) for cid in ids), 'container-list')
    containers = run_json(DOCKER + ['inspect'] + ids)
    matched = 0
    control_proof = None
    for container in containers:
        relevant = [m for m in container.get('Mounts', [])
                    if m.get('Type') == 'bind' and m.get('RW') is True and
                    source_overlaps(m.get('Source'))]
        if not relevant:
            continue
        if approved_control and container.get('Id') == CONTROL_ID:
            require(control_proof is None, 'control-plane-duplicate')
            control_proof = verify_control_plane(container, relevant, expected_device, expected_inode)
            continue
        require(len(relevant) == 1 and relevant[0]['Source'] == SOURCE and
                relevant[0]['Destination'] == '/app/uploads' and
                container.get('Image') == image and
                container.get('Config', {}).get('User', '') in ('', '0', '0:0', 'root', 'root:root') and
                container.get('State', {}).get('Running') is True,
                'unreviewed-rw-consumer')
        config = container.get('Config', {})
        require(config.get('Cmd') == image_config.get('Cmd') and
                config.get('Entrypoint') == image_config.get('Entrypoint') and
                config.get('WorkingDir') == image_config.get('WorkingDir') == '/app',
                'root-prep-command-override')
        for mount in container.get('Mounts', []):
            dest = mount.get('Destination', '')
            require(dest == '/app/uploads' or not any(
                dest == prefix or dest.startswith(prefix + '/') or
                prefix.startswith(dest + '/')
                for prefix in ('/app', '/usr', '/bin', '/sbin', '/lib', '/lib64')),
                'root-prep-code-mount-override')
        pid = container['State'].get('Pid')
        require(isinstance(pid, int) and pid > 1, 'root-prep-pid')
        with open('/proc/{}/status'.format(pid), 'r', encoding='ascii') as stream:
            status = dict(line.rstrip().split(':', 1) for line in stream if ':' in line)
        require(status.get('Umask', '').strip() == '0027' and
                status.get('Uid', '').split() == ['0'] * 4, 'root-prep-umask')
        matched += 1
    require(matched > 0, 'root-prep-missing')
    require(not approved_control or control_proof is not None, 'approved-control-plane-missing')
    return {'root_prep_consumers': matched, 'image': image, 'revision': revision,
            'process_umask': '0027', 'approved_control_plane': control_proof}


def runtime_policy(args):
    return runtime_precondition(args.expected_image, args.expected_revision,
                                args.approved_control_plane_container,
                                args.approved_control_plane_image,
                                args.expected_device, args.expected_inode)


class Journal:
    def __init__(self, path):
        require(path.startswith(EVIDENCE_BASE + '/') and
                os.path.dirname(path) == EVIDENCE_BASE and
                re.fullmatch(r'upload-acl-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}',
                             os.path.basename(path)), 'evidence-path')
        parent = trusted_directory(EVIDENCE_BASE, private=True)
        try:
            os.mkdir(os.path.basename(path), 0o700, dir_fd=parent)
            os.fsync(parent)
        finally:
            os.close(parent)
        self.path = path
        self.fd = trusted_directory(path, private=True)
        self.stream = os.open('inode-journal.jsonl', os.O_WRONLY | os.O_CREAT |
                              os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
        os.fsync(self.fd)

    def record(self, value):
        payload = json.dumps(value, sort_keys=True, separators=(',', ':')).encode() + b'\n'
        require(len(payload) <= 32768, 'evidence-record-size')
        view = memoryview(payload)
        while view:
            view = view[os.write(self.stream, view):]
        os.fsync(self.stream)

    def finish(self, report):
        fd = os.open('result.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
        try:
            payload = json.dumps(report, sort_keys=True).encode() + b'\n'
            require(os.write(fd, payload) == len(payload), 'evidence-write')
            os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(self.fd)

    def close(self):
        os.close(self.stream)
        os.close(self.fd)


class Adoption:
    def __init__(self, journal, source_fd):
        self.journal, self.root = journal, source_fd
        self.observed = {}
        self.initial = {}
        self.protected = set()
        self.changed = 0
        self.mount = mount_id(source_fd)
        self.deadline = time.monotonic() + 170

    def check(self):
        require(time.monotonic() < self.deadline, 'adoption-deadline')

    def capture(self, fd, relative):
        self.check()
        st = os.fstat(fd)
        require(mount_id(fd) == self.mount, 'source-mount-changed')
        directory = stat.S_ISDIR(st.st_mode)
        require(directory or stat.S_ISREG(st.st_mode), 'source-type')
        require(st.st_uid == 0 and st.st_gid == 0 and
                st.st_dev == os.fstat(self.root).st_dev, 'source-owner-device')
        require(directory or st.st_nlink == 1, 'source-hardlink')
        access, default = get_acl(fd, ACL_ACCESS), get_acl(fd, ACL_DEFAULT)
        if relative in self.initial:
            require(identity(st) == self.initial[relative]['identity'], 'initial-inode-changed')
        prior = self.observed.get(relative)
        if prior:
            require(identity(st) == prior['identity'], 'source-inode-changed')
            require(access == base64.b64decode(prior['after_access']) and
                    default == (base64.b64decode(prior['after_default'])
                                if prior['after_default'] else None) and
                    stat.S_IMODE(st.st_mode) == prior['after_mode'],
                    'source-state-changed')
            if directory:
                self.protected.add(relative)
            return prior, False
        if relative in self.initial:
            require(stat.S_IMODE(st.st_mode) == self.initial[relative]['mode'] and
                    access is None and default is None, 'initial-metadata-changed')
        require(len(self.observed) < MAX_ENTRIES, 'entry-limit')
        mode = stat.S_IMODE(st.st_mode)
        protected_parent = relative != '' and relative.rpartition('/')[0] in self.protected
        if access is None and default is None:
            allowed = ((0o750, 0o755) if directory else (0o640, 0o644))
            if relative not in self.initial:
                require(protected_parent, 'new-object-parent-unproven')
                # mkdir between parent's SGID and default-ACL syscalls inherits
                # SGID but still uses reviewed default0777 & umask0027 =>02750.
                allowed = (0o750, 0o2750) if directory else (0o640,)
            require(mode in allowed,
                    'source-basic-mode')
            owner, group, other = (mode >> 6) & 7, (mode >> 3) & 7, mode & 7
            after_access = access_acl(owner, group, other, directory)
            after_default = default_acl(group) if directory else None
            after_mode = ((mode & 0o707) | (0o70 if directory else 0o60) |
                          (0o2000 if directory else 0))
            inherited = False
        else:
            # Only EXACT inherited root-prep states are allowed after a parent
            # was already protected in THIS invocation. Pre-existing extended
            # ACLs fail the initial read-only snapshot below.
            require(protected_parent and relative not in self.initial,
                    'inherited-parent-unproven')
            entries = decode_acl(access) if access else []
            expected = [(UOBJ, 7 if directory else 6, UNDEFINED),
                        (USER, 7, API_UID), (GOBJ, 5, UNDEFINED),
                        (MASK, 7 if directory else 6, UNDEFINED),
                        (OTHER, 0, UNDEFINED)]
            require(entries == expected and
                    default == (default_acl(5) if directory else None) and
                    mode == (0o2770 if directory else 0o660), 'unexplained-complex-acl')
            after_access, after_default, after_mode = access, default, mode
            inherited = True
        raw = subprocess.run(['/usr/bin/getfacl', '-p', '-n', '-E', '--',
                              '/proc/self/fd/{}'.format(fd)], pass_fds=(fd,),
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             timeout=10, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
        require(raw.returncode == 0 and len(raw.stdout) <= 8192, 'getfacl-snapshot')
        record = {'kind': 'before-inode', 'path': relative, 'identity': identity(st),
                  'mode': mode, 'access': b64(access), 'default': b64(default),
                  'numeric_getfacl': raw.stdout.decode('ascii'), 'inherited': inherited,
                  'after_access': b64(after_access), 'after_default': b64(after_default),
                  'after_mode': after_mode}
        self.journal.record(record)  # Durable BEFORE the first metadata change.
        self.observed[relative] = record
        if inherited and directory:
            self.protected.add(relative)
        return record, not inherited

    def walk(self, fd, relative='', mutate=True, snapshot_only=False, depth=0):
        self.check()
        require(depth <= 64 and len(os.fsencode(relative)) <= 4096, 'source-depth-path')
        before = os.fstat(fd)
        require(mount_id(fd) == self.mount, 'source-mount-changed')
        if snapshot_only:
            require(get_acl(fd, ACL_ACCESS) is None and get_acl(fd, ACL_DEFAULT) is None,
                    'preexisting-complex-acl')
            directory = stat.S_ISDIR(before.st_mode)
            require(before.st_uid == before.st_gid == 0 and
                    before.st_dev == os.fstat(self.root).st_dev and
                    (directory or stat.S_ISREG(before.st_mode) and before.st_nlink == 1),
                    'initial-source-state')
            require(stat.S_IMODE(before.st_mode) in
                    ((0o750, 0o755) if directory else (0o640, 0o644)),
                    'initial-source-mode')
            require(len(self.initial) < MAX_ENTRIES, 'initial-entry-limit')
            self.initial[relative] = {'identity': identity(before),
                                      'mode': stat.S_IMODE(before.st_mode)}
            # Retained full numeric ACL snapshot before any adoption mutation.
            raw = subprocess.run(['/usr/bin/getfacl', '-p', '-n', '-E', '--',
                                  '/proc/self/fd/{}'.format(fd)], pass_fds=(fd,),
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 timeout=10, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
            require(raw.returncode == 0 and len(raw.stdout) <= 8192, 'initial-getfacl')
            self.journal.record({'kind': 'initial-snapshot', 'path': relative,
                                 'identity': identity(before),
                                 'mode': stat.S_IMODE(before.st_mode),
                                 'numeric_getfacl': raw.stdout.decode('ascii')})
        else:
            record, needs_change = self.capture(fd, relative)
            if needs_change:
                require(mutate, 'unadopted-object')
                # SGID BEFORE installing access ACL; chmod afterwards using
                # original group bits would accidentally clip API's mask.
                if stat.S_ISDIR(before.st_mode):
                    os.fchmod(fd, record['mode'] | 0o2000)
                set_acl(fd, ACL_ACCESS, base64.b64decode(record['after_access']))
                if record['after_default']:
                    set_acl(fd, ACL_DEFAULT, base64.b64decode(record['after_default']))
                os.fsync(fd)
                self.changed += 1
                self.capture(fd, relative)
        if stat.S_ISDIR(before.st_mode):
            # Default ACL and SGID are now established BEFORE child enumeration.
            names = sorted(os.listdir(fd))
            require(len(names) <= MAX_ENTRIES, 'directory-entry-limit')
            for name in names:
                require(name not in ('.', '..') and '/' not in name and
                        not any(ord(c) < 32 or ord(c) == 127 for c in name),
                        'source-name')
                child_path = name if not relative else relative + '/' + name
                self.check()
                child = open_child(fd, name, self.mount)
                try:
                    self.walk(child, child_path, mutate, snapshot_only, depth + 1)
                    current = os.stat(name, dir_fd=fd, follow_symlinks=False)
                    require(identity(current) == identity(os.fstat(child)),
                            'source-name-replaced')
                finally:
                    os.close(child)
        require(identity(os.fstat(fd)) == identity(before), 'source-inode-changed')

    def reconcile(self):
        for _ in range(MAX_PASSES):
            count = len(self.observed)
            self.walk(self.root)
            # Every previously observed name must remain and name the held
            # identity again. New objects are allowed; deletions/moves are not.
            found = set()
            def visit(fd, path='', depth=0):
                self.check()
                require(depth <= 64 and len(found) < MAX_ENTRIES, 'reconcile-limit')
                found.add(path)
                if stat.S_ISDIR(os.fstat(fd).st_mode):
                    for name in sorted(os.listdir(fd)):
                        child = open_child(fd, name, self.mount)
                        try:
                            if path in self.observed:
                                require(identity(os.fstat(fd)) == self.observed[path]['identity'],
                                        'reconcile-inode')
                            visit(child, name if not path else path + '/' + name, depth + 1)
                        finally:
                            os.close(child)
            visit(self.root)
            require((set(self.initial) | set(self.observed)).issubset(found),
                    'source-name-vanished')
            if len(self.observed) == count and found == set(self.observed):
                self.walk(self.root, mutate=False)
                return
        raise Refused('concurrent-create-retry-limit')


def adopt(args):
    require(sys.platform.startswith('linux') and os.geteuid() == 0, 'linux-root-required')
    require(args.source_review_confirmed, 'source-review-required')
    script_unchanged(args.expected_script_sha256)
    release = runtime_policy(args)
    check_no_nested_mounts()
    root = trusted_directory(SOURCE)
    journal = None
    try:
        st = os.fstat(root)
        require(st.st_dev == args.expected_device and st.st_ino == args.expected_inode and
                st.st_uid == st.st_gid == 0 and stat.S_IMODE(st.st_mode) == 0o750,
                'source-root-identity')
        journal = Journal(args.evidence_dir)
        journal.record({'kind': 'policy', 'schema_version': 1, 'source': SOURCE,
                        'root_identity': identity(st), 'release': release,
                        'script_sha256': args.expected_script_sha256,
                        'api_uid': API_UID, 'api_gid': API_GID,
                        'backup_uid': BACKUP_UID, 'backup_gid': BACKUP_GID,
                        'default_other': 0, 'started_at': int(time.time())})
        adoption = Adoption(journal, root)
        adoption.walk(root, snapshot_only=True)
        journal.record({'kind': 'initial-snapshot-complete'})
        if args.mode == 'audit':
            named_source_matches(root)
            runtime_policy(args)
            script_unchanged(args.expected_script_sha256)
            report = {'ok': True, 'snapshot_entries': len(adoption.initial),
                      'adoption_applied': False, 'source_metadata_changed': False,
                      'source_contents_written': False,
                      'source_ownership_changed': False}
            journal.finish(report)
            return report
        # This fixture evidence must be copied from a successful execution of
        # THIS exact script and image. Its digest is owner supplied explicitly.
        require(verify_fixture(args.fixture_report, args.fixture_sha256,
                               args.expected_image, args.expected_device), 'fixture-proof')
        named_source_matches(root)
        runtime_policy(args)
        adoption.walk(root)
        adoption.reconcile()
        runtime_policy(args)
        check_no_nested_mounts()
        named_source_matches(root)
        require(identity(os.fstat(root)) == identity(st), 'source-root-changed')
        script_unchanged(args.expected_script_sha256)
        report = {'ok': True, 'entries': len(adoption.observed),
                  'adoption_applied': True,
                  'changed_entries': adoption.changed, 'finished_at': int(time.time()),
                  'source_contents_written': False, 'source_ownership_changed': False,
                  'backup_identity_changed': False, 'default_other': 0,
                  'future_chmod_rename_private_modes_supported': False,
                  'atomic_against_arbitrary_writers': False}
        journal.finish(report)
        return report
    except BaseException as error:
        if journal:
            try:
                journal.finish({'ok': False, 'error_code':
                                str(error) if isinstance(error, Refused) else 'operation-failed',
                                'partial_metadata_retained': True,
                                'automatic_rollback_attempted': False})
            except BaseException:
                pass
        raise
    finally:
        if journal:
            journal.close()
        os.close(root)


def verify_fixture(path, expected_sha, image, expected_device):
    require(re.fullmatch('[0-9a-f]{64}', expected_sha), 'fixture-digest')
    parent = trusted_directory(os.path.dirname(path), private=True)
    try:
        fd = os.open(os.path.basename(path), os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
        try:
            st = os.fstat(fd)
            require(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1 and
                    stat.S_IMODE(st.st_mode) == 0o600 and st.st_size < 8192,
                    'fixture-report-protection')
            data = os.read(fd, 8192)
        finally:
            os.close(fd)
    finally:
        os.close(parent)
    require(hashlib.sha256(data).hexdigest() == expected_sha, 'fixture-report-digest')
    report = json.loads(data)
    script_hash = script_digest()
    return (report.get('ok') is True and report.get('image') == image and
            report.get('script_sha256') == script_hash
            and report.get('filesystem_device') == expected_device
            and report.get('api_uid') == API_UID and report.get('api_gid') == API_GID and
            all(report.get(k) is True for k in
                ('nested_sgid_gid0', 'api_rw', 'backup_read_no_write',
                 'outsider_denied', 'read_only_container', 'private_mode_limit_confirmed')))


def run_identity(root_fd, uid, gid, operation):
    """Fork only for synthetic fixture; never used by source adoption."""
    read_fd, write_fd = os.pipe()
    pid = os.fork()
    if pid == 0:
        try:
            os.close(read_fd)
            os.fchdir(root_fd)  # Private ancestor is intentionally not exposed.
            for entry in os.listdir('/proc/self/fd'):
                number = int(entry)
                if number > 2 and number != write_fd:
                    try:
                        os.close(number)
                    except OSError:
                        pass
            os.setgroups([])
            os.setgid(gid)
            os.setuid(uid)
            require(os.getresuid() == (uid, uid, uid) and
                    os.getresgid() == (gid, gid, gid) and
                    os.getgroups() == [], 'fixture-child-identity')
            with open('/proc/self/status', 'r', encoding='ascii') as stream:
                fields = dict(line.rstrip().split(':', 1) for line in stream if ':' in line)
            require(int(fields['CapEff'].strip(), 16) == 0 and
                    int(fields['CapPrm'].strip(), 16) == 0, 'fixture-child-caps')
            result = operation()
            data = json.dumps({'ok': True, 'result': result}, sort_keys=True).encode()
        except BaseException:
            data = b'{"ok":false}'
        try:
            os.write(write_fd, data)
        finally:
            os._exit(0)
    os.close(write_fd)
    pid_fd = None
    reaped = False
    try:
        # Held process identity prevents a signal/exception after waitpid from
        # ever directing cleanup at a reused numeric PID.
        pid_fd = os.pidfd_open(pid, 0)
        ready, _, _ = select.select([read_fd], [], [], 15)
        if not ready:
            raise Refused('fixture-child-timeout')
        data = os.read(read_fd, 8192)
        _, status = os.waitpid(pid, 0)
        reaped = True
    finally:
        os.close(read_fd)
        if not reaped:
            try:
                if pid_fd is not None:
                    signal.pidfd_send_signal(pid_fd, signal.SIGKILL, None, 0)
                else:
                    # No wait was attempted before pidfd_open, so this child
                    # remains ours (running or unreaped), never a reused PID.
                    os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass
        if pid_fd is not None:
            os.close(pid_fd)
    require(os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0 and
            len(data) < 8192, 'fixture-child-process')
    report = json.loads(data)
    require(report.get('ok') is True, 'fixture-identity-proof')
    return report['result']


def denied(operation):
    try:
        value = operation()
    except OSError as error:
        require(error.errno in (errno.EACCES, errno.EPERM, errno.EROFS), 'fixture-denial-kind')
        return True
    if isinstance(value, int):
        os.close(value)
    return False


RO_PROBE = r"""'use strict';
const fs=require('fs');
const st=fs.readFileSync('/proc/self/status','utf8');
const zero=['CapEff','CapPrm','CapInh','CapBnd','CapAmb'].every(k=>{
 const m=st.match(new RegExp('^'+k+':\\s*([0-9a-f]+)$','m'));return m&&/^0+$/.test(m[1]);});
const ro=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').some(l=>{
 const p=l.split(' ');return p[4]==='/fixture'&&p[5].split(',').includes('ro');});
let reads=true,writes=true;
for(const f of ['existing640','root-late','new/nested/mode640','new/nested/default666']){
 try{if(!fs.readFileSync('/fixture/'+f).length)reads=false;}catch{reads=false;}
 try{const fd=fs.openSync('/fixture/'+f,'r+');fs.closeSync(fd);writes=false;}
 catch(e){if(!['EACCES','EPERM','EROFS'].includes(e.code))writes=false;}}
try{fs.mkdirSync('/fixture/backup-write');writes=false;}catch(e){
 if(!['EACCES','EPERM','EROFS'].includes(e.code))writes=false;}
const groups=process.getgroups();
const ok=process.getuid()===999&&process.getgid()===0&&groups.every(g=>g===0)&&zero&&ro&&reads&&writes;
console.log(JSON.stringify({ok,read_only_container:ok}));process.exitCode=ok?0:1;
"""


def readonly_fixture_probe(path, image, journal=None):
    token = uuid.uuid4().hex
    name = 'falcon-acl-fixture-' + token
    if journal:
        journal.record({'kind': 'fixture-container-intent', 'name': name, 'token': token})
    command = DOCKER + ['run', '--pull=never', '--name', name,
               '--label', 'falcon.acl.fixture=' + token, '--network', 'none',
               '--user', '999:0', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
               '--read-only', '--memory', '64m', '--memory-swap', '64m',
               '--cpus', '0.1', '--pids-limit', '32', '--log-driver', 'none',
               '--mount', 'type=bind,src=' + path + ',dst=/fixture,readonly',
               '--env', 'NODE_OPTIONS=', '--entrypoint', 'node', image, '-e', RO_PROBE]
    report = None
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=30, env=SAFE_ENV)
        require(result.returncode == 0 and len(result.stdout) <= 1024,
                'fixture-ro-container')
        report = json.loads(result.stdout)
        require(report == {'ok': True, 'read_only_container': True},
                'fixture-ro-report')
    finally:
        inspected = run_json(DOCKER + ['inspect', name])
        require(len(inspected) == 1 and inspected[0].get('Image') == image and
                inspected[0].get('Config', {}).get('Labels', {}).get(
                    'falcon.acl.fixture') == token, 'fixture-container-identity')
        container_id = inspected[0].get('Id', '')
        require(re.fullmatch('[0-9a-f]{64}', container_id), 'fixture-container-id')
        if journal:
            journal.record({'kind': 'fixture-container-observed',
                            'name': name, 'id': container_id, 'image': image})
        if inspected[0].get('State', {}).get('Running'):
            stopped = subprocess.run(DOCKER + ['stop', '-t', '5', container_id],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     timeout=10, env=SAFE_ENV)
            require(stopped.returncode == 0, 'fixture-container-stop')
        removed = subprocess.run(DOCKER + ['rm', container_id], stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, timeout=10, env=SAFE_ENV)
        require(removed.returncode == 0, 'fixture-container-cleanup')
        if journal:
            journal.record({'kind': 'fixture-container-removed', 'id': container_id})
    return report['read_only_container']


def fixture(args):
    require(sys.platform.startswith('linux') and os.geteuid() == 0, 'linux-root-required')
    require(IMAGE_RE.fullmatch(args.expected_image), 'fixture-image')
    script_unchanged(args.expected_script_sha256)
    image = run_json(DOCKER + ['image', 'inspect', args.expected_image])
    require(len(image) == 1 and image[0]['Id'] == args.expected_image, 'fixture-image-id')
    journal = Journal(args.evidence_dir)
    root = None
    try:
        os.mkdir('fixture', 0o750, dir_fd=journal.fd)
        root = os.open('fixture', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                       dir_fd=journal.fd)
        os.fchmod(root, 0o750)
        require(os.fstat(root).st_dev == args.expected_device, 'fixture-filesystem-device')
        for name, mode in (('existing640', 0o640), ('existing644', 0o644),
                           ('delete-probe', 0o640)):
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         mode, dir_fd=root)
            try:
                os.fchmod(fd, mode)
                os.write(fd, b'synthetic-fixture-only\n')
                os.fsync(fd)
            finally:
                os.close(fd)
        adoption = Adoption(journal, root)
        adoption.walk(root, snapshot_only=True)
        adoption.walk(root)
        adoption.reconcile()
        # ROOT prep's explicit0660 bridge after ACL adoption.
        old_mask = os.umask(0o027)
        try:
            late = os.open('root-late', os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                           0o660, dir_fd=root)
            os.write(late, b'synthetic-root-prep\n')
            os.close(late)
        finally:
            os.umask(old_mask)

        def api_operation():
            os.umask(0o027)
            for name in ('existing640', 'existing644', 'root-late'):
                fd = os.open(name, os.O_WRONLY | os.O_APPEND)
                os.write(fd, b'synthetic-api-write\n')
                os.close(fd)
            os.mkdir('new', 0o777)
            os.mkdir('new/nested', 0o777)
            for name, mode in (('mode640', 0o640), ('default666', 0o666),
                               ('private600', 0o600)):
                fd = os.open('new/nested/' + name, os.O_WRONLY | os.O_CREAT |
                             os.O_EXCL, mode)
                os.write(fd, b'synthetic-api-create\n')
                os.close(fd)
            os.mkdir('new/private700', 0o700)
            for path in ('new', 'new/nested'):
                st = os.stat(path, follow_symlinks=False)
                require(st.st_uid == API_UID and st.st_gid == 0 and
                        st.st_mode & stat.S_ISGID, 'fixture-sgid-inheritance')
            for path in ('new/nested/mode640', 'new/nested/default666'):
                st = os.stat(path, follow_symlinks=False)
                require(st.st_uid == API_UID and st.st_gid == 0 and
                        not st.st_mode & 0o007, 'fixture-file-inheritance')
            return {'nested_sgid_gid0': True, 'api_rw': True}

        api = run_identity(root, API_UID, API_GID, api_operation)

        def backup_operation():
            paths = ('existing640', 'root-late', 'new/nested/mode640',
                     'new/nested/default666')
            for path in paths:
                fd = os.open(path, os.O_RDONLY)
                require(bool(os.read(fd, 128)), 'fixture-backup-read')
                os.close(fd)
                require(denied(lambda: os.open(path, os.O_WRONLY)), 'fixture-backup-write')
            require(denied(lambda: os.mkdir('backup-create')), 'fixture-backup-create')
            require(denied(lambda: os.unlink('delete-probe')), 'fixture-backup-delete')
            require(denied(lambda: os.open('new/nested/private600', os.O_RDONLY)) and
                    denied(lambda: os.open('new/private700', os.O_RDONLY | os.O_DIRECTORY)),
                    'fixture-private-mode-limit')
            return {'backup_read_no_write': True, 'private_mode_limit_confirmed': True}

        backup = run_identity(root, BACKUP_UID, BACKUP_GID, backup_operation)
        outsider = run_identity(root, BACKUP_UID, BACKUP_UID, lambda:
                                {'outsider_denied': denied(lambda:
                                 os.open('existing640', os.O_RDONLY))})
        require(outsider['outsider_denied'], 'fixture-outsider')
        ro = readonly_fixture_probe(args.evidence_dir + '/fixture', args.expected_image, journal)
        script_unchanged(args.expected_script_sha256)
        report = dict(api, **backup, **outsider)
        report.update({'ok': True, 'image': args.expected_image,
                       'script_sha256': args.expected_script_sha256,
                       'filesystem_device': os.fstat(root).st_dev, 'api_uid': API_UID,
                       'api_gid': API_GID, 'read_only_container': ro,
                       'synthetic_only': True, 'no_source_access': True})
        journal.finish(report)
        return report
    except BaseException as error:
        try:
            journal.finish({'ok': False, 'error_code': str(error)
                            if isinstance(error, Refused) else 'fixture-failed',
                            'synthetic_only': True})
        except BaseException:
            pass
        raise
    finally:
        if root is not None:
            os.close(root)
        journal.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='mode', required=True)
    for mode in ('audit', 'adopt'):
        p = sub.add_parser(mode)
        for flag in ('expected-image', 'expected-revision', 'evidence-dir'):
            p.add_argument('--' + flag, required=True)
        p.add_argument('--expected-device', type=int, required=True)
        p.add_argument('--expected-script-sha256', required=True)
        p.add_argument('--expected-inode', type=int, required=True)
        p.add_argument('--source-review-confirmed', action='store_true')
        p.add_argument('--approved-control-plane-container')
        p.add_argument('--approved-control-plane-image')
        if mode == 'adopt':
            p.add_argument('--fixture-report', required=True)
            p.add_argument('--fixture-sha256', required=True)
    p = sub.add_parser('fixture')
    p.add_argument('--expected-image', required=True)
    p.add_argument('--evidence-dir', required=True)
    p.add_argument('--expected-device', type=int, required=True)
    p.add_argument('--expected-script-sha256', required=True)
    args = parser.parse_args()
    try:
        code_stat = os.stat(__file__, follow_symlinks=False)
        require(stat.S_ISREG(code_stat.st_mode) and code_stat.st_uid == 0 and
                not code_stat.st_mode & 0o022 and code_stat.st_nlink == 1,
                'helper-code-protection')
        script_unchanged(args.expected_script_sha256)
        with operation_deadline():
            report = fixture(args) if args.mode == 'fixture' else adopt(args)
        # Only aggregate fixed fields; paths, SQL/HTTP data and getfacl stay local.
        print(json.dumps(report, sort_keys=True))
        return 0
    except BaseException as error:
        code = str(error) if isinstance(error, Refused) else 'operation-failed'
        print(json.dumps({'ok': False, 'error_code': code,
                          'source_metadata_may_be_partial': args.mode == 'adopt'},
                         sort_keys=True))
        return 1


if __name__ == '__main__':
    sys.exit(main())
