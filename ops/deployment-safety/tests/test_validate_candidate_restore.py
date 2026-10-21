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

    def exercise_hook(self, *, negative_code=1, probe=REQUIRED, probe_code=0, command_override=None, cleanup_unconfirmed=False, runtime_caps=None, user_mode='root', image_user=None, observed_uid=61001, relay_cleanup_failure=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        session = Path(temporary.name)
        socket = session / 'socket-anchor'; socket.mkdir(mode=0o700)
        restore = types.SimpleNamespace(open_anchor_directory=lambda p: os.open(str(p), os.O_RDONLY),
                                       GuardedStream=lambda stream, monitor: contextlib.nullcontext(stream))
        backup = types.SimpleNamespace(available_memory=lambda: 3 * m.GIB, DOCKER=['docker'])
        hook = m.CandidateHook(restore, backup, {'restore_uid': 70, 'restore_gid': 70, 'image': PG},
                               IMAGE, '4' * 64, '/fixed/runtime-role.sql', user_mode)
        if runtime_caps is None:
            runtime_caps = () if user_mode == 'nonroot' else ('DAC_OVERRIDE',)
        monitor = Monitor()
        if cleanup_unconfirmed:
            monitor.container_absent = lambda name: False
        captured = []
        def capture(command, current_monitor, name, allow_failure=False):
            captured.append(command)
            self.assertIn(name, [BASE + '-redis-id', BASE + '-content', BASE + '-candidate'])
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
                'User': image_user if image_user is not None else ('61001:61001' if user_mode == 'nonroot' else ''), 'Entrypoint': ['docker-entrypoint.sh'],
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
            if '-e' in command and command[-1] == m.CODE_PERMISSIONS_JS:
                return 0, json.dumps({'schema_version': 1, 'code_permission_inventory_complete': True,
                    'code_owned_by_root': True, 'code_write_bits_clear': True, 'code_setid_bits_clear': True,
                    'files_checked': 3, 'directories_checked': 7, 'symlinks_checked': 1}).encode()
            if '-e' in command and command[-1] == m.IDENTITY_JS:
                return 0, json.dumps({'uid': observed_uid, 'gid': 61001, 'groups': [61001],
                    'pid1_uids': [observed_uid] * 4, 'pid1_gids': [61001] * 4, 'pid1_groups': [61001],
                    'capabilities_zero': True, 'no_new_privileges': True}).encode()
            if '-i' in command:
                return probe_code, b'FALCON_CANDIDATE_V1 ' + json.dumps(probe).encode() + b'\n'
            return 0, b''
        context = {'database': 'postgres', 'sandbox_name': BASE, 'session_path': str(session),
                   'socket_mount_source': str(socket)}
        if user_mode == 'nonroot':
            @contextlib.contextmanager
            def relay(context, current_monitor, inputs, image):
                endpoint = inputs / 'relay-socket'
                endpoint.mkdir(mode=0o710)
                monitor.active.add(BASE + '-content')
                try:
                    yield endpoint, {'uid': 70, 'gid': 61001, 'all_capabilities_zero': True}, lambda: monitor.tick()
                finally:
                    if relay_cleanup_failure:
                        raise m.CandidateError('relay-cleanup-unconfirmed')
                    monitor.active.remove(BASE + '-content')
                    monitor.cleanup.append(BASE + '-content')
            hook.relay = relay
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
        for script in [m.PROBE_JS, m.GUARD_JS, m.IDENTITY_JS, m.RELAY_JS, m.CODE_PERMISSIONS_JS]:
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


    def test_nonroot_mode_uses_relay_not_core_alias_and_verifies_cleanup_order(self):
        result, error, captured, monitor, session = self.exercise_hook(user_mode='nonroot')
        self.assertIsNone(error)
        self.assertTrue(result['nonroot_proven'])
        self.assertTrue(result['all_capabilities_dropped_proven'])
        self.assertIsNone(result['test_capability_exception'])
        self.assertEqual(result['candidate_identity']['uid'], 61001)
        self.assertEqual(monitor.cleanup, [BASE + '-candidate', BASE + '-redis', BASE + '-content'])
        app = next(c for c in monitor.commands if c[c.index('--name') + 1] == BASE + '-candidate')
        self.assertNotIn('--cap-add', app)
        socket_mounts = [x for x in app if 'dst=/restore-socket' in x]
        self.assertEqual(len(socket_mounts), 1)
        self.assertIn('relay-socket', socket_mounts[0])
        self.assertNotIn('socket-anchor', socket_mounts[0])
        self.assertIn(',readonly', socket_mounts[0])
        self.assertEqual(stat.S_IMODE((session / 'candidate-validation/storage-boundary.json').stat().st_mode), 0o444)
        self.assertEqual(monitor.active, set())

    def test_nonroot_mode_rejects_root_image_extra_caps_wrong_actual_uid_and_failed_relay_cleanup(self):
        for kwargs, expected in [({'image_user': ''}, 'unreviewed-entrypoint-or-uid-stage'),
                ({'runtime_caps': ('DAC_OVERRIDE',)}, 'candidate-isolation'),
                ({'observed_uid': 0}, 'observed-nonroot-identity-or-caps'),
                ({'relay_cleanup_failure': True}, 'relay-cleanup-unconfirmed')]:
            result, error, _, _, session = self.exercise_hook(user_mode='nonroot', **kwargs)
            self.assertIsNone(result); self.assertEqual(str(error), expected)
            self.assertFalse((session / 'candidate-validation/passed.json').exists())

    def test_relay_command_has_fixed_targets_no_network_no_caps_and_only_one_fresh_rw_directory(self):
        command = m.relay_command(['docker'], BASE + '-content', IMAGE, {'Config': {'Env': []}},
                                  '/root-private/held-core', Path('/root-private/new-relay'))
        self.assertEqual(command[command.index('--user') + 1], '70:61001')
        self.assertEqual(command[command.index('--memory') + 1], '64m')
        self.assertEqual(command[command.index('--cpus') + 1], '0.1')
        self.assertEqual(command[command.index('--network') + 1], 'none')
        self.assertNotIn('--cap-add', command)
        mounts = [x for x in command if x.startswith('type=bind,')]
        self.assertEqual(mounts, ['type=bind,src=/root-private/held-core,dst=/upstream-socket,readonly',
                                   'type=bind,src=/root-private/new-relay,dst=/relay'])
        self.assertNotIn('--env-file', command)
        self.assertNotIn('DB_PASSWORD', str(command))
        self.assertIn("upstream='/upstream-socket/.s.PGSQL.55432'", m.RELAY_JS)
        self.assertNotIn('unlink', m.RELAY_JS)
        self.assertNotIn('chmodSync', m.RELAY_JS.split('endpoint=')[0])

    def test_observed_uid_caps_and_no_new_privileges_are_required_from_kernel_metadata(self):
        hook = m.CandidateHook(None, None, {}, IMAGE, '4' * 64, '/fixed/runtime-role.sql', 'nonroot')
        good = {'uid': 61001, 'gid': 61001, 'groups': [61001], 'pid1_uids': [61001] * 4,
                'pid1_gids': [61001] * 4, 'pid1_groups': [61001], 'capabilities_zero': True, 'no_new_privileges': True}
        for patch_value in [{}, {'uid': 0}, {'pid1_uids': [0] * 4}, {'groups': [0]},
                            {'capabilities_zero': False}, {'no_new_privileges': False}]:
            with patch.object(m, 'run_guarded', return_value=(0, json.dumps({**good, **patch_value}).encode())):
                if patch_value:
                    with self.assertRaisesRegex(m.CandidateError, 'observed-nonroot-identity-or-caps'):
                        hook.observe_identity(['docker'], Monitor(), BASE + '-candidate', 61001, 61001)
                else:
                    self.assertEqual(hook.observe_identity(['docker'], Monitor(), BASE + '-candidate', 61001, 61001)['uid'], 61001)

    def test_relay_endpoint_identity_rejects_swaps_links_wrong_modes_owners_and_extra_entries(self):
        def info(mode, uid, gid, inode, links=1):
            return types.SimpleNamespace(st_mode=mode, st_uid=uid, st_gid=gid, st_dev=1, st_ino=inode, st_nlink=links)
        directory = info(stat.S_IFDIR | 0o710, 70, 61001, 10)
        endpoint = info(stat.S_IFSOCK | 0o660, 70, 61001, 11)
        args = [directory, directory, endpoint, directory, (1, 11), ['.s.PGSQL.55432']]
        m.validate_relay_endpoint(*args)
        for index, replacement in [(0, info(stat.S_IFDIR | 0o770, 70, 61001, 10)),
                (0, info(stat.S_IFDIR | 0o710, 0, 61001, 10)), (1, info(stat.S_IFDIR | 0o710, 70, 61001, 12)),
                (2, info(stat.S_IFLNK | 0o660, 70, 61001, 11)), (2, info(stat.S_IFSOCK | 0o666, 70, 61001, 11)),
                (2, info(stat.S_IFSOCK | 0o660, 70, 70, 11)), (2, info(stat.S_IFSOCK | 0o660, 70, 61001, 11, 2)),
                (4, (1, 12)), (5, ['.s.PGSQL.55432', 'unexpected'])]:
            altered = list(args); altered[index] = replacement
            with self.assertRaisesRegex(m.CandidateError, 'relay-endpoint-identity'):
                m.validate_relay_endpoint(*altered)


    def test_code_stat_inventory_rejects_writable_modes_even_when_fixture_root_is_readonly(self):
        import shutil
        import subprocess
        node = shutil.which('node')
        if node is None:
            self.skipTest('Node is unavailable for synthetic metadata test')
        harness = r"""
const fs=require('fs'),vm=require('vm');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const records={
 '/app':{kind:'d',mode:0o40555}, '/app/dist':{kind:'d',mode:0o40555,children:['main.js']},
 '/app/dist/main.js':{kind:'f',mode:0o100444}, '/app/scripts':{kind:'d',mode:0o40555},
 '/app/node_modules':{kind:'d',mode:0o40555,children:['alias','module.js']},
 '/app/node_modules/alias':{kind:'l',mode:0o120777,real:'/app/node_modules/module.js'},
 '/app/node_modules/module.js':{kind:'f',mode:0o100444}, '/app/migrations':{kind:'d',mode:0o40555},
 '/app/data':{kind:'d',mode:0o40555}, '/app/package.json':{kind:'f',mode:0o100444}};
if(input.patch)Object.assign(records[input.patch.path],input.patch.value);
const info=p=>{const r=records[p];if(!r)throw Error();return {...r,uid:r.uid===undefined?0:r.uid,
 isDirectory:()=>r.kind==='d',isFile:()=>r.kind==='f',isSymbolicLink:()=>r.kind==='l'};};
const fake={lstatSync:info,statSync:info,realpathSync:p=>records[p].real,
 readdirSync:p=>records[p].children||[],accessSync:()=>{throw Error('RO must not be used as mode proof');}};
let stdout='';const process={stdout:{write:x=>stdout+=x},exitCode:0};
vm.runInNewContext(input.code,{require:n=>n==='fs'?fake:require(n),process});
global.process.stdout.write(JSON.stringify({code:process.exitCode,report:JSON.parse(stdout)}));
"""
        for patch_value in [None, {'path': '/app', 'value': {'mode': 0o40755}},
                {'path': '/app/dist/main.js', 'value': {'mode': 0o100644}},
                {'path': '/app/data', 'value': {'uid': 61001}},
                {'path': '/app/dist/main.js', 'value': {'mode': 0o104444}},
                {'path': '/app/node_modules/alias', 'value': {'real': '/app/uploads/anything'}}]:
            result = subprocess.run([node, '-e', harness], input=json.dumps({'code': m.CODE_PERMISSIONS_JS,
                                    'patch': patch_value}).encode(), capture_output=True)
            self.assertEqual(result.returncode, 0)
            report = json.loads(result.stdout)
            self.assertEqual(report['code'], 0 if patch_value is None else 1)
            self.assertEqual(report['report']['code_permission_inventory_complete'], patch_value is None)


    def test_probe_jwt_timestamp_remains_epoch_seconds_when_runtime_ids_change(self):
        import re
        import shutil
        import subprocess
        node = shutil.which('node')
        if node is None:
            self.skipTest('Node is unavailable for timestamp check')
        match = re.search(r'now=(Math.floor\(Date.now\(\)/[0-9]+\))', m.PROBE_JS)
        self.assertIsNotNone(match)
        script = 'Date.now=()=>1700000000000;console.log(' + match.group(1) + ');'
        result = subprocess.run([node, '-e', script], capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), b'1700000000')

    def test_recovered_uploads_require_nonroot_and_finalized_backup(self):
        run = '20261021T124757Z-' + 'a' * 32
        for user, selected in [('root', run), ('nonroot', None), ('nonroot', '../production')]:
            with self.assertRaisesRegex(m.CandidateError, 'recovered-uploads-require'):
                m.CandidateHook(None, None, {}, IMAGE, '4' * 64, '/fixed/roles.sql', user, True, selected)
        m.CandidateHook(None, None, {}, IMAGE, '4' * 64, '/fixed/roles.sql', 'nonroot', True, run)

    def test_recovery_application_upload_uses_one_exact_predeclared_synthetic_file(self):
        selected = '.falcon-recovery-proof-' + 'a' * 32
        script = m.recovery_application_probe(selected)
        self.assertIn("const key='" + selected + "/application.txt';", script)
        self.assertNotIn('candidate-validation/synthetic-', script)
        self.assertIn('FALCON disposable candidate upload check', script)
        self.assertLessEqual(len(script.encode()), 4096)
        for invalid in ['../production', selected + '/child', selected.upper()]:
            with self.assertRaises(m.CandidateError):
                m.recovery_application_probe(invalid)

    def test_recovered_probe_matrix_has_only_scratch_mounts_and_distinct_post_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            inputs = Path(directory)
            backup = types.SimpleNamespace(DOCKER=['docker'], trusted_file=lambda path: os.open(path, os.O_RDONLY))
            hook = m.CandidateHook(None, backup, {}, IMAGE, '4' * 64, '/fixed/roles.sql', 'nonroot')
            observed = []
            def capture(command, monitor, name):
                observed.append(command)
                mode = command[-2] if command[-1] == 'after-application' else command[-1]
                after = command[-1] == 'after-application'
                return 0, json.dumps(dict(ok=True, mode=mode, original_files=195,
                                          synthetic_files=4 if after else 3)).encode()
            hook.capture = capture
            image = {'Config': {'Env': ['SMTP_PASSWORD=must-not-copy']}}
            for mode in ('api', 'backup', 'backup-ro', 'outsider'):
                hook.recovered_upload_probe({'sandbox_name': BASE}, Monitor(), inputs, image, mode)
            for mode in ('verify', 'backup', 'backup-ro'):
                hook.recovered_upload_probe({'sandbox_name': BASE}, Monitor(), inputs, image, mode, after=True)
            self.assertEqual(len(list(inputs.glob('recovery-permission-*.json'))), 7)
            for command in observed:
                self.assertNotIn('must-not-copy', str(command))
                self.assertIn('none', command)
                self.assertIn('--read-only', command)
                mounts = [command[i+1] for i, value in enumerate(command) if value == '--mount']
                self.assertEqual(len(mounts), 3)
                upload = next(item for item in mounts if 'dst=/app/uploads' in item)
                self.assertIn('src=' + str(inputs / 'uploads'), upload)
                mode = command[-2] if command[-1] == 'after-application' else command[-1]
                self.assertEqual('readonly' in upload, mode == 'backup-ro')
            hook.capture = lambda *args: (0, b'{"ok":true,"mode":"backup","original_files":195,"synthetic_files":3,"extra":true}')
            with self.assertRaisesRegex(m.CandidateError, 'recovered-upload-permission-probe'):
                hook.recovered_upload_probe({'sandbox_name': BASE}, Monitor(), inputs, image, 'verify')


if __name__ == '__main__':
    unittest.main()
