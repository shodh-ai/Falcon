#!/usr/bin/env python3
"""Explicit offline content probe of a disposable restore; no production connection."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import restore_check as restore
from falcon_backup import (BackupError, DOCKER, MIB, NOFOLLOW, DIRECTORY,
                           ensure_runtime_directory, load_config, lock,
                           open_directory, trusted_file)


def read_environment(filename):
    path = Path(filename)
    root = Path('/data/falcon-backups/recovery-private')
    if not path.is_absolute() or '..' in path.parts or root not in path.parents:
        raise BackupError('Use the protected on-server preservation environment')
    parent = open_directory(path.parent)
    try:
        restore._private(os.fstat(parent), directory=True)
        with os.fdopen(restore._open_regular(parent, path.name), 'rb') as stream:
            data = stream.read(2 * MIB + 1)
    finally:
        os.close(parent)
    if len(data) > 2 * MIB:
        raise BackupError('Recovery environment exceeds limit')
    entries = restore._json(data)
    if not isinstance(entries, list) or not all(isinstance(x, str) and '=' in x for x in entries):
        raise BackupError('Recovery environment format is unsupported')
    selected = {}
    for entry in entries:
        key, value = entry.split('=', 1)
        if key in ('HR_ENCRYPTION_KEY', 'JWT_SECRET', 'S3_ENDPOINT', 'UPLOAD_PATH'):
            if key in selected:
                raise BackupError('Duplicate recovery configuration key')
            selected[key] = value
    if selected.get('UPLOAD_PATH', '/app/uploads').strip() not in ('/app/uploads', './uploads', 'uploads'):
        raise BackupError('Review the preserved upload mapping before this probe')
    return selected


def helper_command(image, name, socket_source, inputs, script, database, dump_hash):
    command = DOCKER + ['run', '--pull', 'never', '--rm', '--name', name,
        '--network', 'none', '--user', '70:70', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--memory', '128m',
        '--memory-swap', '128m', '--cpus', '0.25', '--pids-limit', '32',
        '--tmpfs', '/tmp:rw,nosuid,noexec,size=16m', '--env', 'NODE_OPTIONS=',
        '--mount', 'type=bind,src=%s,dst=/restore-socket,readonly' % socket_source,
        '--mount', 'type=bind,src=%s,dst=/checks/recovery_content_check.js,readonly' % script]
    for filename in ('uploads.tar.gz', 'manifest.json', 'mapping.json', 'hr-key.json'):
        command += ['--mount', 'type=bind,src=%s,dst=/inputs/%s,readonly' % (inputs / filename, filename)]
    return command + ['--entrypoint', 'node', image, '--max-old-space-size=64',
        '/checks/recovery_content_check.js', '--archive', '/inputs/uploads.tar.gz',
        '--manifest', '/inputs/manifest.json', '--mapping', '/inputs/mapping.json',
        '--hr-key-file', '/inputs/hr-key.json', '--source-database', database,
        '--dump-sha256', dump_hash]


def content_hook(config, run_id, image, environment):
    script = str(Path(__file__).resolve().with_name('recovery_content_check.js'))
    os.close(trusted_file(script))
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image):
        raise BackupError('Pin the already-local reviewed application image ID')

    def check(context, monitor):
        if context['database'] != 'postgres':
            return {'execution_complete': True, 'content_probe': 'not applicable: non-business database'}
        if config['restore_uid'] != 70 or config['restore_gid'] != 70:
            raise BackupError('Offline checker requires reviewed PG image UID/GID 70')
        session = Path(context['session_path'])
        session_fd = open_directory(session)
        directory_fd = None
        try:
            restore._private(os.fstat(session_fd), directory=True)
            os.mkdir('content-inputs', 0o700, dir_fd=session_fd)
            directory_fd = os.open('content-inputs', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=session_fd)
            inputs = session / 'content-inputs'
            with restore.checked_set(config, run_id, monitor) as (source, manifest):
                entry = next(e for e in manifest['files'] if e['name'] == 'uploads.tar.gz')
                source_fd = restore._open_regular(source, entry['name'])
                try:
                    out = os.open('uploads.tar.gz', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                                  0o400, dir_fd=directory_fd)
                    with os.fdopen(out, 'wb') as target:
                        restore._matches(restore._hash(source_fd, config['working_bytes'], monitor, target), entry)
                        target.flush()
                        os.fsync(target.fileno())
                        os.fchown(target.fileno(), 70, 70)
                finally:
                    os.close(source_fd)
                mapping = {'source_upload_roots': list(dict.fromkeys(['/app/uploads', manifest['sources']['uploads_directory']])),
                    'working_directory': '/app', 'same_origin_hosts': ['apifalcon.jataka.io', 'falcon.jataka.io'],
                    'object_storage_enabled': bool(environment.get('S3_ENDPOINT', '').strip())}
                primary = environment.get('HR_ENCRYPTION_KEY', '').strip()
                key = {'HR_ENCRYPTION_KEY': primary} if primary else {'JWT_SECRET': environment.get('JWT_SECRET', '').strip()}
                for filename, value in [('manifest.json', manifest), ('mapping.json', mapping), ('hr-key.json', key)]:
                    restore._write_json(directory_fd, filename, value)
                    os.chmod(filename, 0o400, dir_fd=directory_fd, follow_symlinks=False)
                    os.chown(filename, 70, 70, dir_fd=directory_fd, follow_symlinks=False)
            name = context['sandbox_name'] + '-content'
            raw = monitor.run_capture(helper_command(image, name, context['socket_mount_source'],
                inputs, script, context['database'], context['dump_sha256']), name, max_bytes=65536)
            report = restore._json(raw)
            if (not isinstance(report, dict) or report.get('schema_version') != 1
                    or report.get('execution_complete') is not True
                    or report.get('status') not in ('passed', 'unproven')
                    or not isinstance(report.get('readiness'), dict)
                    or any(type(report['readiness'].get(k)) is not bool for k in
                           ('documents_verified', 'encrypted_fields_verified'))):
                raise BackupError('Incomplete offline checker report')
            result = {'content_image_id': image, 'report': report,
                    'all_content_checks_passed': report['status'] == 'passed' and
                        report['readiness']['documents_verified'] and report['readiness']['encrypted_fields_verified'],
                    'production_database_credentials_mounted': False,
                    'full_environment_mounted': False,
                    'minimal_application_key_mounted': True}
            check.reports.append(result)
            return result
        finally:
            if directory_fd is not None:
                os.close(directory_fd)
            os.close(session_fd)
    check.reports = []
    return check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/falcon-local-backup/config.json')
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--approval-id', required=True)
    parser.add_argument('--content-image', required=True)
    parser.add_argument('--key-source', required=True)
    parser.add_argument('--i-confirm-disposable-restore', action='store_true', required=True)
    args = parser.parse_args()
    ensure_runtime_directory()
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', args.approval_id):
        raise BackupError('An explicit authorization reference is required')
    def interrupted(signum, frame):
        raise BackupError('Disposable restore interrupted')
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    with lock('/run/falcon-local-backup/lock'):
        config = load_config(args.config)
        if restore.available_memory() < int(1.5 * restore.GIB):
            raise BackupError('Restore blocked: available memory is below 1.5 GiB')
        environment = read_environment(args.key_source)
        hook = content_hook(config, args.run_id, args.content_image, environment)
        result = restore.run_restore(config, args.run_id, args.approval_id, hook)
        result['content_checks'] = hook.reports
        result['content_checks_passed'] = bool(hook.reports) and all(
            report['all_content_checks_passed'] for report in hook.reports)
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except (BackupError, OSError, ValueError, KeyError, TypeError):
        print('FALCON offline recovery check refused/failed; result unproven', file=sys.stderr)
        sys.exit(1)
