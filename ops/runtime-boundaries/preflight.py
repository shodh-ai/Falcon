#!/usr/bin/env python3
"""Offline FALCON deployment gate. Reads evidence; never invokes Docker or SQL."""
import argparse
import datetime as dt
import json
from pathlib import PurePosixPath
import re
import sys

GIB = 1024 ** 3
MIB = 1024 ** 2
REVISION = re.compile(r'^[0-9a-f]{40}(?:[0-9a-f]{24})?$')
IMAGE = re.compile(r'^sha256:[0-9a-f]{64}$')
CONTAINER = re.compile(r'^[0-9a-f]{64}$')
REVISION_LABEL = 'org.opencontainers.image.revision'


class Refused(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Refused(message)


def absolute_path(value):
    require(isinstance(value, str) and value.startswith('/') and
            '..' not in PurePosixPath(value).parts and
            str(PurePosixPath(value)) == value and value != '/',
            'Expected a normalized, non-root absolute path')
    return value


def fresh(record, now):
    text = record.get('observed_at', '')
    try:
        observed = dt.datetime.fromisoformat(text.replace('Z', '+00:00'))
        require(observed.tzinfo is not None, 'Evidence timestamp needs a timezone')
        age = (now - observed).total_seconds()
    except (AttributeError, TypeError, ValueError) as error:
        raise Refused('Invalid evidence timestamp') from error
    require(-30 <= age <= 300, 'Inspection/headroom evidence is stale or future dated')


def inspection(record, now):
    fresh(record, now)
    data = record.get('inspect')
    if isinstance(data, list):
        require(len(data) == 1, 'Exactly one container inspection is required')
        data = data[0]
    require(isinstance(data, dict), 'Container inspection is missing')
    require(CONTAINER.fullmatch(data.get('Id', '')), 'Full container identity is required')
    require(IMAGE.fullmatch(data.get('Image', '')), 'Immutable container image identity is required')
    require(isinstance(data.get('Mounts'), list), 'Actual persistent mount inspection is required')
    return data


def persistent_mounts(mounts):
    result = {}
    seen = set()
    for mount in mounts:
        kind = mount.get('Type')
        require(kind in ('bind', 'volume', 'tmpfs'), 'Unknown container mount type')
        target = absolute_path(mount.get('Destination'))
        require(target not in seen, 'Duplicate mount destination')
        seen.add(target)
        if kind == 'tmpfs':
            continue
        source = absolute_path(mount.get('Source'))
        require(not source.endswith('/docker.sock') and not target.endswith('/docker.sock'),
                'Docker socket access is forbidden')
        require(isinstance(mount.get('RW'), bool), 'Mount read/write evidence is missing')
        name = mount.get('Name', '')
        require(kind != 'volume' or isinstance(name, str) and bool(name),
                'Persistent volumes need their recorded Docker identity')
        result[target] = (kind, source, name if kind == 'volume' else '', mount['RW'])
    return result


def tmpfs_size(options):
    parts = set(options.split(','))
    require({'rw', 'nosuid', 'nodev', 'noexec'} <= parts and
            not {'ro', 'suid', 'dev', 'exec'} & parts,
            'Temporary mounts need explicit rw,nosuid,nodev,noexec')
    sizes = [part[5:] for part in parts if part.startswith('size=')]
    require(len(sizes) == 1, 'Temporary mounts need one bounded size')
    match = re.fullmatch(r'([1-9][0-9]*)([kKmMgG]?)', sizes[0])
    require(match is not None, 'Invalid tmpfs size')
    amount = int(match[1]) * {'': 1, 'k': 1024, 'm': MIB, 'g': GIB}[match[2].lower()]
    require(amount <= 256 * MIB, 'Temporary mount exceeds 256 MiB safety bound')


def validate(baseline, previous_record, candidate_record, headroom,
             candidate_image, candidate_revision, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    require(baseline.get('schema_version') == 1, 'Unsupported baseline schema')
    require(REVISION.fullmatch(baseline.get('revision', '')), 'Baseline revision is missing')
    require(bool(baseline.get('revision_evidence')), 'Baseline image/revision mapping needs reviewed evidence')
    require(IMAGE.fullmatch(candidate_image) and REVISION.fullmatch(candidate_revision),
            'Proposed image and full revision identities are required')
    previous = inspection(previous_record, now)
    candidate = inspection(candidate_record, now)
    require(previous['Id'] == baseline.get('container_id') and
            previous['Image'] == baseline.get('image_id'),
            'Previous container/image differs from the recorded baseline')
    require((previous_record.get('image_inspect') or {}).get('Id') == previous['Image'],
            'Previous immutable image must also be available in fresh image inspection evidence')
    require(previous.get('State', {}).get('Running') is True and
            previous.get('State', {}).get('Paused') is False and
            previous.get('State', {}).get('Restarting') is False and
            previous.get('State', {}).get('Health', {}).get('Status') == 'healthy',
            'Previous release must still be running and healthy')
    previous_label = (previous.get('Config', {}).get('Labels') or {}).get(REVISION_LABEL)
    require(previous_label is None or previous_label == baseline['revision'],
            'Previous revision label differs from its reviewed baseline')
    require(candidate['Image'] == candidate_image and
            (candidate.get('Config', {}).get('Labels') or {}).get(REVISION_LABEL) == candidate_revision,
            'Candidate image/revision does not match the proposed release')

    recorded = persistent_mounts(baseline.get('persistent_mounts', []))
    require(recorded and persistent_mounts(previous['Mounts']) == recorded,
            'Current persistent mounts differ from the recorded baseline')
    proposed = persistent_mounts(candidate['Mounts'])
    require(set(proposed) == set(recorded), 'Candidate has missing or unexpected persistent mounts')
    for target, old in recorded.items():
        require(proposed[target][:3] == old[:3], 'Candidate changes a persistent mount identity')
        require(old[3] or not proposed[target][3], 'Candidate broadens a read-only persistent mount')

    writable = baseline.get('writable_upload_targets')
    require(isinstance(writable, list) and writable and
            len(set(writable)) == len(writable), 'Explicit writable upload targets are required')
    require('/app/uploads' in writable, 'Current hardcoded /app/uploads must remain persistent')
    for target in writable:
        absolute_path(target)
        require(target not in ('/app', '/data', '/var', '/home') and
                not any(target == root or target.startswith(root + '/')
                        for root in ('/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/proc', '/sys', '/dev', '/run')) and
                (not target.startswith('/app/') or target == '/app/uploads' or target.startswith('/app/uploads/')),
                'Writable exception is not a narrow upload root')
        require(target in recorded and proposed[target][3],
                'Required upload mount is missing or read-only')
    require(all(not value[3] or target in writable for target, value in proposed.items()),
            'Writable persistent mount outside approved upload roots')

    config, host = candidate.get('Config', {}), candidate.get('HostConfig', {})
    require(re.fullmatch(r'[1-9][0-9]*:[1-9][0-9]*', config.get('User', '')),
            'Candidate needs an explicitly verified non-root numeric UID:GID')
    require(host.get('ReadonlyRootfs') is True and host.get('Privileged') is False,
            'Candidate must have a read-only root and be unprivileged')
    require('ALL' in (host.get('CapDrop') or []) and not host.get('CapAdd'),
            'Candidate must drop all capabilities without additions')
    require(any(option in ('no-new-privileges', 'no-new-privileges:true')
                for option in (host.get('SecurityOpt') or [])),
            'Candidate must enable no-new-privileges')
    require(all(key in host for key in ('PidMode', 'IpcMode', 'NetworkMode')) and
            host.get('PidMode', '') != 'host' and host.get('IpcMode', '') != 'host' and
            host.get('NetworkMode') != 'host', 'Host namespaces are forbidden')
    temporary = host.get('Tmpfs') or {}
    allowed_temporary = baseline.get('allowed_tmpfs_targets', ['/tmp'])
    require(set(allowed_temporary) <= {'/tmp', '/home/node/.cache'} and
            '/tmp' in temporary and set(temporary) <= set(allowed_temporary),
            'Only approved /tmp and optional node cache tmpfs mounts are allowed')
    require(not set(temporary) & set(proposed), 'Temporary storage cannot replace persistent data')
    for target, options in temporary.items():
        absolute_path(target)
        tmpfs_size(options)
    require(all(mount['Destination'] in temporary for mount in candidate['Mounts']
                if mount.get('Type') == 'tmpfs'), 'Unaccounted temporary mount')

    fresh(headroom, now)
    for key in ('available_memory_bytes', 'free_disk_bytes', 'working_bytes'):
        require(type(headroom.get(key)) is int and headroom[key] > 0,
                'Positive measured headroom and working-set bytes are required')
    memory = host.get('Memory')
    require(type(memory) is int and memory > 0 and host.get('MemorySwap') == memory,
            'Candidate needs a memory limit and no additional swap allowance')
    require(headroom['available_memory_bytes'] >= max(GIB, memory + 512 * MIB),
            'Insufficient headroom to preserve the running release')
    require(headroom['free_disk_bytes'] >= max(20 * GIB, 3 * headroom['working_bytes']),
            'Insufficient disk headroom; cleanup is not authorized')
    return {'result': 'offline configuration gate passed; deployment not performed',
            'baseline_container_id': previous['Id'], 'previous_healthy_image_id': previous['Image'],
            'previous_revision': baseline['revision'], 'candidate_image_id': candidate_image,
            'candidate_revision': candidate_revision, 'persistent_mounts': len(recorded)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('baseline', 'previous-inspect', 'candidate-inspect', 'headroom',
                 'candidate-image', 'candidate-revision'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    documents = []
    for path in (args.baseline, args.previous_inspect, args.candidate_inspect, args.headroom):
        with open(path, encoding='utf-8') as stream:
            data = stream.read(2 * MIB + 1)
            require(len(data) <= 2 * MIB, 'Evidence document exceeds 2 MiB bound')
            documents.append(json.loads(data))
    print(json.dumps(validate(*documents, args.candidate_image, args.candidate_revision), sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, TypeError, KeyError, AttributeError) as error:
        print('FALCON deployment preflight refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
