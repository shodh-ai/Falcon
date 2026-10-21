#!/usr/bin/env python3
"""Explicitly approved, disposable PG18 restore; never connects to production."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from falcon_backup import (BackupError, GIB, available_memory, load_config,
                           open_directory, RUN_RE, NOFOLLOW, MIB, trusted_file,
                           expected_files, lock, Guard, ensure_runtime_directory,
                           DOCKER, DIRECTORY, utcnow)

MAX_METADATA = 16 * MIB
READY = {'restore_inventory_complete': True}
HELPER_RE = re.compile(r'falcon-restore-check-[0-9a-f]{32}(?:-[a-z0-9-]{1,48})?')


def _private(info, directory=False):
    kind = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not kind or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise BackupError('Restore input/evidence must be private and dispatcher-owned')
    if not directory and info.st_nlink != 1:
        raise BackupError('Restore input must be a single-link regular file')


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise BackupError('Duplicate JSON metadata key')
        value[key] = item
    return value


def _json(data):
    def bad_constant(value):
        raise BackupError('Invalid JSON constant')
    return json.loads(data, object_pairs_hook=_unique, parse_constant=bad_constant)


def _open_regular(directory, name):
    fd = os.open(name, os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    try:
        _private(os.fstat(fd))
        return fd
    except BaseException:
        os.close(fd)
        raise


def _hash(fd, maximum, monitor=None, target=None):
    before = os.fstat(fd)
    _private(before)
    if before.st_size < 0 or before.st_size > maximum:
        raise BackupError('Restore input exceeds configured size limit')
    checksum, total = hashlib.sha256(), 0
    while True:
        data = os.read(fd, MIB)
        if not data:
            break
        total += len(data)
        if total > before.st_size or total > maximum:
            raise BackupError('Restore input grew while being read')
        checksum.update(data)
        if target is not None:
            target.write(data)
        if monitor:
            monitor.tick()
    after = os.fstat(fd)
    if total != before.st_size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        raise BackupError('Restore input changed while being read')
    return {'bytes': total, 'sha256': checksum.hexdigest()}


def _matches(actual, expected):
    if any(actual[key] != expected[key] for key in ('bytes', 'sha256')):
        raise BackupError('Backup hash/size mismatch')


@contextlib.contextmanager
def checked_set(c, run_id, monitor=None):
    """Hold the verified directory inode; never reopen inputs through paths."""
    if not RUN_RE.fullmatch(run_id):
        raise BackupError('Invalid run ID')
    parent = open_directory(c['final_root'])
    fd = None
    try:
        _private(os.fstat(parent), directory=True)
        fd = os.open(run_id, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent)
        _private(os.fstat(fd), directory=True)
        with os.fdopen(_open_regular(fd, 'manifest.json'), 'rb') as stream:
            data = stream.read(MAX_METADATA + 1)
        if len(data) > MAX_METADATA:
            raise BackupError('Manifest exceeds metadata limit')
        manifest = _json(data)
        if (not isinstance(manifest, dict) or manifest.get('schema_version') != 1 or manifest.get('run_id') != run_id
                or manifest.get('database_names') != c['databases']
                or manifest.get('postgres_image_id') != c['image']):
            raise BackupError('Manifest does not match the configured backup scope/image')
        entries = manifest.get('files')
        if not isinstance(entries, list) or len(entries) != len(expected_files(c)):
            raise BackupError('Manifest file inventory is incomplete/duplicated')
        names = [item.get('name') for item in entries if isinstance(item, dict)]
        if (len(names) != len(entries) or any(not isinstance(name, str) for name in names)
                or set(names) != set(expected_files(c))):
            raise BackupError('Manifest does not match the configured backup scope')
        if set(os.listdir(fd)) != set(names) | {'manifest.json'}:
            raise BackupError('Unexpected finalized backup files')
        for item in entries:
            if (type(item.get('bytes')) is not int or item['bytes'] < 0
                    or not isinstance(item.get('sha256'), str)
                    or not re.fullmatch('[0-9a-f]{64}', item['sha256'])):
                raise BackupError('Invalid backup digest metadata')
            with os.fdopen(_open_regular(fd, item['name']), 'rb') as stream:
                _matches(_hash(stream.fileno(), c['working_bytes'], monitor), item)
        yield fd, manifest
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def check_set(c, run_id):
    # Compatibility for an operator check; restore uses held directory FDs.
    with checked_set(c, run_id) as (_, manifest):
        return manifest


def _container(config, name, inputs):
    return DOCKER + ['run', '--pull', 'never', '--rm', '--name', name,
            '--network', 'none', '--user', '%d:%d' % (config['restore_uid'], config['restore_gid']),
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--memory', '256m', '--memory-swap', '256m', '--cpus', '0.5', '--pids-limit', '64',
            '--tmpfs', '/tmp:rw,nosuid,size=64m',
            '--mount', 'type=bind,src=%s,dst=/backup,readonly' % inputs]


def restore_command(config, name, set_path, scratch, script):
    return _container(config, name, set_path) + [
            '--mount', 'type=bind,src=%s,dst=/scratch' % scratch,
            '--mount', 'type=bind,src=%s,dst=/restore-check.sh,readonly' % script,
            '--entrypoint', '/bin/sh', config['image'], '/restore-check.sh']


def count_command(config, name, inputs):
    return _container(config, name, inputs) + ['--entrypoint', 'pg_restore', config['image'],
            '-w', '--data-only', '--no-owner', '--no-acl', '--file=-', '/backup/database.dump']


def toc_command(config, name, inputs):
    return _container(config, name, inputs) + ['--entrypoint', 'pg_restore', config['image'],
            '-w', '--list', '/backup/database.dump']


class Monitor:
    """Resource/application guards also run on an idle container output pipe."""
    def __init__(self, config):
        self.guard = Guard(config)
        self.started = time.monotonic()
        self.last_check = -float('inf')

    def tick(self, force=False):
        now = time.monotonic()
        if now - self.started > 1800:
            raise BackupError('Disposable restore timed out; result unproven')
        if force or now - self.last_check >= 1:
            self.last_check = now
            if available_memory() < GIB:
                raise BackupError('Disposable restore aborted: host memory pressure')
            self.guard.check()

    @contextlib.contextmanager
    def helper(self, command, name):
        if not HELPER_RE.fullmatch(name):
            raise BackupError('Only a generated disposable restore helper may be controlled')
        self.tick(force=True)
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   start_new_session=True)
        try:
            yield process
        finally:
            # Only the generated helper is removed. Backups/scratch are retained.
            try:
                subprocess.run(DOCKER + ['rm', '-f', name], timeout=20, check=False,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                if process.stdout:
                    process.stdout.close()

    def wait(self, process):
        while process.poll() is None:
            self.tick()
            time.sleep(0.2)
        if process.returncode:
            raise BackupError('Isolated helper failed/resource limit reached; result unproven')

    def run_capture(self, command, name, max_bytes=MAX_METADATA):
        """For a separately reviewed fixed optional checker, never row output."""
        with self.helper(command, name) as process:
            with GuardedStream(process.stdout, self) as stream:
                data = stream.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise BackupError('Isolated checker output exceeds limit')
            self.wait(process)
            return data


class GuardedStream:
    """Bound reads and wake guards while a container is stalled/silent."""
    def __init__(self, pipe, monitor):
        self.pipe, self.monitor, self.pending, self.eof = pipe, monitor, bytearray(), False
        self.selector = selectors.DefaultSelector()
        self.selector.register(pipe, selectors.EVENT_READ)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.selector.close()

    def _more(self):
        while not self.eof:
            self.monitor.tick()
            if self.selector.select(timeout=1):
                data = os.read(self.pipe.fileno(), 65536)
                if not data:
                    self.eof = True
                else:
                    self.pending.extend(data)
                return

    def readline(self, size=-1):
        if size <= 0:
            size = MAX_METADATA + 1
        while True:
            end = self.pending.find(b'\n') + 1
            if end or len(self.pending) >= size or self.eof:
                end = min(end or len(self.pending), size)
                value = bytes(self.pending[:end])
                del self.pending[:end]
                return value
            self._more()

    def read(self, size=-1):
        if size < 0:
            raise BackupError('Unbounded isolated output read is forbidden')
        while len(self.pending) < size and not self.eof:
            self._more()
        value = bytes(self.pending[:size])
        del self.pending[:size]
        return value


def compare_counts(expected, actual, materialized=None):
    """Exact COPY table counts; declared materialized caches are separate proof."""
    want, got, parents, seen, declared_views, restored_views = {}, {}, set(), set(), set(), {}
    for row in expected['tables']:
        key = (row['schema'], row['table'])
        if key in want or type(row['rows']) is not int or row['rows'] < 0:
            raise BackupError('Invalid expected row-count inventory')
        want[key] = row['rows']
    if materialized is not None:
        if (not isinstance(materialized, dict) or not isinstance(expected.get('dump_sha256'), str)
                or not re.fullmatch('[0-9a-f]{64}', expected['dump_sha256'])
                or materialized.get('schema_version') != 1
                or materialized.get('dump_sha256') != expected.get('dump_sha256')
                or not isinstance(materialized.get('materialized_views'), list)):
            raise BackupError('Materialized-view TOC is not bound to the same dump')
        for row in materialized['materialized_views']:
            if (not isinstance(row, dict) or not isinstance(row.get('schema'), str)
                    or not isinstance(row.get('table'), str) or row.get('refresh_intended') is not True):
                raise BackupError('Invalid materialized-view TOC declaration')
            key = (row['schema'], row['table'])
            if key in declared_views or key in want:
                raise BackupError('Duplicate or conflicting materialized-view TOC declaration')
            declared_views.add(key)
    for row in actual:
        if (set(row) != {'schema', 'table', 'kind', 'rows'}
                or not isinstance(row['schema'], str) or not isinstance(row['table'], str)
                or type(row['rows']) is not int or row['rows'] < 0):
            raise BackupError('Invalid restored row-count inventory')
        key = (row['schema'], row['table'])
        if key in seen:
            raise BackupError('Duplicate restored table inventory')
        seen.add(key)
        if row['kind'] == 'p':
            if row['rows'] != 0 or want.get(key, 0) != 0:
                raise BackupError('Partition-root COPY routing cannot be proven by physical counts')
            parents.add(key)
        elif row['kind'] == 'r':
            got[key] = row['rows']
        elif row['kind'] == 'm':
            if materialized is None or key not in declared_views:
                raise BackupError('Undeclared materialized view in restored inventory')
            restored_views[key] = row['rows']
        else:
            raise BackupError('Unsupported foreign/unknown relation in restored inventory')
    physical = {key: count for key, count in want.items() if key not in parents}
    if physical != got:
        raise BackupError('Same-dump and restored table inventory/counts differ')
    if set(restored_views) != declared_views:
        raise BackupError('Restored materialized-view inventory differs from the dump TOC')
    return {'physical_tables': len(got), 'partition_parents': len(parents),
            'rows': sum(got.values()), 'exact_physical_inventory_and_counts': True,
            'materialized_views_checked': len(restored_views),
            'materialized_view_rows_observed': sum(restored_views.values()),
            'materialized_view_inventory_matches_dump_toc': materialized is not None,
            'materialized_view_rows_are_derived_observations': True}


def read_inventory(stream):
    rows, total = [], 0
    while True:
        line = stream.readline(MIB + 1)
        total += len(line)
        if not line or len(line) > MIB or total > MAX_METADATA or len(rows) > 100000:
            raise BackupError('Incomplete or oversized restored inventory')
        row = _json(line)
        if row == READY:
            return rows
        if not isinstance(row, dict):
            raise BackupError('Invalid restored inventory record')
        rows.append(row)


def _write_json(directory, name, value):
    out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=directory)
    with os.fdopen(out, 'w', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=True)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(directory)


def copy_dump(source_directory, entry, inputs, config, monitor):
    """New private copy tied to manifest; no chmod/chown of the original."""
    source = _open_regular(source_directory, entry['name'])
    destination = None
    try:
        destination = os.open('database.dump', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                              0o400, dir_fd=inputs)
        with os.fdopen(destination, 'wb', closefd=False) as target:
            _matches(_hash(source, config['working_bytes'], monitor, target), entry)
            target.flush()
            os.fsync(target.fileno())
        os.fchown(destination, config['restore_uid'], config['restore_gid'])
    finally:
        os.close(source)
        if destination is not None:
            os.close(destination)


def check_copy(inputs, entry, config, monitor):
    fd = os.open('database.dump', os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK, dir_fd=inputs)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or info.st_uid != config['restore_uid'] or info.st_mode & 0o277):
            raise BackupError('Unsafe private dump copy')
        digest, total = hashlib.sha256(), 0
        while True:
            chunk = os.read(fd, MIB)
            if not chunk:
                break
            total += len(chunk)
            if total > entry['bytes']:
                raise BackupError('Private dump copy grew')
            digest.update(chunk)
            monitor.tick()
        after = os.fstat(fd)
        if (info.st_size, info.st_mtime_ns, info.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise BackupError('Private dump copy changed')
        _matches({'bytes': total, 'sha256': digest.hexdigest()}, entry)
    finally:
        os.close(fd)


@contextlib.contextmanager
def sandbox_socket(scratch, uid):
    """Anchor the IPC bind inode, not an attacker-replaceable scratch path.

    Docker's root daemon opens this host /proc path while the FD is held. A
    symlink planted by restored SQL must never redirect a bind to host sockets.
    """
    scratch_fd = open_directory(scratch)
    socket_fd = None
    try:
        socket_fd = os.open('socket', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=scratch_fd)
        directory = os.fstat(socket_fd)
        endpoint = os.stat('.s.PGSQL.55432', dir_fd=socket_fd, follow_symlinks=False)
        if (directory.st_uid != uid or directory.st_mode & 0o077
                or not stat.S_ISSOCK(endpoint.st_mode) or endpoint.st_uid != uid
                or endpoint.st_nlink != 1):
            raise BackupError('Unsafe isolated Unix socket directory/endpoint')
        yield '/proc/%d/fd/%d' % (os.getpid(), socket_fd)
    finally:
        if socket_fd is not None:
            os.close(socket_fd)
        os.close(scratch_fd)


def run_restore(c, run_id, approval_id, validation_hook=None):
    """Optional hook is trusted local code, not a configurable shell command."""
    if available_memory() < int(1.5 * GIB):
        raise BackupError('Restore blocked: available memory is below 1.5 GiB')
    if (type(c.get('restore_uid')) is not int or c['restore_uid'] <= 0
            or type(c.get('restore_gid')) is not int or c['restore_gid'] < 0):
        raise BackupError('Configure the existing nonroot PG18 image account UID/GID for initdb')
    from dump_counts import parse_copy_stream, parse_materialized_toc
    monitor = Monitor(c)
    monitor.guard.check(initial=True)
    monitor.tick(force=True)
    script = str(Path(__file__).resolve().with_name('restore-check.sh'))
    os.close(trusted_file(script))
    session_id = 'falcon-restore-check-' + uuid.uuid4().hex
    scratch_root = Path(c['staging_root']).parent / 'restore-check'
    parent = open_directory(scratch_root)
    session_fd = None
    stage = 'initializing'
    summaries = []
    try:
        _private(os.fstat(parent), directory=True)
        os.mkdir(session_id, 0o700, dir_fd=parent)
        session_fd = os.open(session_id, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent)
        session = scratch_root / session_id
        event = {'schema_version': 1, 'run_id': run_id, 'approval_id': approval_id,
                 'started_at': utcnow(), 'retained_scratch': str(session),
                 'production_restore': False, 'automatic_data_deletion': False}
        _write_json(session_fd, 'started.json', event)
        with checked_set(c, run_id, monitor) as (source, manifest):
            for index, database in enumerate(c['databases']):
                stage = 'private-input-copy'
                entry = next(item for item in manifest['files'] if item['name'] == 'database-' + database + '.dump')
                db_dir = 'db-%d' % index
                os.mkdir(db_dir, 0o700, dir_fd=session_fd)
                db_fd = os.open(db_dir, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=session_fd)
                inputs_fd = None
                try:
                    for child in ('inputs', 'pgdata'):
                        os.mkdir(child, 0o700, dir_fd=db_fd)
                    inputs_fd = os.open('inputs', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=db_fd)
                    copy_dump(source, entry, inputs_fd, c, monitor)
                    os.fchown(inputs_fd, c['restore_uid'], c['restore_gid'])
                    os.chown('pgdata', c['restore_uid'], c['restore_gid'], dir_fd=db_fd, follow_symlinks=False)
                    inputs = session / db_dir / 'inputs'
                    scratch = session / db_dir / 'pgdata'
                    check_copy(inputs_fd, entry, c, monitor)
                    stage = 'same-dump-toc-derivation'
                    name = session_id + '-toc-%d' % index
                    with monitor.helper(toc_command(c, name, inputs), name) as process:
                        with GuardedStream(process.stdout, monitor) as stream:
                            materialized = parse_materialized_toc(stream, entry['sha256'], check=monitor.tick)
                        monitor.wait(process)
                    check_copy(inputs_fd, entry, c, monitor)
                    _write_json(db_fd, 'expected-materialized-toc.json', materialized)
                    stage = 'same-dump-count-derivation'
                    name = session_id + '-counts-%d' % index
                    with monitor.helper(count_command(c, name, inputs), name) as process:
                        with GuardedStream(process.stdout, monitor) as stream:
                            counts = parse_copy_stream(stream, entry['sha256'], check=monitor.tick)
                        monitor.wait(process)
                    check_copy(inputs_fd, entry, c, monitor)
                    _write_json(db_fd, 'expected-counts.json', counts)
                    stage = 'isolated-sql-restore'
                    name = session_id + '-db-%d' % index
                    with monitor.helper(restore_command(c, name, inputs, scratch, script), name) as process:
                        with GuardedStream(process.stdout, monitor) as stream:
                            actual = read_inventory(stream)
                            summary = compare_counts(counts, actual, materialized)
                            _write_json(db_fd, 'restored-counts.json', {
                                'tables': [row for row in actual if row['kind'] in ('r', 'p')],
                                'comparison': summary})
                            _write_json(db_fd, 'restored-materialized-views.json', {
                                'dump_sha256': entry['sha256'],
                                'toc_stream_sha256': materialized['toc_stream_sha256'],
                                'views': [row for row in actual if row['kind'] == 'm'],
                                'exact_inventory_matches_dump_toc': True,
                                'row_count_semantics': 'observed after restore; derived cache data, not dump COPY row-count proof'})
                            hook_result = None
                            if validation_hook is not None:
                                stage = 'optional-application-checks'
                                with sandbox_socket(scratch, c['restore_uid']) as socket_source:
                                    context = {'database': database, 'sandbox_name': name,
                                               'socket_path': str(scratch / 'socket'),
                                               'socket_mount_source': socket_source,
                                               'session_path': str(session), 'inputs_path': str(inputs),
                                               'scratch_path': str(scratch), 'dump_sha256': entry['sha256'],
                                               'inventory': actual, 'manifest': manifest}
                                    hook_result = validation_hook(context, monitor)
                                _write_json(db_fd, 'optional-checks.json', hook_result)
                            stage = 'isolated-helper-finalization'
                            marker = os.open('complete', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                                             0o400, dir_fd=inputs_fd)
                            os.fsync(marker)
                            os.close(marker)
                            if stream.read(1):
                                raise BackupError('Unexpected trailing isolated helper output')
                        monitor.wait(process)
                    check_copy(inputs_fd, entry, c, monitor)
                    summary.update({'database': database, 'dump_sha256': entry['sha256'],
                                    'optional_checks': 'not requested' if hook_result is None else 'recorded separately'})
                    summaries.append(summary)
                    _write_json(db_fd, 'passed.json', summary)
                finally:
                    if inputs_fd is not None:
                        os.close(inputs_fd)
                    os.close(db_fd)
        monitor.guard.check(force_health=True)
        result = dict(event, completed_at=utcnow(), seconds=round(time.monotonic() - monitor.started, 1),
                      result='isolated SQL restore and same-dump physical table counts passed',
                      databases=summaries, application_recovery_proven=False,
                      cross_system_snapshot_proven=False)
        _write_json(session_fd, 'passed.json', result)
        return {'run_id': run_id, 'approval_id': approval_id, 'retained_scratch': str(session),
                'databases_checked': len(summaries),
                'physical_tables_checked': sum(row['physical_tables'] for row in summaries),
                'rows_checked': sum(row['rows'] for row in summaries),
                'materialized_views_checked': sum(row['materialized_views_checked'] for row in summaries),
                'materialized_view_rows_observed': sum(row['materialized_view_rows_observed'] for row in summaries),
                'materialized_view_rows_are_derived_observations': True,
                'isolated_sql_restore_passed': True, 'same_dump_counts_passed': True,
                'application_recovery_proven': False, 'cross_system_snapshot_proven': False}
    except BaseException as error:
        if session_fd is not None:
            _write_json(session_fd, 'failed.json', {'schema_version': 1, 'run_id': run_id,
                        'failed_at': utcnow(), 'stage': stage, 'error_type': type(error).__name__,
                        'result': 'unproven; inspect retained private evidence',
                        'databases_completed': len(summaries), 'automatic_data_deletion': False})
        raise
    finally:
        if session_fd is not None:
            os.close(session_fd)
        os.close(parent)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/falcon-local-backup/config.json')
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--approval-id', required=True, help='Reference to explicit human authorization; not a secret')
    parser.add_argument('--i-confirm-disposable-restore', action='store_true', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise BackupError('Root is required for the fixed Docker dispatcher')
    def interrupted(signum, frame):
        raise BackupError('Disposable restore interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', args.approval_id):
        raise BackupError('A non-secret explicit authorization reference is required')
    if available_memory() < int(1.5 * GIB):
        raise BackupError('Restore blocked: available memory is below 1.5 GiB')
    print(json.dumps(run_restore(load_config(args.config), args.run_id, args.approval_id)))


if __name__ == '__main__':
    try:
        ensure_runtime_directory()
        with lock('/run/falcon-local-backup/lock'):
            main()
    except (BackupError, OSError, ValueError, KeyError, TypeError) as error:
        print('FALCON restore check refused/failed; result unproven (%s)' % type(error).__name__, file=sys.stderr)
        sys.exit(1)
