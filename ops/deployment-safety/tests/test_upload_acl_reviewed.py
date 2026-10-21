"""Synthetic tests only; actual Linux fixture is a separate required gate."""
import ast
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import types
import unittest
from unittest.mock import patch, mock_open

PATH = Path(__file__).resolve().parents[1] / 'falcon-upload-acl-reviewed.py'
spec = importlib.util.spec_from_file_location('upload_acl_reviewed', PATH)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def node(inode, mode, directory=False, uid=0, gid=0, nlink=1):
    return dict(st_dev=123, st_ino=inode,
                st_mode=(stat.S_IFDIR if directory else stat.S_IFREG) | mode,
                st_uid=uid, st_gid=gid, st_nlink=nlink, access=None, default=None)


class Journal:
    def __init__(self):
        self.records = []

    def record(self, value):
        self.records.append(copy.deepcopy(value))

    def finish(self, report):
        self.result = copy.deepcopy(report)

    def close(self):
        pass


class Model:
    def __init__(self, nodes=None, children=None):
        self.nodes = nodes or {10: node(42, 0o750, True), 11: node(43, 0o640)}
        self.children = children or {10: {'file': 11}}
        self.events = []

    def fstat(self, fd):
        return types.SimpleNamespace(**{k: v for k, v in self.nodes[fd].items()
                                        if k.startswith('st_')})

    def set_acl(self, fd, kind, value):
        self.events.append(('set_acl', fd, kind))
        self.nodes[fd]['access' if kind == m.ACL_ACCESS else 'default'] = value
        if kind == m.ACL_ACCESS and value:
            entries = m.decode_acl(value)
            owner = next(p for t, p, _ in entries if t == m.UOBJ)
            group = next(p for t, p, _ in entries if t == m.MASK)
            other = next(p for t, p, _ in entries if t == m.OTHER)
            current = self.nodes[fd]['st_mode']
            self.nodes[fd]['st_mode'] = (current & ~0o777) | owner << 6 | group << 3 | other

    def fchmod(self, fd, mode):
        self.events.append(('fchmod', fd, mode))
        self.nodes[fd]['st_mode'] = stat.S_IFMT(self.nodes[fd]['st_mode']) | mode

    def listdir(self, fd):
        self.events.append(('listdir', fd))
        return list(self.children.get(fd, {}))

    def enter(self):
        targets = [
            patch.object(m, 'mount_id', return_value=7),
            patch.object(m.os, 'fstat', side_effect=self.fstat),
            patch.object(m, 'get_acl', side_effect=lambda fd, kind:
                         self.nodes[fd]['access' if kind == m.ACL_ACCESS else 'default']),
            patch.object(m, 'set_acl', side_effect=self.set_acl),
            patch.object(m.os, 'fchmod', side_effect=self.fchmod),
            patch.object(m.os, 'fsync'), patch.object(m.os, 'close'),
            patch.object(m.os, 'listdir', side_effect=self.listdir),
            patch.object(m, 'open_child', side_effect=lambda fd, name, mount:
                         self.children[fd][name]),
            patch.object(m.os, 'stat', side_effect=lambda name, dir_fd, follow_symlinks:
                         self.fstat(self.children[dir_fd][name])),
            patch.object(m.subprocess, 'run', return_value=types.SimpleNamespace(
                returncode=0, stdout=b'# owner: 0\nuser::rw-\ngroup::r--\nother::---\n'))]
        for target in targets:
            target.start()
        self.targets = targets
        return self

    def close(self):
        for target in reversed(self.targets):
            target.stop()


class ACLTests(unittest.TestCase):
    def test_access_preserves_group_other_without_backup_uid(self):
        acl = m.decode_acl(m.access_acl(6, 4, 4, False))
        self.assertEqual(acl, [(1, 6, m.UNDEFINED), (2, 6, 61001),
                               (4, 4, m.UNDEFINED), (16, 6, m.UNDEFINED),
                               (32, 4, m.UNDEFINED)])
        self.assertNotIn((2, 4, 999), acl)

    def test_default_other_is_private(self):
        self.assertEqual(m.decode_acl(m.default_acl(5))[-1], (32, 0, m.UNDEFINED))

    def test_linux_uapi_wire_version_and_endianness(self):
        blob = m.default_acl(5)
        self.assertEqual(blob[:4], b'\x02\0\0\0')
        self.assertEqual(blob[12:20], struct.pack('<HHI', 2, 7, 61001))

    def test_bad_acl_wire_refused(self):
        for blob in (b'', b'\0' * 28, b'\x02\0\0\0' + b'\0' * 25):
            with self.assertRaises(m.Refused):
                m.decode_acl(blob)

    def test_no_group_write_added_by_wide_mask(self):
        acl = m.decode_acl(m.access_acl(7, 5, 0, True))
        entries = {tag: p for tag, p, _ in acl}
        self.assertEqual(entries[m.GOBJ] & entries[m.MASK], 5)
        self.assertEqual(entries[m.GOBJ] & entries[m.MASK] & 2, 0)


class AdoptionTests(unittest.TestCase):
    def setUp(self):
        self.model = Model().enter()
        self.addCleanup(self.model.close)
        self.journal = Journal()
        self.adoption = m.Adoption(self.journal, 10)

    def snapshot(self):
        self.adoption.walk(10, snapshot_only=True)

    def test_top_down_sgid_access_default_before_enumeration(self):
        self.snapshot()
        self.model.events.clear()
        self.adoption.walk(10)
        events = self.model.events
        self.assertLess(events.index(('fchmod', 10, 0o2750)),
                        events.index(('set_acl', 10, m.ACL_ACCESS)))
        self.assertLess(events.index(('set_acl', 10, m.ACL_DEFAULT)),
                        events.index(('listdir', 10)))
        self.assertEqual(stat.S_IMODE(self.model.nodes[10]['st_mode']), 0o2770)
        self.assertEqual(stat.S_IMODE(self.model.nodes[11]['st_mode']), 0o660)
        self.assertEqual(len(self.journal.records), 4)

    def test_initial_inode_swap_refused_before_mutation(self):
        self.snapshot()
        self.model.nodes[11]['st_ino'] = 99
        with self.assertRaisesRegex(m.Refused, 'initial-inode-changed'):
            self.adoption.walk(10)
        self.assertIsNone(self.model.nodes[11]['access'])

    def test_initial_mode_change_refused(self):
        self.snapshot()
        self.model.nodes[11]['st_mode'] = stat.S_IFREG | 0o644
        with self.assertRaisesRegex(m.Refused, 'initial-metadata-changed'):
            self.adoption.walk(10)

    def test_preexisting_complex_acl_refused_without_changes(self):
        self.model.nodes[11]['access'] = m.access_acl(6, 4, 0, False)
        with self.assertRaisesRegex(m.Refused, 'preexisting-complex-acl'):
            self.snapshot()
        self.assertEqual(self.adoption.changed, 0)

    def test_preexisting_sgid_refused(self):
        self.model.nodes[10]['st_mode'] |= stat.S_ISGID
        with self.assertRaisesRegex(m.Refused, 'initial-source-mode'):
            self.snapshot()

    def test_hardlink_refused(self):
        self.model.nodes[11]['st_nlink'] = 2
        with self.assertRaises(m.Refused):
            self.snapshot()

    def test_uid_or_gid_change_refused(self):
        for field in ('st_uid', 'st_gid'):
            self.model.nodes[11][field] = 61001
            with self.assertRaises(m.Refused):
                self.snapshot()
            self.model.nodes[11][field] = 0

    def test_changed_mount_id_refused(self):
        with patch.object(m, 'mount_id', return_value=8):
            with self.assertRaisesRegex(m.Refused, 'source-mount-changed'):
                self.snapshot()

    def test_normal_new_basic640_has_parent_provenance(self):
        self.snapshot()
        self.adoption.walk(10)
        self.model.nodes[12] = node(44, 0o640)
        self.model.children[10]['new'] = 12
        self.adoption.reconcile()
        self.assertEqual(self.adoption.observed['new']['after_mode'], 0o660)

    def test_transitional_new_sgid_directory_supported(self):
        self.snapshot()
        self.adoption.walk(10)
        self.model.nodes[12] = node(44, 0o2750, True)
        self.model.children[10]['new'] = 12
        self.adoption.reconcile()
        self.assertEqual(stat.S_IMODE(self.model.nodes[12]['st_mode']), 0o2770)

    def test_unreviewed_transitional755_refused(self):
        self.snapshot()
        self.adoption.walk(10)
        self.model.nodes[12] = node(44, 0o2755, True)
        self.model.children[10]['new'] = 12
        with self.assertRaisesRegex(m.Refused, 'source-basic-mode'):
            self.adoption.reconcile()

    def test_inherited_rootprep_acl_supported_without_mutation(self):
        self.snapshot()
        self.adoption.walk(10)
        inherited = node(44, 0o660)
        inherited['access'] = m.encode_acl([(1, 6, m.UNDEFINED), (2, 7, 61001),
                                            (4, 5, m.UNDEFINED), (16, 6, m.UNDEFINED),
                                            (32, 0, m.UNDEFINED)])
        self.model.nodes[12] = inherited
        self.model.children[10]['new'] = 12
        changed = self.adoption.changed
        self.adoption.reconcile()
        self.assertEqual(self.adoption.changed, changed)
        self.assertTrue(self.adoption.observed['new']['inherited'])

    def test_unproven_parent_inherited_acl_refused(self):
        self.model.nodes[11]['access'] = m.access_acl(6, 4, 0, False)
        with self.assertRaisesRegex(m.Refused, 'inherited-parent-unproven'):
            self.adoption.capture(11, 'file')

    def test_deleted_initial_name_refused(self):
        self.snapshot()
        self.model.children[10].pop('file')
        self.adoption.walk(10)
        with self.assertRaisesRegex(m.Refused, 'source-name-vanished'):
            self.adoption.reconcile()

    def test_changed_acl_after_adoption_refused(self):
        self.snapshot()
        self.adoption.walk(10)
        self.model.nodes[11]['access'] = m.access_acl(6, 6, 0, False)
        with self.assertRaisesRegex(m.Refused, 'source-state-changed'):
            self.adoption.reconcile()

    def test_verify_only_never_adopts_basic_file(self):
        self.snapshot()
        with self.assertRaisesRegex(m.Refused, 'unadopted-object'):
            self.adoption.walk(10, mutate=False)
        self.assertEqual(self.adoption.changed, 0)

    def test_directory_nlink_change_is_normal(self):
        self.snapshot()
        self.model.nodes[10]['st_nlink'] = 8
        self.adoption.walk(10)
        self.adoption.reconcile()

    def test_operation_monotonic_deadline(self):
        self.adoption.deadline = -1
        with self.assertRaisesRegex(m.Refused, 'adoption-deadline'):
            self.snapshot()

    def operation(self, mode='adopt', fixture_ok=True):
        args = types.SimpleNamespace(mode=mode, source_review_confirmed=True,
                                     expected_image='sha256:' + 'a' * 64,
                                     expected_revision='b' * 40,
                                     expected_script_sha256=m.script_digest(),
                                     expected_device=123, expected_inode=42,
                                     approved_control_plane_container=None,
                                     approved_control_plane_image=None,
                                     evidence_dir='/ignored', fixture_report='/ignored',
                                     fixture_sha256='c' * 64)
        with patch.object(m.sys, 'platform', 'linux'), \
             patch.object(m.os, 'geteuid', return_value=0), \
             patch.object(m, 'runtime_precondition', return_value={'reviewed': True}) as runtime, \
             patch.object(m, 'check_no_nested_mounts'), \
             patch.object(m, 'trusted_directory', return_value=10), \
             patch.object(m, 'Journal', return_value=self.journal), \
             patch.object(m, 'named_source_matches'), \
             patch.object(m, 'verify_fixture', return_value=fixture_ok) as verified:
            result = m.adopt(args)
            self.last_runtime_calls = runtime.call_args_list
            return result, verified.call_count

    def test_fixture_proof_is_required_before_any_source_metadata_change(self):
        with self.assertRaisesRegex(m.Refused, 'fixture-proof'):
            self.operation(fixture_ok=False)
        self.assertIsNone(self.model.nodes[10]['access'])
        self.assertFalse(any(e[0] in ('set_acl', 'fchmod') for e in self.model.events))
        self.assertFalse(self.journal.result['ok'])

    def test_audit_snapshots_but_never_mutates(self):
        result, verified = self.operation(mode='audit')
        self.assertFalse(result['source_metadata_changed'])
        self.assertFalse(result['adoption_applied'])
        self.assertEqual(result['snapshot_entries'], 2)
        self.assertEqual(verified, 0)
        self.assertFalse(any(e[0] in ('set_acl', 'fchmod') for e in self.model.events))

    def test_successful_adoption_aggregate_flags(self):
        result, verified = self.operation()
        self.assertTrue(result['adoption_applied'])
        self.assertEqual(result['entries'], 2)
        self.assertEqual(verified, 1)
        self.assertFalse(result['source_contents_written'])
        self.assertFalse(result['source_ownership_changed'])
        self.assertFalse(result['atomic_against_arbitrary_writers'])
        self.assertEqual(len(self.last_runtime_calls), 3)
        self.assertTrue(all(call.args[-2:] == (123, 42) for call in self.last_runtime_calls))


class SafetyTests(unittest.TestCase):
    def test_identity_child_is_killed_and_reaped_on_dispatcher_exception(self):
        with patch.object(m.os, 'pipe', return_value=(4, 5)), \
             patch.object(m.os, 'fork', return_value=123), \
             patch.object(m.os, 'pidfd_open', return_value=8, create=True), \
             patch.object(m.os, 'close'), \
             patch.object(m.select, 'select', side_effect=m.Refused('interrupted')), \
             patch.object(m.signal, 'pidfd_send_signal', create=True) as killed, \
             patch.object(m.os, 'waitpid', return_value=(123, 0)) as waited, \
             patch.object(m.os, 'kill') as numeric_kill:
            with self.assertRaisesRegex(m.Refused, 'interrupted'):
                m.run_identity(10, 61001, 61001, lambda: {})
        killed.assert_called_once_with(8, m.signal.SIGKILL, None, 0)
        waited.assert_called_once_with(123, 0)
        numeric_kill.assert_not_called()

    def test_identity_child_wait_interruption_uses_pidfd_not_reused_pid(self):
        with patch.object(m.os, 'pipe', return_value=(4, 5)), \
             patch.object(m.os, 'fork', return_value=123), \
             patch.object(m.os, 'pidfd_open', return_value=8, create=True), \
             patch.object(m.os, 'close'), \
             patch.object(m.select, 'select', return_value=([4], [], [])), \
             patch.object(m.os, 'read', return_value=b'{"ok":true,"result":{}}'), \
             patch.object(m.signal, 'pidfd_send_signal', create=True) as killed, \
             patch.object(m.os, 'waitpid', side_effect=[m.Refused('wait-interrupted'),
                                                       (123, 0)]), \
             patch.object(m.os, 'kill') as numeric_kill:
            with self.assertRaisesRegex(m.Refused, 'wait-interrupted'):
                m.run_identity(10, 61001, 61001, lambda: {})
        killed.assert_called_once_with(8, m.signal.SIGKILL, None, 0)
        numeric_kill.assert_not_called()

    def test_identity_child_success_reaped_without_signal(self):
        with patch.object(m.os, 'pipe', return_value=(4, 5)), \
             patch.object(m.os, 'fork', return_value=123), \
             patch.object(m.os, 'pidfd_open', return_value=8, create=True), \
             patch.object(m.os, 'close'), \
             patch.object(m.select, 'select', return_value=([4], [], [])), \
             patch.object(m.os, 'read', return_value=b'{"ok":true,"result":{"proved":true}}'), \
             patch.object(m.signal, 'pidfd_send_signal', create=True) as killed, \
             patch.object(m.os, 'waitpid', return_value=(123, 0)):
            self.assertEqual(m.run_identity(10, 61001, 61001, lambda: {}), {'proved': True})
        killed.assert_not_called()

    def test_inert_type_reject_never_activates_device(self):
        for kind in (stat.S_IFCHR, stat.S_IFBLK, stat.S_IFIFO, stat.S_IFLNK):
            fake = types.SimpleNamespace(st_mode=kind | 0o600)
            with patch.object(m.os, 'O_PATH', 0x200000, create=True), \
                 patch.object(m.os, 'open', return_value=44) as opened, \
                 patch.object(m.os, 'fstat', return_value=fake), \
                 patch.object(m.os, 'close'):
                with self.assertRaisesRegex(m.Refused, 'source-type-before-open'):
                    m.open_child(1, 'name', 7)
                self.assertEqual(opened.call_count, 1)
                self.assertTrue(opened.call_args.args[1] & m.os.O_NOFOLLOW)

    def test_named_source_replacement_refused(self):
        first, second = node(1, 0o2770, True), node(2, 0o2770, True)
        with patch.object(m, 'trusted_directory', return_value=20), \
             patch.object(m.os, 'open', return_value=30), \
             patch.object(m.os, 'close'), \
             patch.object(m.os, 'fstat', side_effect=lambda fd:
                          types.SimpleNamespace(**(first if fd == 10 else second))), \
             patch.object(m, 'mount_id', return_value=7):
            with self.assertRaisesRegex(m.Refused, 'named-source-changed'):
                m.named_source_matches(10)

    def test_requires_source_review_before_runtime_or_source_io(self):
        args = types.SimpleNamespace(source_review_confirmed=False)
        with patch.object(m.sys, 'platform', 'linux'), \
             patch.object(m.os, 'geteuid', return_value=0), \
             patch.object(m, 'runtime_precondition') as runtime:
            with self.assertRaisesRegex(m.Refused, 'source-review-required'):
                m.adopt(args)
            runtime.assert_not_called()

    def test_invalid_release_before_docker(self):
        with patch.object(m, 'run_json') as runner:
            with self.assertRaises(m.Refused):
                m.runtime_precondition('latest', 'abc')
            runner.assert_not_called()

    def test_uid_collision_before_docker(self):
        with patch.object(m.pwd, 'getpwuid', return_value=object()), \
             patch.object(m, 'run_json') as runner:
            with self.assertRaisesRegex(m.Refused, 'host-uid-collision'):
                m.runtime_precondition('sha256:' + 'a' * 64, 'b' * 40)
            runner.assert_not_called()

    def test_python39_syntax(self):
        ast.parse(PATH.read_text(), feature_version=(3, 9))

    def test_node_probe_syntax(self):
        result = subprocess.run(['node', '--check'], input=m.RO_PROBE.encode(),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_node_probe_protocol_and_capability_regex(self):
        script = """const vm=require('vm');
const status=['CapEff','CapPrm','CapInh','CapBnd','CapAmb'].map(k=>k+':\\t0000000000000000').join('\\n');
const denied=()=>{const e=new Error();e.code='EACCES';throw e};
const fakefs={readFileSync:p=>p==='/proc/self/status'?status:p==='/proc/self/mountinfo'?'1 2 0:1 / /fixture ro,nosuid - ext4 none ro\\n':Buffer.from('synthetic'),openSync:denied,mkdirSync:denied};
vm.runInNewContext(PROBE,{require:()=>fakefs,console,process:{getuid:()=>999,getgid:()=>0,getgroups:()=>[0]}});
""".replace('PROBE', json.dumps(m.RO_PROBE))
        result = subprocess.run(['node', '-e', script], stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(json.loads(result.stdout), {'ok': True, 'read_only_container': True})

    def test_readonly_fixture_fixed_isolation_and_exact_cleanup(self):
        image, token = 'sha256:' + 'a' * 64, 'b' * 32
        inspected = [{'Id': 'c' * 64, 'Image': image, 'Config': {'Labels': {'falcon.acl.fixture': token}},
                      'State': {'Running': False}}]
        with patch.object(m.uuid, 'uuid4', return_value=types.SimpleNamespace(hex=token)), \
             patch.object(m, 'run_json', return_value=inspected), \
             patch.object(m.subprocess, 'run', side_effect=[
                 types.SimpleNamespace(returncode=0, stdout=b'{"ok":true,"read_only_container":true}'),
                 types.SimpleNamespace(returncode=0)]) as runner:
            self.assertTrue(m.readonly_fixture_probe('/private/synthetic', image))
        command = runner.call_args_list[0].args[0]
        for pair in (['--network', 'none'], ['--user', '999:0'], ['--cap-drop', 'ALL'],
                     ['--memory', '64m'], ['--log-driver', 'none']):
            index = command.index(pair[0])
            self.assertEqual(command[index:index + 2], pair)
        self.assertIn('--read-only', command)
        self.assertIn('--pull=never', command)
        self.assertEqual(command[:3], ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock'])
        self.assertIn('type=bind,src=/private/synthetic,dst=/fixture,readonly', command)
        self.assertEqual(runner.call_args_list[1].args[0],
                         m.DOCKER + ['rm', 'c' * 64])

    def test_readonly_fixture_cleanup_failure_refused(self):
        image, token = 'sha256:' + 'a' * 64, 'b' * 32
        inspected = [{'Id': 'c' * 64, 'Image': image, 'Config': {'Labels': {'falcon.acl.fixture': token}},
                      'State': {'Running': False}}]
        with patch.object(m.uuid, 'uuid4', return_value=types.SimpleNamespace(hex=token)), \
             patch.object(m, 'run_json', return_value=inspected), \
             patch.object(m.subprocess, 'run', side_effect=[
                 types.SimpleNamespace(returncode=0, stdout=b'{"ok":true,"read_only_container":true}'),
                 types.SimpleNamespace(returncode=1)]):
            with self.assertRaisesRegex(m.Refused, 'fixture-container-cleanup'):
                m.readonly_fixture_probe('/private/synthetic', image)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.image, self.revision = 'sha256:' + 'a' * 64, 'b' * 40
        self.config = {'Cmd': ['node', 'scripts/runtime-start.cjs'],
                       'Entrypoint': ['docker-entrypoint.sh'], 'WorkingDir': '/app',
                       'User': '', 'Labels': {'org.opencontainers.image.revision': self.revision}}
        self.image_data = [{'Id': self.image, 'Config': copy.deepcopy(self.config)}]
        self.container = {'Image': self.image, 'Config': copy.deepcopy(self.config),
                          'State': {'Running': True, 'Pid': 1234}, 'Mounts': [
                              {'Type': 'bind', 'Source': m.SOURCE,
                               'Destination': '/app/uploads', 'RW': True}]}

    def check(self, containers=None, status='Umask:\t0027\nUid:\t0\t0\t0\t0\n'):
        with patch.object(m.pwd, 'getpwuid', side_effect=KeyError), \
             patch.object(m.grp, 'getgrgid', side_effect=KeyError), \
             patch.object(m, 'run_json', side_effect=[self.image_data, containers or [self.container]]), \
             patch.object(m.subprocess, 'run', return_value=types.SimpleNamespace(
                 returncode=0, stdout=('c' * 64 + '\n').encode())), \
             patch('builtins.open', mock_open(read_data=status)):
            return m.runtime_precondition(self.image, self.revision)

    def test_exact_rootprep_and_process_umask_accepted(self):
        self.assertEqual(self.check()['root_prep_consumers'], 1)

    def test_old_image_in_overlap_refused(self):
        old = copy.deepcopy(self.container)
        old['Image'] = 'sha256:' + 'd' * 64
        with self.assertRaisesRegex(m.Refused, 'unreviewed-rw-consumer'):
            self.check([self.container, old])

    def test_actual_umask0022_refused(self):
        with self.assertRaisesRegex(m.Refused, 'root-prep-umask'):
            self.check(status='Umask:\t0022\nUid:\t0\t0\t0\t0\n')

    def test_command_override_refused(self):
        self.container['Config']['Cmd'] = ['node', 'dist/main.js']
        with self.assertRaisesRegex(m.Refused, 'root-prep-command-override'):
            self.check()

    def test_readonly_code_override_refused(self):
        self.container['Mounts'].append({'Type': 'bind', 'Source': '/other',
                                         'Destination': '/app/scripts', 'RW': False})
        with self.assertRaisesRegex(m.Refused, 'root-prep-code-mount-override'):
            self.check()

    def test_ancestor_rw_consumer_refused(self):
        self.container['Mounts'][0]['Source'] = '/data'
        with self.assertRaisesRegex(m.Refused, 'unreviewed-rw-consumer'):
            self.check()

    def test_root_ancestor_rw_consumer_refused(self):
        self.container['Mounts'][0]['Source'] = '/'
        with self.assertRaisesRegex(m.Refused, 'unreviewed-rw-consumer'):
            self.check()

    def test_normalized_ancestors_and_descendants_overlap(self):
        for source in ('/', '//', '/data/', '/data/..', '/data//coolify',
                       m.SOURCE + '/', m.SOURCE + '/child',
                       m.SOURCE + '/../uploads'):
            self.assertTrue(m.source_overlaps(source), source)
        for source in ('/other', '/data-other', m.SOURCE + '-other', None, ''):
            self.assertFalse(m.source_overlaps(source), source)

    def test_readonly_backup_consumer_does_not_expand_authority(self):
        backup = {'Image': 'sha256:' + 'd' * 64, 'Mounts': [
            {'Type': 'bind', 'Source': m.SOURCE, 'Destination': '/source', 'RW': False}]}
        self.assertEqual(self.check([self.container, backup])['root_prep_consumers'], 1)

    def test_control_plane_approval_cannot_select_other_container_or_image(self):
        for cid, image in ((m.CONTROL_ID, 'sha256:' + 'd' * 64),
                           ('d' * 64, m.CONTROL_IMAGE), (m.CONTROL_ID, None)):
            with patch.object(m, 'run_json') as runner:
                with self.assertRaisesRegex(m.Refused, 'control-plane-approval-pins'):
                    m.runtime_precondition(self.image, self.revision, cid, image, 123, 42)
                runner.assert_not_called()

    def test_only_explicit_approved_control_plane_dispatches_to_denial_gate(self):
        control = {'Id': m.CONTROL_ID, 'Image': m.CONTROL_IMAGE, 'Mounts': [
            {'Type': 'bind', 'Source': m.CONTROL_SOURCE,
             'Destination': m.CONTROL_DEST, 'RW': True}]}
        with patch.object(m.pwd, 'getpwuid', side_effect=KeyError), \
             patch.object(m.grp, 'getgrgid', side_effect=KeyError), \
             patch.object(m, 'run_json', side_effect=[self.image_data, [self.container, control]]), \
             patch.object(m.subprocess, 'run', return_value=types.SimpleNamespace(
                 returncode=0, stdout=('c' * 64 + '\n').encode())), \
             patch('builtins.open', mock_open(read_data='Umask:\t0027\nUid:\t0 0 0 0\n')), \
             patch.object(m, 'verify_control_plane', return_value={'denied': True}) as gate:
            result = m.runtime_precondition(self.image, self.revision,
                                           m.CONTROL_ID, m.CONTROL_IMAGE, 123, 42)
        gate.assert_called_once_with(control, control['Mounts'], 123, 42)
        self.assertEqual(result['approved_control_plane'], {'denied': True})


class ControlPlaneTests(unittest.TestCase):
    def setUp(self):
        self.mount = {'Type': 'bind', 'Source': m.CONTROL_SOURCE,
                      'Destination': m.CONTROL_DEST, 'RW': True}
        self.container = {'Id': m.CONTROL_ID, 'Image': m.CONTROL_IMAGE,
                          'State': {'Running': True, 'Pid': 123},
                          'Config': {'User': 'www-data'}, 'Mounts': [self.mount]}
        self.proof = {'uid': 9999, 'euid': 9999, 'gid': 9999, 'egid': 9999,
                      'groups': [9999], 'device': 123, 'inode': 42,
                      'owner': 0, 'group': 0, 'mode': stat.S_IFDIR | 0o2770,
                      'searchable': False, 'writable': False,
                      'caps': {'CapInh': '0', 'CapPrm': '0', 'CapEff': '0',
                               'CapAmb': '0', 'CapBnd': 'a80425fb', 'NoNewPrivs': '0'}}
        self.snapshot = {'123': {'starttime': '1000', 'bounding': 'a80425fb', 'nnp': '0'}}

    def verify(self, before=None, after=None):
        with patch.object(m, 'control_processes', side_effect=[before or self.snapshot,
                                                              after or self.snapshot]), \
             patch.object(m, 'run_json', side_effect=[self.proof, [self.container]]) as runner:
            result = m.verify_control_plane(self.container, [self.mount], 123, 42)
            command = runner.call_args_list[0].args[0]
            self.assertEqual(command, m.DOCKER + ['exec', m.CONTROL_ID,
                                                 'php', '-r', m.CONTROL_PHP])
            self.assertNotIn('--user', command)
            return result

    def test_exact_existing_control_plane_denial_accepted(self):
        report = self.verify()
        self.assertTrue(report['uploads_same_inode'])
        self.assertTrue(report['uploads_search_write_denied'])
        self.assertTrue(report['existing_docker_admin_authority_acknowledged'])
        self.assertEqual(report['bounding_sets_observed'], ['a80425fb'])
        self.assertEqual(report['no_new_privs_observed'], ['0'])

    def test_missing_or_shadowed_target_cannot_false_pass_denials(self):
        for key, value in (('inode', None), ('inode', 43), ('device', 124),
                           ('mode', stat.S_IFREG | 0o660)):
            original = self.proof[key]
            self.proof[key] = value
            with self.assertRaisesRegex(m.Refused, 'control-plane-uploads-denial'):
                self.verify()
            self.proof[key] = original

    def test_actual_php_write_or_search_authority_refused(self):
        for key in ('searchable', 'writable'):
            self.proof[key] = True
            with self.assertRaisesRegex(m.Refused, 'control-plane-uploads-denial'):
                self.verify()
            self.proof[key] = False

    def test_php_group0_or_api_identity_refused(self):
        for groups in ([0], [9999, 0], [9999, 61001], []):
            self.proof['groups'] = groups
            with self.assertRaisesRegex(m.Refused, 'control-plane-uploads-denial'):
                self.verify()

    def test_php_permitted_capability_refused(self):
        self.proof['caps']['CapPrm'] = '1'
        with self.assertRaisesRegex(m.Refused, 'control-plane-probe-active-caps'):
            self.verify()

    def test_control_mounts_cannot_shadow_uploads(self):
        for dest in (m.CONTROL_DEST, m.CONTROL_UPLOADS,
                     m.CONTROL_UPLOADS + '/child',
                     m.CONTROL_DEST + '/pmy0ybhwzco11kocu0zloqk0'):
            self.container['Mounts'] = [self.mount, {'Type': 'bind', 'Source': '/other',
                                                   'Destination': dest, 'RW': False}]
            with self.assertRaisesRegex(m.Refused, 'control-plane-shadowed-uploads'):
                self.verify()

    def test_other_ancestor_or_generic_container_is_not_exempt(self):
        for key, value in (('Source', '/data/coolify'),
                           ('Destination', '/different'), ('RW', False)):
            original = self.mount[key]
            self.mount[key] = value
            with self.assertRaisesRegex(m.Refused, 'control-plane-exception-identity'):
                self.verify()
            self.mount[key] = original

    def test_reused_process_id_refused(self):
        after = copy.deepcopy(self.snapshot)
        after['123']['starttime'] = '1001'
        with self.assertRaisesRegex(m.Refused, 'control-plane-process-reused'):
            self.verify(after=after)

    def test_new_validated_worker_is_allowed(self):
        after = copy.deepcopy(self.snapshot)
        after['124'] = {'starttime': '2000', 'bounding': 'a80425fb', 'nnp': '0'}
        self.assertEqual(self.verify(after=after)['after_process_count'], 2)

    def test_process_status_all_ids_caps_and_starttime(self):
        status = ('Uid:\t9999 9999 9999 9999\nGid:\t9999 9999 9999 9999\n'
                  'Groups:\t9999 9999\nCapInh:\t0\nCapPrm:\t0\nCapEff:\t0\n'
                  'CapAmb:\t0\nCapBnd:\ta80425fb\nNoNewPrivs:\t0\n')
        def run(text, stat_change=False):
            calls = {}
            def opened(path, *args, **kwargs):
                if path.endswith('/stat'):
                    calls[path] = calls.get(path, 0) + 1
                    started = '1001' if stat_change and calls[path] > 1 else '1000'
                    return io.StringIO(path.split('/')[2] + ' (php worker) S ' +
                                       '0 ' * 18 + started + '\n')
                return io.StringIO(text)
            with patch.object(m.subprocess, 'run', return_value=types.SimpleNamespace(
                    returncode=0, stdout=b'PID\n123\n124\n')), \
                 patch('builtins.open', side_effect=opened):
                return m.control_processes(m.CONTROL_ID, 123)
        self.assertEqual(set(run(status)), {'123', '124'})
        for old, new in (('Uid:\t9999 9999 9999 9999', 'Uid:\t9999 9999 9999 0'),
                         ('Groups:\t9999 9999', 'Groups:\t9999 0'),
                         ('Groups:\t9999 9999', 'Groups:\t9999 61001'),
                         ('CapPrm:\t0', 'CapPrm:\t1')):
            with self.assertRaises(m.Refused):
                run(status.replace(old, new))
        with self.assertRaisesRegex(m.Refused, 'control-plane-process-reused'):
            run(status, stat_change=True)


if __name__ == '__main__':
    unittest.main()
