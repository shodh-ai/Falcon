"""Synthetic metadata and files only. No Docker daemon or production connections."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / 'reconcile-documents-reviewed.py'
SPEC = importlib.util.spec_from_file_location('document_dispatcher', PATH)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
IMAGE = 'sha256:' + 'a' * 64
RUN = '20261021T120000Z-' + 'b' * 32
SESSION = 'falcon-restore-check-' + 'c' * 32


def catalog():
    return {'schema_version': 1, 'source_revision': 'd' * 40,
            'match_label': 'matches_repository_seed_literal',
            'entries': [{'reference': '/uploads/synthetic.pdf',
                         'source_files': ['backend/migrations/001_demo.sql:7']}]}


def complete_report():
    summary = {key: 0 for key in m.COUNT_FIELDS}
    summary.update({key: False for key in m.FALSE_FIELDS})
    summary['missing_local_occurrences'] = 5
    return {'schema_version': 1, 'execution_complete': True, 'summary': summary,
            'references': [{'reference': '/uploads/private-synthetic-reference.pdf'}],
            'sources': [{'column': 'synthetic_column'}], 'samples': []}


def context(root=m.RESTORE_ROOT):
    session = root / SESSION
    return {'database': 'postgres', 'session_path': str(session),
            'sandbox_name': SESSION + '-db-0', 'dump_sha256': 'e' * 64,
            'socket_mount_source': str(session / 'ipc-anchors' / ('socket-' + 'f' * 32))}


class Monitor:
    def __init__(self, raw=None, absent=True):
        self.raw = raw if raw is not None else json.dumps(complete_report()).encode()
        self.absent = absent
        self.commands = []
        self.ticks = 0

    def tick(self, force=False):
        self.ticks += 1

    def run_capture(self, command, name, max_bytes):
        self.commands.append((command, name, max_bytes))
        return self.raw

    def container_absent(self, name):
        self.checked_absence = name
        return self.absent


class DispatcherTests(unittest.TestCase):
    def test_command_is_fixed_nonroot_networkless_readonly_and_resource_bounded(self):
        ctx = context()
        inputs = Path(ctx['session_path']) / 'document-inputs'
        command = m.helper_command(['/usr/bin/docker'], IMAGE, ctx, inputs,
                                   Path('/reviewed/document-reconciliation.cjs'),
                                   Path('/opt/falcon-local-backup/recovery_content_check.js'),
                                   ['--env', 'DATABASE_URL=', '--env', 'NODE_OPTIONS='])
        for option, expected in [('--pull', 'never'), ('--network', 'none'), ('--user', '70:70'),
                                 ('--memory', '128m'), ('--memory-swap', '128m'), ('--cpus', '0.25'),
                                 ('--cap-drop', 'ALL'), ('--security-opt', 'no-new-privileges:true')]:
            self.assertEqual(command[command.index(option) + 1], expected)
        self.assertIn('--read-only', command)
        self.assertEqual(command[-4:], ['node', IMAGE, '--max-old-space-size=64', '/checks/document-reconciliation.cjs'])
        mounts = [command[index + 1] for index, item in enumerate(command) if item == '--mount']
        self.assertEqual(len(mounts), 8)
        self.assertTrue(all(item.endswith(',readonly') for item in mounts))
        self.assertFalse(any('/run/docker.sock' in item or '/app/uploads' in item for item in mounts))
        self.assertFalse(any(flag in command for flag in ['--env-file', '--privileged', '--publish', '-p']))
        self.assertFalse(any('hr-key' in item or 'environment.json' in item for item in mounts))

    def test_context_refuses_production_arbitrary_alias_and_mutable_image(self):
        for key, value in [('session_path', '/data/coolify/applications/uploads'),
                           ('sandbox_name', 'live-api'), ('socket_mount_source', '/run/postgresql'),
                           ('dump_sha256', 'bad')]:
            ctx = context()
            ctx[key] = value
            with self.subTest(key=key), self.assertRaises(m.ReconciliationError):
                m.checked_context(ctx)
        ctx = context()
        with self.assertRaises(m.ReconciliationError):
            m.helper_command([], 'app:latest', ctx, Path(ctx['session_path']) / 'document-inputs',
                             Path('/reviewed/tool'), Path('/checks/frozen'), [])
        with self.assertRaises(m.ReconciliationError):
            m.helper_command([], IMAGE, ctx, Path('/app/uploads'), Path('/reviewed/tool'), Path('/checks/frozen'), [])

    def test_all_non_system_image_env_is_cleared_including_hr_and_database_secrets(self):
        metadata = {'Id': IMAGE, 'Config': {'Env': ['PATH=/bin', 'NODE_VERSION=22',
                    'DATABASE_URL=synthetic', 'PGPASSWORD=synthetic', 'HR_ENCRYPTION_KEY=synthetic',
                    'S3_SECRET_ACCESS_KEY=synthetic', 'MAILER_URL=synthetic', 'NODE_OPTIONS=--require=x']}}
        resets = m.environment_resets(metadata, IMAGE)
        self.assertEqual(set(resets[1::2]), {'DATABASE_URL=', 'PGPASSWORD=', 'HR_ENCRYPTION_KEY=',
                                            'S3_SECRET_ACCESS_KEY=', 'MAILER_URL=', 'NODE_OPTIONS='})
        self.assertNotIn('synthetic', ' '.join(resets))
        for env in [['X=1', 'X=2'], ['BAD-KEY=x'], [5]]:
            with self.subTest(env=env), self.assertRaises(m.ReconciliationError):
                m.environment_resets({'Id': IMAGE, 'Config': {'Env': env}}, IMAGE)
        with self.assertRaises(m.ReconciliationError):
            m.environment_resets({'Id': IMAGE, 'Config': {'Volumes': {'/app/uploads': {}}}}, IMAGE)

    def test_private_report_findings_are_valid_but_never_public(self):
        report = m.checked_report(json.dumps(complete_report()).encode())
        self.assertEqual(report['summary']['missing_local_occurrences'], 5)
        for change in ['extra-summary', 'string-summary', 'negative-count', 'bool-count', 'mutation', 'incomplete']:
            value = complete_report()
            if change == 'extra-summary': value['summary']['reference'] = '/private/path'
            if change == 'string-summary': value['summary']['files_hashed'] = '/private/path'
            if change == 'negative-count': value['summary']['files_hashed'] = -1
            if change == 'bool-count': value['summary']['files_hashed'] = True
            if change == 'mutation': value['summary']['production_mutations'] = True
            if change == 'incomplete': value['execution_complete'] = False
            with self.subTest(change=change), self.assertRaises(m.ReconciliationError):
                m.checked_report(json.dumps(value).encode())
        for raw in [b'{"schema_version":1,"schema_version":1}', b'{"x":NaN}', b'x' * (m.MAX_PRIVATE + 1)]:
            with self.assertRaises(m.ReconciliationError):
                m.checked_report(raw)

    def test_catalog_requires_revision_label_deduplicated_bounded_sources(self):
        self.assertEqual(m.validate_catalog(json.dumps(catalog()).encode())['schema_version'], 1)
        for field, value in [('source_revision', 'main'), ('match_label', 'recovered'), ('schema_version', 2)]:
            item = catalog(); item[field] = value
            with self.subTest(field=field), self.assertRaises(m.ReconciliationError):
                m.validate_catalog(json.dumps(item).encode())
        for source in ['../secret.sql:1', 'backend/migrations/link/../secret.sql:1', '/absolute.sql:2']:
            item = catalog(); item['entries'][0]['source_files'] = [source]
            with self.subTest(source=source), self.assertRaises(m.ReconciliationError):
                m.validate_catalog(json.dumps(item).encode())
        item = catalog(); item['entries'] *= 2
        with self.assertRaises(m.ReconciliationError):
            m.validate_catalog(json.dumps(item).encode())

    def test_seed_hash_verified_and_rechecked_while_held(self):
        with tempfile.NamedTemporaryFile() as stream:
            data = json.dumps(catalog()).encode(); stream.write(data); stream.flush()
            digest = hashlib.sha256(data).hexdigest()
            with patch.object(m, 'trusted_open', return_value=os.dup(stream.fileno())):
                with m.catalog_input('/private/catalog.json', digest) as fd:
                    self.assertEqual(m.stable_read(fd, m.MAX_PRIVATE), data)
            with patch.object(m, 'trusted_open', return_value=os.dup(stream.fileno())), \
                 self.assertRaisesRegex(m.ReconciliationError, 'seed-catalog-hash'):
                with m.catalog_input('/private/catalog.json', '0' * 64): pass

    def test_frozen_hash_checked_before_loading_bytes(self):
        with tempfile.NamedTemporaryFile() as stream:
            stream.write(b'synthetic code, never executed'); stream.flush()
            with patch.object(m, 'trusted_open', return_value=os.dup(stream.fileno())), \
                 self.assertRaisesRegex(m.ReconciliationError, 'frozen-component-hash'):
                m.trusted_bytes('/reviewed/code.py', '0' * 64)
        with patch.object(m, 'trusted_bytes', side_effect=m.ReconciliationError('frozen-component-hash')), \
             patch.dict(m.sys.modules, {}, clear=False), \
             self.assertRaises(m.ReconciliationError):
            m.load_frozen()

    def test_root_owned_chain_and_exact_catalog_mode_are_required(self):
        def info(mode, uid=0):
            return types.SimpleNamespace(st_uid=uid, st_mode=mode, st_nlink=1)
        directory = info(stat.S_IFDIR | 0o700)
        safe_file = info(stat.S_IFREG | 0o600)
        for chain in [[directory, info(stat.S_IFDIR | 0o770), safe_file],
                      [directory, info(stat.S_IFDIR | 0o700, 501), safe_file],
                      [directory, directory, info(stat.S_IFREG | 0o400)]]:
            with self.subTest(chain=chain), patch.object(m.os, 'open', side_effect=[30, 31, 32]), \
                 patch.object(m.os, 'close'), patch.object(m.os, 'fstat', side_effect=chain + chain[-1:]), \
                 self.assertRaises(m.ReconciliationError):
                m.trusted_open('/protected/catalog.json', private=True)
        with patch.object(m.os, 'open', side_effect=[30, 31, 32]), patch.object(m.os, 'close'), \
             patch.object(m.os, 'fstat', side_effect=[directory, directory, safe_file, safe_file]):
            self.assertEqual(m.trusted_open('/protected/catalog.json', private=True), 32)

    def test_stable_read_rejects_changed_metadata_and_oversize(self):
        with tempfile.NamedTemporaryFile() as stream:
            stream.write(b'synthetic'); stream.flush()
            with self.assertRaisesRegex(m.ReconciliationError, 'input-size-or-type'):
                m.stable_read(stream.fileno(), 2)
            before = os.fstat(stream.fileno())
            after = types.SimpleNamespace(**{key: getattr(before, key) for key in
                ['st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_uid', 'st_gid', 'st_size', 'st_mtime_ns', 'st_ctime_ns']})
            after.st_ctime_ns += 1
            with patch.object(m.os, 'fstat', side_effect=[before, after]), \
                 self.assertRaisesRegex(m.ReconciliationError, 'input-changed'):
                m.stable_read(stream.fileno(), m.MAX_PRIVATE)

    def test_private_evidence_is_exclusive_and_not_world_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                m.write_private(fd, 'report.json', b'private')
                self.assertEqual(stat.S_IMODE(os.stat(Path(directory) / 'report.json').st_mode), 0o600)
                with self.assertRaises(FileExistsError): m.write_private(fd, 'report.json', b'changed')
                (Path(directory) / 'linked').symlink_to('report.json')
                with self.assertRaises(FileExistsError): m.write_private(fd, 'linked', b'changed')
                self.assertEqual((Path(directory) / 'report.json').read_bytes(), b'private')
            finally: os.close(fd)

    def test_headroom_stricter_than_core_and_cli_has_no_keys_or_live_paths(self):
        for amount in [m.GIB, 2 * m.GIB - 1]:
            with self.assertRaises(m.ReconciliationError):
                m.require_headroom(types.SimpleNamespace(available_memory=lambda: amount))
        m.require_headroom(types.SimpleNamespace(available_memory=lambda: 2 * m.GIB))
        parser = m.argument_parser()
        options = {option for action in parser._actions for option in action.option_strings}
        self.assertFalse(options & {'--key-source', '--config', '--database-url', '--uploads-source', '--prod-db'})
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit): parser.parse_args([])

    def run_hook(self, monitor=None, manifest_mismatch=False, low_memory=False):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        session = root / SESSION; session.mkdir(mode=0o700)
        source = root / 'source'; source.mkdir()
        content = b'synthetic-archive-not-extracted-here'
        (source / 'uploads.tar.gz').write_bytes(content)
        source_fd = os.open(source, os.O_RDONLY | os.O_DIRECTORY); self.addCleanup(os.close, source_fd)
        seed = root / 'seed.json'; seed.write_text(json.dumps(catalog()))
        seed_fd = os.open(seed, os.O_RDONLY); self.addCleanup(os.close, seed_fd)
        seed_hash = hashlib.sha256(seed.read_bytes()).hexdigest()
        manifest = {'files': [{'name': 'uploads.tar.gz', 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()},
                              {'name': 'database-postgres.dump', 'sha256': 'e' * 64}],
                    'sources': {'uploads_directory': '/synthetic/never-mounted/uploads'}}
        @contextlib.contextmanager
        def checked_set(config, run_id, monitor): yield source_fd, manifest
        def copy_hash(fd, maximum, monitor, target):
            value = os.read(fd, maximum); target.write(value)
            return {'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()}
        def matches(actual, expected):
            if any(actual[key] != expected[key] for key in ('bytes', 'sha256')): raise ValueError('hash')
        restore = types.SimpleNamespace(open_anchor_directory=lambda path: os.open(path, os.O_RDONLY | os.O_DIRECTORY),
            _private=lambda info, **kwargs: self.assertFalse(info.st_mode & 0o077), checked_set=checked_set,
            _open_regular=lambda fd, name: os.open(name, os.O_RDONLY, dir_fd=fd), _hash=copy_hash, _matches=matches)
        backup = types.SimpleNamespace(DOCKER=['/usr/bin/docker'],
            available_memory=lambda: m.GIB if low_memory else 3 * m.GIB)
        ctx = context(root); ctx['manifest'] = {} if manifest_mismatch else manifest
        monitor = monitor or Monitor()
        with patch.object(m, 'RESTORE_ROOT', root), patch.object(m, 'trusted_bytes', return_value=b'reviewed'), \
             patch.object(m, 'trusted_open', side_effect=lambda path: os.open(PATH, os.O_RDONLY)), \
             patch.object(m.os, 'fchown'), patch.object(m, 'capture_inspect',
                return_value={'Id': IMAGE, 'Config': {'Env': ['DATABASE_URL=synthetic-secret']}}):
            hook = m.content_hook(backup, restore, {'restore_uid': 70, 'restore_gid': 70, 'working_bytes': m.MIB},
                                  RUN, IMAGE, seed_fd, seed_hash)
            result = hook(ctx, monitor)
        return result, session, monitor

    def test_hook_copies_verified_private_inputs_and_only_returns_aggregates(self):
        result, session, monitor = self.run_hook()
        encoded = json.dumps(result)
        self.assertNotIn('private-synthetic-reference', encoded)
        self.assertNotIn('references', result)
        self.assertEqual(result['summary']['missing_local_occurrences'], 5)
        self.assertTrue(result['consumer_cleanup_verified'])
        raw = (session / 'document-reconciliation-private.json').read_bytes()
        self.assertIn(b'private-synthetic-reference', raw)
        self.assertEqual(stat.S_IMODE((session / 'document-reconciliation-private.json').stat().st_mode), 0o600)
        inputs = session / 'document-inputs'
        self.assertEqual(set(p.name for p in inputs.iterdir()), {'uploads.tar.gz', 'manifest.json', 'mapping.json', 'binding.json', 'seed-catalog.json'})
        self.assertTrue(all(stat.S_IMODE(p.stat().st_mode) == 0o400 for p in inputs.iterdir()))
        self.assertEqual(json.loads((inputs / 'mapping.json').read_text())['object_storage_enabled'], False)
        self.assertEqual(monitor.commands[0][2], m.MAX_PRIVATE)
        command = monitor.commands[0][0]
        self.assertIn('DATABASE_URL=', command)
        self.assertNotIn('synthetic-secret', ' '.join(command))

    def test_hook_refuses_hash_binding_cleanup_and_memory_without_production_access(self):
        with self.assertRaisesRegex(m.ReconciliationError, 'restore-manifest-binding'):
            self.run_hook(manifest_mismatch=True)
        monitor = Monitor(absent=False)
        with self.assertRaisesRegex(m.ReconciliationError, 'consumer-cleanup-unproven'):
            self.run_hook(monitor)
        with self.assertRaisesRegex(m.ReconciliationError, 'start-memory-below-2gib'):
            self.run_hook(low_memory=True)


if __name__ == '__main__':
    unittest.main()
