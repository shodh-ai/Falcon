import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import falcon_backup as backup
import restore_check


def config(root):
    return {'staging_root': str(root / 'staging'), 'final_root': str(root / 'finalized'),
            'uploads_source': str(root / 'uploads'), 'pgpass_file': str(root / 'pgpass'),
            'image': 'sha256:' + 'a' * 64, 'network': 'private-net', 'db_host': 'postgres',
            'db_port': 5432, 'db_user': 'falcon_backup', 'databases': ['postgres', 'university_governance'],
            'health_urls': ['https://example.invalid/health'], 'worker_uid': os.getuid() or 999,
            'worker_gid': os.getgid() or 999, 'working_bytes': 1024 * 1024,
            'restore_uid': 70, 'restore_gid': 70,
            'max_archive_bytes': 1024 * 1024}


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.c = config(Path('/tmp/test'))

    def guard(self, memory=2 * backup.GIB, disk=30 * backup.GIB, health=True):
        return backup.Guard(self.c, memory=lambda: memory, disk=lambda: disk, health=lambda _: health)

    def test_start_memory_exact_boundary(self):
        self.guard(memory=backup.GIB).check(initial=True)
        with self.assertRaises(backup.BackupError):
            self.guard(memory=backup.GIB - 1).check(initial=True)

    def test_abort_memory_boundary(self):
        self.guard(memory=768 * backup.MIB).check()
        with self.assertRaises(backup.BackupError):
            self.guard(memory=768 * backup.MIB - 1).check()

    def test_twenty_gib_disk_floor(self):
        self.guard(disk=20 * backup.GIB).check(initial=True)
        with self.assertRaises(backup.BackupError):
            self.guard(disk=20 * backup.GIB - 1).check(initial=True)

    def test_three_working_sets_disk_floor(self):
        self.c['working_bytes'] = 8 * backup.GIB
        with self.assertRaises(backup.BackupError):
            self.guard(disk=23 * backup.GIB).check(initial=True)
        self.guard(disk=24 * backup.GIB).check(initial=True)

    def test_initial_health_failure_refuses(self):
        with self.assertRaises(backup.BackupError):
            self.guard(health=False).check(initial=True)

    def test_two_consecutive_rounds_abort(self):
        guard = self.guard(health=False)
        guard.check(force_health=True)
        with self.assertRaises(backup.BackupError):
            guard.check(force_health=True)

    def test_good_health_resets_failures(self):
        guard = self.guard()
        guard.health = mock.Mock(side_effect=[False, True, False])
        for _ in range(3):
            guard.check(force_health=True)
        self.assertEqual(guard.failures, 1)

    def test_metric_failure_is_not_healthy(self):
        guard = self.guard()
        guard.memory = mock.Mock(side_effect=OSError('unavailable'))
        with self.assertRaises(OSError):
            guard.check(initial=True)

    @mock.patch.object(backup.subprocess, 'run')
    def test_curl_keeps_tls_and_checks_exact_200(self, run):
        run.return_value = mock.Mock(returncode=0, stdout='200')
        self.assertTrue(backup.health_ok('https://example.invalid/health'))
        args = run.call_args.args[0]
        self.assertNotIn('--insecure', args)
        self.assertNotIn('-k', args)
        self.assertNotIn('--location', args)
        self.assertIn('--max-time', args)
        self.assertIn('--noproxy', args)
        run.return_value.stdout = '302'
        self.assertFalse(backup.health_ok('https://example.invalid/health'))

    @mock.patch.object(backup.subprocess, 'Popen')
    @mock.patch.object(backup.os, 'killpg')
    def test_guard_abort_stops_only_own_child(self, kill, popen):
        child = mock.Mock(pid=123, returncode=None)
        child.poll.return_value = None
        popen.return_value = child
        guard = mock.Mock()
        guard.check.side_effect = backup.BackupError('memory pressure')
        stop = mock.Mock()
        with self.assertRaises(backup.BackupError):
            backup.monitor_process(['fixed-helper'], guard, stop=stop)
        stop.assert_called_once_with()
        kill.assert_called_once_with(123, backup.signal.SIGTERM)


class FinalizationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        # macOS /var is a symlink. Resolve only our freshly generated fixture
        # root, retaining strict no-symlink behavior in production code.
        self.root = Path(self.temp.name).resolve()
        self.c = config(self.root)
        self.c['worker_uid'] = os.getuid()
        self.c['worker_gid'] = os.getgid()
        for key in ('staging_root', 'final_root', 'uploads_source'):
            Path(self.c[key]).mkdir(mode=0o700)
        self.run_id = '20261019T120000Z-' + 'b' * 32
        self.stage = Path(self.c['staging_root']) / self.run_id
        self.stage.mkdir(mode=0o700)
        for database in self.c['databases']:
            (self.stage / ('database-' + database + '.dump')).write_bytes(b'PGDMPfixture')
        (self.stage / 'globals-no-passwords.sql').write_text('-- no passwords\n')
        self.contents = b'harmless synthetic document'
        self.archive('document.txt', self.contents)
        digest = hashlib.sha256(self.contents).hexdigest().encode()
        for name in ('uploads-before.sha256', 'uploads-after.sha256'):
            (self.stage / name).write_bytes(digest + b'  /source/document.txt\0')

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, name, contents=b'', member_type=None):
        with tarfile.open(self.stage / 'uploads.tar.gz', 'w:gz') as stream:
            item = tarfile.TarInfo(name)
            if member_type:
                item.type = member_type
                item.linkname = '/etc/passwd'
            else:
                item.size = len(contents)
            stream.addfile(item, io.BytesIO(contents) if not member_type else None)

    def test_copies_to_private_new_files_and_hashes(self):
        manifest = backup.finalize(self.c, self.run_id)
        final = Path(self.c['final_root']) / self.run_id
        self.assertEqual(stat.S_IMODE(final.stat().st_mode), 0o700)
        self.assertEqual(manifest['uploads']['file_sha256']['document.txt'], hashlib.sha256(self.contents).hexdigest())
        self.assertEqual(manifest['sources']['uploads_directory'], self.c['uploads_source'])
        self.assertIn('manual adoption', manifest['capture']['status'])
        for item in manifest['files']:
            path = final / item['name']
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), item['sha256'])
            self.assertNotEqual(path.stat().st_ino, (self.stage / item['name']).stat().st_ino)
        (self.stage / 'database-postgres.dump').write_bytes(b'changed after seal')
        self.assertEqual((final / 'database-postgres.dump').read_bytes(), b'PGDMPfixture')

    def test_existing_destination_refused(self):
        backup.finalize(self.c, self.run_id)
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, self.run_id)

    def test_invalid_run_id_refused(self):
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, '../outside')

    def test_symlink_candidate_refused(self):
        path = self.stage / 'database-postgres.dump'
        path.unlink()
        path.symlink_to('/etc/passwd')
        with self.assertRaises((backup.BackupError, OSError)):
            backup.finalize(self.c, self.run_id)

    def test_hardlink_candidate_refused(self):
        path = self.stage / 'database-postgres.dump'
        os.link(path, self.root / 'retained-open-inode')
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, self.run_id)

    def test_fifo_candidate_refused_without_blocking(self):
        path = self.stage / 'database-postgres.dump'
        path.unlink()
        os.mkfifo(path)
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, self.run_id)

    def test_symlink_directory_ancestor_refused(self):
        alias = self.root / 'alias'
        alias.symlink_to(self.c['staging_root'], target_is_directory=True)
        with self.assertRaises(OSError):
            backup.open_directory(alias / self.run_id)

    def test_public_final_root_refused(self):
        Path(self.c['final_root']).chmod(0o755)
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, self.run_id)

    def test_bad_dump_header_refused(self):
        (self.stage / 'database-postgres.dump').write_bytes(b'not a dump')
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, self.run_id)

    def test_unexpected_candidate_refused(self):
        (self.stage / 'extra.env').write_text('synthetic only')
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, self.run_id)

    def test_archive_path_traversal_and_links_refused(self):
        for name, kind in (('../outside', None), ('/absolute', None), ('symlink', tarfile.SYMTYPE), ('hardlink', tarfile.LNKTYPE)):
            self.archive(name, b'x', kind)
            with self.assertRaises(backup.BackupError):
                backup.inspect_upload_archive(self.stage / 'uploads.tar.gz', 1024)

    def test_expansion_limit_refused(self):
        self.archive('large', b'x' * 2048)
        with self.assertRaises(backup.BackupError):
            backup.inspect_upload_archive(self.stage / 'uploads.tar.gz', 1024)

    def test_gzip_corruption_refused(self):
        path = self.stage / 'uploads.tar.gz'
        data = bytearray(path.read_bytes())
        data[-8] ^= 1
        path.write_bytes(data)
        with self.assertRaises((backup.BackupError, OSError, tarfile.TarError)):
            backup.inspect_upload_archive(path, 1024)

    def test_extension_header_refused_before_large_metadata_read(self):
        import gzip
        header = tarfile.TarInfo('././@LongLink')
        header.type = tarfile.GNUTYPE_LONGNAME
        header.size = 2 * backup.MIB
        with gzip.open(self.stage / 'uploads.tar.gz', 'wb') as stream:
            stream.write(header.tobuf(format=tarfile.GNU_FORMAT))
            stream.write(b'x' * header.size)
        with self.assertRaisesRegex(backup.BackupError, 'Only USTAR'):
            backup.inspect_upload_archive(self.stage / 'uploads.tar.gz', 1024)

    def test_ordinary_busybox_gnu_headers_accepted(self):
        with tarfile.open(self.stage / 'uploads.tar.gz', 'w:gz', format=tarfile.GNU_FORMAT) as stream:
            directory = tarfile.TarInfo('./')
            directory.type = tarfile.DIRTYPE
            stream.addfile(directory)
            item = tarfile.TarInfo('./document.txt')
            item.size = len(self.contents)
            stream.addfile(item, io.BytesIO(self.contents))
        info = backup.inspect_upload_archive(self.stage / 'uploads.tar.gz', 1024)
        self.assertEqual(info['file_sha256'], {'document.txt': hashlib.sha256(self.contents).hexdigest()})

    def test_gnu_nonzero_extension_tail_rejected(self):
        import gzip
        item = tarfile.TarInfo('document.txt')
        header = bytearray(item.tobuf(format=tarfile.GNU_FORMAT))
        header[345] = ord('1')
        header[148:156] = b'        '
        checksum = sum(header)
        header[148:156] = ('%06o\0 ' % checksum).encode()
        with gzip.open(self.stage / 'uploads.tar.gz', 'wb') as stream:
            stream.write(header)
            stream.write(b'\0' * 1024)
        with self.assertRaisesRegex(backup.BackupError, 'Only USTAR'):
            backup.inspect_upload_archive(self.stage / 'uploads.tar.gz', 1024)

    def test_failed_run_status_is_private_and_outside_worker_candidate(self):
        capture = {'started_at': '2026-10-19T15:00:00+00:00',
                   'finished_at': '2026-10-19T15:01:00+00:00'}
        event = backup.write_run_status(self.c, self.run_id, 'failed', capture,
                                       backup.BackupError('synthetic archive failure'))
        folder = self.root / 'status'
        self.assertEqual(stat.S_IMODE(folder.stat().st_mode), 0o700)
        files = list(folder.iterdir())
        self.assertEqual(len(files), 1)
        self.assertEqual(stat.S_IMODE(files[0].stat().st_mode), 0o600)
        self.assertNotEqual(folder.parent, self.stage)
        stored = json.loads(files[0].read_text())
        self.assertEqual(stored['capture'], capture)
        self.assertTrue(stored['candidate_present'])
        self.assertFalse(stored['finalized_set_present'])
        self.assertEqual(stored['validation'], 'restore unproven')
        self.assertEqual(stored['error']['message'], 'synthetic archive failure')
        self.assertTrue(self.stage.exists())

    def test_inventory_mismatch_refused(self):
        (self.stage / 'uploads-after.sha256').write_bytes(b'a' * 64 + b'  /source/document.txt\0')
        with self.assertRaises(backup.BackupError):
            backup.finalize(self.c, self.run_id)

    def test_copy_mutation_detected(self):
        src = backup.open_directory(self.stage)
        out = self.root / 'out'
        out.mkdir(mode=0o700)
        dst = backup.open_directory(out)
        guard = mock.Mock()
        guard.check.side_effect = lambda: (self.stage / 'database-postgres.dump').write_bytes(b'PGDMPmutation')
        try:
            with self.assertRaises(backup.BackupError):
                backup.copy_regular(src, 'database-postgres.dump', dst, os.getuid(), 1024, guard)
        finally:
            os.close(src)
            os.close(dst)

    def test_review_never_deletes(self):
        backup.finalize(self.c, self.run_id)
        with mock.patch.object(backup.os, 'unlink', side_effect=AssertionError('must not delete')):
            backup.retention_review(self.c)
        self.assertTrue(self.stage.exists())
        self.assertTrue((Path(self.c['final_root']) / self.run_id).exists())


class CommandTests(unittest.TestCase):
    def test_backup_helper_is_nonroot_readonly_and_private(self):
        c = config(Path('/tmp/test'))
        command = backup.helper_command(c, 'falcon-local-backup-test', '/stage/run', '/worker.sh')
        self.assertIn('--read-only', command)
        self.assertEqual(command[command.index('--pull')+1], 'never')
        self.assertEqual(command[command.index('--network')+1], 'private-net')
        self.assertIn('type=bind,src=/tmp/test/uploads,dst=/source,readonly', command)
        self.assertIn('unix:///run/docker.sock', command)
        self.assertFalse(any('docker.sock' in value for value in command if value.startswith('type=bind')))
        self.assertNotIn('PGPASSWORD', ' '.join(command))

    def test_restore_has_no_production_network_or_credentials(self):
        c = config(Path('/tmp/test'))
        command = restore_check.restore_command(c, 'falcon-restore-check-test', '/input', '/scratch-only', '/script')
        self.assertEqual(command[command.index('--network')+1], 'none')
        self.assertEqual(command[command.index('--memory')+1], '256m')
        self.assertEqual(command[command.index('--memory-swap')+1], '256m')
        self.assertEqual(command[command.index('--cpus')+1], '0.5')
        self.assertNotIn('pgpass', ' '.join(command))
        self.assertNotIn(c['uploads_source'], ' '.join(command))
        self.assertNotIn('PGHOST', ' '.join(command))

    def test_mutable_image_and_overlapping_paths_refused(self):
        c = config(Path('/tmp/test'))
        c['image'] = 'postgres:18'
        with self.assertRaises(backup.BackupError):
            backup.validate_config(c)
        c['image'] = 'sha256:' + 'a' * 64
        c['final_root'] = c['staging_root'] + '/nested'
        with self.assertRaises(backup.BackupError):
            backup.validate_config(c)

    def test_credential_cannot_be_archived_or_placed_in_candidate_roots(self):
        for key in ('staging_root', 'final_root', 'uploads_source'):
            c = config(Path('/tmp/test'))
            c['pgpass_file'] = c[key] + '/secret'
            with self.assertRaisesRegex(backup.BackupError, 'Credential'):
                backup.validate_config(c)

    def test_gid_zero_allowed_but_root_uid_refused(self):
        c = config(Path('/tmp/test'))
        c['worker_gid'] = 0
        backup.validate_config(c)
        c['worker_uid'] = 0
        with self.assertRaises(backup.BackupError):
            backup.validate_config(c)

    def test_systemd_and_installer_manage_private_lock_directory(self):
        for name in ('falcon-local-backup.service', 'falcon-local-backup-review.service'):
            unit = (ROOT / name).read_text()
            self.assertIn('RuntimeDirectory=falcon-local-backup', unit)
            self.assertIn('RuntimeDirectoryMode=0700', unit)
            self.assertIn('/run/falcon-local-backup', unit)
        self.assertIn('/run/falcon-local-backup', (ROOT / 'install.sh').read_text())

    def test_fixed_worker_audits_membership_secdef_and_dump_lock_bound(self):
        worker = (ROOT / 'worker.sh').read_text()
        self.assertIn("pg_has_role(current_user,member.oid,'MEMBER')", worker)
        self.assertIn('p.prosecdef', worker)
        self.assertIn('--lock-wait-timeout=5000', worker)
        self.assertNotIn('sha256sum -z', worker)

    def test_lock_refuses_overlap(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = str(Path(directory).resolve() / 'lock')
            with backup.lock(lock):
                with self.assertRaises(backup.BackupError):
                    with backup.lock(lock):
                        self.fail('overlap entered')

    def test_public_or_linked_lock_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            root.chmod(0o755)
            with self.assertRaises(backup.BackupError):
                with backup.lock(str(root / 'lock')):
                    self.fail('unsafe lock entered')
            root.chmod(0o700)
            path = root / 'lock'
            path.write_text('')
            path.chmod(0o600)
            os.link(path, root / 'other')
            with self.assertRaises(backup.BackupError):
                with backup.lock(str(path)):
                    self.fail('linked lock entered')

    @mock.patch.object(restore_check, 'available_memory', return_value=backup.GIB)
    @mock.patch.object(restore_check.os, 'geteuid', return_value=0)
    def test_restore_blocks_before_any_container_under_1_5_gib(self, uid, memory):
        with mock.patch.object(sys, 'argv', ['restore_check.py', '--run-id', 'anything', '--approval-id', 'explicit-user-turn', '--i-confirm-disposable-restore']):
            with mock.patch.object(restore_check.subprocess, 'Popen') as popen:
                with self.assertRaisesRegex(backup.BackupError, '1.5 GiB'):
                    restore_check.main()
                popen.assert_not_called()


if __name__ == '__main__':
    unittest.main()
