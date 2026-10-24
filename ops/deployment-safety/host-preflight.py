#!/usr/bin/env python3
"""Read-only, live FALCON host observations; never deploys or changes storage."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import time

GIB = 1024 ** 3
MIB = 1024 ** 2
MAX_CAPTURE_SECONDS = 30
MAX_DOCUMENT_BYTES = 2 * MIB
IMAGE = re.compile(r'^sha256:[0-9a-f]{64}$')
CONTAINER = re.compile(r'^[0-9a-f]{64}$')
REVISION = re.compile(r'^[0-9a-f]{40}$')
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')
REVISION_LABEL = 'org.opencontainers.image.revision'
UPLOAD_SOURCE = '/data/coolify/applications/pmy0ybhwzco11kocu0zloqk0/uploads'
PG_VOLUME = 'postgres-data-acdz53zfy2eqstxeybua41rs'
REDIS_VOLUME = 'redis-data-y13hscsoka5mti9mjtfptqlh'
GUARD_SOURCE = '/etc/falcon-deployment-safety/storage-boundary.json'
VERSIONED_GUARD_SOURCE = re.compile(
    r'/etc/falcon-deployment-safety/policies/storage-boundary-[0-9a-f]{32}\.json')
GUARD_TARGET = '/run/falcon/storage-boundary.json'
EXPECTED_NAMES = {'api': 'pmy0ybhwzco11kocu0zloqk0',
                  'postgres': 'acdz53zfy2eqstxeybua41rs',
                  'redis': 'y13hscsoka5mti9mjtfptqlh'}

# Project only needed fields. Config.Env and health-check logs never leave Docker.
# Docker 29 uses strict missing-key template evaluation. Official images may
# omit Labels entirely, so a dotted lookup fails even inside an if statement.
REVISION_FORMAT = ('{{with index .Config "Labels"}}{{json (index . "' +
                   REVISION_LABEL + '")}}{{else}}null{{end}}')
CONTAINER_FORMAT = ('{"Id":{{json .Id}},"Name":{{json .Name}},'
    '"Image":{{json .Image}},"Mounts":{{json .Mounts}},'
    '"Revision":' + REVISION_FORMAT + ','
    '"State":{"Running":{{json .State.Running}},'
    '"Paused":{{json .State.Paused}},"Restarting":{{json .State.Restarting}},'
    '"Health":{{with index .State "Health"}}{{json (index . "Status")}}{{else}}null{{end}}}}')
IMAGE_FORMAT = '{"Id":{{json .Id}},"Revision":' + REVISION_FORMAT + '}'
VOLUME_FORMAT = ('{"Name":{{json .Name}},"Driver":{{json .Driver}},'
                 '"Mountpoint":{{json .Mountpoint}},"Scope":{{json .Scope}},'
                 '"HasOptions":{{if index . "Options"}}true{{else}}false{{end}}}')
PGDATA_FORMAT = ('{{range .Config.Env}}{{if eq (index (split . "=") 0) '
                 '"PGDATA"}}{{json .}}{{end}}{{end}}')
PS_FORMAT = '{"Id":{{json .ID}},"Name":{{json .Names}}}'


class Refused(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def absolute_path(value, allow_root=False):
    require(isinstance(value, str) and value.startswith('/') and
            not any(ord(c) < 32 for c in value) and
            '..' not in PurePosixPath(value).parts and
            str(PurePosixPath(value)) == value and
            (allow_root or value != '/'), 'Invalid normalized host/container path')
    return value


class FileSystem:
    """Small injectable read-only interface. No create/write/chmod/chown calls."""
    def lstat(self, path):
        return os.lstat(path)

    def read(self, path, limit):
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            require(stat.S_ISREG(os.fstat(fd).st_mode), 'Expected a regular readable file')
            with os.fdopen(fd, 'rb', closefd=False) as stream:
                data = stream.read(limit + 1)
            require(len(data) <= limit, 'Read-only input exceeds size bound')
            return data
        finally:
            os.close(fd)

    def disk_free(self, path):
        return shutil.disk_usage(path).free


def no_symlink_path(fs, path, protected=False, directory=True):
    """Walk every ancestor, including /; never follow a source-root symlink."""
    absolute_path(path, allow_root=True)
    parts = PurePosixPath(path).parts
    info = None
    current = '/'
    for i in range(len(parts)):
        if i:
            current = str(PurePosixPath(current) / parts[i])
        info = fs.lstat(current)
        require(not stat.S_ISLNK(info.st_mode), 'Symlink path component refused')
        is_directory = i < len(parts) - 1 or directory
        require(stat.S_ISDIR(info.st_mode) if is_directory else stat.S_ISREG(info.st_mode),
                'Required host source or baseline path has the wrong type')
        if protected:
            require(info.st_uid == 0 and not info.st_mode & 0o022,
                    'Baseline and ancestors must be root-owned and not group/other writable')
    return info


def read_baseline(fs, path):
    before = no_symlink_path(fs, path, protected=True, directory=False)
    require(not before.st_mode & 0o077 and before.st_nlink == 1,
            'Baseline must be owner-only and single-link')
    raw = fs.read(path, MAX_DOCUMENT_BYTES)
    after = fs.lstat(path)
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns),
            'Baseline changed during capture')
    try:
        baseline = json.loads(raw)
    except (ValueError, UnicodeError) as error:
        raise Refused('Invalid protected baseline JSON') from error
    return baseline, hashlib.sha256(raw).hexdigest()


def live_docker(arguments):
    """Fixed local endpoint, no shell, output never echoed on command failure."""
    try:
        result = subprocess.run(
            ['/usr/bin/docker', '--host', 'unix:///run/docker.sock'] + arguments,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=10, check=False,
            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root'})
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Refused('Read-only local Docker observation failed') from error
    require(result.returncode == 0 and len(result.stdout) <= MAX_DOCUMENT_BYTES,
            'Read-only local Docker observation failed or exceeded its bound')
    try:
        return result.stdout.decode('utf-8')
    except UnicodeError as error:
        raise Refused('Unexpected Docker observation encoding') from error


def normalize_mounts(mounts, baseline=False):
    require(isinstance(mounts, list) and mounts, 'Persistent mount inventory is missing')
    result = {}
    for mount in mounts:
        require(isinstance(mount, dict), 'Invalid mount inventory')
        kind = mount.get('Type')
        require(kind in ('bind', 'volume'), 'Unreviewed mount type refused')
        target = absolute_path(mount.get('Destination'))
        source = absolute_path(mount.get('Source'))
        require(target not in result and type(mount.get('RW')) is bool,
                'Duplicate mount destination or missing mode')
        name = mount.get('Name', '') if kind == 'volume' else ''
        require(kind != 'volume' or isinstance(name, str) and NAME.fullmatch(name),
                'Named volume identity is missing')
        require(not source.endswith('/docker.sock') and not target.endswith('/docker.sock'),
                'Docker socket mount refused')
        normalized = {'Type': kind, 'Source': source, 'Destination': target,
                      'RW': mount['RW'], 'Name': name}
        if baseline:
            identity = mount.get('source_identity')
            require(isinstance(identity, dict) and
                    type(identity.get('device')) is int and identity['device'] >= 0 and
                    type(identity.get('inode')) is int and identity['inode'] > 0,
                    'Host source device/inode evidence is missing')
            normalized['source_identity'] = identity
            source_type = mount.get('source_type', 'directory')
            require(source_type == 'directory' or
                    source_type == 'file' and kind == 'bind' and
                    (source == GUARD_SOURCE or VERSIONED_GUARD_SOURCE.fullmatch(source)) and
                    target == GUARD_TARGET and mount['RW'] is False,
                    'Only the exact read-only startup boundary may be a file mount')
            normalized['source_type'] = source_type
        result[target] = normalized
    # Even a baseline cannot authorize nested mounts hiding part of a data root.
    targets = list(result)
    require(not any(a != b and b.startswith(a + '/') for a in targets for b in targets),
            'Nested mounts can shadow persistent data')
    return result


class Preflight:
    def __init__(self, run=live_docker, fs=None, monotonic=time.monotonic,
                 utc_now=lambda: dt.datetime.now(dt.timezone.utc)):
        self.run = run
        self.fs = fs or FileSystem()
        self.monotonic = monotonic
        self.utc_now = utc_now

    def document(self, arguments):
        try:
            value = json.loads(self.run(arguments))
        except Refused:
            # Refused inherits ValueError. Preserve sanitized command failures
            # instead of misreporting a template/daemon error as invalid JSON.
            raise
        except (ValueError, UnicodeError, TypeError) as error:
            raise Refused('Unexpected read-only Docker observation format') from error
        require(isinstance(value, dict), 'Expected one Docker observation object')
        return value

    def discover_api(self):
        output = self.run(['container', 'ls', '--no-trunc', '--filter',
                           'name=^/' + EXPECTED_NAMES['api'] + '-', '--format', PS_FORMAT])
        found = []
        try:
            for line in output.splitlines():
                if line.strip():
                    row = json.loads(line)
                    require(isinstance(row, dict) and CONTAINER.fullmatch(row.get('Id', '')) and
                            isinstance(row.get('Name'), str) and
                            row['Name'].startswith(EXPECTED_NAMES['api'] + '-'),
                            'Unexpected API discovery identity')
                    found.append(row)
        except (ValueError, TypeError, AttributeError) as error:
            raise Refused('Invalid API container discovery') from error
        require(len(found) == 1, 'API resource is missing or ambiguous; preserve all containers for review')
        return found[0]['Id'], found[0]['Name']

    def container(self, kind, expected):
        if kind == 'api':
            target, name = self.discover_api()
        else:
            target = EXPECTED_NAMES[kind]
            name = target
        actual = self.document(['container', 'inspect', '--format', CONTAINER_FORMAT, target])
        require(actual.get('Id') == expected['container_id'] and
                CONTAINER.fullmatch(actual.get('Id', '')) and
                actual.get('Name') == '/' + name and
                actual.get('Image') == expected['image_id'],
                'Live container/image differs from protected baseline')
        state = actual.get('State') or {}
        require(state.get('Running') is True and state.get('Paused') is False and
                state.get('Restarting') is False and state.get('Health') == 'healthy',
                'An existing production resource is not running and healthy')
        if kind == 'api':
            require(actual.get('Revision') == expected['revision'],
                    'Running API revision differs from protected baseline')
        observed = normalize_mounts(actual.get('Mounts'))
        recorded = normalize_mounts(expected['mounts'], baseline=True)
        comparable = {key: {k: v for k, v in mount.items()
                            if k not in ('source_identity', 'source_type')}
                      for key, mount in recorded.items()}
        require(observed == comparable, 'Live persistent mount mapping differs from protected baseline')
        for mount in recorded.values():
            file_source = mount['source_type'] == 'file'
            info = no_symlink_path(self.fs, mount['Source'], protected=file_source,
                                   directory=not file_source)
            identity = mount['source_identity']
            require(info.st_dev == identity['device'] and info.st_ino == identity['inode'],
                    'Host persistent source device/inode changed')
            if mount['Type'] == 'volume':
                volume = self.document(['volume', 'inspect', '--format', VOLUME_FORMAT, mount['Name']])
                require(volume.get('Name') == mount['Name'] and volume.get('Driver') == 'local' and
                        volume.get('Scope') == 'local' and volume.get('HasOptions') is False and
                        volume.get('Mountpoint') == mount['Source'],
                        'Named volume driver, identity or local mountpoint differs')
        if kind == 'postgres':
            try:
                pgdata = json.loads(self.run(['container', 'inspect', '--format', PGDATA_FORMAT,
                                             actual['Id']]))
            except Refused:
                raise
            except (ValueError, TypeError) as error:
                raise Refused('Exactly one explicit PostgreSQL PGDATA value is required') from error
            require(pgdata == 'PGDATA=' + expected['pgdata'], 'PostgreSQL PGDATA differs from protected baseline')
        return actual

    def image(self, image_id, revision=None):
        image = self.document(['image', 'inspect', '--format', IMAGE_FORMAT, image_id])
        require(image.get('Id') == image_id, 'Required immutable image is unavailable or changed')
        if revision is not None:
            require(image.get('Revision') == revision, 'Candidate image has the wrong or missing revision')

    def validate_baseline(self, baseline):
        require(isinstance(baseline, dict) and baseline.get('schema_version') == 1,
                'Unsupported protected baseline schema')
        resources = baseline.get('resources')
        require(isinstance(resources, dict) and set(resources) == set(EXPECTED_NAMES),
                'Baseline must cover API, PostgreSQL and Redis')
        for kind, resource in resources.items():
            require(isinstance(resource, dict) and CONTAINER.fullmatch(resource.get('container_id', '')) and
                    IMAGE.fullmatch(resource.get('image_id', '')), 'Baseline resource identity is incomplete')
            if kind == 'api':
                require(REVISION.fullmatch(resource.get('revision', '')), 'Baseline API revision is incomplete')
            mounts = normalize_mounts(resource.get('mounts'), baseline=True)
            if kind == 'api':
                root = mounts.get('/app/uploads') or {}
                require(root.get('Type') == 'bind' and root.get('Source') == UPLOAD_SOURCE and root.get('RW') is True,
                        'Baseline must preserve the verified writable API upload bind')
            elif kind == 'postgres':
                root = mounts.get('/var/lib/postgresql') or {}
                require(root.get('Type') == 'volume' and root.get('Name') == PG_VOLUME and root.get('RW') is True,
                        'Baseline must preserve the verified PostgreSQL 18 volume destination')
                pgdata = absolute_path(resource.get('pgdata'))
                require(pgdata.startswith('/var/lib/postgresql/'), 'PGDATA must remain inside the verified PG18 mount')
            else:
                root = mounts.get('/data') or {}
                require(root.get('Type') == 'volume' and root.get('Name') == REDIS_VOLUME and root.get('RW') is True,
                        'Baseline must preserve persistent Redis storage')
        paths = baseline.get('working_filesystems')
        require(isinstance(paths, list) and paths and len(paths) == len(set(paths)),
                'Deployment/data filesystem paths are required')
        require('/data' in paths and '/var/lib/docker' in paths,
                'Disk observations must cover data and Docker image storage')
        for path in paths:
            absolute_path(path, allow_root=True)
        return resources

    def check(self, baseline_path, candidate_image, revision, working_bytes,
              candidate_memory_bytes=GIB):
        require(IMAGE.fullmatch(candidate_image or '') and REVISION.fullmatch(revision or ''),
                'An immutable candidate image ID and full revision are required')
        require(type(working_bytes) is int and working_bytes > 0 and
                type(candidate_memory_bytes) is int and candidate_memory_bytes >= GIB,
                'Positive planned working bytes and at least a 1 GiB candidate budget are required')
        started = self.monotonic()
        captured_at = self.utc_now().isoformat()
        baseline, baseline_hash = read_baseline(self.fs, baseline_path)
        resources = self.validate_baseline(baseline)
        first = {kind: self.container(kind, resource) for kind, resource in resources.items()}
        for image_id in {resource['image_id'] for resource in resources.values()}:
            self.image(image_id)
        self.image(candidate_image, revision)
        try:
            meminfo = self.fs.read('/proc/meminfo', 64 * 1024).decode('ascii')
        except UnicodeError as error:
            raise Refused('Available host memory could not be measured') from error
        values = re.findall(r'^MemAvailable:\s+([0-9]+) kB$', meminfo, re.MULTILINE)
        require(len(values) == 1, 'Available host memory could not be measured')
        available = int(values[0]) * 1024
        minimum_memory = max(1536 * MIB, candidate_memory_bytes + 512 * MIB)
        require(available >= minimum_memory, 'Insufficient memory to retain the healthy release during replacement')
        minimum_disk = max(20 * GIB, 3 * working_bytes)
        disk = {}
        for path in baseline['working_filesystems']:
            no_symlink_path(self.fs, path)
            free = self.fs.disk_free(path)
            require(type(free) is int and free >= minimum_disk, 'Insufficient deployment/data filesystem space')
            disk[path] = free
        # Detect an overlapping deployment/change while collecting observations.
        for kind, resource in resources.items():
            require(self.container(kind, resource) == first[kind],
                    'Production resource changed during read-only capture')
        require(0 <= self.monotonic() - started <= MAX_CAPTURE_SECONDS,
                'Live observation capture exceeded its freshness bound')
        _, final_hash = read_baseline(self.fs, baseline_path)
        require(final_hash == baseline_hash, 'Protected baseline changed during capture')
        return {'result': 'live read-only host preflight passed; deployment not performed',
                'captured_at': captured_at, 'baseline_sha256': baseline_hash,
                'candidate_image_id': candidate_image, 'candidate_revision': revision,
                'previous_api_image_id': resources['api']['image_id'],
                'resources': {kind: {'container_id': value['Id'], 'image_id': value['Image'],
                                     'persistent_mount_count': len(value['Mounts'])}
                              for kind, value in first.items()},
                'available_memory_bytes': available, 'minimum_memory_bytes': minimum_memory,
                'free_disk_bytes': disk, 'minimum_disk_bytes': minimum_disk,
                'warning': 'Observes the current host only; does not intercept Coolify UI or future replacements'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--candidate-image', required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--working-bytes', required=True, type=int)
    parser.add_argument('--candidate-memory-bytes', type=int, default=GIB)
    args = parser.parse_args()
    require(os.geteuid() == 0, 'Live host preflight requires root to inspect protected evidence')
    result = Preflight().check(args.baseline, args.candidate_image, args.revision,
                               args.working_bytes, args.candidate_memory_bytes)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (Refused, OSError, KeyError, TypeError, AttributeError) as error:
        # Raw subprocess output, environment values and untrusted JSON never print.
        message = str(error) if isinstance(error, Refused) else 'Required read-only host observation failed'
        print('FALCON host preflight refused: ' + message, file=sys.stderr)
        sys.exit(1)
