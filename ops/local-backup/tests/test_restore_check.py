"""Synthetic only: no Docker daemon, application data or production access."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import time
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import restore_check as restore

RUN = '20261021T000000Z-' + 'a' * 32
DATA = (b'-- PostgreSQL database dump\n'
        b"SET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n"
        b'COPY public.records (id) FROM stdin;\n1\n2\n\\.\n'
        b'COPY public.empty (id) FROM stdin;\n\\.\n'
        b'-- PostgreSQL database dump complete\n')
ROWS = [{'schema': 'public', 'table': 'records', 'kind': 'r', 'rows': 2},
        {'schema': 'public', 'table': 'empty', 'kind': 'r', 'rows': 0}]


def config(root):
    return {'staging_root': str(root / 'staging'), 'final_root': str(root / 'finalized'),
            'databases': ['postgres', 'university_governance'],
            'image': 'sha256:' + 'b' * 64, 'restore_uid': os.getuid() or 70,
            'restore_gid': os.getgid(), 'working_bytes': restore.MIB,
            'health_urls': ['https://example.invalid/health']}


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/tmp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.c = config(self.root)
        for name in ('staging', 'finalized', 'restore-check'):
            (self.root / name).mkdir(mode=0o700)
        self.path = self.root / 'finalized' / RUN
        self.path.mkdir(mode=0o700)
        self.manifest = {'schema_version': 1, 'run_id': RUN, 'database_names': self.c['databases'],
                         'postgres_image_id': self.c['image'], 'files': []}
        for name in restore.expected_files(self.c):
            data = b'PGDMP-test' if name.endswith('.dump') else b'fixture'
            path = self.path / name
            path.write_bytes(data)
            path.chmod(0o600)
            self.manifest['files'].append({'name': name, 'bytes': len(data),
                                            'sha256': hashlib.sha256(data).hexdigest()})
        self.save_manifest()

    def save_manifest(self):
        path = self.path / 'manifest.json'
        path.write_text(json.dumps(self.manifest))
        path.chmod(0o600)

    def sessions(self):
        return list((self.root / 'restore-check').glob('falcon-restore-check-*'))


class InputTests(Fixture):
    def test_verified_scope_succeeds_without_modifying_originals(self):
        before = {p.name: (p.read_bytes(), p.stat().st_mode) for p in self.path.iterdir()}
        self.assertEqual(restore.check_set(self.c, RUN), self.manifest)
        self.assertEqual(before, {p.name: (p.read_bytes(), p.stat().st_mode) for p in self.path.iterdir()})

    def test_duplicate_manifest_entry_refused(self):
        self.manifest['files'][-1] = self.manifest['files'][0]
        self.save_manifest()
        with self.assertRaises(restore.BackupError):
            restore.check_set(self.c, RUN)

    def test_scope_image_and_database_mismatch_refused(self):
        for key, value in [('postgres_image_id', 'sha256:' + 'c' * 64),
                           ('database_names', ['postgres']), ('run_id', RUN + 'x')]:
            original = self.manifest[key]
            self.manifest[key] = value
            self.save_manifest()
            with self.assertRaises(restore.BackupError):
                restore.check_set(self.c, RUN)
            self.manifest[key] = original

    def test_symlink_and_hardlink_original_refused(self):
        original = self.path / self.manifest['files'][0]['name']
        moved = self.root / 'saved'
        original.rename(moved)
        original.symlink_to(moved)
        with self.assertRaises(OSError):
            restore.check_set(self.c, RUN)
        original.unlink()
        os.link(moved, original)
        with self.assertRaisesRegex(restore.BackupError, 'single-link'):
            restore.check_set(self.c, RUN)

    def test_fifo_refused_without_blocking(self):
        original = self.path / self.manifest['files'][0]['name']
        original.unlink()
        os.mkfifo(original, 0o600)
        with self.assertRaises(restore.BackupError):
            restore.check_set(self.c, RUN)

    def test_changed_digest_and_extra_file_refused(self):
        original = self.path / self.manifest['files'][0]['name']
        original.write_bytes(b'changed')
        with self.assertRaisesRegex(restore.BackupError, 'hash/size'):
            restore.check_set(self.c, RUN)
        (self.path / 'unexpected').write_text('x')
        with self.assertRaisesRegex(restore.BackupError, 'Unexpected'):
            restore.check_set(self.c, RUN)

    def test_shared_modes_refused(self):
        original = self.path / self.manifest['files'][0]['name']
        original.chmod(0o640)
        with self.assertRaisesRegex(restore.BackupError, 'private'):
            restore.check_set(self.c, RUN)

    def test_metadata_duplicate_key_and_oversize_refused(self):
        path = self.path / 'manifest.json'
        path.write_text('{"files":[],"files":[]}')
        with self.assertRaisesRegex(restore.BackupError, 'Duplicate'):
            restore.check_set(self.c, RUN)
        self.save_manifest()
        with mock.patch.object(restore, 'MAX_METADATA', 10):
            with self.assertRaisesRegex(restore.BackupError, 'metadata limit'):
                restore.check_set(self.c, RUN)

    def test_held_directory_not_replaced_path_is_used(self):
        with restore.checked_set(self.c, RUN) as (fd, manifest):
            old = self.root / 'finalized' / 'retained'
            self.path.rename(old)
            self.path.mkdir(mode=0o700)
            (self.path / manifest['files'][0]['name']).write_bytes(b'wrong inode')
            inputs = self.root / 'input'
            inputs.mkdir(mode=0o700)
            target_fd = restore.open_directory(inputs)
            try:
                restore.copy_dump(fd, manifest['files'][0], target_fd, self.c, mock.Mock())
            finally:
                os.close(target_fd)
            self.assertEqual((inputs / 'database.dump').read_bytes(), b'PGDMP-test')

    def test_copy_rechecks_manifest_after_initial_verification(self):
        with restore.checked_set(self.c, RUN) as (fd, manifest):
            (self.path / manifest['files'][0]['name']).write_bytes(b'replaced')
            inputs = self.root / 'input'
            inputs.mkdir(mode=0o700)
            target_fd = restore.open_directory(inputs)
            try:
                with self.assertRaisesRegex(restore.BackupError, 'hash/size'):
                    restore.copy_dump(fd, manifest['files'][0], target_fd, self.c, mock.Mock())
            finally:
                os.close(target_fd)


class SocketTests(Fixture):
    def socket_tree(self):
        scratch = self.root / 'scratch'
        scratch.mkdir(mode=0o700)
        directory = scratch / 'socket'
        directory.mkdir(mode=0o700)
        endpoint = socket.socket(socket.AF_UNIX)
        endpoint.bind(str(directory / '.s.PGSQL.55432'))
        self.addCleanup(endpoint.close)
        return scratch, directory

    def test_held_socket_inode_survives_directory_replacement(self):
        scratch, directory = self.socket_tree()
        original = directory.stat().st_ino
        with restore.sandbox_socket(scratch, os.getuid()) as anchor:
            fd = int(anchor.rsplit('/', 1)[1])
            directory.rename(scratch / 'retained-socket')
            directory.mkdir(mode=0o700)
            self.assertEqual(os.fstat(fd).st_ino, original)
            self.assertNotEqual(directory.stat().st_ino, original)
            self.assertTrue(anchor.startswith('/proc/%d/fd/' % os.getpid()))
        with self.assertRaises(OSError):
            os.fstat(fd)

    def test_symlink_directory_or_endpoint_is_refused(self):
        scratch, directory = self.socket_tree()
        directory.rename(scratch / 'saved')
        directory.symlink_to(scratch / 'saved')
        with self.assertRaises(OSError):
            with restore.sandbox_socket(scratch, os.getuid()):
                self.fail('followed socket-directory symlink')
        directory.unlink()
        directory.mkdir(mode=0o700)
        (directory / '.s.PGSQL.55432').symlink_to(scratch / 'saved' / '.s.PGSQL.55432')
        with self.assertRaisesRegex(restore.BackupError, 'Unsafe isolated'):
            with restore.sandbox_socket(scratch, os.getuid()):
                self.fail('followed socket endpoint symlink')

    def test_shared_socket_directory_refused(self):
        scratch, directory = self.socket_tree()
        directory.chmod(0o750)
        with self.assertRaisesRegex(restore.BackupError, 'Unsafe isolated'):
            with restore.sandbox_socket(scratch, os.getuid()):
                self.fail('shared IPC directory accepted')


class ComparisonTests(unittest.TestCase):
    def expected(self):
        return {'tables': [{'schema': row['schema'], 'table': row['table'], 'rows': row['rows']} for row in ROWS]}

    def test_exact_inventory_zero_and_nonzero(self):
        result = restore.compare_counts(self.expected(), ROWS)
        self.assertEqual(result['physical_tables'], 2)
        self.assertEqual(result['rows'], 2)

    def test_missing_extra_and_count_mismatch_refused(self):
        changes = [ROWS[:1], ROWS + [{'schema': 'public', 'table': 'extra', 'kind': 'r', 'rows': 0}],
                   [dict(ROWS[0], rows=3), ROWS[1]]]
        for rows in changes:
            with self.assertRaisesRegex(restore.BackupError, 'inventory/counts'):
                restore.compare_counts(self.expected(), rows)

    def test_equal_aggregate_does_not_hide_per_table_difference(self):
        rows = [dict(ROWS[0], rows=1), dict(ROWS[1], rows=1)]
        with self.assertRaises(restore.BackupError):
            restore.compare_counts(self.expected(), rows)

    def test_parent_zero_is_checked_without_double_counting(self):
        parent = {'schema': 'public', 'table': 'parent', 'kind': 'p', 'rows': 0}
        result = restore.compare_counts(self.expected(), ROWS + [parent])
        self.assertEqual(result['partition_parents'], 1)
        expected = self.expected()
        expected['tables'].append({'schema': 'public', 'table': 'parent', 'rows': 1})
        with self.assertRaisesRegex(restore.BackupError, 'Partition-root'):
            restore.compare_counts(expected, ROWS + [parent])

    def test_duplicate_or_unsupported_relation_refused(self):
        for rows in (ROWS + [ROWS[0]], [dict(ROWS[0], kind='f'), ROWS[1]],
                     [dict(ROWS[0], kind='m'), ROWS[1]]):
            with self.assertRaises(restore.BackupError):
                restore.compare_counts(self.expected(), rows)

    def test_inventory_requires_ready_and_bounded_metadata(self):
        wire = b''.join(json.dumps(row).encode() + b'\n' for row in ROWS)
        self.assertEqual(restore.read_inventory(io.BytesIO(wire + json.dumps(restore.READY).encode() + b'\n')), ROWS)
        with self.assertRaisesRegex(restore.BackupError, 'Incomplete'):
            restore.read_inventory(io.BytesIO(wire))
        with mock.patch.object(restore, 'MAX_METADATA', 5):
            with self.assertRaisesRegex(restore.BackupError, 'oversized'):
                restore.read_inventory(io.BytesIO(wire))


class GuardTests(unittest.TestCase):
    def monitor(self):
        with mock.patch.object(restore, 'Guard'):
            return restore.Monitor({})

    def test_memory_floor_and_timeout(self):
        monitor = self.monitor()
        with mock.patch.object(restore, 'available_memory', return_value=restore.GIB - 1):
            with self.assertRaisesRegex(restore.BackupError, 'memory pressure'):
                monitor.tick(force=True)
        monitor.started = time.monotonic() - 1801
        with self.assertRaisesRegex(restore.BackupError, 'timed out'):
            monitor.tick()

    def test_health_failure_propagates(self):
        monitor = self.monitor()
        monitor.guard.check.side_effect = restore.BackupError('two failed health rounds')
        with mock.patch.object(restore, 'available_memory', return_value=2 * restore.GIB):
            with self.assertRaisesRegex(restore.BackupError, 'health'):
                monitor.tick(force=True)

    def test_silent_pipe_still_runs_guard(self):
        read_fd, write_fd = os.pipe()
        with os.fdopen(read_fd, 'rb') as pipe:
            monitor = mock.Mock()
            monitor.tick.side_effect = restore.BackupError('memory pressure')
            try:
                with restore.GuardedStream(pipe, monitor) as stream:
                    with self.assertRaisesRegex(restore.BackupError, 'memory pressure'):
                        stream.readline(100)
            finally:
                os.close(write_fd)

    def test_partial_line_and_eof_and_read_bounds(self):
        read_fd, write_fd = os.pipe()
        os.write(write_fd, b'abc\ndef')
        os.close(write_fd)
        with os.fdopen(read_fd, 'rb') as pipe, restore.GuardedStream(pipe, mock.Mock()) as stream:
            self.assertEqual(stream.readline(2), b'ab')
            self.assertEqual(stream.readline(10), b'c\n')
            self.assertEqual(stream.read(3), b'def')
            self.assertEqual(stream.read(1), b'')
            with self.assertRaises(restore.BackupError):
                stream.read()

    def test_cleanup_only_generated_container_on_parser_error(self):
        monitor = self.monitor()
        process = mock.Mock(stdout=io.BytesIO(), returncode=None)
        process.poll.return_value = None
        with mock.patch.object(monitor, 'tick'), mock.patch.object(restore.subprocess, 'Popen', return_value=process), mock.patch.object(restore.subprocess, 'run') as remove:
            with self.assertRaisesRegex(ValueError, 'synthetic'):
                with monitor.helper(['fixed-command'], 'falcon-restore-check-' + 'b' * 32):
                    raise ValueError('synthetic')
        self.assertEqual(remove.call_args.args[0], restore.DOCKER + ['rm', '-f', 'falcon-restore-check-' + 'b' * 32])
        process.terminate.assert_called_once()

    def test_cleanup_namespace_cannot_target_production_name(self):
        monitor = self.monitor()
        with mock.patch.object(restore.subprocess, 'Popen') as popen:
            with self.assertRaisesRegex(restore.BackupError, 'generated'):
                with monitor.helper(['fixed'], 'production-database'):
                    pass
            popen.assert_not_called()

    def test_helpers_have_no_network_secret_or_source_mount(self):
        c = config(Path('/data/private'))
        for command in (restore.count_command(c, 'name', '/private-input'),
                        restore.restore_command(c, 'name', '/private-input', '/private-scratch', '/reviewed-script')):
            for flag, value in [('--network', 'none'), ('--pull', 'never'), ('--memory', '256m'),
                                ('--memory-swap', '256m'), ('--cpus', '0.5')]:
                self.assertEqual(command[command.index(flag) + 1], value)
            self.assertIn('--read-only', command)
            self.assertIn('--cap-drop', command)
            self.assertNotIn('PGPASSWORD', ' '.join(command))
            self.assertFalse(any('docker.sock' in v for v in command if v.startswith('type=bind')))


class FakeMonitor:
    def __init__(self, config):
        self.guard = mock.Mock()
        self.started = time.monotonic()
        self.active = self.maximum_active = 0
        self.names = []
        self.nonzero = False
        self.rows = ROWS

    def tick(self, **kwargs):
        pass

    @contextlib.contextmanager
    def helper(self, command, name):
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        self.names.append(name)
        output = DATA if '-counts-' in name else b''.join(json.dumps(row).encode() + b'\n' for row in self.rows) + json.dumps(restore.READY).encode() + b'\n'
        process = mock.Mock(stdout=io.BytesIO(output), returncode=1 if self.nonzero else 0)
        try:
            yield process
        finally:
            self.active -= 1

    def wait(self, process):
        if process.returncode:
            raise restore.BackupError('Synthetic helper nonzero')


class LifecycleTests(Fixture):
    def run_fake(self, monitor=None, hook=None):
        monitor = monitor or FakeMonitor(self.c)
        with mock.patch.object(restore, 'available_memory', return_value=2 * restore.GIB), mock.patch.object(restore, 'Monitor', return_value=monitor), mock.patch.object(restore, 'trusted_file', side_effect=lambda path: os.open(path, os.O_RDONLY)), mock.patch.object(restore, 'GuardedStream', side_effect=lambda pipe, monitor: contextlib.nullcontext(pipe)), mock.patch.object(restore, 'sandbox_socket', side_effect=lambda scratch, uid: contextlib.nullcontext('/proc/123/fd/4')):
            return restore.run_restore(self.c, RUN, 'explicit-user-turn', hook)

    def test_success_is_serialized_retains_private_evidence_and_originals(self):
        before = {p.name: p.read_bytes() for p in self.path.iterdir()}
        monitor = FakeMonitor(self.c)
        summary = self.run_fake(monitor)
        self.assertEqual(monitor.maximum_active, 1)
        self.assertEqual(summary['databases_checked'], 2)
        self.assertEqual(summary['physical_tables_checked'], 4)
        self.assertEqual(summary['rows_checked'], 4)
        self.assertFalse(summary['application_recovery_proven'])
        self.assertNotIn('records', json.dumps(summary))
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.path.iterdir()})
        session = self.sessions()[0]
        self.assertTrue((session / 'passed.json').is_file())
        self.assertFalse((session / 'failed.json').exists())
        for idx in range(2):
            for name in ('expected-counts.json', 'restored-counts.json', 'passed.json'):
                path = session / ('db-%d' % idx) / name
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertTrue((session / ('db-%d' % idx) / 'inputs' / 'database.dump').exists())

    def test_nonzero_export_never_promoted_to_expected_evidence(self):
        monitor = FakeMonitor(self.c)
        monitor.nonzero = True
        with self.assertRaisesRegex(restore.BackupError, 'nonzero'):
            self.run_fake(monitor)
        session = self.sessions()[0]
        self.assertTrue((session / 'failed.json').exists())
        self.assertFalse((session / 'passed.json').exists())
        self.assertFalse((session / 'db-0' / 'expected-counts.json').exists())

    def test_count_mismatch_retains_expected_and_failure_status(self):
        monitor = FakeMonitor(self.c)
        monitor.rows = [dict(ROWS[0], rows=99), ROWS[1]]
        with self.assertRaisesRegex(restore.BackupError, 'inventory/counts'):
            self.run_fake(monitor)
        session = self.sessions()[0]
        self.assertTrue((session / 'db-0' / 'expected-counts.json').exists())
        event = json.loads((session / 'failed.json').read_text())
        self.assertEqual(event['stage'], 'isolated-sql-restore')
        self.assertNotIn('99', json.dumps(event))
        self.assertEqual(len(monitor.names), 2)

    def test_hook_sees_only_current_private_sandbox_before_completion(self):
        seen = []
        def hook(context, monitor):
            self.assertFalse((Path(context['inputs_path']) / 'complete').exists())
            self.assertTrue(context['socket_path'].endswith('/pgdata/socket'))
            self.assertEqual(context['socket_mount_source'], '/proc/123/fd/4')
            self.assertEqual(monitor.active, 1)
            seen.append(context['database'])
            return {'document_check_passed': False, 'status': 'not implemented'}
        summary = self.run_fake(hook=hook)
        self.assertEqual(seen, self.c['databases'])
        self.assertFalse(summary['application_recovery_proven'])

    def test_hook_failure_retains_unproven_status_and_stops_sequence(self):
        monitor = FakeMonitor(self.c)
        def hook(context, monitor):
            raise restore.BackupError('Synthetic offline checker refused')
        with self.assertRaisesRegex(restore.BackupError, 'offline checker'):
            self.run_fake(monitor, hook)
        session = self.sessions()[0]
        self.assertTrue((session / 'failed.json').exists())
        self.assertFalse((session / 'db-0' / 'inputs' / 'complete').exists())
        self.assertEqual(len(monitor.names), 2)
        self.assertEqual(monitor.active, 0)

    def test_low_start_memory_starts_nothing(self):
        with mock.patch.object(restore, 'available_memory', return_value=int(1.5 * restore.GIB) - 1), mock.patch.object(restore, 'Monitor') as monitor:
            with self.assertRaisesRegex(restore.BackupError, '1.5 GiB'):
                restore.run_restore(self.c, RUN, 'approval')
            monitor.assert_not_called()
        self.assertEqual(self.sessions(), [])


if __name__ == '__main__':
    unittest.main()
