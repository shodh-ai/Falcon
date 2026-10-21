#!/usr/bin/env python3
"""Isolated PDF/raster proof on private indexed archive copies; no live mounts."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
import types
import uuid

ROOT = Path('/data/falcon-backups/restore-check')
RECONCILE_HASH = 'e29d965a89f262b71473c1b4a8ba33965961c0a891734e8912b9956ff4849189'
EXTRACTOR_HASH = '60d03fcf9da57455d627990a9ec88370d529856a2be2555d86aeda3e27e6aaab'
MIB = 1024 ** 2
MAX_FILE, MAX_TARGETS, MAX_PRIVATE = 8 * MIB, 256, 2 * MIB
NOFOLLOW, DIRECTORY = os.O_NOFOLLOW, os.O_DIRECTORY
COUNT_FIELDS = frozenset('''targets_checked source_files_verified pdf_parsed encrypted_pdf_password_required
    parser_rejected raster_decoded raster_decoder_rejected pixel_budget_exceeded multiple_frames_unproven
    format_mismatch unsupported_media_format'''.split())
FALSE_FIELDS = frozenset('''production_mutations external_requests database_access
    source_archive_rehashed_by_helper jpeg_header_only_is_raster_proof'''.split())
OUTCOMES = COUNT_FIELDS - {'targets_checked', 'source_files_verified'}


class MediaError(RuntimeError):
    pass


def require(condition, code):
    if not condition:
        raise MediaError(code)


def load_dispatcher():
    """Bootstrap a fixed root-owned adjacent module from verified held bytes."""
    path = Path(__file__).absolute().with_name('reconcile-documents-reviewed.py')
    fd = os.open('/', os.O_RDONLY | DIRECTORY | NOFOLLOW)
    try:
        for index, part in enumerate((None,) + path.parts[1:]):
            if part is not None:
                child = os.open(part, os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK |
                                (0 if index == len(path.parts) - 1 else DIRECTORY), dir_fd=fd)
                os.close(fd); fd = child
            info = os.fstat(fd)
            require(info.st_uid == 0 and not info.st_mode & 0o022, 'dispatcher-trust')
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 <= info.st_size <= MAX_PRIVATE,
                'dispatcher-source')
        data = bytearray()
        while len(data) <= MAX_PRIVATE:
            block = os.read(fd, 65536)
            if not block: break
            data.extend(block)
        after = os.fstat(fd)
        require(len(data) == info.st_size and len(data) <= MAX_PRIVATE and
                (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) and
                hashlib.sha256(data).hexdigest() == RECONCILE_HASH, 'dispatcher-hash')
    finally:
        os.close(fd)
    module = types.ModuleType('reviewed_document_dispatcher'); module.__file__ = str(path)
    exec(compile(bytes(data), str(path), 'exec'), module.__dict__)
    return module


def load_extractor(common):
    path = Path(__file__).absolute().with_name('restore_upload_permissions.py')
    data = common.trusted_bytes(path, EXTRACTOR_HASH)
    module = types.ModuleType('reviewed_media_extractor'); module.__file__ = str(path)
    exec(compile(data, str(path), 'exec'), module.__dict__)
    return module


def report_path(value):
    path = Path(value)
    require(path.name == 'document-reconciliation-private.json' and path.parent.parent == ROOT and
            re.fullmatch(r'falcon-restore-check-[0-9a-f]{32}', path.parent.name), 'source-report-path')
    return path


def binding(report, manifest, run_id):
    require(isinstance(report, dict) and report.get('schema_version') == 1 and
            report.get('execution_complete') is True and isinstance(report.get('samples'), list) and
            len(report['samples']) <= 10000 and isinstance(report.get('source_binding'), dict), 'source-report')
    archives = [entry for entry in manifest['files'] if entry['name'] == 'uploads.tar.gz']
    dumps = [entry for entry in manifest['files'] if entry['name'] == 'database-postgres.dump']
    require(len(archives) == len(dumps) == 1 and manifest['run_id'] == run_id, 'manifest-binding')
    source = report['source_binding']
    require(source.get('run_id') == run_id and source.get('uploads_archive_sha256') == archives[0]['sha256'] and
            source.get('dump_sha256') == dumps[0]['sha256'], 'source-report-binding')
    return archives[0]


def select_members(report, manifest, mode, extractor):
    require(mode in ('pdf', 'raster'), 'mode')
    expected = manifest['uploads']['file_sha256']
    selected = set()
    for sample in report['samples']:
        require(isinstance(sample, dict) and isinstance(sample.get('member'), str), 'source-sample')
        member = sample['member']
        require(extractor.canonical_member(member) == member and member in expected, 'source-member')
        result, detected = sample.get('result'), sample.get('detected_mime')
        choose = (mode == 'pdf' and member.lower().endswith('.pdf') and result in
                  ('parser_rejected', 'byte_budget_exceeded', 'encrypted_pdf_password_required'))
        if mode == 'raster':
            choose = (result == 'jpeg_header_opened' or
                      result == 'pixel_budget_exceeded' and
                      (detected == 'image/png' or member.lower().endswith('.png')) or
                      sample.get('extension_mismatch') is True)
        if choose:
            require(type(sample.get('bytes')) is int and 0 < sample['bytes'] <= MAX_FILE, 'target-byte-budget')
            selected.add(member)
    require(0 < len(selected) <= MAX_TARGETS, 'target-count')
    return sorted(selected)


def new_session(restore):
    parent = restore.open_anchor_directory(ROOT)
    session_fd = None
    try:
        restore._private(os.fstat(parent), directory=True)
        name = 'falcon-restore-check-' + uuid.uuid4().hex
        os.mkdir(name, 0o700, dir_fd=parent)
        session_fd = os.open(name, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent)
        restore._private(os.fstat(session_fd), directory=True)
        for directory in ('candidate-validation', 'media-inputs'):
            os.mkdir(directory, 0o700, dir_fd=session_fd)
        candidate = os.open('candidate-validation', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=session_fd)
        try: os.mkdir('uploads', 0o700, dir_fd=candidate)
        finally: os.close(candidate)
        return ROOT / name, session_fd
    except BaseException:
        if session_fd is not None: os.close(session_fd)
        raise
    finally:
        os.close(parent)


def json_bytes(value):
    data = (json.dumps(value, sort_keys=True) + '\n').encode()
    require(len(data) <= MAX_PRIVATE, 'metadata-bound')
    return data


def copy_target(source_fd, inputs_fd, index, member, expected, common, extractor, monitor):
    actual = extractor.hash_regular(source_fd, monitor, MAX_FILE)
    require(actual['sha256'] == expected and 0 < actual['bytes'] <= MAX_FILE, 'target-source-hash')
    data = common.stable_read(source_fd, MAX_FILE, monitor)
    require(len(data) == actual['bytes'] and hashlib.sha256(data).hexdigest() == expected, 'target-copy-hash')
    common.write_private(inputs_fd, str(index), data, reader=True)
    copy_fd = os.open(str(index), os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK, dir_fd=inputs_fd)
    try:
        copied = extractor.hash_regular(copy_fd, monitor, MAX_FILE)
        require(copied['bytes'] == actual['bytes'] and copied['sha256'] == expected and
                os.fstat(copy_fd).st_ino != os.fstat(source_fd).st_ino and
                stat.S_IMODE(os.fstat(copy_fd).st_mode) == 0o400, 'indexed-copy')
    finally: os.close(copy_fd)
    return {'index': index, 'member': member, 'sha256': expected, 'bytes': actual['bytes']}, actual


def helper_command(docker, session, image, mode, inputs, script, targets, resets):
    require(mode in ('pdf', 'raster') and re.fullmatch(r'sha256:[0-9a-f]{64}', image), 'helper-scope')
    require(session.parent == ROOT and re.fullmatch(r'falcon-restore-check-[0-9a-f]{32}', session.name) and
            inputs == session / 'media-inputs', 'helper-session')
    name = session.name + '-db-0-content'
    command = docker + ['run', '--pull', 'never', '--rm', '--name', name, '--network', 'none', '--user', '70:70',
        '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '384m',
        '--memory-swap', '384m', '--cpus', '0.5', '--pids-limit', '32', '--log-driver', 'local',
        '--log-opt', 'max-size=4m', '--log-opt', 'max-file=2', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m'] + resets
    mounts = [(script, '/checks/document-media-proof.cjs')]
    mounts += [(inputs / filename, '/inputs/' + filename) for filename in ('manifest.json', 'targets.json')]
    require(0 < len(targets) <= MAX_TARGETS, 'helper-targets')
    for index, target in enumerate(targets):
        require(target['index'] == index, 'helper-target-index')
        mounts.append((inputs / str(index), '/inputs/files/' + str(index)))
    for source, destination in mounts:
        require(Path(source).is_absolute() and ',' not in str(source) and '..' not in Path(source).parts, 'helper-mount')
        command += ['--mount', 'type=bind,src=%s,dst=%s,readonly' % (source, destination)]
    return command + ['--entrypoint', 'node', image, '--max-old-space-size=96', '/checks/document-media-proof.cjs', mode]


def checked_result(common, raw, mode, targets, run_id, archive_hash):
    require(len(raw) <= MAX_PRIVATE, 'report-bound')
    report = common.unique_json(raw)
    require(isinstance(report, dict) and report.get('schema_version') == 1 and report.get('execution_complete') is True and
            report.get('mode') == mode and report.get('source_binding') == {'run_id': run_id, 'archive_sha256': archive_hash} and
            isinstance(report.get('summary'), dict) and isinstance(report.get('results'), list), 'media-report')
    summary, results = report['summary'], report['results']
    require(set(summary) == COUNT_FIELDS | FALSE_FIELDS and
            all(type(summary[key]) is int and 0 <= summary[key] <= MAX_TARGETS for key in COUNT_FIELDS) and
            all(summary[key] is False for key in FALSE_FIELDS), 'media-summary')
    require(len(results) == len(targets) == summary['targets_checked'] == summary['source_files_verified'], 'media-completeness')
    counts = {key: 0 for key in OUTCOMES}
    allowed = ({'pdf_parsed', 'encrypted_pdf_password_required', 'parser_rejected', 'format_mismatch'} if mode == 'pdf'
               else {'raster_decoded', 'raster_decoder_rejected', 'pixel_budget_exceeded',
                     'multiple_frames_unproven', 'format_mismatch', 'unsupported_media_format'})
    for target, result in zip(targets, results):
        require(isinstance(result, dict) and all(result.get(key) == target[key] for key in ('index', 'member', 'sha256', 'bytes')) and
                type(result.get('index')) is int and type(result.get('bytes')) is int and
                result.get('source_bytes_verified') is True and result.get('result') in allowed and
                result.get('raster_decoded') is (result.get('result') == 'raster_decoded'), 'media-result-binding')
        counts[result['result']] += 1
    require(all(summary[key] == counts[key] for key in OUTCOMES), 'media-counts')
    return report


def run_proof(common, backup, restore, config, args, extractor, monitor):
    path = report_path(args.report)
    parent_fd = extractor.checked_directory(path.parent)
    os.close(parent_fd)
    source_report = common.trusted_open(path, private=True)
    session = session_fd = uploads_fd = inputs_fd = archive_fd = None
    try:
        raw_source = common.stable_read(source_report, MAX_PRIVATE, monitor)
        # Earlier complete source reports predate the new media summary counters.
        # Bind their immutable source identifiers and samples; do not reinterpret
        # or require any newer reconciliation summary field.
        report = common.unique_json(raw_source)
        with restore.checked_set(config, args.run_id, monitor) as (source, manifest):
            archive_entry = binding(report, manifest, args.run_id)
            members = select_members(report, manifest, args.mode, extractor)
            session, session_fd = new_session(restore)
            common.write_private(session_fd, 'started.json', json_bytes({'schema_version': 1, 'mode': args.mode,
                'run_id': args.run_id, 'production_mutations': False, 'automatic_data_deletion': False}))
            common.write_private(session_fd, 'source-report-private.json', raw_source)
            src = restore._open_regular(source, archive_entry['name'])
            try:
                out = os.open('source-uploads.tar.gz', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=session_fd)
                with os.fdopen(out, 'wb') as target:
                    restore._matches(restore._hash(src, config['working_bytes'], monitor, target), archive_entry)
                    target.flush(); os.fchmod(target.fileno(), 0o600); os.fsync(target.fileno())
            finally: os.close(src)
            archive_fd = restore._open_regular(session_fd, 'source-uploads.tar.gz')
            restore._matches(restore._hash(archive_fd, config['working_bytes'], monitor), archive_entry)
            inspected = backup.inspect_upload_archive('/proc/self/fd/%d' % archive_fd, config['max_archive_bytes'],
                guard=types.SimpleNamespace(check=monitor.tick))
            require(inspected['file_sha256'] == manifest['uploads']['file_sha256'], 'archive-inventory')
            os.lseek(archive_fd, 0, os.SEEK_SET)
            restore._matches(restore._hash(archive_fd, config['working_bytes'], monitor), archive_entry)
            uploads = session / 'candidate-validation' / 'uploads'
            uploads_fd = restore.open_anchor_directory(uploads)
            files, _ = extractor.extract_validated(archive_fd, uploads_fd, manifest['uploads']['file_sha256'],
                                                    config['max_archive_bytes'], monitor)
            os.lseek(archive_fd, 0, os.SEEK_SET)
            restore._matches(restore._hash(archive_fd, config['working_bytes'], monitor), archive_entry)
            inputs = session / 'media-inputs'
            inputs_fd = restore.open_anchor_directory(inputs)
            targets, originals = [], {}
            for index, member in enumerate(members):
                fd = extractor.open_relative(uploads_fd, member)
                try:
                    target, original = copy_target(fd, inputs_fd, index, member, manifest['uploads']['file_sha256'][member],
                                                   common, extractor, monitor)
                finally: os.close(fd)
                require(target['bytes'] == files[member]['bytes'], 'source-file-size')
                require(all(sample.get('bytes') == target['bytes'] for sample in report['samples']
                            if sample.get('member') == member), 'source-sample-size')
                targets.append(target); originals[member] = original
            values = {'schema_version': 1, 'run_id': args.run_id, 'archive_sha256': archive_entry['sha256'], 'targets': targets}
            for filename, value in (('manifest.json', manifest), ('targets.json', values)):
                common.write_private(inputs_fd, filename, json_bytes(value), reader=True)
            source_script = Path(__file__).absolute().with_name('document-media-proof.cjs')
            code = common.trusted_bytes(source_script)
            common.write_private(session_fd, 'document-media-proof.cjs', code)
            script = session / 'document-media-proof.cjs'
            script_fd = os.open('document-media-proof.cjs', os.O_RDONLY | NOFOLLOW, dir_fd=session_fd)
            try:
                os.fchmod(script_fd, 0o444)
                require(os.fstat(script_fd).st_uid == 0 and common.stable_read(script_fd, MAX_PRIVATE, monitor) == code,
                        'script-copy')
            finally: os.close(script_fd)
            metadata = common.capture_inspect(backup.DOCKER + ['image', 'inspect', '--format', '{{json .}}', args.image], monitor)
            resets = common.environment_resets(metadata, args.image)
            command = helper_command(backup.DOCKER, session, args.image, args.mode, inputs, script, targets, resets)
            name = session.name + '-db-0-content'
            require(monitor.container_absent(name) is True, 'new-helper-name')
            raw = monitor.run_capture(command, name, max_bytes=MAX_PRIVATE)
            common.write_private(session_fd, 'document-media-private.json', raw)
            require(monitor.container_absent(name) is True, 'consumer-cleanup-unproven')
            result = checked_result(common, raw, args.mode, targets, args.run_id, archive_entry['sha256'])
            for target in targets:
                fd = extractor.open_relative(uploads_fd, target['member'])
                try: require(extractor.hash_regular(fd, monitor, MAX_FILE) == originals[target['member']], 'quarantine-file-changed')
                finally: os.close(fd)
                fd = os.open(str(target['index']), os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK, dir_fd=inputs_fd)
                try:
                    current = extractor.hash_regular(fd, monitor, MAX_FILE)
                    require(current['sha256'] == target['sha256'] and current['bytes'] == target['bytes'] and
                            current['uid'] == current['gid'] == 70 and stat.S_IMODE(os.fstat(fd).st_mode) == 0o400,
                            'indexed-file-changed')
                finally: os.close(fd)
            # The held source report and copied archive must still be identical.
            require(common.stable_read(source_report, MAX_PRIVATE, monitor) == raw_source, 'source-report-changed')
            os.lseek(archive_fd, 0, os.SEEK_SET)
            restore._matches(restore._hash(archive_fd, config['working_bytes'], monitor), archive_entry)
            monitor.guard.check(force_health=True)
            public = {'schema_version': 1, 'mode': args.mode, 'run_id': args.run_id, 'image_id': args.image,
                      'summary': result['summary'], 'retained_scratch': str(session), 'production_mutations': False,
                      'archive_and_source_bytes_verified': True, 'consumer_cleanup_verified': True}
            common.write_private(session_fd, 'passed.json', json_bytes(public))
            return public
    except BaseException as error:
        if session_fd is not None:
            common.write_private(session_fd, 'failed.json', json_bytes({'schema_version': 1, 'result': 'unproven',
                'error_type': type(error).__name__, 'production_mutations': False, 'automatic_data_deletion': False}))
        raise
    finally:
        for fd in (archive_fd, inputs_fd, uploads_fd, session_fd, source_report):
            if fd is not None: os.close(fd)


def argument_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('pdf', 'raster'), required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--i-confirm-isolated-media-proof', required=True, action='store_true')
    return parser


def main(argv=None):
    args = argument_parser().parse_args(argv)
    require(os.geteuid() == 0 and re.fullmatch(r'sha256:[0-9a-f]{64}', args.image) and
            re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}', args.run_id), 'explicit-isolated-scope')
    report_path(args.report)
    common = load_dispatcher(); backup, restore = common.load_frozen(); extractor = load_extractor(common)
    def interrupted(signum, frame): raise MediaError('interrupted')
    signal.signal(signal.SIGINT, interrupted); signal.signal(signal.SIGTERM, interrupted)
    backup.ensure_runtime_directory()
    with backup.lock(common.LOCK):
        common.require_headroom(backup)
        config = backup.load_config(common.CONFIG)
        monitor = restore.Monitor(config); monitor.guard.check(initial=True); monitor.tick(force=True)
        started = time.monotonic()
        result = run_proof(common, backup, restore, config, args, extractor, monitor)
        result['isolated_media_seconds'] = round(time.monotonic() - started, 1)
        print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try: main()
    except (RuntimeError, OSError, ValueError, TypeError, KeyError):
        print('FALCON isolated media proof refused/failed; inspect private server evidence', file=sys.stderr)
        sys.exit(1)
