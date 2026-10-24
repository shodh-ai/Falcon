"""Synthetic archives only; no Docker, production paths, keys or server access."""
import contextlib
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import stat
import struct
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / 'restore_upload_permissions.py'
SPEC = importlib.util.spec_from_file_location('recovery_uploads', PATH)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class Monitor:
    def __init__(self):
        self.ticks = 0

    def tick(self, force=False):
        self.ticks += 1


def archive_bytes(entries, format=tarfile.USTAR_FORMAT):
    target = io.BytesIO()
    with tarfile.open(fileobj=target, mode='w:gz', format=format) as archive:
        for name, kind, content, mode, uid, gid in entries:
            info = tarfile.TarInfo(name)
            info.type, info.mode, info.uid, info.gid = kind, mode, uid, gid
            info.size = len(content) if kind in (tarfile.REGTYPE, tarfile.AREGTYPE) else 0
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                info.linkname = '../../outside'
            archive.addfile(info, io.BytesIO(content))
    return target.getvalue()


ROOT = ('.', tarfile.DIRTYPE, b'', 0o2770, 0, 0)
FILE = ('./original.txt', tarfile.REGTYPE, b'original-synthetic-bytes', 0o660, 0, 0)


class RecoveryUploadTests(unittest.TestCase):
    def exercise_extract(self, entries, expected=None, maximum=1024 * 1024, format=tarfile.USTAR_FORMAT):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        archive_path = base / 'input.tar.gz'
        archive_path.write_bytes(archive_bytes(entries, format))
        root_path = base / 'uploads'
        root_path.mkdir(mode=0o700)
        source = os.open(archive_path, os.O_RDONLY)
        root = os.open(root_path, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, source)
        self.addCleanup(os.close, root)
        if expected is None:
            expected = {m.canonical_member(name): hashlib.sha256(content).hexdigest()
                        for name, kind, content, *_ in entries
                        if kind in (tarfile.REGTYPE, tarfile.AREGTYPE)}
        with patch.object(m.os, 'fchown') as owners:
            files, directories = m.extract_validated(source, root, expected, maximum, Monitor())
        return files, directories, root_path, owners

    def test_round_trip_bytes_and_numeric_owner_metadata(self):
        entries = [ROOT, FILE, ('./nested/', tarfile.DIRTYPE, b'', 0o2775, 61001, 0),
                   ('./nested/new.txt', tarfile.REGTYPE, b'new-synthetic', 0o664, 61001, 0)]
        files, directories, root, owners = self.exercise_extract(entries)
        self.assertEqual((root / 'original.txt').read_bytes(), FILE[2])
        self.assertEqual((root / 'nested/new.txt').read_bytes(), b'new-synthetic')
        self.assertEqual(files['original.txt']['uid'], 0)
        self.assertEqual(files['nested/new.txt']['uid'], 61001)
        self.assertEqual(files['nested/new.txt']['gid'], 0)
        self.assertEqual(files['nested/new.txt']['other'], 4)
        self.assertEqual(directories['nested']['other'], 5)
        self.assertEqual(owners.call_count, 4)

    def test_bounded_gnu_longname_round_trip(self):
        name = './' + ('long' * 30)
        _, _, root, _ = self.exercise_extract([ROOT, (name, tarfile.REGTYPE, b'long', 0o640, 0, 0)],
                                             format=tarfile.GNU_FORMAT)
        self.assertEqual((root / name[2:]).read_bytes(), b'long')

    def test_oversized_gnu_longname_rejected_before_body_processing(self):
        name = './' + 'x' * 5000
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'archive-longname'):
            self.exercise_extract([ROOT, (name, tarfile.REGTYPE, b'x', 0o640, 0, 0)],
                                  expected={}, format=tarfile.GNU_FORMAT)

    def test_paths_reject_escape_aliases_and_controls(self):
        for name in ['/escape', '../escape', 'a/../escape', '././escape', 'a//b',
                     './', '', 'a\\b', 'a\x00b', 'a\x85b', 'a/./b', 'a/' * 65 + 'b', 'x' * 256]:
            with self.subTest(name=repr(name)), self.assertRaises(m.RecoveryPermissionsError):
                m.canonical_member(name)
        self.assertEqual(m.canonical_member('./safe/file'), 'safe/file')
        self.assertEqual(m.canonical_member('./safe/', True), 'safe')
        self.assertEqual(m.canonical_member('.', True), '')

    def test_duplicate_root_or_normalized_file_is_refused(self):
        for entries in [[ROOT, ROOT], [ROOT, FILE, ('original.txt', *FILE[1:])]]:
            with self.subTest(entries=len(entries)), self.assertRaisesRegex(m.RecoveryPermissionsError, 'duplicate'):
                self.exercise_extract(entries)

    def test_unexpected_or_missing_file_is_refused(self):
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'unexpected-file'):
            self.exercise_extract([ROOT, FILE], expected={})
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'inventory-complete'):
            self.exercise_extract([ROOT], expected={'missing': 'a' * 64})

    def test_hash_mismatch_never_installs_permissions(self):
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'file-hash'):
            self.exercise_extract([ROOT, FILE], expected={'original.txt': '0' * 64})

    def test_missing_parent_is_refused_instead_of_implicitly_created(self):
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'parent-order'):
            self.exercise_extract([ROOT, ('./missing/file', *FILE[1:])])

    def test_known_modes_only_no_setid_worldwrite_or_private_mode_guess(self):
        for mode in [0o600, 0o666, 0o777, 0o1640, 0o4640]:
            with self.subTest(mode=oct(mode)), self.assertRaisesRegex(m.RecoveryPermissionsError, 'archive-mode'):
                self.exercise_extract([ROOT, (FILE[0], FILE[1], FILE[2], mode, 0, 0)])
        for mode in [0o700, 0o777, 0o1777, 0o4750]:
            with self.subTest(mode=oct(mode)), self.assertRaisesRegex(m.RecoveryPermissionsError, 'archive-mode'):
                self.exercise_extract([('.', tarfile.DIRTYPE, b'', mode, 0, 0)])

    def test_unknown_uid_or_gid_never_chowned(self):
        for uid, gid in [(999, 0), (0, 999), (61001, 61001), (-1, 0)]:
            with self.subTest(uid=uid, gid=gid), self.assertRaises((m.RecoveryPermissionsError, tarfile.HeaderError)):
                self.exercise_extract([ROOT, (FILE[0], FILE[1], FILE[2], FILE[3], uid, gid)],
                                       format=tarfile.GNU_FORMAT)

    def test_links_devices_fifo_and_pax_rejected_before_body_processing(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE,
                     tarfile.FIFOTYPE, tarfile.GNUTYPE_SPARSE, tarfile.XHDTYPE, tarfile.XGLTYPE]:
            with self.subTest(kind=kind), self.assertRaises(m.RecoveryPermissionsError):
                self.exercise_extract([ROOT, ('./unsafe', kind, b'', 0o640, 0, 0)])

    def test_bounded_member_bytes_and_reader_allocation(self):
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'content-bound'):
            self.exercise_extract([ROOT, FILE], maximum=1)
        reader = m.BoundedReader(io.BytesIO(b'abc'), Monitor(), 2)
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'expansion'):
            reader.read(3)
        with self.assertRaisesRegex(m.RecoveryPermissionsError, 'read-size'):
            reader.read(m.MIB + 1)
        with patch.object(m, 'MAX_ENTRIES', 1), \
             self.assertRaisesRegex(m.RecoveryPermissionsError, 'duplicate-or-count'):
            self.exercise_extract([ROOT, FILE])

    def test_manual_extraction_never_calls_archive_extract(self):
        with patch.object(tarfile.TarFile, 'extract', side_effect=AssertionError('unsafe extract')), \
             patch.object(tarfile.TarFile, 'extractall', side_effect=AssertionError('unsafe extractall')):
            self.exercise_extract([ROOT, FILE])

    def test_policy_reconstructs_readonly_group_not_tar_mask(self):
        captured = {}
        with patch.object(m.os, 'setxattr', create=True, side_effect=lambda fd, key, blob: captured.__setitem__(key, blob)), \
             patch.object(m.os, 'getxattr', create=True, side_effect=lambda fd, key: captured[key]), \
             patch.object(m.os, 'fchmod') as chmod, patch.object(m.os, 'fsync'), \
             patch.object(m.os, 'fstat', return_value=types.SimpleNamespace(st_mode=stat.S_ISGID)):
            m.set_policy(7, True, 5)
        entries = [struct.unpack('<HHI', captured[m.ACL_ACCESS][i:i + 8])
                   for i in range(4, len(captured[m.ACL_ACCESS]), 8)]
        self.assertEqual(entries[1], (2, 7, 61001))
        self.assertEqual(entries[2][0:2], (4, 5))
        self.assertEqual(entries[3][0:2], (16, 7))
        self.assertEqual(entries[4][0:2], (32, 5))
        defaults = [struct.unpack('<HHI', captured[m.ACL_DEFAULT][i:i + 8])
                    for i in range(4, len(captured[m.ACL_DEFAULT]), 8)]
        self.assertEqual(defaults[-1][0:2], (32, 0))
        chmod.assert_called_once_with(7, 0o2755)

    def test_open_relative_refuses_symlink_and_fifo(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'real').write_text('safe')
            (root / 'link').symlink_to('real')
            source = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with self.assertRaises(m.RecoveryPermissionsError):
                    m.open_relative(source, '../outside')
                with self.assertRaises(OSError):
                    m.open_relative(source, 'link')
                if hasattr(os, 'mkfifo'):
                    os.mkfifo(root / 'fifo')
                    with self.assertRaisesRegex(m.RecoveryPermissionsError, 'object-type'):
                        m.open_relative(source, 'fifo')
            finally:
                os.close(source)

    def test_archive_file_change_during_hash_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'archive'
            path.write_bytes(b'synthetic')
            fd = os.open(path, os.O_RDONLY)
            real_fstat = os.fstat
            calls = 0
            def changing(number):
                nonlocal calls
                value = real_fstat(number)
                calls += 1
                if calls == 2:
                    fields = {name: getattr(value, name) for name in ['st_dev', 'st_ino', 'st_mode',
                              'st_uid', 'st_gid', 'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_nlink']}
                    fields['st_ctime_ns'] += 1
                    return types.SimpleNamespace(**fields)
                return value
            try:
                with patch.object(m.os, 'fstat', side_effect=changing), \
                     self.assertRaisesRegex(m.RecoveryPermissionsError, 'file-changed'):
                    m.hash_regular(fd, Monitor(), 1024)
            finally:
                os.close(fd)

    def test_prepare_has_only_fixed_disposable_path(self):
        helper = m.RecoveryUploads(None, None, {}, 'unused')
        with patch.object(m.os, 'geteuid', return_value=0):
            for context, inputs, uploads in [
                ({'session_path': '/data/coolify/production'}, Path('/tmp'), Path('/tmp/uploads')),
                ({'session_path': '/data/falcon-backups/restore-check/falcon-restore-check-' + 'a' * 32},
                 Path('/data/coolify/production'), Path('/data/coolify/production/uploads'))]:
                with self.subTest(context=context), self.assertRaisesRegex(m.RecoveryPermissionsError, 'fixed-'):
                    helper.prepare(context, Monitor(), inputs, uploads)

    def test_verify_detects_changed_bytes_owner_and_root_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            root = parent / 'uploads'
            root.mkdir()
            path = root / 'original'
            path.write_bytes(b'synthetic')
            helper = m.RecoveryUploads(None, None, {'max_archive_bytes': 1024}, 'unused')
            helper.uploads, helper.root_identity = root, m.identity(root.stat())
            helper.original_files = {'original': {'sha256': hashlib.sha256(b'synthetic').hexdigest(),
                'bytes': 9, 'uid': path.stat().st_uid, 'gid': path.stat().st_gid}}
            def checked(path):
                return os.open(path, os.O_RDONLY | os.O_DIRECTORY)
            with patch.object(m, 'checked_directory', side_effect=checked):
                self.assertTrue(helper.verify(Monitor())['original_file_bytes_and_ownership_unchanged'])
                helper.original_files['original']['uid'] += 1
                with self.assertRaisesRegex(m.RecoveryPermissionsError, 'original-file-changed'):
                    helper.verify(Monitor())
                helper.original_files['original']['uid'] -= 1
                path.write_bytes(b'changed!!')
                with self.assertRaisesRegex(m.RecoveryPermissionsError, 'original-file-changed'):
                    helper.verify(Monitor())
                helper.root_identity = (0, 0, 0, 0, 0)
                with self.assertRaisesRegex(m.RecoveryPermissionsError, 'root-replaced'):
                    helper.verify(Monitor())

    @contextlib.contextmanager
    def recovered_directory_fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'uploads'
            root.mkdir(mode=0o750)
            (root / 'empty').mkdir(mode=0o750)
            helper = m.RecoveryUploads(None, None, {'max_archive_bytes': 1024}, 'unused')
            helper.uploads, helper.root_identity = root, m.identity(root.stat())
            for name in ['', 'empty']:
                state = (root / name).stat()
                helper.original_directories[name] = {'identity': list(m.identity(state)),
                    'uid': state.st_uid, 'gid': state.st_gid, 'mode': stat.S_IMODE(state.st_mode),
                    'access_acl': b'known-access'.hex(), 'default_acl': b'known-default'.hex()}
            with patch.object(m, 'checked_directory', side_effect=lambda path:
                              os.open(path, os.O_RDONLY | os.O_DIRECTORY)), \
                 patch.object(m.os, 'getxattr', create=True, side_effect=lambda fd, key:
                              b'known-access' if key == m.ACL_ACCESS else b'known-default'):
                yield helper, root

    def test_directory_verification_includes_empty_directories_and_allows_synthetic_additions(self):
        with self.recovered_directory_fixture() as (helper, root):
            (root / 'new-synthetic-directory').mkdir()
            (root / 'new-synthetic-directory/file').write_bytes(b'synthetic-only')
            report = helper.verify(Monitor())
            self.assertEqual(report['original_directories_verified'], 2)
            self.assertTrue(report['original_directory_identity_and_policy_unchanged'])

    def test_missing_original_empty_directory_is_refused(self):
        with self.recovered_directory_fixture() as (helper, root):
            (root / 'empty').rmdir()
            with self.assertRaises(FileNotFoundError):
                helper.verify(Monitor())

    def test_replaced_original_empty_directory_is_refused(self):
        with self.recovered_directory_fixture() as (helper, root):
            (root / 'empty').rename(root / 'preserved-original')
            (root / 'empty').mkdir(mode=0o750)
            with self.assertRaisesRegex(m.RecoveryPermissionsError, 'original-directory-changed'):
                helper.verify(Monitor())

    def test_changed_original_directory_mode_or_acl_is_refused(self):
        with self.recovered_directory_fixture() as (helper, root):
            (root / 'empty').chmod(0o700)
            with self.assertRaisesRegex(m.RecoveryPermissionsError, 'original-directory-changed'):
                helper.verify(Monitor())
        with self.recovered_directory_fixture() as (helper, root):
            with patch.object(m.os, 'getxattr', return_value=b'unexpected-policy'), \
                 self.assertRaisesRegex(m.RecoveryPermissionsError, 'original-directory-changed'):
                helper.verify(Monitor())

    def test_original_directory_numeric_owner_change_is_refused(self):
        with self.recovered_directory_fixture() as (helper, root):
            original_inode = (root / 'empty').stat().st_ino
            real_fstat = os.fstat
            def owner_changed(fd):
                state = real_fstat(fd)
                if state.st_ino != original_inode:
                    return state
                values = {name: getattr(state, name) for name in ['st_dev', 'st_ino', 'st_mode',
                          'st_uid', 'st_gid', 'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_nlink']}
                values['st_uid'] = 61001
                return types.SimpleNamespace(**values)
            with patch.object(m.os, 'fstat', side_effect=owner_changed), \
                 self.assertRaisesRegex(m.RecoveryPermissionsError, 'original-directory-changed'):
                helper.verify(Monitor())


if __name__ == '__main__':
    unittest.main()
