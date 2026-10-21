"""Synthetic files and metadata only; no Docker, production data or keys."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, BASE / filename)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value
m = module('media_dispatcher', 'prove-document-media-reviewed.py')
common = module('media_common', 'reconcile-documents-reviewed.py')
extractor = module('media_extractor', 'restore_upload_permissions.py')
IMAGE = 'sha256:' + 'a' * 64
RUN = '20261021T120000Z-' + 'b' * 32
SESSION = m.ROOT / ('falcon-restore-check-' + 'c' * 32)
HASH = 'd' * 64


class Monitor:
    def tick(self, force=False): pass


def manifest():
    return {'run_id': RUN, 'files': [{'name': 'uploads.tar.gz', 'sha256': HASH},
                                    {'name': 'database-postgres.dump', 'sha256': 'e' * 64}],
            'uploads': {'file_sha256': {'private.pdf': 'f' * 64, 'private.jpg': '1' * 64, 'private.png': '2' * 64}}}


def source_report():
    return {'schema_version': 1, 'execution_complete': True,
            'source_binding': {'run_id': RUN, 'uploads_archive_sha256': HASH, 'dump_sha256': 'e' * 64},
            'samples': [{'member': 'private.pdf', 'bytes': 12, 'result': 'parser_rejected'},
                        {'member': 'private.jpg', 'bytes': 10, 'result': 'jpeg_header_opened'},
                        {'member': 'private.png', 'bytes': 11, 'result': 'pixel_budget_exceeded', 'detected_mime': 'image/png'}]}


def targets():
    return [{'index': 0, 'member': 'private.pdf', 'sha256': 'f' * 64, 'bytes': 12}]


def result():
    counts = {key: 0 for key in m.COUNT_FIELDS}
    counts.update({key: False for key in m.FALSE_FIELDS})
    counts.update(targets_checked=1, source_files_verified=1, encrypted_pdf_password_required=1)
    return {'schema_version': 1, 'execution_complete': True, 'mode': 'pdf',
            'source_binding': {'run_id': RUN, 'archive_sha256': HASH}, 'summary': counts,
            'results': [dict(targets()[0], source_bytes_verified=True,
                             result='encrypted_pdf_password_required', raster_decoded=False)]}


class MediaDispatcherTests(unittest.TestCase):
    def test_report_path_is_only_existing_private_reconciliation_location(self):
        self.assertEqual(m.report_path(str(SESSION / 'document-reconciliation-private.json')),
                         SESSION / 'document-reconciliation-private.json')
        for path in ['/data/coolify/applications/uploads/report.json', '/tmp/report.json',
                     str(SESSION / 'nested/document-reconciliation-private.json'),
                     str(SESSION / 'other.json'), str(m.ROOT / 'live/document-reconciliation-private.json')]:
            with self.subTest(path=path), self.assertRaises(m.MediaError): m.report_path(path)

    def test_old_report_summary_accepted_with_exact_dump_archive_run_binding(self):
        report = source_report()  # Deliberately no newer summary counters.
        self.assertEqual(m.binding(report, manifest(), RUN)['sha256'], HASH)
        for key in ['run_id', 'uploads_archive_sha256', 'dump_sha256']:
            changed = source_report(); changed['source_binding'][key] = '0' * 64
            with self.subTest(key=key), self.assertRaises(m.MediaError): m.binding(changed, manifest(), RUN)
        changed = source_report(); changed['execution_complete'] = False
        with self.assertRaises(m.MediaError): m.binding(changed, manifest(), RUN)

    def test_selection_is_only_known_manifest_members_and_bounded_reviewed_outcomes(self):
        self.assertEqual(m.select_members(source_report(), manifest(), 'pdf', extractor), ['private.pdf'])
        self.assertEqual(m.select_members(source_report(), manifest(), 'raster', extractor), ['private.jpg', 'private.png'])
        for member in ['../escape', '/absolute', 'missing.pdf', 'a//b.pdf']:
            report = source_report(); report['samples'][0]['member'] = member
            with self.subTest(member=member), self.assertRaises(RuntimeError):
                m.select_members(report, manifest(), 'pdf', extractor)
        for size in [0, -1, True, m.MAX_FILE + 1]:
            report = source_report(); report['samples'][0]['bytes'] = size
            with self.subTest(size=size), self.assertRaises(m.MediaError):
                m.select_members(report, manifest(), 'pdf', extractor)
        report = source_report(); report['samples'][0]['result'] = 'pdf_parsed'
        with self.assertRaises(m.MediaError): m.select_members(report, manifest(), 'pdf', extractor)

    def test_raster_selection_includes_larger_originals_within_existing_byte_limit(self):
        for member in ['large.png', 'large.JPG', 'large.JPEG']:
            value = manifest(); value['uploads']['file_sha256'][member] = '3' * 64
            report = source_report()
            report['samples'] = [{'member': member, 'bytes': 7_069_597,
                                  'result': 'byte_budget_exceeded', 'detected_mime': None}]
            with self.subTest(member=member):
                self.assertEqual(m.select_members(report, value, 'raster', extractor), [member])
                report['samples'][0]['bytes'] = m.MAX_FILE
                self.assertEqual(m.select_members(report, value, 'raster', extractor), [member])
                report['samples'][0]['bytes'] = m.MAX_FILE + 1
                with self.assertRaisesRegex(m.MediaError, 'target-byte-budget'):
                    m.select_members(report, value, 'raster', extractor)

    def test_raster_byte_budget_selection_requires_image_suffix_or_reviewed_mime(self):
        for field in ['detected_mime', 'extension_mime']:
            for mime in ['image/jpeg', 'image/png']:
                value = manifest(); value['uploads']['file_sha256']['original.bin'] = '3' * 64
                report = source_report()
                report['samples'] = [{'member': 'original.bin', 'bytes': 7_069_597,
                                      'result': 'byte_budget_exceeded', field: mime}]
                with self.subTest(field=field, mime=mime):
                    self.assertEqual(m.select_members(report, value, 'raster', extractor), ['original.bin'])
        for member, mime in [('private.pdf', 'application/pdf'), ('trick.png.exe', None),
                             ('remote.txt', 'image/gif')]:
            value = manifest(); value['uploads']['file_sha256'][member] = '3' * 64
            report = source_report()
            report['samples'] = [{'member': member, 'bytes': 7_069_597,
                                  'result': 'byte_budget_exceeded', 'detected_mime': mime}]
            with self.subTest(member=member), self.assertRaisesRegex(m.MediaError, 'target-count'):
                m.select_members(report, value, 'raster', extractor)

    def test_individual_readonly_indexed_binds_without_archive_database_keys_or_live_mounts(self):
        command = m.helper_command(['/usr/bin/docker'], SESSION, IMAGE, 'pdf', SESSION / 'media-inputs',
                                   SESSION / 'document-media-proof.cjs', targets(), ['--env', 'DATABASE_URL='])
        for flag, expected in [('--network', 'none'), ('--user', '70:70'), ('--memory', '384m'),
                               ('--memory-swap', '384m'), ('--cpus', '0.5'), ('--cap-drop', 'ALL'),
                               ('--security-opt', 'no-new-privileges:true'), ('--pull', 'never')]:
            self.assertEqual(command[command.index(flag) + 1], expected)
        self.assertIn('--read-only', command)
        self.assertEqual(command[-5:], ['node', IMAGE, '--max-old-space-size=96', '/checks/document-media-proof.cjs', 'pdf'])
        mounts = [command[index + 1] for index, item in enumerate(command) if item == '--mount']
        self.assertEqual(len(mounts), 4)
        self.assertTrue(all(item.endswith(',readonly') for item in mounts))
        self.assertTrue(any('dst=/inputs/files/0,readonly' in item for item in mounts))
        for forbidden in ['uploads', 'archive', 'docker.sock', 'environment', 'key.json', 'socket', 'pgdata']:
            self.assertFalse(any(forbidden in item for item in mounts), forbidden)
        self.assertFalse(set(command) & {'--env-file', '--privileged', '--publish'})
        for bad in [('latest', 'pdf', SESSION / 'media-inputs'), (IMAGE, 'bad', SESSION / 'media-inputs'),
                    (IMAGE, 'pdf', Path('/app/uploads'))]:
            with self.assertRaises(m.MediaError):
                m.helper_command([], SESSION, bad[0], bad[1], bad[2], Path('/code'), targets(), [])

    def test_private_result_binding_summary_counts_and_completeness_are_strict(self):
        report = m.checked_result(common, json.dumps(result()).encode(), 'pdf', targets(), RUN, HASH)
        self.assertEqual(report['summary']['encrypted_pdf_password_required'], 1)
        self.assertNotIn('private.pdf', json.dumps(report['summary']))
        for change in ['summary-string', 'summary-extra', 'summary-count', 'source-binding', 'member', 'incomplete', 'unknown-outcome', 'false-raster-proof']:
            value = result()
            if change == 'summary-string': value['summary']['pdf_parsed'] = 'private.pdf'
            if change == 'summary-extra': value['summary']['member'] = 'private.pdf'
            if change == 'summary-count': value['summary']['pdf_parsed'] = 1
            if change == 'source-binding': value['source_binding']['run_id'] = 'other'
            if change == 'member': value['results'][0]['member'] = 'other.pdf'
            if change == 'incomplete': value['execution_complete'] = False
            if change == 'unknown-outcome': value['results'][0]['result'] = 'arbitrary raw source error'
            if change == 'false-raster-proof': value['results'][0]['raster_decoded'] = True
            with self.subTest(change=change), self.assertRaises(m.MediaError):
                m.checked_result(common, json.dumps(value).encode(), 'pdf', targets(), RUN, HASH)

    def test_indexed_copy_has_new_inode_exact_hash_and_private_mode_source_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); original = root / 'original.pdf'; original.write_bytes(b'synthetic PDF bytes')
            inputs = root / 'inputs'; inputs.mkdir(mode=0o700)
            source_fd = os.open(original, os.O_RDONLY); inputs_fd = os.open(inputs, os.O_RDONLY | os.O_DIRECTORY)
            try:
                digest = hashlib.sha256(original.read_bytes()).hexdigest()
                before = original.stat()
                with patch.object(common.os, 'fchown'):
                    target, observed = m.copy_target(source_fd, inputs_fd, 0, 'original.pdf', digest, common, extractor, Monitor())
                copied = inputs / '0'
                self.assertEqual(copied.read_bytes(), original.read_bytes())
                self.assertNotEqual(copied.stat().st_ino, before.st_ino)
                self.assertEqual(stat.S_IMODE(copied.stat().st_mode), 0o400)
                self.assertEqual(target['sha256'], digest)
                self.assertEqual(observed['bytes'], before.st_size)
                self.assertEqual(original.stat().st_mtime_ns, before.st_mtime_ns)
                with self.assertRaisesRegex(m.MediaError, 'target-source-hash'):
                    m.copy_target(source_fd, inputs_fd, 1, 'original.pdf', '0' * 64, common, extractor, Monitor())
                self.assertFalse((inputs / '1').exists())
            finally: os.close(source_fd); os.close(inputs_fd)

    def test_new_session_is_fixed_private_and_never_accepts_live_target(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(m, 'ROOT', Path(directory)):
            restore = types.SimpleNamespace(open_anchor_directory=lambda path: os.open(path, os.O_RDONLY | os.O_DIRECTORY),
                _private=lambda info, **kwargs: self.assertFalse(info.st_mode & 0o077))
            session, fd = m.new_session(restore)
            try:
                self.assertEqual(session.parent, Path(directory))
                self.assertRegex(session.name, r'^falcon-restore-check-[0-9a-f]{32}$')
                for path in [session, session / 'candidate-validation', session / 'candidate-validation/uploads', session / 'media-inputs']:
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o700)
            finally: os.close(fd)

    def test_adjacent_dispatcher_hash_pins_loaded_bytes(self):
        code = b'loaded_synthetic = True\n'
        directory = types.SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR | 0o700)
        regular = types.SimpleNamespace(st_uid=0, st_mode=stat.S_IFREG | 0o400, st_nlink=1,
            st_size=len(code), st_dev=1, st_ino=2, st_mtime_ns=3, st_ctime_ns=4)
        for good in [False, True]:
            with self.subTest(good=good), patch.object(m, '__file__', '/reviewed/prove-document-media-reviewed.py'), \
                 patch.object(m.os, 'open', side_effect=[20, 21, 22]), patch.object(m.os, 'close'), \
                 patch.object(m.os, 'fstat', side_effect=[directory, directory, regular, regular]), \
                 patch.object(m.os, 'read', side_effect=[code, b'']), \
                 patch.object(m, 'RECONCILE_HASH', hashlib.sha256(code).hexdigest() if good else '0' * 64):
                if good: self.assertTrue(m.load_dispatcher().loaded_synthetic)
                else:
                    with self.assertRaisesRegex(m.MediaError, 'dispatcher-hash'): m.load_dispatcher()

    def test_cli_has_no_production_paths_keys_sockets_or_database_options(self):
        options = {option for action in m.argument_parser()._actions for option in action.option_strings}
        self.assertFalse(options & {'--uploads', '--archive', '--database', '--key-source', '--socket', '--config'})
        self.assertIn('--i-confirm-isolated-media-proof', options)


if __name__ == '__main__': unittest.main()
