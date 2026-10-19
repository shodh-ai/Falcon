#!/usr/bin/env python3
"""Local-only FALCON backups. No production restore or backup deletion command."""
import argparse
import contextlib
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid

GIB = 1024 ** 3
MIB = 1024 ** 2
DOCKER = ['/usr/bin/docker', '--host', 'unix:///run/docker.sock']
RUN_RE = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}$")
IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$")
NOFOLLOW = getattr(os, 'O_NOFOLLOW', 0)
DIRECTORY = getattr(os, 'O_DIRECTORY', 0)


class BackupError(RuntimeError):
    pass


def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def available_memory():
    with open('/proc/meminfo', encoding='ascii') as handle:
        for line in handle:
            if line.startswith('MemAvailable:'):
                return int(line.split()[1]) * 1024
    raise BackupError('MemAvailable unavailable; refusing to run')


def ensure_runtime_directory():
    if os.geteuid() != 0:
        raise BackupError('Only root may initialize the private runtime directory')
    try:
        os.mkdir('/run/falcon-local-backup', 0o700)
    except FileExistsError:
        pass
    fd = open_directory('/run/falcon-local-backup')
    try:
        info = os.fstat(fd)
        if info.st_uid != 0 or info.st_mode & 0o077:
            raise BackupError('Unsafe runtime directory')
    finally:
        os.close(fd)


def health_ok(url):
    try:
        # Keep TLS verification on; use the host's working curl trust store.
        # No payload, auth, redirects, insecure flag or environmental proxies.
        response = subprocess.run(['/usr/bin/curl', '--silent', '--show-error', '--fail',
                                   '--noproxy', '*', '--proto', '=http,https',
                                   '--connect-timeout', '2', '--max-time', '4',
                                   '--output', '/dev/null', '--write-out', '%{http_code}', url],
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=6, check=False, text=True)
        return response.returncode == 0 and response.stdout == '200'
    except Exception:
        return False


class Guard:
    def __init__(self, config, memory=available_memory, disk=None, health=health_ok):
        self.config = config
        self.memory = memory
        self.disk = disk or (lambda: shutil.disk_usage(config['staging_root']).free)
        self.health = health
        self.failures = 0
        self.last_health = 0.0

    def check(self, initial=False, force_health=False):
        memory_min = GIB if initial else 768 * MIB
        if self.memory() < memory_min:
            raise BackupError('Available memory below %d MiB; backup refused/aborted' % (memory_min // MIB))
        disk_min = max(20 * GIB, 3 * self.config['working_bytes'])
        if self.disk() < disk_min:
            raise BackupError('Available disk below max(20 GiB, 3 x working set)')
        now = time.monotonic()
        if initial or force_health or now - self.last_health >= 30:
            self.last_health = now
            ok = all(self.health(url) for url in self.config['health_urls'])
            self.failures = 0 if ok else self.failures + 1
            if (initial and not ok) or self.failures >= 2:
                raise BackupError('Initial health failure or two consecutive failed health rounds')


def open_directory(path):
    """Open every component without following symlinks, including ancestors."""
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise BackupError('An absolute, normalized directory is required')
    fd = os.open('/', os.O_RDONLY | DIRECTORY)
    try:
        for component in path.parts[1:]:
            next_fd = os.open(component, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except Exception:
        os.close(fd)
        raise


def trusted_file(path):
    """Root-owned configuration/code only; no writable ancestor directories."""
    path = Path(path)
    if not path.is_absolute():
        raise BackupError('Trusted files require absolute paths')
    fd = os.open('/', os.O_RDONLY | DIRECTORY)
    try:
        for index, component in enumerate(path.parts[1:]):
            last = index == len(path.parts[1:]) - 1
            next_fd = os.open(component, os.O_RDONLY | NOFOLLOW | (0 if last else DIRECTORY), dir_fd=fd)
            info = os.fstat(next_fd)
            if info.st_uid != 0 or info.st_mode & 0o022 or (last and not stat.S_ISREG(info.st_mode)):
                os.close(next_fd)
                raise BackupError('Code/configuration must be root-owned and not group/other writable')
            os.close(fd)
            fd = next_fd
        return fd
    except Exception:
        os.close(fd)
        raise


def validate_config(c):
    required = ['staging_root', 'final_root', 'uploads_source', 'pgpass_file', 'image',
                'network', 'db_host', 'db_user', 'db_port', 'databases', 'health_urls',
                'worker_uid', 'worker_gid', 'working_bytes', 'max_archive_bytes']
    if any(key not in c for key in required):
        raise BackupError('Configuration is incomplete')
    for key in ('staging_root', 'final_root', 'uploads_source', 'pgpass_file'):
        p = Path(c[key])
        if not p.is_absolute() or '..' in p.parts:
            raise BackupError('Unsafe configured path: ' + key)
    roots = [Path(c[key]) for key in ('staging_root', 'final_root', 'uploads_source')]
    if any(a == b or a in b.parents or b in a.parents for i, a in enumerate(roots) for b in roots[i+1:]):
        raise BackupError('Source, staging and final roots must be disjoint')
    credential = Path(c['pgpass_file'])
    if any(credential == root or root in credential.parents for root in roots):
        raise BackupError('Credential file must be outside source, staging and finalized roots')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', c['image']):
        raise BackupError('Pin an already-local PG18 image ID; mutable tags are refused')
    for key in ('network', 'db_host', 'db_user'):
        if not re.fullmatch(r'[a-zA-Z0-9_.-]{1,128}', c[key]):
            raise BackupError('Unsafe ' + key)
    if not isinstance(c['db_port'], int) or not 1 <= c['db_port'] <= 65535:
        raise BackupError('Invalid database port')
    if not c['databases'] or len(set(c['databases'])) != len(c['databases']) or any(not IDENT_RE.fullmatch(x) for x in c['databases']):
        raise BackupError('Invalid database list')
    if any(not isinstance(c[k], int) or c[k] <= 0 for k in ('worker_uid', 'working_bytes', 'max_archive_bytes')) or not isinstance(c['worker_gid'], int) or c['worker_gid'] < 0:
        raise BackupError('UID and limits must be positive; GID must be nonnegative')
    if not c['health_urls'] or any(not re.fullmatch(r'https?://[^\s@]+', u) for u in c['health_urls']):
        raise BackupError('Health URLs must be explicit and contain no credentials')
    return c


def load_config(path):
    fd = trusted_file(path)
    with os.fdopen(fd, encoding='utf-8') as handle:
        return validate_config(json.load(handle))


def expected_files(c):
    return ['database-' + name + '.dump' for name in c['databases']] + ['globals-no-passwords.sql', 'uploads.tar.gz', 'uploads-before.sha256', 'uploads-after.sha256']


def helper_command(c, name, run_dir, worker_script):
    return DOCKER + ['run', '--pull', 'never', '--rm', '--name', name,
            '--user', '%d:%d' % (c['worker_uid'], c['worker_gid']),
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--memory', '256m', '--memory-swap', '256m', '--cpus', '0.5', '--pids-limit', '64',
            '--network', c['network'], '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
            '--mount', 'type=bind,src=%s,dst=/source,readonly' % c['uploads_source'],
            '--mount', 'type=bind,src=%s,dst=/staging' % run_dir,
            '--mount', 'type=bind,src=%s,dst=/run/secrets/pgpass,readonly' % c['pgpass_file'],
            '--mount', 'type=bind,src=%s,dst=/worker.sh,readonly' % worker_script,
            '--env', 'PGPASSFILE=/run/secrets/pgpass', '--env', 'PGHOST=' + c['db_host'],
            '--env', 'PGPORT=' + str(c['db_port']), '--env', 'PGUSER=' + c['db_user'],
            '--env', 'EXPECTED_DATABASES=' + ','.join(c['databases']),
            '--entrypoint', '/bin/sh', c['image'], '/worker.sh']


def release_observation(c):
    """Root reads only container IDs/images and one release label; never env."""
    prefixes = c.get('release_resource_prefixes', {})
    if not prefixes:
        return {'status': 'not configured; release identity unverified'}
    if any(not IDENT_RE.fullmatch(k) or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,128}', v)
           for k, v in prefixes.items()):
        raise BackupError('Unsafe release resource prefix')
    result = subprocess.run(DOCKER + ['ps', '--no-trunc', '--format',
                             '{{.ID}}\t{{.Names}}\t{{.Image}}'],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, timeout=10, check=True)
    observed = {}
    for line in result.stdout.splitlines():
        parts = line.split('\t')
        if len(parts) != 3 or not re.fullmatch(r'[0-9a-f]{64}', parts[0]):
            raise BackupError('Unexpected Docker release observation')
        for app, prefix in prefixes.items():
            if parts[1] == prefix or parts[1].startswith(prefix + '-'):
                detail = subprocess.run(DOCKER + ['inspect', '--type', 'container',
                                         '--format', '{{.Image}}\t{{.State.StartedAt}}\t{{index .Config.Labels "org.opencontainers.image.revision"}}',
                                         parts[0]], stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, text=True, timeout=10, check=True)
                fields = detail.stdout.rstrip('\n').split('\t')
                if len(fields) != 3:
                    raise BackupError('Unexpected image release detail')
                observed.setdefault(app, []).append({'container_id': parts[0], 'container_name': parts[1],
                                                     'image_reference': parts[2], 'image_id': fields[0],
                                                     'container_started_at': fields[1],
                                                     'revision_label': fields[2] or 'not present'})
    return {'observed_at': utcnow(), 'resources': observed,
            'unmatched': sorted(set(prefixes) - set(observed))}


def monitor_process(command, guard, timeout=900, stop=None):
    """No shell or production-container actions; stderr content is not logged."""
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               start_new_session=True)
    start = time.monotonic()
    try:
        while process.poll() is None:
            guard.check()
            if time.monotonic() - start > timeout:
                raise BackupError('Helper timed out')
            time.sleep(5)
        if process.returncode:
            raise BackupError('Helper failed (exit %d); no set finalized' % process.returncode)
        guard.check(force_health=True)
    finally:
        if stop:
            try:
                stop()
            except (OSError, subprocess.SubprocessError):
                print('Backup helper cleanup could not be confirmed; inspect only its generated name', file=sys.stderr)
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)


def copy_regular(src_dir_fd, filename, dst_dir_fd, uid, max_bytes, guard=None):
    src = os.open(filename, os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK, dir_fd=src_dir_fd)
    try:
        before = os.fstat(src)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_uid != uid:
            raise BackupError('Candidate is not a single-link regular worker-owned file')
        if before.st_size < 0 or (before.st_size == 0 and not filename.endswith('.sha256')) or before.st_size > max_bytes:
            raise BackupError('Candidate size outside allowed bounds')
        dst = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=dst_dir_fd)
        digest = hashlib.sha256()
        total = 0
        with os.fdopen(dst, 'wb') as target:
            while True:
                data = os.read(src, MIB)
                if not data:
                    break
                total += len(data)
                if total > max_bytes or total > before.st_size:
                    raise BackupError('Candidate grew during copy')
                target.write(data)
                digest.update(data)
                if guard:
                    guard.check()
            target.flush()
            os.fsync(target.fileno())
        after = os.fstat(src)
        if total != before.st_size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise BackupError('Candidate changed during copy')
        return {'name': filename, 'bytes': total, 'sha256': digest.hexdigest(),
                'copied_at': utcnow(), 'worker_owned_candidate_mtime_ns': before.st_mtime_ns}
    finally:
        os.close(src)


def inspect_upload_archive(path, max_bytes, max_members=10000, guard=None):
    """Parse only bounded USTAR file/directory headers; never extract files.

    Do not feed untrusted GNU/PAX headers into tarfile: extension metadata can
    allocate attacker-sized strings before tarfile yields a member to validate.
    """
    total, count, seen = 0, 0, set()
    files = {}
    deadline = time.monotonic() + 120
    expanded = 0
    with gzip.open(path, 'rb') as compressed:
        def read(size):
            nonlocal expanded
            if not 0 <= size <= MIB:
                raise BackupError('Oversized archive parser read')
            if guard:
                guard.check()
            if time.monotonic() > deadline:
                raise BackupError('Uploads archive validation timed out')
            data = compressed.read(size)
            expanded += len(data)
            if expanded > max_bytes + max_members * 1024 + MIB:
                raise BackupError('Compressed archive exceeds validation limits')
            return data

        while True:
            header = read(512)
            if len(header) != 512:
                raise BackupError('Truncated USTAR header')
            if header == b'\0' * 512:
                if read(512) != b'\0' * 512:
                    raise BackupError('Invalid USTAR end marker')
                # Consume through gzip EOF/CRC without permitting hidden members.
                trailing = 0
                while True:
                    chunk = read(65536)
                    if not chunk:
                        break
                    trailing += len(chunk)
                    if trailing > MIB or any(chunk):
                        raise BackupError('Unexpected data after USTAR end marker')
                break
            posix = header[257:263] == b'ustar\0' and header[263:265] == b'00'
            gnu = header[257:265] == b'ustar  \0'
            # BusyBox emits ordinary GNU headers. Its tail must be zero here:
            # never interpret GNU sparse/extended fields as a POSIX path prefix.
            if (not (posix or gnu) or (gnu and any(header[345:512]))
                    or header[156:157] not in (b'0', b'\0', b'5')):
                raise BackupError('Only USTAR regular files/directories are accepted')
            try:
                checksum_text = header[148:156].strip(b'\0 ')
                size_text = header[124:136].strip(b'\0 ') or b'0'
                if not re.fullmatch(b'[0-7]+', checksum_text) or not re.fullmatch(b'[0-7]+', size_text):
                    raise ValueError('Non-octal field')
                checksum = int(checksum_text, 8)
                size = int(size_text, 8)
                name = header[:100].split(b'\0', 1)[0]
                prefix = header[345:500].split(b'\0', 1)[0] if posix else b''
                member_name = ((prefix + b'/') if prefix else b'') + name
                member_name = member_name.decode('utf-8', 'strict')
            except (ValueError, UnicodeError):
                raise BackupError('Invalid USTAR metadata')
            if sum(header[:148]) + 256 + sum(header[156:]) != checksum:
                raise BackupError('Invalid USTAR header checksum')
            count += 1
            parts = PurePosixPath(member_name).parts
            key = '/'.join(parts)
            is_file = header[156:157] in (b'0', b'\0')
            if (count > max_members or member_name.startswith('/') or '..' in parts
                    or '\\' in member_name or key in seen or (is_file and not key)
                    or any(ord(char) < 32 for char in member_name) or (not is_file and size)):
                raise BackupError('Unsafe or oversized uploads archive')
            seen.add(key)
            total += size
            if total > max_bytes:
                raise BackupError('Uploads archive expands beyond configured limit')
            digest = hashlib.sha256()
            remaining = size
            while remaining:
                chunk = read(min(MIB, remaining))
                if not chunk:
                    raise BackupError('Truncated USTAR member')
                remaining -= len(chunk)
                digest.update(chunk)
            padding = (512 - size % 512) % 512
            if read(padding) != b'\0' * padding:
                raise BackupError('Invalid USTAR member padding')
            if is_file:
                files[key] = digest.hexdigest()
    return {'members': count, 'uncompressed_bytes': total, 'file_sha256': files}


def parse_inventory(path, maximum):
    if os.stat(path).st_size > min(maximum, 8 * MIB):
        raise BackupError('Upload inventory exceeds configured bounds')
    data = Path(path).read_bytes()
    result = {}
    for record in data.split(b'\0'):
        if not record:
            continue
        if len(record) < 67 or len(record) > 4162 or len(result) >= 10000 or record[64:66] != b'  ' or not re.fullmatch(b'[0-9a-f]{64}', record[:64]):
            raise BackupError('Invalid upload inventory record')
        source = record[66:].decode('utf-8', 'strict')
        if not source.startswith('/source/'):
            raise BackupError('Inventory path outside upload source')
        relative = source[len('/source/'):]
        parts = PurePosixPath(relative).parts
        if not parts or '..' in parts or relative.startswith('/') or any(ord(x) < 32 for x in relative):
            raise BackupError('Unsafe upload inventory path')
        key = '/'.join(parts)
        if key in result:
            raise BackupError('Duplicate inventory path')
        result[key] = record[:64].decode('ascii')
    return result


def finalize(c, run_id, guard=None, capture=None):
    if not RUN_RE.fullmatch(run_id):
        raise BackupError('Invalid run ID')
    stage_root = open_directory(c['staging_root'])
    final_root = open_directory(c['final_root'])
    source = destination = None
    temp_name = '.partial-' + run_id + '-' + uuid.uuid4().hex
    try:
        for root_fd in (stage_root, final_root):
            info = os.fstat(root_fd)
            if info.st_uid != os.geteuid() or info.st_mode & 0o077:
                raise BackupError('Backup roots must be private and dispatcher-owned')
        source = os.open(run_id, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=stage_root)
        info = os.fstat(source)
        if info.st_uid != c['worker_uid'] or info.st_mode & 0o077:
            raise BackupError('Unsafe candidate directory ownership/permissions')
        if set(os.listdir(source)) != set(expected_files(c)):
            raise BackupError('Missing or unexpected candidate files')
        # Never overwrite a previous finalized set, even if the caller replays a run ID.
        try:
            os.stat(run_id, dir_fd=final_root, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise BackupError('Finalized run already exists')
        os.mkdir(temp_name, 0o700, dir_fd=final_root)
        destination = os.open(temp_name, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=final_root)
        entries = [copy_regular(source, f, destination, c['worker_uid'], c['working_bytes'], guard)
                   for f in expected_files(c)]
        temp_path = str(Path(c['final_root']) / temp_name)
        for database in c['databases']:
            with open(Path(temp_path) / ('database-' + database + '.dump'), 'rb') as handle:
                if handle.read(5) != b'PGDMP':
                    raise BackupError('Invalid custom-format dump header')
        archive_info = inspect_upload_archive(Path(temp_path) / 'uploads.tar.gz', c['max_archive_bytes'], guard=guard)
        before = parse_inventory(Path(temp_path) / 'uploads-before.sha256', c['working_bytes'])
        after = parse_inventory(Path(temp_path) / 'uploads-after.sha256', c['working_bytes'])
        if before != after or before != archive_info['file_sha256']:
            raise BackupError('Upload files changed or archive differs from pre/post inventories')
        manifest = {'schema_version': 1, 'run_id': run_id, 'finalized_at': utcnow(),
                    'database_names': c['databases'], 'postgres_image_id': c['image'],
                    'capture': capture or {'status': 'manual adoption; original capture times/release unverified'},
                    'sources': {'database_host': c['db_host'], 'database_port': c['db_port'],
                                'uploads_directory': c['uploads_source']},
                    'files': entries, 'uploads': archive_info,
                    'validation': 'hash/header/archive checked; restore unproven',
                    'consistency': 'online dumps plus live files; not an atomic cross-system snapshot',
                    'location': 'same production host; no protection against host loss',
                    'retention': 'no automatic deletion; review after 14 days and weekly'}
        out = os.open('manifest.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=destination)
        with os.fdopen(out, 'w', encoding='utf-8') as handle:
            json.dump(manifest, handle, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.fsync(destination)
        # final_root is root-only and execution is serialized by the root lock.
        os.rename(temp_name, run_id, src_dir_fd=final_root, dst_dir_fd=final_root)
        os.fsync(final_root)
        return manifest
    finally:
        for fd in (source, destination, stage_root, final_root):
            if fd is not None:
                os.close(fd)
        # Failed candidates/partial finalizations are retained, never auto-deleted.


def write_run_status(c, run_id, status, capture, error=None):
    """Append a root-owned event outside worker-owned candidate directories."""
    if not RUN_RE.fullmatch(run_id) or status not in ('started', 'completed', 'failed'):
        raise BackupError('Invalid root status event')
    parent = open_directory(Path(c['staging_root']).parent)
    status_fd = None
    try:
        info = os.fstat(parent)
        if info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise BackupError('Status parent must be private and dispatcher-owned')
        try:
            os.mkdir('status', 0o700, dir_fd=parent)
        except FileExistsError:
            pass
        status_fd = os.open('status', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent)
        info = os.fstat(status_fd)
        if info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise BackupError('Status directory must be private and dispatcher-owned')
        final_path = Path(c['final_root']) / run_id
        event = {'schema_version': 1, 'run_id': run_id, 'status': status,
                 'recorded_at': utcnow(), 'capture': capture,
                 'retained_candidate_path': str(Path(c['staging_root']) / run_id),
                 'candidate_present': (Path(c['staging_root']) / run_id).is_dir(),
                 'finalized_set_present': final_path.is_dir(),
                 'finalized_set_path': str(final_path),
                 'validation': 'restore unproven', 'automatic_deletion': False}
        if error is not None:
            event['error'] = {'type': type(error).__name__, 'message': str(error)[:512]}
        name = run_id + '-' + status + '-' + uuid.uuid4().hex + '.json'
        out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=status_fd)
        with os.fdopen(out, 'w', encoding='utf-8') as stream:
            json.dump(event, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.fsync(status_fd)
        return event
    finally:
        if status_fd is not None:
            os.close(status_fd)
        os.close(parent)


def run_backup(c, script):
    guard = Guard(c)
    guard.check(initial=True)
    capture = {'started_at': utcnow(), 'release_before': release_observation(c)}
    run_id = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex
    write_run_status(c, run_id, 'started', capture)
    try:
        staging = open_directory(c['staging_root'])
        try:
            os.mkdir(run_id, 0o700, dir_fd=staging)
            os.chown(run_id, c['worker_uid'], c['worker_gid'], dir_fd=staging, follow_symlinks=False)
        finally:
            os.close(staging)
        name = 'falcon-local-backup-' + uuid.uuid4().hex
        def stop():
            subprocess.run(DOCKER + ['rm', '-f', name], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=20, check=False)
        monitor_process(helper_command(c, name, str(Path(c['staging_root']) / run_id), script),
                        guard, c.get('timeout_seconds', 900), stop)
        capture.update({'finished_at': utcnow(), 'release_after': release_observation(c)})
        result = finalize(c, run_id, guard, capture)
        write_run_status(c, run_id, 'completed', capture)
        return result
    except Exception as error:
        capture.setdefault('finished_at', utcnow())
        try:
            write_run_status(c, run_id, 'failed', capture, error)
        except Exception:
            print('Failed run status could not be persisted; candidates retained', file=sys.stderr)
        raise


def retention_review(c):
    # Report only. No unlink/rmdir/prune/retention mutation exists in this tool.
    now = dt.datetime.now(dt.timezone.utc)
    report = []
    fd = open_directory(c['final_root'])
    try:
        for name in sorted(os.listdir(fd)):
            if not RUN_RE.fullmatch(name):
                continue
            info = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if not stat.S_ISDIR(info.st_mode):
                raise BackupError('Unexpected finalized path type')
            created = dt.datetime.strptime(name.split('-')[0], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
            if (now - created).days >= 14:
                report.append({'run_id': name, 'age_days': (now - created).days, 'action': 'review only; user must authorize deletion'})
    finally:
        os.close(fd)
    return {'checked_at': utcnow(), 'review_candidates': report}


@contextlib.contextmanager
def lock(path):
    parent = open_directory(Path(path).parent)
    info = os.fstat(parent)
    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
        os.close(parent)
        raise BackupError('Lock directory must be private and dispatcher-owned')
    fd = os.open(Path(path).name, os.O_WRONLY | os.O_CREAT | NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=parent)
    os.close(parent)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1 or info.st_mode & 0o077:
            raise BackupError('Lock must be a private single-link dispatcher-owned regular file')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    except BlockingIOError:
        raise BackupError('Another backup/finalization is already running')
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['backup', 'finalize', 'review'])
    parser.add_argument('--config', default='/etc/falcon-local-backup/config.json')
    parser.add_argument('--run-id')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise BackupError('The fixed dispatcher/finalizer must be invoked by root')
    def interrupted(signum, frame):
        raise BackupError('Backup interrupted; no production stop/restore was requested')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    ensure_runtime_directory()
    c = load_config(args.config)
    script = str(Path(__file__).resolve().with_name('worker.sh'))
    fd = trusted_file(script)
    os.close(fd)
    with lock('/run/falcon-local-backup/lock'):
        if args.action == 'backup':
            result = run_backup(c, script)
        elif args.action == 'finalize':
            result = finalize(c, args.run_id or '')
        else:
            result = retention_review(c)
    if args.action != 'review':
        # Upload filenames remain in the protected manifest, not the journal.
        result = {key: result[key] for key in ('run_id', 'finalized_at', 'validation')}
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (BackupError, OSError, ValueError, tarfile.TarError) as error:
        print('FALCON backup refused/failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
