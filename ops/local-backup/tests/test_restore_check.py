"""Synthetic only: no Docker daemon, application data or production access."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
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
TOC_HEADER = (b';\n; Archive created at synthetic\n; TOC Entries: 3\n; Format: CUSTOM\n'
              b'; Dumped by pg_dump version: 18.4\n;\n; Selected TOC Entries:\n;\n')


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


class FakeKernelMounts:
    def __init__(self):
        self.live = None
        self.calls = []
        self.source_fd = None
        self.unmount_error = None
        self.skip_hardening = False
        self.wrong_inode = False

    def bind(self, source, target):
        self.calls.append(('bind', source, str(target)))
        self.source_fd = int(source.rsplit('/', 1)[1])
        info = os.fstat(self.source_fd)
        self.live = {'mount_id': 123, 'device': info.st_dev,
                     'inode': info.st_ino + int(self.wrong_inode), 'uid': info.st_uid,
                     'mode': info.st_mode, 'private': False, 'options': {'rw'}, 'children': False}

    def make_private(self, target):
        self.calls.append(('private', str(target)))
        self.live['private'] = True

    def remount_readonly(self, target):
        self.calls.append(('readonly', str(target)))
        if not self.skip_hardening:
            self.live['options'] = {'ro', 'nosuid', 'nodev', 'noexec'}

    def state(self, target):
        return copy.deepcopy(self.live)

    def unmount(self, target):
        self.calls.append(('unmount', str(target)))
        if self.unmount_error:
            raise self.unmount_error
        self.live = None


class SocketTests(Fixture):
    def setUp(self):
        super().setUp()
        # Local tests run as a normal account under sticky /tmp. Production's
        # root-only ancestry check is tested separately below, not weakened.
        patch = mock.patch.object(restore, 'open_anchor_directory', side_effect=restore.open_directory)
        patch.start()
        self.addCleanup(patch.stop)

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
        ops = FakeKernelMounts()
        def absent():
            ops.calls.append(('consumer_absent',))
            return True
        with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=absent, mount_ops=ops) as anchor:
            fd = ops.source_fd
            ops.calls.append(('consumer',))
            directory.rename(scratch / 'retained-socket')
            directory.mkdir(mode=0o700)
            self.assertEqual(os.fstat(fd).st_ino, original)
            self.assertNotEqual(directory.stat().st_ino, original)
            self.assertTrue(anchor.startswith(str(self.root / 'ipc-anchors' / 'socket-')))
            self.assertEqual(Path(anchor).parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual([call[0] for call in ops.calls],
                         ['bind', 'private', 'readonly', 'consumer', 'consumer_absent', 'unmount'])
        self.assertIsNone(ops.live)
        self.assertTrue(Path(anchor).is_dir())
        self.assertEqual(len(list(Path(anchor).parent.glob('*-unmounted.json'))), 1)
        with self.assertRaises(OSError):
            os.fstat(fd)

    def test_symlink_directory_or_endpoint_is_refused(self):
        scratch, directory = self.socket_tree()
        directory.rename(scratch / 'saved')
        directory.symlink_to(scratch / 'saved')
        with self.assertRaises(OSError):
            with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: True, mount_ops=FakeKernelMounts()):
                self.fail('followed socket-directory symlink')
        directory.unlink()
        directory.mkdir(mode=0o700)
        (directory / '.s.PGSQL.55432').symlink_to(scratch / 'saved' / '.s.PGSQL.55432')
        with self.assertRaisesRegex(restore.BackupError, 'Unsafe isolated'):
            with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: True, mount_ops=FakeKernelMounts()):
                self.fail('followed socket endpoint symlink')

    def test_shared_socket_directory_refused(self):
        scratch, directory = self.socket_tree()
        directory.chmod(0o750)
        with self.assertRaisesRegex(restore.BackupError, 'Unsafe isolated'):
            with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: True, mount_ops=FakeKernelMounts()):
                self.fail('shared IPC directory accepted')

    def test_anchor_inside_writable_scratch_is_refused(self):
        scratch, _ = self.socket_tree()
        ops = FakeKernelMounts()
        with self.assertRaisesRegex(restore.BackupError, 'outside'):
            with restore.sandbox_socket(scratch, os.getuid(), scratch / 'ipc-anchors',
                                        consumer_absent=lambda: True, mount_ops=ops):
                self.fail('anchor exposed through scratch')
        self.assertEqual(ops.calls, [])

    def test_mount_identity_child_mount_or_consumer_uncertainty_retains_anchor(self):
        scratch, _ = self.socket_tree()
        for fault in ('mount_id', 'children', 'consumer'):
            ops = FakeKernelMounts()
            with self.assertRaisesRegex(restore.BackupError, 'cleanup failed'):
                with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: fault != 'consumer', mount_ops=ops):
                    if fault == 'mount_id':
                        ops.live['mount_id'] += 1
                    elif fault == 'children':
                        ops.live['children'] = True
            self.assertIsNotNone(ops.live)
            self.assertNotIn('unmount', [call[0] for call in ops.calls])
        self.assertEqual(len(list((self.root / 'ipc-anchors').glob('*-cleanup-failed.json'))), 3)

    def test_busy_unmount_retains_anchor_without_force_or_lazy_retry(self):
        scratch, _ = self.socket_tree()
        ops = FakeKernelMounts()
        ops.unmount_error = OSError(16, 'synthetic busy')
        with self.assertRaisesRegex(restore.BackupError, 'cleanup failed'):
            with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: True, mount_ops=ops):
                pass
        self.assertEqual([call[0] for call in ops.calls].count('unmount'), 1)
        self.assertIsNotNone(ops.live)

    def test_wrong_inode_retained_and_missing_hardening_cleanly_unmounted(self):
        scratch, _ = self.socket_tree()
        ops = FakeKernelMounts()
        ops.wrong_inode = True
        with self.assertRaisesRegex(restore.BackupError, 'cleanup failed'):
            with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: True, mount_ops=ops):
                self.fail('wrong inode yielded')
        self.assertIsNotNone(ops.live)
        ops = FakeKernelMounts()
        ops.skip_hardening = True
        with self.assertRaisesRegex(restore.BackupError, 'hardening'):
            with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: True, mount_ops=ops):
                self.fail('unprotected bind yielded')
        self.assertIsNone(ops.live)

    def test_no_source_permission_changes_and_body_failure_still_cleans_mount(self):
        scratch, _ = self.socket_tree()
        ops = FakeKernelMounts()
        with mock.patch.object(restore.os, 'chmod') as chmod, mock.patch.object(restore.os, 'chown') as chown:
            with self.assertRaisesRegex(ValueError, 'synthetic checker'):
                with restore.sandbox_socket(scratch, os.getuid(), consumer_absent=lambda: True, mount_ops=ops):
                    raise ValueError('synthetic checker')
            chmod.assert_not_called()
            chown.assert_not_called()
        self.assertIsNone(ops.live)


class KernelMountTests(unittest.TestCase):
    def test_syscalls_preserve_literal_source_and_never_recursive_or_forced(self):
        kernel = restore.KernelMounts.__new__(restore.KernelMounts)
        kernel.libc = mock.Mock()
        kernel.libc.mount.return_value = 0
        kernel.libc.umount2.return_value = 0
        kernel.bind('/proc/123/fd/4', '/private/target')
        kernel.make_private('/private/target')
        kernel.remount_readonly('/private/target')
        flags = [call.args[3] for call in kernel.libc.mount.call_args_list]
        self.assertEqual(flags, [4096, 1 << 18, 4096 | 32 | 1 | 2 | 4 | 8])
        self.assertEqual(kernel.libc.mount.call_args_list[0].args[0], b'/proc/123/fd/4')
        self.assertTrue(all(not value & 16384 for value in flags))
        kernel.unmount('/private/target')
        kernel.libc.umount2.assert_called_once_with(b'/private/target', 0)

    def test_mountinfo_decodes_paths_and_propagation(self):
        records = restore.mount_records('12 1 8:1 / /private/target\\040space ro,nosuid,nodev,noexec - ext4 /dev/test rw\n'
                                        '13 12 8:1 / /private/child rw shared:2 - ext4 /dev/test rw\n')
        self.assertEqual(records[0]['point'], '/private/target space')
        self.assertTrue(records[0]['private'])
        self.assertFalse(records[1]['private'])
        self.assertEqual(records[0]['options'], {'ro', 'nosuid', 'nodev', 'noexec'})

    def test_every_anchor_ancestor_must_be_root_owned_and_not_writable(self):
        info = lambda uid, mode: mock.Mock(st_uid=uid, st_mode=stat.S_IFDIR | mode)
        for metadata in ([info(0, 0o755), info(70, 0o700)], [info(0, 0o755), info(0, 0o777)]):
            with mock.patch.object(restore.os, 'open', side_effect=[100, 101]), mock.patch.object(restore.os, 'close'), mock.patch.object(restore.os, 'fstat', side_effect=metadata):
                with self.assertRaisesRegex(restore.BackupError, 'ancestors'):
                    restore.open_anchor_directory('/unsafe')
        with mock.patch.object(restore.os, 'open', side_effect=[100, 101, 102]) as opened, mock.patch.object(restore.os, 'close'), mock.patch.object(restore.os, 'fstat', return_value=info(0, 0o755)):
            self.assertEqual(restore.open_anchor_directory('/safe/root'), 102)
            self.assertTrue(all(call.args[1] & restore.NOFOLLOW for call in opened.call_args_list))


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

    def materialized(self):
        expected = dict(self.expected(), dump_sha256='a' * 64)
        toc = {'schema_version': 1, 'dump_sha256': 'a' * 64, 'materialized_views': [
            {'schema': 'public', 'table': 'summary', 'object_oid': 12345,
             'definition_toc_id': 10, 'data_toc_id': 20, 'refresh_intended': True}]}
        actual = ROWS + [{'schema': 'public', 'table': 'summary', 'kind': 'm', 'rows': 42}]
        return expected, actual, toc

    def test_declared_materialized_cache_is_separate_from_copy_counts(self):
        expected, actual, toc = self.materialized()
        result = restore.compare_counts(expected, actual, toc)
        self.assertEqual(result['physical_tables'], 2)
        self.assertEqual(result['rows'], 2)
        self.assertEqual(result['materialized_views_checked'], 1)
        self.assertEqual(result['materialized_view_rows_observed'], 42)
        self.assertTrue(result['materialized_view_inventory_matches_dump_toc'])
        self.assertTrue(result['materialized_view_rows_are_derived_observations'])

    def test_materialized_inventory_missing_unknown_or_duplicate_is_refused(self):
        expected, actual, toc = self.materialized()
        for rows in (ROWS, actual + [dict(actual[-1], table='undeclared')], actual + [actual[-1]]):
            with self.assertRaises(restore.BackupError):
                restore.compare_counts(expected, rows, toc)
        toc['materialized_views'].append(toc['materialized_views'][0])
        with self.assertRaisesRegex(restore.BackupError, 'Duplicate'):
            restore.compare_counts(expected, actual, toc)

    def test_materialized_toc_requires_same_dump_and_explicit_refresh(self):
        expected, actual, original = self.materialized()
        for mutate in ('hash', 'missing_hash', 'refresh'):
            toc = copy.deepcopy(original)
            candidate = copy.deepcopy(expected)
            if mutate == 'hash':
                toc['dump_sha256'] = 'b' * 64
            elif mutate == 'missing_hash':
                toc.pop('dump_sha256')
                candidate.pop('dump_sha256')
            else:
                toc['materialized_views'][0]['refresh_intended'] = False
            with self.assertRaises(restore.BackupError):
                restore.compare_counts(candidate, actual, toc)

    def test_materialized_cache_cannot_hide_copy_or_foreign_relation(self):
        expected, actual, toc = self.materialized()
        with self.assertRaisesRegex(restore.BackupError, 'foreign'):
            restore.compare_counts(expected, actual + [{'schema': 'public', 'table': 'remote', 'kind': 'f', 'rows': 0}], toc)
        expected['tables'].append({'schema': 'public', 'table': 'summary', 'rows': 42})
        with self.assertRaisesRegex(restore.BackupError, 'conflicting'):
            restore.compare_counts(expected, actual, toc)

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

    def test_consumer_absence_requires_successful_scoped_empty_query(self):
        monitor = self.monitor()
        name = 'falcon-restore-check-' + 'b' * 32 + '-content'
        for code, output, expected in ((0, b'', True), (0, b'container-id\n', False), (1, b'', False)):
            with mock.patch.object(restore.subprocess, 'run', return_value=mock.Mock(returncode=code, stdout=output)) as query:
                self.assertEqual(monitor.container_absent(name), expected)
                self.assertEqual(query.call_args.args[0][-2:], ['--filter', 'name=^/' + name + '$'])
        with mock.patch.object(restore.subprocess, 'run', side_effect=subprocess.TimeoutExpired('synthetic', 10)):
            self.assertFalse(monitor.container_absent(name))
        with self.assertRaises(restore.BackupError):
            monitor.container_absent('production-database')

    def test_helpers_have_no_network_secret_or_source_mount(self):
        c = config(Path('/data/private'))
        for command in (restore.count_command(c, 'name', '/private-input'),
                        restore.toc_command(c, 'name', '/private-input'),
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
        self.fail_stage = None
        self.rows = ROWS
        self.views = []

    def tick(self, **kwargs):
        pass

    @contextlib.contextmanager
    def helper(self, command, name):
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        self.names.append(name)
        if '-toc-' in name:
            output = TOC_HEADER.replace(b'TOC Entries: 3', ('TOC Entries: %d' % (3 + 2 * len(self.views))).encode())
            for index, view in enumerate(self.views):
                output += ('%d; 1259 %d MATERIALIZED VIEW %s %s postgres\n%d; 0 %d MATERIALIZED VIEW DATA %s %s postgres\n' %
                           (10 + index, 12345 + index, view['schema'], view['table'],
                            20 + index, 12345 + index, view['schema'], view['table'])).encode('ascii')
        elif '-counts-' in name:
            output = DATA
        else:
            output = b''.join(json.dumps(row).encode() + b'\n' for row in self.rows) + json.dumps(restore.READY).encode() + b'\n'
        failure = self.nonzero and (self.fail_stage is None or '-' + self.fail_stage + '-' in name)
        process = mock.Mock(stdout=io.BytesIO(output), returncode=1 if failure else 0)
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
        with mock.patch.object(restore, 'available_memory', return_value=2 * restore.GIB), mock.patch.object(restore, 'Monitor', return_value=monitor), mock.patch.object(restore, 'trusted_file', side_effect=lambda path: os.open(path, os.O_RDONLY)), mock.patch.object(restore, 'GuardedStream', side_effect=lambda pipe, monitor: contextlib.nullcontext(pipe)), mock.patch.object(restore, 'sandbox_socket', side_effect=lambda scratch, uid, anchor_parent, **kwargs: contextlib.nullcontext('/private/protected-ipc-anchor')):
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
            for name in ('expected-counts.json', 'restored-counts.json', 'expected-materialized-toc.json',
                         'restored-materialized-views.json', 'passed.json'):
                path = session / ('db-%d' % idx) / name
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertTrue((session / ('db-%d' % idx) / 'inputs' / 'database.dump').exists())

    def test_nonzero_export_never_promoted_to_expected_evidence(self):
        monitor = FakeMonitor(self.c)
        monitor.nonzero = True
        monitor.fail_stage = 'counts'
        with self.assertRaisesRegex(restore.BackupError, 'nonzero'):
            self.run_fake(monitor)
        session = self.sessions()[0]
        self.assertTrue((session / 'failed.json').exists())
        self.assertFalse((session / 'passed.json').exists())
        self.assertFalse((session / 'db-0' / 'expected-counts.json').exists())
        self.assertTrue((session / 'db-0' / 'expected-materialized-toc.json').exists())

    def test_nonzero_toc_or_changed_copy_cannot_promote_toc_evidence(self):
        monitor = FakeMonitor(self.c)
        monitor.nonzero = True
        monitor.fail_stage = 'toc'
        with self.assertRaisesRegex(restore.BackupError, 'nonzero'):
            self.run_fake(monitor)
        session = self.sessions()[0]
        self.assertFalse((session / 'db-0' / 'expected-materialized-toc.json').exists())
        self.assertEqual(len(monitor.names), 1)
        with mock.patch.object(restore, 'check_copy', side_effect=[None, restore.BackupError('changed copy')]):
            with self.assertRaisesRegex(restore.BackupError, 'changed copy'):
                self.run_fake()
        changed = next(path for path in self.sessions() if path != session)
        self.assertFalse((changed / 'db-0' / 'expected-materialized-toc.json').exists())

    def test_materialized_toc_and_derived_rows_are_separate_private_evidence(self):
        monitor = FakeMonitor(self.c)
        views = [{'schema': 'public', 'table': 'summary_%d' % i, 'kind': 'm', 'rows': i + 1}
                 for i in range(8)]
        monitor.rows = ROWS + views
        monitor.views = views
        result = self.run_fake(monitor)
        self.assertEqual(result['rows_checked'], 4)
        self.assertEqual(result['materialized_views_checked'], 16)
        self.assertEqual(result['materialized_view_rows_observed'], 72)
        self.assertTrue(result['materialized_view_rows_are_derived_observations'])
        self.assertEqual(monitor.maximum_active, 1)
        session = self.sessions()[0]
        evidence = json.loads((session / 'db-0' / 'restored-materialized-views.json').read_text())
        self.assertEqual(evidence['views'], views)
        self.assertIn('not dump COPY row-count proof', evidence['row_count_semantics'])
        physical = json.loads((session / 'db-0' / 'restored-counts.json').read_text())
        self.assertEqual(physical['tables'], ROWS)

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
        self.assertEqual(len(monitor.names), 3)

    def test_hook_sees_only_current_private_sandbox_before_completion(self):
        seen = []
        def hook(context, monitor):
            self.assertFalse((Path(context['inputs_path']) / 'complete').exists())
            self.assertTrue(context['socket_path'].endswith('/pgdata/socket'))
            self.assertEqual(context['socket_mount_source'], '/private/protected-ipc-anchor')
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
        self.assertEqual(len(monitor.names), 3)
        self.assertEqual(monitor.active, 0)

    def test_low_start_memory_starts_nothing(self):
        with mock.patch.object(restore, 'available_memory', return_value=int(1.5 * restore.GIB) - 1), mock.patch.object(restore, 'Monitor') as monitor:
            with self.assertRaisesRegex(restore.BackupError, '1.5 GiB'):
                restore.run_restore(self.c, RUN, 'approval')
            monitor.assert_not_called()
        self.assertEqual(self.sessions(), [])


class ShellDiagnosticsTests(Fixture):
    """Exercise the shell with fake local PG binaries, never a database."""
    def run_shell(self, fail='', stop_failure=False, preexisting=False):
        case = self.root / ('shell-' + str(len(list(self.root.glob('shell-*')))))
        case.mkdir(mode=0o700)
        scratch, inputs, binaries = case / 'scratch', case / 'backup', case / 'bin'
        for directory in (scratch, inputs, binaries):
            directory.mkdir(mode=0o700)
        (inputs / 'database.dump').write_bytes(b'PGDMP-synthetic')
        if preexisting:
            (scratch / 'recovery-operations.log').write_text('must remain unchanged')
        fake = '''#!/usr/bin/env python3
import json, os, sys
name = os.path.basename(sys.argv[0])
if name == 'postgres':
    print('postgres (PostgreSQL) 18.0')
    raise SystemExit(0)
kind = name
if name == 'pg_ctl':
    kind = 'pg_ctl_stop' if 'stop' in sys.argv else 'pg_ctl_start'
    if kind == 'pg_ctl_start':
        assert '-l' in sys.argv
        assert sys.argv[sys.argv.index('-l') + 1] == os.environ['SYNTHETIC_LOG']
if kind == os.environ.get('FAIL_COMMAND') or (kind == 'pg_ctl_stop' and os.environ.get('FAIL_STOP') == '1'):
    print('SYNTHETIC_SECRET_ROW error detail', file=sys.stderr)
    print('SYNTHETIC_SECRET_ROW output detail')
    raise SystemExit(17)
if name == 'psql':
    sys.stdin.buffer.read()
    print(json.dumps({'schema':'public','table':'records','kind':'r','rows':2}))
    with open(os.environ['SYNTHETIC_COMPLETION'], 'w') as marker:
        marker.write('')
else:
    print('synthetic operation complete')
'''
        for name in ('postgres', 'initdb', 'pg_ctl', 'createdb', 'pg_restore', 'psql'):
            path = binaries / name
            path.write_text(fake)
            path.chmod(0o700)
        source = Path(restore.__file__).with_name('restore-check.sh').read_text()
        script = case / 'restore-check.sh'
        script.write_text(source.replace('/scratch', str(scratch)).replace('/backup', str(inputs)))
        environment = dict(os.environ, PATH=str(binaries) + os.pathsep + os.environ['PATH'],
                           FAIL_COMMAND=fail, FAIL_STOP='1' if stop_failure else '0',
                           SYNTHETIC_LOG=str(scratch / 'recovery-operations.log'),
                           SYNTHETIC_COMPLETION=str(inputs / 'complete'))
        result = subprocess.run(['/bin/sh', str(script)], env=environment, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=10, check=False)
        stages = (scratch / 'recovery-stages.log').read_text() if (scratch / 'recovery-stages.log').exists() else ''
        return result, scratch, stages

    def test_success_preserves_inventory_only_stdout_and_private_logs(self):
        result, scratch, stages = self.run_shell()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([json.loads(line) for line in result.stdout.splitlines()], ROWS[:1] + [restore.READY])
        self.assertEqual(result.stderr, b'')
        self.assertIn('restore_done\ninventory_start\ninventory_done\n', stages)
        self.assertTrue(stages.endswith('shutdown_done\nexit_code=0\ncomplete\n'))
        for name in ('recovery-operations.log', 'recovery-stages.log'):
            self.assertEqual((scratch / name).stat().st_mode & 0o777, 0o600)

    def test_each_failure_has_fixed_stage_and_private_error_only(self):
        for command, stage in [('initdb', 'initdb_start'), ('pg_ctl_start', 'postgres_start'),
                               ('createdb', 'createdb_start'), ('pg_restore', 'restore_start'),
                               ('psql', 'inventory_start')]:
            result, scratch, stages = self.run_shell(fail=command)
            self.assertEqual(result.returncode, 17)
            self.assertIn(stage + '\n', stages)
            self.assertTrue(stages.endswith('exit_code=17\nfailed\n'))
            self.assertEqual(result.stdout, b'')
            self.assertEqual(result.stderr, b'')
            self.assertNotIn('SYNTHETIC_SECRET_ROW', stages)
            self.assertIn('SYNTHETIC_SECRET_ROW', (scratch / 'recovery-operations.log').read_text())
            if command != 'initdb':
                self.assertIn('shutdown_done\n', stages)

    def test_shutdown_failure_does_not_turn_success_into_pass(self):
        result, scratch, stages = self.run_shell(stop_failure=True)
        self.assertEqual(result.returncode, 31)
        self.assertTrue(stages.endswith('shutdown_unconfirmed\nexit_code=31\nfailed\n'))
        self.assertNotIn('SYNTHETIC_SECRET_ROW', result.stdout.decode())
        self.assertEqual(result.stderr, b'')

    def test_preexisting_private_log_is_not_overwritten(self):
        result, scratch, stages = self.run_shell(preexisting=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((scratch / 'recovery-operations.log').read_text(), 'must remain unchanged')
        self.assertEqual(result.stdout, b'')


if __name__ == '__main__':
    unittest.main()
