"""Synthetic tests only: no Docker daemon, backup data, credentials or network."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / 'validate-candidate-restore.py'
SPEC = importlib.util.spec_from_file_location('candidate_restore', PATH)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
IMAGE = 'sha256:' + '1' * 64
REDIS = 'sha256:' + '2' * 64
PG = 'sha256:' + '3' * 64
BASE = 'falcon-restore-check-' + 'a' * 32 + '-db-0'
REQUIRED = dict(schema_version=1, execution_complete=True, actual_runtime_login=True,
                business_crud=True, ddl_and_ledger_denials=True, health=True,
                authenticated_me=True, synthetic_disk_upload=True)


class Monitor:
    def __init__(self):
        self.ticks = 0
        self.commands = []
        self.active = set()
        self.cleanup = []

    def tick(self, force=False):
        self.ticks += 1

    @contextlib.contextmanager
    def helper(self, command, name):
        self.commands.append(command)
        self.active.add(name)
        process = types.SimpleNamespace(stdout=io.BytesIO(('f' * 64 + '\n').encode()),
                                        returncode=0, poll=lambda: 0)
        try:
            yield process
        finally:
            self.active.remove(name)
            self.cleanup.append(name)

    def wait(self, process):
        if process.returncode:
            raise m.CandidateError('helper-failed')

    def container_absent(self, name):
        return name not in self.active


class CandidateUnitTests(unittest.TestCase):
    def test_fixed_run_is_nonprivileged_bounded_and_never_pulls_or_publishes(self):
        command = m.base_run(['docker'], BASE + '-content', IMAGE, network='none', memory='1g', cpus='0.5')
        for pair in [('--pull', 'never'), ('--network', 'none'), ('--cap-drop', 'ALL'),
                     ('--memory', '1g'), ('--memory-swap', '1g'), ('--cpus', '0.5'),
                     ('--security-opt', 'no-new-privileges:true'), ('--log-driver', 'local')]:
            offset = command.index(pair[0]); self.assertEqual(tuple(command[offset:offset + 2]), pair)
        self.assertIn('--read-only', command)
        for forbidden in ['--privileged', '--publish', '-p', '--volume', '/var/run/docker.sock']:
            self.assertNotIn(forbidden, command)
        self.assertNotIn('--rm', m.base_run(['docker'], BASE, IMAGE, remove=False))
        for name in ['postgres', BASE + ';danger', 'falcon-restore-check-not-random-content']:
            with self.assertRaises(m.CandidateError):
                m.base_run(['docker'], name, IMAGE)
        with self.assertRaises(m.CandidateError):
            m.base_run(['docker'], BASE, 'latest')

    def test_image_env_is_cleared_without_overriding_synthetic_envfile_keys(self):
        image = {'Config': {'Env': ['PATH=/known', 'NODE_VERSION=20', 'JWT_SECRET=must-not-copy',
                                  'DB_PASSWORD=must-not-copy', 'SMTP_PASSWORD=must-not-copy', 'OTHER_TOKEN=must-not-copy']}}
        reset = m.image_environment_resets(image, {'JWT_SECRET', 'DB_PASSWORD'})
        self.assertEqual(reset, ['--env', 'SMTP_PASSWORD=', '--env', 'OTHER_TOKEN='])
        self.assertNotIn('must-not-copy', str(reset))
        with self.assertRaises(m.CandidateError):
            m.image_environment_resets({'Config': {'Env': ['INVALID KEY=bad']}})

    def test_mountinfo_root_uses_deepest_exact_mount_and_preserves_filesystem_root(self):
        info = ('1 0 8:1 / / rw - xfs /dev/fixture rw\n'
                '2 1 8:1 /protected/socket /private/anchor ro - xfs /dev/fixture rw\n')
        self.assertEqual(m.mount_root_for('/private/anchor', info), '/protected/socket')
        self.assertEqual(m.mount_root_for('/data/check/uploads', info), '/data/check/uploads')
        self.assertEqual(m.mount_root_for('/private/anchor/child', info), '/protected/socket/child')
        with self.assertRaises(m.CandidateError):
            m.mount_root_for('/private/anchor', info + '3 1 8:1 /other /private/anchor ro - xfs x rw\n')

    def test_private_evidence_is_create_only_nofollow_and_never_replaces_existing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            m.private_write(root, 'fixture.log', b'synthetic')
            self.assertEqual(stat.S_IMODE((root / 'fixture.log').stat().st_mode), 0o400)
            with self.assertRaises(FileExistsError):
                m.private_write(root, 'fixture.log', b'replaced')
            (root / 'link.log').symlink_to(root / 'fixture.log')
            with self.assertRaises(FileExistsError):
                m.private_write(root, 'link.log', b'replaced')
            self.assertEqual((root / 'fixture.log').read_bytes(), b'synthetic')
            with self.assertRaises(m.CandidateError):
                m.private_write(root, '../outside', b'bad')

    def test_guarded_process_drains_and_applies_existing_monitor(self):
        monitor = Monitor()
        code, output = m.run_guarded([sys.executable, '-c', 'print("aggregate-only")'], monitor)
        self.assertEqual(code, 0); self.assertEqual(output, b'aggregate-only\n')
        self.assertGreater(monitor.ticks, 0)
        with self.assertRaisesRegex(m.CandidateError, 'command-output-bound'):
            m.run_guarded([sys.executable, '-c', 'print("x"*1000)'], Monitor(), maximum=100)
        with self.assertRaisesRegex(m.CandidateError, 'command-timeout'):
            m.run_guarded([sys.executable, '-c', 'import time;time.sleep(2)'], Monitor(), timeout=0.05)

    def test_json_metadata_requires_unique_keys(self):
        with self.assertRaises(m.CandidateError):
            m.decode_json(b'{"status":true,"status":false}')

    def test_nonbusiness_database_does_not_read_image_or_create_helpers(self):
        hook = m.CandidateHook(None, None, {}, IMAGE, '4' * 64, '/fixed/runtime-role.sql')
        result = hook({'database': 'empty_second_database'}, Monitor())
        self.assertTrue(result['execution_complete'])
        self.assertEqual(hook.reports, [])

    def test_memory_gate_precedes_private_inputs_or_docker(self):
        backup = types.SimpleNamespace(available_memory=lambda: 2 * m.GIB - 1)
        hook = m.CandidateHook(None, backup, {}, IMAGE, '4' * 64, '/fixed/runtime-role.sql')
        with self.assertRaisesRegex(m.CandidateError, 'candidate-memory-start-gate'):
            hook({'database': 'postgres'}, Monitor())

    def exercise_hook(self, *, negative_code=1, probe=REQUIRED, probe_code=0, command_override=None, cleanup_unconfirmed=False, runtime_caps=('DAC_OVERRIDE',)):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        session = Path(temporary.name)
        socket = session / 'socket-anchor'; socket.mkdir(mode=0o700)
        restore = types.SimpleNamespace(open_anchor_directory=lambda p: os.open(str(p), os.O_RDONLY),
                                       GuardedStream=lambda stream, monitor: contextlib.nullcontext(stream))
        backup = types.SimpleNamespace(available_memory=lambda: 3 * m.GIB, DOCKER=['docker'])
        hook = m.CandidateHook(restore, backup, {'restore_uid': 70, 'restore_gid': 70, 'image': PG},
                               IMAGE, '4' * 64, '/fixed/runtime-role.sql')
        monitor = Monitor()
        if cleanup_unconfirmed:
            monitor.container_absent = lambda name: False
        captured = []
        def capture(command, current_monitor, name, allow_failure=False):
            captured.append(command)
            self.assertEqual(name, BASE + ('-redis-id' if '-redis-id' in name else '-content'))
            if '--entrypoint' in command and command[command.index('--entrypoint') + 1] == 'node':
                mounted = [x for x in command if 'dst=/app/uploads' in x]
                if not mounted or 'wrong-uploads' in mounted[0]:
                    return negative_code, json.dumps({'storage_boundary_refused': True, 'error_code': 'mount-identity'}).encode()
                return 0, b'{"storage_boundary_verified":true,"upload_roots_verified":1}'
            if '--entrypoint' in command and command[command.index('--entrypoint') + 1] == 'id':
                return 0, b'999\n'
            return 0, b'fixture SQL metadata only\n'
        hook.capture = capture
        def metadata(docker, current_monitor, image):
            return {'Id': image, 'Config': {'Cmd': command_override or ['node', 'scripts/runtime-start.cjs'],
                'User': '', 'Entrypoint': ['docker-entrypoint.sh'],
                'Env': ['NODE_ENV=production', 'SMTP_PASSWORD=discard-image-value']}}
        def docker_json(docker, current_monitor, command):
            if '{{json .Image}}' in command:
                return REDIS
            if '{{json .State.Running}}' in command:
                return True
            if command[-1].endswith('-redis'):
                return {'NetworkMode': 'none', 'PortBindings': {}, 'Binds': None}
            return {'NetworkMode': 'container:' + 'f' * 64, 'PortBindings': {}, 'Privileged': False,
                    'ReadonlyRootfs': True, 'Memory': m.GIB, 'NanoCpus': 500000000, 'CapDrop': ['ALL'], 'CapAdd': list(runtime_caps)}
        def guarded(command, current_monitor, **kwargs):
            if command[1] == 'logs':
                return 0, b'private application diagnostics\n'
            if '-i' in command:
                return probe_code, b'FALCON_CANDIDATE_V1 ' + json.dumps(probe).encode() + b'\n'
            return 0, b''
        context = {'database': 'postgres', 'sandbox_name': BASE, 'session_path': str(session),
                   'socket_mount_source': str(socket)}
        with patch.object(m, 'image_metadata', side_effect=metadata), patch.object(m, 'docker_json', side_effect=docker_json), \
             patch.object(m, 'run_guarded', side_effect=guarded), patch.object(m.os, 'chown'), \
             patch.object(m.Path, 'read_text', return_value='1 0 8:1 / / rw - xfs /dev/fixture rw\n'):
            try:
                result = hook(context, monitor)
            except m.CandidateError as error:
                return None, error, captured, monitor, session
        return result, None, captured, monitor, session

    def test_hook_mounts_no_production_data_and_requires_actual_login_auth_upload_and_cleanup(self):
        result, error, captured, monitor, session = self.exercise_hook()
        self.assertIsNone(error); self.assertTrue(result['candidate_checks_passed'])
        self.assertFalse(result['nonroot_proven']); self.assertFalse(result['production_credentials_mounted'])
        self.assertEqual(result['test_capability_exception'], 'DAC_OVERRIDE')
        self.assertFalse(result['all_capabilities_dropped_proven'])
        self.assertEqual(monitor.active, set())
        for command in captured + monitor.commands:
            self.assertNotIn('coolify', str(command)); self.assertNotIn('docker.sock', str(command))
            for part in command:
                if part.startswith('type=bind,'):
                    self.assertNotIn('dst=/scratch', part)
                    self.assertNotIn('dst=/backup', part)
        role = next(c for c in captured if 'psql' in c)
        self.assertIn('runtime_database=restorecheck', role)
        self.assertIn('runtime_role=falcon_runtime', role)
        self.assertIn('/restore-socket', role)
        app = next(c for c in monitor.commands if c[c.index('--name') + 1] == BASE + '-content')
        self.assertIn('container:' + 'f' * 64, app)
        self.assertNotIn('--rm', app)
        self.assertEqual(app[app.index('--cap-add') + 1], 'DAC_OVERRIDE')
        redis = next(c for c in monitor.commands if c[c.index('--name') + 1] == BASE + '-redis')
        self.assertNotIn('--cap-add', redis)
        self.assertEqual(app[-1], IMAGE)
        env = (session / 'candidate-validation/candidate.env').read_text()
        self.assertIn('PORTAL_EMAIL_DELIVERY_ENABLED=false', env)
        self.assertNotIn('SMTP_PASSWORD', env)
        self.assertNotIn('discard-image-value', env)
        self.assertTrue((session / 'candidate-validation/passed.json').exists())
        self.assertTrue((session / 'candidate-validation/candidate-application.log').exists())

    def test_missing_or_wrong_mount_acceptance_fails_before_nest_or_redis(self):
        result, error, captured, monitor, session = self.exercise_hook(negative_code=0)
        self.assertIsNone(result); self.assertEqual(str(error), 'negative-storage-guard')
        self.assertEqual(monitor.commands, [])
        self.assertTrue((session / 'candidate-validation/failed.json').exists())

    def test_incomplete_probe_never_becomes_a_pass_and_containers_are_removed(self):
        result, error, _, monitor, session = self.exercise_hook(probe={**REQUIRED, 'authenticated_me': False})
        self.assertIsNone(result); self.assertEqual(str(error), 'candidate-probe-incomplete')
        self.assertEqual(monitor.active, set())
        self.assertFalse((session / 'candidate-validation/passed.json').exists())
        self.assertTrue((session / 'candidate-validation/failed.json').exists())

    def test_old_startup_command_is_rejected_before_any_fixture_sql(self):
        result, error, captured, monitor, _ = self.exercise_hook(command_override=['sh', '-c', 'npm run db:migrate'])
        self.assertIsNone(result); self.assertEqual(str(error), 'unreviewed-entrypoint-or-uid-stage')
        self.assertEqual(captured, []); self.assertEqual(monitor.commands, [])


    def test_cleanup_failure_cannot_be_reported_as_success(self):
        result, error, _, monitor, session = self.exercise_hook(cleanup_unconfirmed=True)
        self.assertIsNone(result); self.assertEqual(str(error), 'candidate-cleanup-unconfirmed')
        self.assertEqual(monitor.active, set())
        self.assertFalse((session / 'candidate-validation/passed.json').exists())
        self.assertTrue((session / 'candidate-validation/failed.json').exists())

    def test_deadline_monitor_preserves_underlying_guard_and_refuses_expired_helper(self):
        monitor = Monitor()
        with patch.object(m.time, 'monotonic', return_value=10):
            bounded = m.DeadlineMonitor(monitor, 2)
            bounded.tick()
        self.assertEqual(monitor.ticks, 1)
        with patch.object(m.time, 'monotonic', return_value=12):
            with self.assertRaisesRegex(m.CandidateError, 'helper-timeout'):
                bounded.tick()

    def test_fixed_node_probe_and_guard_are_syntactically_valid(self):
        import shutil
        import subprocess
        node = shutil.which('node')
        if node is None:
            self.skipTest('Node is unavailable for syntax-only check')
        for script in [m.PROBE_JS, m.GUARD_JS]:
            result = subprocess.run([node, '--check', '-'], input=script.encode(), capture_output=True)
            self.assertEqual(result.returncode, 0, 'fixed Node probe failed syntax validation')
        self.assertLessEqual(len(m.PROBE_JS.encode()), 4096)


    def test_framed_probe_ignores_private_library_warnings_but_refuses_missing_or_duplicate_evidence(self):
        payload = b'FALCON_CANDIDATE_V1 ' + json.dumps(REQUIRED).encode()
        self.assertEqual(m.probe_report(b'private library warning\n' + payload + b'\n'), REQUIRED)
        for data in [b'library warning only', payload + b'\n' + payload]:
            with self.assertRaises(m.CandidateError):
                m.probe_report(data)


    def test_runtime_capability_exception_must_match_exactly_and_never_expands_silently(self):
        for capabilities in [(), ('DAC_READ_SEARCH',), ('DAC_OVERRIDE', 'SYS_ADMIN')]:
            result, error, _, monitor, session = self.exercise_hook(runtime_caps=capabilities)
            self.assertIsNone(result); self.assertEqual(str(error), 'candidate-isolation')
            self.assertEqual(monitor.active, set())
            self.assertTrue((session / 'candidate-validation/candidate-application.log').exists())
            self.assertFalse((session / 'candidate-validation/passed.json').exists())


if __name__ == '__main__':
    unittest.main()
