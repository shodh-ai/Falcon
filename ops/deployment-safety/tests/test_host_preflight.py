import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path, PurePosixPath
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('host_preflight', Path(__file__).parents[1] / 'host-preflight.py')
host = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(host)
BASELINE_PATH = '/etc/falcon-deployment-safety/host-baseline.json'


class FakeFS:
    def __init__(self):
        self.nodes = {}
        self.content = {}
        self.reads = []
        self.free = 40 * host.GIB
        self.add_directory('/')

    def add_directory(self, path):
        parts = PurePosixPath(path).parts
        for i in range(1, len(parts) + 1):
            current = str(PurePosixPath(*parts[:i]))
            if current not in self.nodes:
                self.nodes[current] = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755,
                    st_uid=0, st_dev=123, st_ino=len(self.nodes) + 1,
                    st_size=0, st_mtime_ns=100, st_nlink=1)

    def add_file(self, path, content, mode=0o600):
        self.add_directory(str(PurePosixPath(path).parent))
        self.nodes[path] = SimpleNamespace(st_mode=stat.S_IFREG | mode,
            st_uid=0, st_dev=123, st_ino=len(self.nodes) + 1,
            st_size=len(content), st_mtime_ns=100, st_nlink=1)
        self.content[path] = content

    def lstat(self, path):
        if path not in self.nodes:
            raise FileNotFoundError(path)
        return copy.copy(self.nodes[path])

    def read(self, path, limit):
        self.reads.append(path)
        value = self.content[path]
        host.require(len(value) <= limit, 'Read-only input exceeds size bound')
        return value

    def disk_free(self, path):
        return self.free


class FakeDocker:
    def __init__(self, resources):
        self.calls = []
        self.resources = resources
        self.api_rows = [{'Id': resources['api']['container_id'],
                          'Name': host.EXPECTED_NAMES['api'] + '-synthetic'}]
        self.documents = {}
        self.images = {item['image_id']: {'Id': item['image_id'], 'Revision': ''}
                       for item in resources.values()}
        self.images['sha256:' + '9' * 64] = {'Id': 'sha256:' + '9' * 64, 'Revision': 'f' * 40}
        self.pgdata = 'PGDATA=' + resources['postgres']['pgdata']
        self.volumes = {}
        self.before_run = None
        for kind, resource in resources.items():
            name = self.api_rows[0]['Name'] if kind == 'api' else host.EXPECTED_NAMES[kind]
            self.documents[kind] = {'Id': resource['container_id'], 'Name': '/' + name,
                'Image': resource['image_id'],
                'Revision': resource.get('revision', ''),
                'Mounts': [{key: value for key, value in mount.items()
                            if key not in ('source_identity', 'source_type')}
                           for mount in resource['mounts']],
                'State': {'Running': True, 'Paused': False,
                          'Restarting': False, 'Health': 'healthy'}}
            for mount in resource['mounts']:
                if mount['Type'] == 'volume':
                    self.volumes[mount['Name']] = {'Name': mount['Name'], 'Driver': 'local',
                        'Scope': 'local', 'HasOptions': False, 'Mountpoint': mount['Source']}

    def __call__(self, arguments):
        self.calls.append(arguments)
        if self.before_run:
            self.before_run(arguments)
        if arguments[:2] == ['container', 'ls']:
            return '\n'.join(json.dumps(row) for row in self.api_rows)
        if arguments[:2] == ['container', 'inspect']:
            if arguments[3] == host.PGDATA_FORMAT:
                return json.dumps(self.pgdata)
            target = arguments[-1]
            for kind, document in self.documents.items():
                if target in (document['Id'], host.EXPECTED_NAMES[kind]):
                    return json.dumps(document)
            raise host.Refused('Read-only local Docker observation failed')
        if arguments[:2] == ['image', 'inspect']:
            if arguments[-1] not in self.images:
                raise host.Refused('Read-only local Docker observation failed')
            return json.dumps(self.images[arguments[-1]])
        if arguments[:2] == ['volume', 'inspect']:
            return json.dumps(self.volumes[arguments[-1]])
        raise AssertionError('Unexpected or mutating Docker operation')


class HostPreflightTests(unittest.TestCase):
    def setUp(self):
        self.fs = FakeFS()
        sources = {'api': host.UPLOAD_SOURCE,
                   'postgres': '/var/lib/docker/volumes/' + host.PG_VOLUME + '/_data',
                   'redis': '/var/lib/docker/volumes/' + host.REDIS_VOLUME + '/_data'}
        resources = {}
        for i, kind in enumerate(('api', 'postgres', 'redis')):
            self.fs.add_directory(sources[kind])
            source = self.fs.lstat(sources[kind])
            mount = {'Type': 'bind' if kind == 'api' else 'volume',
                     'Source': sources[kind],
                     'Destination': {'api': '/app/uploads', 'postgres': '/var/lib/postgresql', 'redis': '/data'}[kind],
                     'RW': True, 'source_identity': {'device': source.st_dev, 'inode': source.st_ino}}
            if kind != 'api':
                mount['Name'] = host.PG_VOLUME if kind == 'postgres' else host.REDIS_VOLUME
            resource = {'container_id': str(i + 1) * 64,
                        'image_id': 'sha256:' + str(i + 4) * 64, 'mounts': [mount]}
            if kind == 'api':
                resource['revision'] = 'a' * 40
            if kind == 'postgres':
                resource['pgdata'] = '/var/lib/postgresql/18/docker'
            resources[kind] = resource
        self.baseline = {'schema_version': 1, 'resources': resources,
                         'working_filesystems': ['/data', '/var/lib/docker']}
        self.save_baseline()
        self.fs.add_file('/proc/meminfo', b'MemAvailable:    4194304 kB\n')
        self.docker = FakeDocker(resources)
        self.preflight = host.Preflight(run=self.docker, fs=self.fs, monotonic=lambda: 0,
            utc_now=lambda: dt.datetime(2026, 10, 21, tzinfo=dt.timezone.utc))

    def save_baseline(self):
        self.fs.add_file(BASELINE_PATH, json.dumps(self.baseline).encode())

    def check(self, **kwargs):
        return self.preflight.check(BASELINE_PATH, 'sha256:' + '9' * 64,
                                    'f' * 40, kwargs.pop('working_bytes', host.GIB), **kwargs)

    def test_valid_capture_is_live_readonly_and_output_minimized(self):
        before = copy.deepcopy((self.baseline, self.fs.content, self.docker.documents))
        result = self.check()
        self.assertIn('deployment not performed', result['result'])
        self.assertEqual(before, (self.baseline, self.fs.content, self.docker.documents))
        self.assertEqual(set(self.fs.reads), {BASELINE_PATH, '/proc/meminfo'})
        self.assertGreater(len(self.docker.calls), 10)
        self.assertTrue(all(call[:2] in (['container', 'ls'], ['container', 'inspect'],
                                        ['image', 'inspect'], ['volume', 'inspect'])
                            for call in self.docker.calls))
        output = json.dumps(result)
        self.assertNotIn('Env', output)
        self.assertNotIn('PGDATA', output)
        self.assertNotIn('Mounts', output)
        # Retained stopped rollback containers are not selected by discovery.
        self.assertNotIn('--all', self.docker.calls[0])

    def test_required_image_revisions_and_immutable_id(self):
        for image, revision in [('production', 'f' * 40), ('sha256:' + '9' * 64, 'short')]:
            with self.subTest(image=image), self.assertRaises(host.Refused):
                self.preflight.check(BASELINE_PATH, image, revision, host.GIB)
        self.docker.images['sha256:' + '9' * 64]['Revision'] = 'e' * 40
        with self.assertRaises(host.Refused): self.check()

    def test_missing_candidate_or_previous_image_refuses(self):
        for image in ('sha256:' + '9' * 64, self.baseline['resources']['api']['image_id']):
            original = self.docker.images.pop(image)
            with self.subTest(image=image), self.assertRaises(host.Refused): self.check()
            self.docker.images[image] = original

    def test_missing_or_multiple_active_api_containers_refuse_without_cleanup(self):
        original = self.docker.api_rows
        for rows in ([], original + [{'Id': '8' * 64, 'Name': host.EXPECTED_NAMES['api'] + '-other'}]):
            self.docker.api_rows = rows
            with self.assertRaises(host.Refused): self.check()

    def test_wrong_resource_container_image_or_revision_refuses(self):
        for field, value in [('Id', '7' * 64), ('Image', 'sha256:' + '7' * 64), ('Revision', 'e' * 40)]:
            original = self.docker.documents['api'][field]
            self.docker.documents['api'][field] = value
            with self.subTest(field=field), self.assertRaises(host.Refused): self.check()
            self.docker.documents['api'][field] = original

    def test_unhealthy_paused_or_restarting_resources_refuse(self):
        for kind in self.docker.documents:
            for key, value in [('Running', False), ('Paused', True), ('Restarting', True), ('Health', 'starting')]:
                original = self.docker.documents[kind]['State'][key]
                self.docker.documents[kind]['State'][key] = value
                with self.subTest(kind=kind, field=key), self.assertRaises(host.Refused): self.check()
                self.docker.documents[kind]['State'][key] = original

    def test_baseline_file_and_ancestors_must_be_root_protected(self):
        for path, field, value in [(BASELINE_PATH, 'st_uid', 1000),
                (BASELINE_PATH, 'st_mode', stat.S_IFREG | 0o644),
                (BASELINE_PATH, 'st_nlink', 2),
                ('/etc/falcon-deployment-safety', 'st_mode', stat.S_IFDIR | 0o775),
                ('/etc', 'st_mode', stat.S_IFLNK | 0o777)]:
            original = getattr(self.fs.nodes[path], field)
            setattr(self.fs.nodes[path], field, value)
            with self.subTest(path=path, field=field), self.assertRaises(host.Refused): self.check()
            setattr(self.fs.nodes[path], field, original)

    def test_incomplete_baseline_and_missing_resource_refuse(self):
        original = copy.deepcopy(self.baseline)
        for mutation in ('schema', 'resource', 'identity', 'root_identity'):
            self.baseline = copy.deepcopy(original)
            if mutation == 'schema': self.baseline['schema_version'] = 2
            elif mutation == 'resource': del self.baseline['resources']['redis']
            elif mutation == 'identity': self.baseline['resources']['api']['container_id'] = 'short'
            else: del self.baseline['resources']['api']['mounts'][0]['source_identity']
            self.save_baseline()
            with self.subTest(mutation=mutation), self.assertRaises(host.Refused): self.check()

    def test_missing_extra_repointed_readonly_or_anonymous_data_mounts_refuse(self):
        for kind in self.docker.documents:
            original = copy.deepcopy(self.docker.documents[kind]['Mounts'])
            for mutation in ('missing', 'extra', 'source', 'destination', 'mode', 'anonymous'):
                mounts = copy.deepcopy(original)
                if mutation == 'missing': mounts.clear()
                elif mutation == 'extra': mounts.append({'Type': 'bind', 'Source': '/extra', 'Destination': '/extra', 'RW': False})
                elif mutation == 'source': mounts[0]['Source'] = '/new-empty-source'
                elif mutation == 'destination': mounts[0]['Destination'] += '/data'
                elif mutation == 'mode': mounts[0]['RW'] = False
                elif mutation == 'anonymous': mounts[0]['Type'] = 'volume'; mounts[0]['Name'] = ''
                self.docker.documents[kind]['Mounts'] = mounts
                with self.subTest(kind=kind, mutation=mutation), self.assertRaises(host.Refused): self.check()
            self.docker.documents[kind]['Mounts'] = original

    def test_even_baseline_cannot_authorize_nested_shadow_mount(self):
        mount = copy.deepcopy(self.baseline['resources']['api']['mounts'][0])
        mount['Destination'] = '/app/uploads/hidden'
        self.baseline['resources']['api']['mounts'].append(mount)
        self.save_baseline()
        with self.assertRaises(host.Refused): self.check()

    def test_duplicate_mount_destination_refuses(self):
        self.docker.documents['postgres']['Mounts'] *= 2
        with self.assertRaises(host.Refused): self.check()

    def test_source_inode_device_symlink_ancestor_or_missing_directory_refuses(self):
        source = host.UPLOAD_SOURCE
        for field, value in [('st_dev', 999), ('st_ino', 999), ('st_mode', stat.S_IFLNK | 0o777)]:
            original = getattr(self.fs.nodes[source], field)
            setattr(self.fs.nodes[source], field, value)
            with self.subTest(field=field), self.assertRaises(host.Refused): self.check()
            setattr(self.fs.nodes[source], field, original)
        original = self.fs.nodes.pop(source)
        with self.assertRaises(FileNotFoundError): self.check()
        self.fs.nodes[source] = original
        self.fs.nodes['/data/coolify'].st_mode = stat.S_IFLNK | 0o777
        with self.assertRaises(host.Refused): self.check()

    def test_volume_driver_mountpoint_scope_options_and_name_refuse(self):
        volume = self.docker.volumes[host.PG_VOLUME]
        for field, value in [('Driver', 'nfs'), ('Mountpoint', '/new-empty-source'),
                             ('Scope', 'global'), ('HasOptions', True), ('Name', 'replacement')]:
            original = volume[field]
            volume[field] = value
            with self.subTest(field=field), self.assertRaises(host.Refused): self.check()
            volume[field] = original

    def test_pgdata_must_match_exact_value_and_remain_in_pg18_mount(self):
        self.docker.pgdata = 'PGDATA=/var/lib/postgresql/data'
        with self.assertRaises(host.Refused): self.check()
        self.baseline['resources']['postgres']['pgdata'] = '/new/data'
        self.save_baseline()
        with self.assertRaises(host.Refused): self.check()

    def test_pg18_destination_must_not_be_changed_in_baseline(self):
        self.baseline['resources']['postgres']['mounts'][0]['Destination'] = '/var/lib/postgresql/data'
        self.save_baseline()
        with self.assertRaises(host.Refused): self.check()

    def test_exact_root_protected_guard_file_mount_supported_after_rollout(self):
        self.fs.add_file(host.GUARD_SOURCE, b'{"synthetic":"metadata only"}', mode=0o444)
        source = self.fs.lstat(host.GUARD_SOURCE)
        mount = {'Type': 'bind', 'Source': host.GUARD_SOURCE,
                 'Destination': host.GUARD_TARGET, 'RW': False, 'source_type': 'file',
                 'source_identity': {'device': source.st_dev, 'inode': source.st_ino}}
        self.baseline['resources']['api']['mounts'].append(mount)
        self.docker.documents['api']['Mounts'].append({k: v for k, v in mount.items()
            if k not in ('source_type', 'source_identity')})
        self.save_baseline()
        self.check()
        self.docker.documents['api']['Mounts'][-1]['RW'] = True
        with self.assertRaises(host.Refused): self.check()

    def test_guard_file_mount_cannot_be_generalized_or_mutable(self):
        source = self.fs.lstat(host.UPLOAD_SOURCE)
        mount = {'Type': 'bind', 'Source': '/some/other/file',
                 'Destination': host.GUARD_TARGET, 'RW': False, 'source_type': 'file',
                 'source_identity': {'device': source.st_dev, 'inode': source.st_ino}}
        self.baseline['resources']['api']['mounts'].append(mount)
        self.save_baseline()
        with self.assertRaises(host.Refused): self.check()

    def test_exact_memory_and_disk_thresholds_and_higher_candidate_budget(self):
        self.fs.content['/proc/meminfo'] = b'MemAvailable: 1572864 kB\n'
        self.fs.free = 20 * host.GIB
        self.check()
        self.fs.content['/proc/meminfo'] = b'MemAvailable: 1572863 kB\n'
        with self.assertRaises(host.Refused): self.check()
        self.fs.content['/proc/meminfo'] = b'MemAvailable: 4194304 kB\n'
        self.fs.free -= 1
        with self.assertRaises(host.Refused): self.check()
        self.fs.free = 40 * host.GIB
        with self.assertRaises(host.Refused): self.check(working_bytes=14 * host.GIB)
        with self.assertRaises(host.Refused): self.check(candidate_memory_bytes=4 * host.GIB)

    def test_memory_and_disk_measurement_must_exist_and_not_be_assumed(self):
        for content in (b'', b'MemAvailable: unknown kB\n', b'MemAvailable: 100 kB\nMemAvailable: 200 kB\n'):
            self.fs.content['/proc/meminfo'] = content
            with self.assertRaises(host.Refused): self.check()
        self.baseline['working_filesystems'] = ['/data']
        self.save_baseline()
        with self.assertRaises(host.Refused): self.check()

    def test_live_capture_exceeding_freshness_bound_refuses(self):
        times = iter([0, host.MAX_CAPTURE_SECONDS + 1])
        self.preflight.monotonic = lambda: next(times)
        with self.assertRaises(host.Refused): self.check()

    def test_live_resource_change_during_capture_refuses(self):
        calls = [0]
        def change(args):
            if args[:2] == ['container', 'ls']:
                calls[0] += 1
                if calls[0] == 2:
                    self.docker.documents['api']['Image'] = 'sha256:' + '8' * 64
        self.docker.before_run = change
        with self.assertRaises(host.Refused): self.check()

    def test_baseline_changed_during_capture_refuses(self):
        count = [0]
        original_read = self.fs.read
        def read(path, limit):
            if path == BASELINE_PATH:
                count[0] += 1
                if count[0] == 2:
                    return json.dumps(self.baseline, indent=2).encode()
            return original_read(path, limit)
        self.fs.read = read
        with self.assertRaises(host.Refused): self.check()

    def test_fixed_local_docker_endpoint_and_errors_do_not_expose_stderr(self):
        fake = SimpleNamespace(returncode=1, stdout=b'synthetic-secret', stderr=b'synthetic-password')
        with patch.object(host.subprocess, 'run', return_value=fake) as command:
            with self.assertRaises(host.Refused) as error:
                host.live_docker(['image', 'inspect'])
        self.assertNotIn('synthetic', str(error.exception))
        args, options = command.call_args
        self.assertEqual(args[0][:3], ['/usr/bin/docker', '--host', 'unix:///run/docker.sock'])
        self.assertNotIn('shell', options)
        self.assertNotIn('DOCKER_HOST', options['env'])


if __name__ == '__main__':
    unittest.main()
