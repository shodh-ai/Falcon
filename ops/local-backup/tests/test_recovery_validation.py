"""Offline wrapper checks with synthetic files only; never runs Docker."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import recovery_validation as recovery

RUN = '20261021T010000Z-' + 'b' * 32
IMAGE = 'sha256:' + 'd' * 64
APPROVAL = 'explicit-user-turn'
KEY_SOURCE = '/data/falcon-backups/recovery-private/preservation/environment.json'


def report(status='passed', documents=True, encrypted=True):
    return {'schema_version': 1, 'execution_complete': True, 'status': status,
            'documents': {'matched_local_references': 2}, 'hr': {'decrypted': 1},
            'readiness': {'documents_verified': documents, 'encrypted_fields_verified': encrypted}}


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/tmp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.path = self.root / 'environment.json'

    def read(self, entries):
        self.path.write_text(json.dumps(entries))
        self.path.chmod(0o600)
        with mock.patch.object(recovery, 'open_directory', side_effect=lambda _: os.open(self.root, os.O_RDONLY)):
            return recovery.read_environment(KEY_SOURCE)

    def test_only_minimum_key_and_mapping_values_are_selected(self):
        selected = self.read(['HR_ENCRYPTION_KEY=synthetic-hr-key', 'JWT_SECRET=synthetic-fallback',
                              'S3_ENDPOINT=', 'UPLOAD_PATH=/app/uploads',
                              'DATABASE_URL=must-never-be-forwarded', 'DB_PASSWORD=private',
                              'S3_SECRET_KEY=private', 'SMTP_PASSWORD=private', 'OTHER=a=b'])
        self.assertEqual(set(selected), {'HR_ENCRYPTION_KEY', 'JWT_SECRET', 'S3_ENDPOINT', 'UPLOAD_PATH'})
        self.assertNotIn('must-never-be-forwarded', json.dumps(selected))

    def test_selected_duplicates_and_unknown_upload_mapping_refused(self):
        for entries in (['JWT_SECRET=one', 'JWT_SECRET=two'], ['UPLOAD_PATH=/other/live/path']):
            with self.assertRaises(recovery.BackupError):
                self.read(entries)

    def test_key_file_must_stay_in_fixed_private_preservation_root(self):
        with mock.patch.object(recovery, 'open_directory') as open_dir:
            for path in ('environment.json', '/etc/environment',
                         '/data/falcon-backups/recovery-private/../environment.json',
                         '/data/falcon-backups/recovery-private-other/environment.json'):
                with self.assertRaises(recovery.BackupError):
                    recovery.read_environment(path)
            open_dir.assert_not_called()

    def test_leaf_symlink_hardlink_and_shared_file_are_refused(self):
        self.path.write_text('["JWT_SECRET=synthetic"]')
        self.path.chmod(0o600)
        saved = self.root / 'saved'
        self.path.rename(saved)
        self.path.symlink_to(saved)
        with mock.patch.object(recovery, 'open_directory', side_effect=lambda _: os.open(self.root, os.O_RDONLY)):
            with self.assertRaises(OSError):
                recovery.read_environment(KEY_SOURCE)
            self.path.unlink()
            os.link(saved, self.path)
            with self.assertRaisesRegex(recovery.BackupError, 'single-link'):
                recovery.read_environment(KEY_SOURCE)
            self.path.unlink()
            saved.rename(self.path)
            self.path.chmod(0o640)
            with self.assertRaisesRegex(recovery.BackupError, 'private'):
                recovery.read_environment(KEY_SOURCE)

    def test_invalid_structure_and_oversized_environment_refused(self):
        for value in ({'JWT_SECRET': 'synthetic'}, ['missing-equals'], [42]):
            self.path.write_text(json.dumps(value))
            self.path.chmod(0o600)
            with mock.patch.object(recovery, 'open_directory', side_effect=lambda _: os.open(self.root, os.O_RDONLY)):
                with self.assertRaises(recovery.BackupError):
                    recovery.read_environment(KEY_SOURCE)
        with mock.patch.object(recovery, 'MIB', 1):
            with self.assertRaisesRegex(recovery.BackupError, 'exceeds'):
                self.read(['JWT_SECRET=synthetic'])


class CommandTests(unittest.TestCase):
    def test_fixed_node_command_has_only_minimal_readonly_mounts(self):
        inputs = Path('/private/session/content-inputs')
        source = '/proc/123/fd/8'
        command = recovery.helper_command(IMAGE, 'falcon-restore-check-' + 'c' * 32 + '-content',
                                           source, inputs, '/opt/falcon-local-backup/recovery_content_check.js',
                                           'postgres', 'e' * 64)
        for flag, value in [('--network', 'none'), ('--pull', 'never'), ('--user', '70:70'),
                            ('--memory', '128m'), ('--memory-swap', '128m'),
                            ('--cpus', '0.25'), ('--pids-limit', '32'), ('--entrypoint', 'node')]:
            self.assertEqual(command[command.index(flag) + 1], value)
        self.assertIn('--read-only', command)
        self.assertIn('ALL', command)
        self.assertIn('no-new-privileges:true', command)
        self.assertIn('NODE_OPTIONS=', command)
        self.assertIn('--max-old-space-size=64', command)
        mounts = [command[i + 1] for i, part in enumerate(command) if part == '--mount']
        self.assertEqual(len(mounts), 6)
        self.assertTrue(all(mount.endswith(',readonly') for mount in mounts))
        self.assertIn('type=bind,src=/proc/123/fd/8,dst=/restore-socket,readonly', mounts)
        self.assertEqual({mount.split('dst=')[1].split(',')[0] for mount in mounts},
                         {'/restore-socket', '/checks/recovery_content_check.js',
                          '/inputs/uploads.tar.gz', '/inputs/manifest.json',
                          '/inputs/mapping.json', '/inputs/hr-key.json'})
        text = ' '.join(command)
        for forbidden in ('--env-file', '--publish', '--privileged', 'DATABASE_URL=',
                          'PGPASSWORD=', 'JWT_SECRET=', 'HR_ENCRYPTION_KEY=', 'recovery-private'):
            self.assertNotIn(forbidden, text)
        self.assertFalse(any('docker.sock' in mount for mount in mounts))


class HookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/tmp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.c = {'final_root': str(self.root / 'finalized'),
                  'staging_root': str(self.root / 'staging'), 'restore_uid': 70, 'restore_gid': 70,
                  'databases': ['postgres', 'university_governance'], 'image': 'sha256:' + 'a' * 64,
                  'working_bytes': recovery.MIB}
        final = Path(self.c['final_root'])
        final.mkdir(mode=0o700)
        self.backup = final / RUN
        self.backup.mkdir(mode=0o700)
        self.manifest = {'schema_version': 1, 'run_id': RUN, 'database_names': self.c['databases'],
                         'postgres_image_id': self.c['image'],
                         'sources': {'uploads_directory': '/data/coolify/app/uploads'},
                         'uploads': {'file_sha256': {}}, 'files': []}
        for name in recovery.restore.expected_files(self.c):
            data = b'synthetic-' + name.encode()
            path = self.backup / name
            path.write_bytes(data)
            path.chmod(0o600)
            self.manifest['files'].append({'name': name, 'bytes': len(data),
                                          'sha256': hashlib.sha256(data).hexdigest()})
        (self.backup / 'manifest.json').write_text(json.dumps(self.manifest))
        (self.backup / 'manifest.json').chmod(0o600)
        self.session = self.root / 'session'
        self.session.mkdir(mode=0o700)
        self.context = {'database': 'postgres', 'session_path': str(self.session),
                        'sandbox_name': 'falcon-restore-check-' + 'f' * 32 + '-db-0',
                        'socket_mount_source': '/proc/123/fd/8',
                        'socket_path': '/do-not-bind/helper-writable/socket',
                        'dump_sha256': next(e['sha256'] for e in self.manifest['files'] if e['name'] == 'database-postgres.dump')}

    def make_hook(self, environment, image=IMAGE):
        with mock.patch.object(recovery, 'trusted_file', side_effect=lambda _: os.open(__file__, os.O_RDONLY)):
            return recovery.content_hook(self.c, RUN, image, environment)

    def invoke(self, hook, payload=None, context=None):
        monitor = mock.Mock()
        monitor.run_capture.return_value = json.dumps(payload if payload is not None else report()).encode()
        # Only ownership syscalls are mocked; protected input verification/copy,
        # hashing, modes, metadata serialization and command construction are real.
        with mock.patch.object(recovery.os, 'fchown') as fchown, mock.patch.object(recovery.os, 'chown') as chown:
            result = hook(context or self.context, monitor)
        return result, monitor, fchown, chown

    def test_primary_key_wins_without_mounting_full_environment(self):
        before = {p.name: p.read_bytes() for p in self.backup.iterdir()}
        hook = self.make_hook({'HR_ENCRYPTION_KEY': '  synthetic-primary  ',
                               'JWT_SECRET': 'must-not-be-copied', 'DATABASE_URL': 'must-not-be-copied'})
        result, monitor, fchown, chown = self.invoke(hook)
        inputs = self.session / 'content-inputs'
        self.assertEqual(json.loads((inputs / 'hr-key.json').read_text()), {'HR_ENCRYPTION_KEY': 'synthetic-primary'})
        self.assertEqual(set(p.name for p in inputs.iterdir()), {'uploads.tar.gz', 'manifest.json', 'mapping.json', 'hr-key.json'})
        for path in inputs.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o400)
        self.assertEqual((inputs / 'uploads.tar.gz').read_bytes(), (self.backup / 'uploads.tar.gz').read_bytes())
        self.assertNotIn('must-not-be-copied', ' '.join(path.read_text() for path in inputs.iterdir()))
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.backup.iterdir()})
        self.assertTrue(result['all_content_checks_passed'])
        self.assertTrue(result['minimal_application_key_mounted'])
        self.assertFalse(result['production_database_credentials_mounted'])
        self.assertFalse(result['full_environment_mounted'])
        self.assertEqual(hook.reports, [result])
        command, name = monitor.run_capture.call_args.args
        self.assertIn('type=bind,src=/proc/123/fd/8,dst=/restore-socket,readonly', command)
        self.assertNotIn('/do-not-bind/helper-writable/socket', ' '.join(command))
        self.assertEqual(name, self.context['sandbox_name'] + '-content')
        self.assertEqual(monitor.run_capture.call_args.kwargs['max_bytes'], 65536)
        fchown.assert_called_once()
        self.assertEqual(fchown.call_args.args[1:], (70, 70))
        self.assertEqual(chown.call_count, 3)

    def test_jwt_fallback_is_minimal_and_does_not_claim_no_credentials(self):
        hook = self.make_hook({'HR_ENCRYPTION_KEY': ' ', 'JWT_SECRET': ' synthetic-fallback '})
        result, _, _, _ = self.invoke(hook)
        self.assertEqual(json.loads((self.session / 'content-inputs' / 'hr-key.json').read_text()),
                         {'JWT_SECRET': 'synthetic-fallback'})
        self.assertTrue(result['minimal_application_key_mounted'])
        self.assertNotIn('production_credentials_mounted', result)

    def test_unproven_and_inconsistent_readiness_never_become_passed(self):
        payloads = [report('unproven', True, True), report('passed', False, True),
                    report('passed', True, False), report('unproven', False, False)]
        for index, payload in enumerate(payloads):
            session = self.root / ('case-%d' % index)
            session.mkdir(mode=0o700)
            context = dict(self.context, session_path=str(session))
            hook = self.make_hook({'HR_ENCRYPTION_KEY': 'synthetic'})
            result, _, _, _ = self.invoke(hook, payload, context)
            self.assertFalse(result['all_content_checks_passed'])
            self.assertEqual(hook.reports, [result])

    def test_malformed_or_failed_report_never_recorded_as_pass(self):
        payloads = [report('failed'), dict(report(), execution_complete=False),
                    dict(report(), readiness={'documents_verified': 1, 'encrypted_fields_verified': True}),
                    dict(report(), schema_version=99), {}]
        for index, payload in enumerate(payloads):
            session = self.root / ('bad-%d' % index)
            session.mkdir(mode=0o700)
            context = dict(self.context, session_path=str(session))
            hook = self.make_hook({'HR_ENCRYPTION_KEY': 'synthetic'})
            with self.assertRaisesRegex(recovery.BackupError, 'Incomplete'):
                self.invoke(hook, payload, context)
            self.assertEqual(hook.reports, [])

    def test_nonbusiness_database_does_not_read_key_copy_or_launch_node(self):
        hook = self.make_hook({'JWT_SECRET': 'synthetic'})
        result, monitor, _, _ = self.invoke(hook, context=dict(self.context, database='university_governance'))
        self.assertIn('not applicable', result['content_probe'])
        self.assertEqual(hook.reports, [])
        self.assertFalse((self.session / 'content-inputs').exists())
        monitor.run_capture.assert_not_called()

    def test_nonreviewed_uid_and_mutable_image_are_refused(self):
        with self.assertRaisesRegex(recovery.BackupError, 'Pin'):
            self.make_hook({}, 'app:latest')
        self.c['restore_uid'] = 1000
        hook = self.make_hook({})
        with self.assertRaisesRegex(recovery.BackupError, 'UID/GID'):
            self.invoke(hook)

    def test_archive_digest_mismatch_stops_before_mounting_or_key_copy(self):
        (self.backup / 'uploads.tar.gz').write_bytes(b'changed')
        hook = self.make_hook({'HR_ENCRYPTION_KEY': 'synthetic'})
        monitor = mock.Mock()
        with self.assertRaisesRegex(recovery.BackupError, 'hash/size'):
            hook(self.context, monitor)
        self.assertFalse((self.session / 'content-inputs' / 'hr-key.json').exists())
        monitor.run_capture.assert_not_called()

    def test_mapping_mirrors_reviewed_endpoint_and_preserved_source_root(self):
        hook = self.make_hook({'HR_ENCRYPTION_KEY': 'synthetic', 'S3_ENDPOINT': 'https://storage.invalid'})
        self.invoke(hook)
        mapping = json.loads((self.session / 'content-inputs' / 'mapping.json').read_text())
        self.assertEqual(mapping['source_upload_roots'], ['/app/uploads', '/data/coolify/app/uploads'])
        self.assertTrue(mapping['object_storage_enabled'])
        self.assertEqual(mapping['working_directory'], '/app')


class MainTests(unittest.TestCase):
    def invoke(self, memory, reports=None):
        argv = ['recovery_validation.py', '--run-id', RUN, '--approval-id', APPROVAL,
                '--content-image', IMAGE, '--key-source', KEY_SOURCE, '--i-confirm-disposable-restore']
        hook = mock.Mock(reports=reports or [])
        output = io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(sys, 'argv', argv))
            stack.enter_context(mock.patch.object(recovery, 'ensure_runtime_directory'))
            stack.enter_context(mock.patch.object(recovery, 'lock', return_value=contextlib.nullcontext()))
            stack.enter_context(mock.patch.object(recovery, 'load_config', return_value={'synthetic': True}))
            stack.enter_context(mock.patch.object(recovery.signal, 'signal'))
            stack.enter_context(mock.patch.object(recovery.restore, 'available_memory', return_value=memory))
            read_keys = stack.enter_context(mock.patch.object(recovery, 'read_environment', return_value={'HR_ENCRYPTION_KEY': 'must-not-be-output'}))
            make_hook = stack.enter_context(mock.patch.object(recovery, 'content_hook', return_value=hook))
            run = stack.enter_context(mock.patch.object(recovery.restore, 'run_restore', return_value={'same_dump_counts_passed': True, 'application_recovery_proven': False}))
            stack.enter_context(contextlib.redirect_stdout(output))
            if memory < int(1.5 * recovery.restore.GIB):
                with self.assertRaisesRegex(recovery.BackupError, '1.5 GiB'):
                    recovery.main()
            else:
                recovery.main()
        return output.getvalue(), read_keys, make_hook, run

    def test_memory_gate_precedes_any_recovery_key_read(self):
        output, read_keys, make_hook, run = self.invoke(int(1.5 * recovery.restore.GIB) - 1)
        read_keys.assert_not_called()
        make_hook.assert_not_called()
        run.assert_not_called()
        self.assertEqual(output, '')

    def test_content_summary_is_false_for_empty_or_unproven_reports(self):
        for reports in ([], [{'all_content_checks_passed': False}]):
            output, _, _, _ = self.invoke(2 * recovery.restore.GIB, reports)
            value = json.loads(output)
            self.assertTrue(value['same_dump_counts_passed'])
            self.assertFalse(value['content_checks_passed'])
            self.assertFalse(value['application_recovery_proven'])
            self.assertNotIn('must-not-be-output', output)

    def test_passed_content_summary_still_does_not_claim_application_recovery(self):
        output, read_keys, make_hook, run = self.invoke(2 * recovery.restore.GIB, [{'all_content_checks_passed': True}])
        value = json.loads(output)
        self.assertTrue(value['content_checks_passed'])
        self.assertFalse(value['application_recovery_proven'])
        read_keys.assert_called_once_with(KEY_SOURCE)
        run.assert_called_once()


if __name__ == '__main__':
    unittest.main()
