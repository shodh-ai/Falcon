#!/usr/bin/env python3
"""Reconstruct the reviewed uploads policy only in a disposable restore tree.

No production path argument, archive extract(), source journal replay, deletion,
or production connection exists here. Tar modes contain ACL masks, so the known
group policy is reconstructed explicitly rather than inferred from those bits.
"""
import errno
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct
import tarfile
import time

MIB = 1024 ** 2
MAX_ENTRIES = 10000
MAX_DEPTH = 64
API_UID = 61001
SESSION_RE = re.compile(r'/data/falcon-backups/restore-check/falcon-restore-check-[0-9a-f]{32}')
HASH_RE = re.compile(r'[0-9a-f]{64}')
FILE_MODES = {0o640, 0o644, 0o660, 0o664}
DIR_MODES = {0o750, 0o755, 0o2750, 0o2755, 0o2770, 0o2775}
NOFOLLOW = os.O_NOFOLLOW
DIRECTORY = os.O_DIRECTORY
ACL_ACCESS = 'system.posix_acl_access'
ACL_DEFAULT = 'system.posix_acl_default'


class RecoveryPermissionsError(RuntimeError):
    """Only fixed, non-sensitive codes are suitable for an external report."""


def require(condition, code):
    if not condition:
        raise RecoveryPermissionsError(code)


def identity(info):
    return (info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode), info.st_uid, info.st_gid)


def stable_file(info):
    return identity(info) + (info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_nlink)


def private_json(parent, name, value):
    require(re.fullmatch(r'[a-z0-9-]+\.json', name), 'evidence-name')
    data = (json.dumps(value, sort_keys=True) + '\n').encode()
    require(len(data) <= 16 * MIB, 'evidence-size')
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=parent)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def checked_directory(path):
    """Root-owned, non-writable ancestors; all backup ancestors stay 0700."""
    require(path.is_absolute() and str(path) == os.path.normpath(str(path)), 'scratch-path')
    fd = os.open('/', os.O_RDONLY | DIRECTORY | NOFOLLOW)
    prefix = ''
    try:
        for part in path.parts[1:]:
            new = os.open(part, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = new
            prefix += '/' + part
            info = os.fstat(fd)
            require(info.st_uid == info.st_gid == 0 and not info.st_mode & 0o022,
                    'scratch-ancestor')
            if prefix == '/data/falcon-backups' or prefix.startswith('/data/falcon-backups/'):
                require(stat.S_IMODE(info.st_mode) == 0o700, 'scratch-private-ancestor')
        return fd
    except BaseException:
        os.close(fd)
        raise


def canonical_member(name, directory=False):
    require(isinstance(name, str) and name and len(name.encode('utf8')) <= 4096,
            'archive-path')
    require(not name.startswith('/') and '\\' not in name and
            not any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in name), 'archive-path')
    if directory and name in ('.', './'):
        return ''
    if name.startswith('./'):
        name = name[2:]
    if directory and name.endswith('/'):
        name = name[:-1]
    parts = name.split('/')
    require(0 < len(parts) <= MAX_DEPTH and
            all(p not in ('', '.', '..') and len(p.encode('utf8')) <= 255 for p in parts),
            'archive-path')
    return '/'.join(parts)


def member_metadata(member):
    directory = member.type == tarfile.DIRTYPE
    require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE), 'archive-member-type')
    require(type(member.uid) is int and member.uid in (0, API_UID) and
            type(member.gid) is int and member.gid == 0, 'archive-owner')
    require(type(member.mode) is int and member.mode in (DIR_MODES if directory else FILE_MODES),
            'archive-mode')
    require(type(member.size) is int and member.size >= 0 and (not directory or member.size == 0),
            'archive-size')
    return canonical_member(member.name, directory), directory


def acl_blob(entries):
    return struct.pack('<I', 2) + b''.join(struct.pack('<HHI', *entry) for entry in entries)


def set_policy(fd, directory, other):
    """Scratch only: numeric GID0 stays read-only; mask is not group access."""
    undefined = 0xffffffff
    access = acl_blob([(1, 7 if directory else 6, undefined), (2, 7 if directory else 6, API_UID),
                       (4, 5 if directory else 4, undefined),
                       (16, 7 if directory else 6, undefined), (32, other, undefined)])
    if directory:
        # SGID before ACL installation; chmod afterwards could clip its mask.
        os.fchmod(fd, 0o2750 | other)
    os.setxattr(fd, ACL_ACCESS, access)
    require(os.getxattr(fd, ACL_ACCESS) == access, 'scratch-access-acl')
    if directory:
        default = acl_blob([(1, 7, undefined), (2, 7, API_UID), (4, 5, undefined),
                            (16, 7, undefined), (32, 0, undefined)])
        os.setxattr(fd, ACL_DEFAULT, default)
        require(os.getxattr(fd, ACL_DEFAULT) == default and os.fstat(fd).st_mode & stat.S_ISGID,
                'scratch-default-acl')
    os.fsync(fd)


class SafeTarInfo(tarfile.TarInfo):
    def _proc_member(self, archive):
        # Reject metadata extensions BEFORE tarfile reads/allocates their body.
        require(self.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE,
                              tarfile.GNUTYPE_LONGNAME), 'archive-header-type')
        longname = self.type == tarfile.GNUTYPE_LONGNAME
        if longname:
            require(100 < self.size <= 4096 and not getattr(archive, '_falcon_longname', False),
                    'archive-longname')
            archive._falcon_longname = True
        try:
            return super()._proc_member(archive)
        finally:
            if longname:
                archive._falcon_longname = False


class BoundedReader:
    def __init__(self, stream, monitor, maximum):
        self.stream, self.monitor, self.maximum = stream, monitor, maximum
        self.total = 0
        self.deadline = time.monotonic() + 180

    def read(self, size):
        require(0 <= size <= MIB, 'archive-read-size')
        require(time.monotonic() < self.deadline, 'archive-deadline')
        self.monitor.tick()
        data = self.stream.read(size)
        self.total += len(data)
        require(self.total <= self.maximum, 'archive-expansion')
        return data


def open_relative(root, name, *, directory=False):
    """Open only existing regular/directory objects below a held scratch root."""
    require(name == '' and directory or canonical_member(name, directory) == name,
            'scratch-relative-path')
    fd = os.dup(root)
    parts = name.split('/') if name else []
    try:
        for index, part in enumerate(parts):
            flags = os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK
            if index < len(parts) - 1 or directory:
                flags |= DIRECTORY
            new = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = new
            info = os.fstat(fd)
            require(stat.S_ISDIR(info.st_mode) if index < len(parts) - 1 or directory
                    else stat.S_ISREG(info.st_mode), 'scratch-object-type')
        return fd
    except BaseException:
        os.close(fd)
        raise


def hash_regular(fd, monitor, maximum):
    before = os.fstat(fd)
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
            0 <= before.st_size <= maximum, 'scratch-file')
    os.lseek(fd, 0, os.SEEK_SET)
    digest, size = hashlib.sha256(), 0
    while True:
        monitor.tick()
        data = os.read(fd, MIB)
        if not data:
            break
        size += len(data)
        require(size <= before.st_size and size <= maximum, 'scratch-file-size')
        digest.update(data)
    require(stable_file(before) == stable_file(os.fstat(fd)) and size == before.st_size,
            'scratch-file-changed')
    return {'sha256': digest.hexdigest(), 'bytes': size, 'uid': before.st_uid, 'gid': before.st_gid}


def extract_validated(archive_fd, root, expected, maximum, monitor):
    """Manual extraction only; all file bytes are verified before ACL exposure."""
    require(isinstance(expected, dict) and len(expected) <= MAX_ENTRIES and
            all(canonical_member(name) == name and isinstance(digest, str) and HASH_RE.fullmatch(digest)
                for name, digest in expected.items()), 'archive-inventory')
    directories, files, seen, total = {}, {}, set(), 0
    os.lseek(archive_fd, 0, os.SEEK_SET)
    with os.fdopen(os.dup(archive_fd), 'rb') as source, gzip.GzipFile(fileobj=source, mode='rb') as compressed:
        reader = BoundedReader(compressed, monitor, maximum + MAX_ENTRIES * 1024 + MIB)
        with tarfile.open(fileobj=reader, mode='r|', tarinfo=SafeTarInfo) as archive:
            for member in archive:
                monitor.tick()
                name, directory = member_metadata(member)
                require(name not in seen and len(seen) < MAX_ENTRIES, 'archive-duplicate-or-count')
                seen.add(name)
                require(name or directory and member.uid == 0, 'archive-root')
                parent_name, _, leaf = name.rpartition('/')
                require(not name or parent_name in directories, 'archive-parent-order')
                if directory:
                    if not name:
                        fd = os.dup(root)
                    else:
                        parent = open_relative(root, parent_name, directory=True)
                        try:
                            os.mkdir(leaf, 0o700, dir_fd=parent)
                            fd = os.open(leaf, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent)
                        finally:
                            os.close(parent)
                    try:
                        os.fchown(fd, member.uid, member.gid)  # Newly created scratch inode ONLY.
                        directories[name] = {'uid': member.uid, 'gid': member.gid, 'other': member.mode & 7}
                    finally:
                        os.close(fd)
                else:
                    require(name in expected and name not in files, 'archive-unexpected-file')
                    total += member.size
                    require(total <= maximum, 'archive-content-bound')
                    parent = open_relative(root, parent_name, directory=True)
                    try:
                        fd = os.open(leaf, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                                     0o600, dir_fd=parent)
                    finally:
                        os.close(parent)
                    try:
                        digest, copied = hashlib.sha256(), 0
                        body = archive.extractfile(member)
                        require(body is not None, 'archive-file-body')
                        with body:
                            while True:
                                monitor.tick()
                                data = body.read(min(MIB, member.size - copied + 1))
                                if not data:
                                    break
                                copied += len(data)
                                require(copied <= member.size, 'archive-file-length')
                                digest.update(data)
                                with memoryview(data) as view:
                                    while view:
                                        written = os.write(fd, view)
                                        require(written > 0, 'scratch-short-write')
                                        view = view[written:]
                        require(copied == member.size and digest.hexdigest() == expected[name], 'archive-file-hash')
                        os.fchown(fd, member.uid, member.gid)  # Newly created scratch inode ONLY.
                        os.fsync(fd)
                        files[name] = {'sha256': digest.hexdigest(), 'bytes': copied,
                                       'uid': member.uid, 'gid': member.gid, 'other': member.mode & 7}
                    finally:
                        os.close(fd)
        # Reach gzip EOF/CRC; the frozen validator already checked all tar tails.
        while reader.read(65536):
            pass
    require('' in directories and set(files) == set(expected), 'archive-inventory-complete')
    return files, directories


class RecoveryUploads:
    def __init__(self, backup, restore, config, run_id):
        self.backup, self.restore, self.config, self.run_id = backup, restore, config, run_id
        self.report, self.original_files, self.original_directories = {}, {}, {}
        self.root_identity = None
        self.uploads = None

    def prepare(self, context, monitor, inputs, uploads):
        require(os.geteuid() == 0, 'linux-root-required')
        session = context.get('session_path')
        require(isinstance(session, str) and SESSION_RE.fullmatch(session), 'fixed-session-path')
        inputs, uploads = Path(inputs), Path(uploads)
        require(inputs == Path(session) / 'candidate-validation' and uploads == inputs / 'uploads',
                'fixed-scratch-path')
        parent = checked_directory(inputs)
        root = os.open('uploads', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent)
        try:
            info = os.fstat(root)
            require(info.st_uid == info.st_gid == 0 and stat.S_IMODE(info.st_mode) == 0o700 and
                    not os.listdir(root), 'empty-private-scratch')
            for key in (ACL_ACCESS, ACL_DEFAULT):
                try:
                    os.getxattr(root, key)
                except OSError as error:
                    require(error.errno == errno.ENODATA, 'scratch-acl-read')
                else:
                    require(False, 'scratch-preexisting-acl')
            self.root_identity, self.uploads = identity(info), uploads
            with self.restore.checked_set(self.config, self.run_id, monitor) as (source, manifest):
                expected = manifest.get('uploads', {}).get('file_sha256')
                require(isinstance(expected, dict), 'manifest-upload-inventory')
                entries = [entry for entry in manifest['files'] if entry['name'] == 'uploads.tar.gz']
                require(len(entries) == 1, 'manifest-upload-archive')
                record = entries[0]
                archive_source = self.restore._open_regular(source, 'uploads.tar.gz')
                try:
                    out = os.open('recovery-upload-archive.tar.gz', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                                  0o600, dir_fd=parent)
                    with os.fdopen(out, 'wb') as target:
                        self.restore._matches(self.restore._hash(archive_source,
                            self.config['working_bytes'], monitor, target), record)
                        target.flush()
                        os.fsync(target.fileno())
                finally:
                    os.close(archive_source)
                private_json(parent, 'recovery-upload-manifest.json', manifest)
            archive_fd = os.open('recovery-upload-archive.tar.gz', os.O_RDONLY | NOFOLLOW, dir_fd=parent)
            try:
                before = os.fstat(archive_fd)
                frozen = self.backup.inspect_upload_archive('/proc/self/fd/' + str(archive_fd),
                    self.config['max_archive_bytes'], guard=type('Guard', (), {'check': lambda _: monitor.tick()})())
                require(frozen['file_sha256'] == expected, 'frozen-archive-inventory')
                self.restore._matches(hash_regular(archive_fd, monitor, self.config['working_bytes']), record)
                files, directories = extract_validated(archive_fd, root, expected,
                    self.config['max_archive_bytes'], monitor)
                require(stable_file(before) == stable_file(os.fstat(archive_fd)), 'archive-changed-during-extraction')
                self.restore._matches(hash_regular(archive_fd, monitor, self.config['working_bytes']), record)
            finally:
                os.close(archive_fd)
            # Private ancestor still prevents access while the full tree policy is reconstructed.
            for name, metadata in files.items():
                monitor.tick()
                fd = open_relative(root, name)
                try:
                    set_policy(fd, False, metadata['other'])
                finally:
                    os.close(fd)
            for name in sorted(directories, key=lambda value: value.count('/'), reverse=True):
                monitor.tick()
                fd = open_relative(root, name, directory=True)
                try:
                    set_policy(fd, True, 0 if not name else directories[name]['other'])
                    state = os.fstat(fd)
                    self.original_directories[name] = {
                        'identity': list(identity(state)), 'uid': state.st_uid, 'gid': state.st_gid,
                        'mode': stat.S_IMODE(state.st_mode),
                        'access_acl': os.getxattr(fd, ACL_ACCESS).hex(),
                        'default_acl': os.getxattr(fd, ACL_DEFAULT).hex()}
                finally:
                    os.close(fd)
            self.original_files = {name: {key: value for key, value in metadata.items() if key != 'other'}
                                   for name, metadata in files.items()}
            private_json(parent, 'recovery-upload-files.json', self.original_files)
            private_json(parent, 'recovery-upload-directories.json', self.original_directories)
            verification = self.verify(monitor)
            self.report = {'schema_version': 1, 'known_permission_policy_reconstructed': True,
                'exact_historical_acl_preservation_claimed': False,
                'production_uploads_mounted': False, 'production_files_modified': False,
                'archive_integrity_verified': True, 'restored_files': len(files),
                'restored_directories': len(directories), **verification}
            return self.report
        finally:
            os.close(root)
            os.close(parent)

    def verify(self, monitor):
        require(self.uploads is not None and self.root_identity is not None, 'scratch-not-prepared')
        parent = checked_directory(self.uploads.parent)
        root = os.open('uploads', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent)
        try:
            require(identity(os.fstat(root)) == self.root_identity, 'scratch-root-replaced')
            for name, metadata in self.original_directories.items():
                monitor.tick()
                fd = open_relative(root, name, directory=True)
                try:
                    current = os.fstat(fd)
                    require(list(identity(current)) == metadata['identity'] and
                            current.st_uid == metadata['uid'] and current.st_gid == metadata['gid'] and
                            stat.S_IMODE(current.st_mode) == metadata['mode'] and
                            os.getxattr(fd, ACL_ACCESS).hex() == metadata['access_acl'] and
                            os.getxattr(fd, ACL_DEFAULT).hex() == metadata['default_acl'],
                            'original-directory-changed')
                finally:
                    os.close(fd)
            for name, metadata in self.original_files.items():
                fd = open_relative(root, name)
                try:
                    require(hash_regular(fd, monitor, self.config['max_archive_bytes']) == metadata,
                            'original-file-changed')
                finally:
                    os.close(fd)
            return {'original_files_verified': len(self.original_files),
                    'original_directories_verified': len(self.original_directories),
                    'original_directory_identity_and_policy_unchanged': True,
                    'original_file_bytes_and_ownership_unchanged': True}
        finally:
            os.close(root)
            os.close(parent)
