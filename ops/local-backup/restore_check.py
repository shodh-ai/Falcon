#!/usr/bin/env python3
"""Explicitly approved, disposable PG18 restore; never connects to production."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid

# Isolated Python excludes the script directory. Only installed, root-owned code
# belongs here; install.sh never adds the working directory to the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from falcon_backup import (BackupError, GIB, available_memory, load_config,
                           open_directory, RUN_RE, NOFOLLOW, MIB, trusted_file,
                           expected_files, lock, Guard, ensure_runtime_directory, DOCKER)


def restore_command(config, name, set_path, scratch, script):
    return DOCKER + ['run', '--pull', 'never', '--rm', '--name', name,
            '--network', 'none', '--user', '%d:%d' % (config['restore_uid'], config['restore_gid']),
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--memory', '256m', '--memory-swap', '256m', '--cpus', '0.5', '--pids-limit', '64',
            '--tmpfs', '/tmp:rw,nosuid,size=64m',
            '--mount', 'type=bind,src=%s,dst=/backup,readonly' % set_path,
            '--mount', 'type=bind,src=%s,dst=/scratch' % scratch,
            '--mount', 'type=bind,src=%s,dst=/restore-check.sh,readonly' % script,
            '--entrypoint', '/bin/sh', config['image'], '/restore-check.sh']


def check_set(c, run_id):
    if not RUN_RE.fullmatch(run_id):
        raise BackupError('Invalid run ID')
    fd = open_directory(Path(c['final_root']) / run_id)
    try:
        manifest_fd = os.open('manifest.json', os.O_RDONLY | NOFOLLOW, dir_fd=fd)
        with os.fdopen(manifest_fd) as stream:
            manifest = json.load(stream)
        if {item['name'] for item in manifest['files']} != set(expected_files(c)):
            raise BackupError('Manifest does not match the configured backup scope')
        for item in manifest['files']:
            if not re.fullmatch(r'[A-Za-z0-9_.-]+', item['name']):
                raise BackupError('Unsafe manifest filename')
            data_fd = os.open(item['name'], os.O_RDONLY | NOFOLLOW, dir_fd=fd)
            checksum = hashlib.sha256()
            size = 0
            with os.fdopen(data_fd, 'rb') as stream:
                for chunk in iter(lambda: stream.read(MIB), b''):
                    checksum.update(chunk)
                    size += len(chunk)
            if size != item['bytes'] or checksum.hexdigest() != item['sha256']:
                raise BackupError('Backup hash/size mismatch')
        return manifest
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/falcon-local-backup/config.json')
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--approval-id', required=True, help='Reference to explicit human authorization; not a secret')
    parser.add_argument('--i-confirm-disposable-restore', action='store_true', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise BackupError('Root is required for the fixed Docker dispatcher')
    def interrupted(signum, frame):
        raise BackupError('Disposable restore interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', args.approval_id):
        raise BackupError('A non-secret explicit authorization reference is required')
    if available_memory() < int(1.5 * GIB):
        raise BackupError('Restore blocked: available memory is below 1.5 GiB')
    c = load_config(args.config)
    if not isinstance(c.get('restore_uid'), int) or c['restore_uid'] <= 0 or not isinstance(c.get('restore_gid'), int) or c['restore_gid'] < 0:
        raise BackupError('Configure the existing nonroot PG18 image account UID/GID for initdb')
    guard = Guard(c)
    guard.check(initial=True)
    manifest = check_set(c, args.run_id)
    # Restore storage is a fresh local scratch directory. It is retained for
    # user-authorized deletion, never mistaken for production PGDATA.
    name = 'falcon-restore-check-' + uuid.uuid4().hex
    script = str(Path(__file__).resolve().with_name('restore-check.sh'))
    script_fd = trusted_file(script)
    os.close(script_fd)
    scratch_root = Path(c['staging_root']).parent / 'restore-check'
    root_fd = open_directory(scratch_root)
    try:
        os.mkdir(name, 0o700, dir_fd=root_fd)
    finally:
        os.close(root_fd)
    session = scratch_root / name
    inputs, scratch = session / 'inputs', session / 'pgdata'
    inputs.mkdir(mode=0o700)
    scratch.mkdir(mode=0o700)
    os.chown(inputs, c['restore_uid'], c['restore_gid'])
    os.chown(scratch, c['restore_uid'], c['restore_gid'])
    # Copy rather than weakening root-owned finalized backup permissions.
    for database in manifest['database_names']:
        filename = 'database-' + database + '.dump'
        with open(Path(c['final_root']) / args.run_id / filename, 'rb') as source:
            destination_fd = os.open(str(inputs / filename), os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o400)
            with os.fdopen(destination_fd, 'wb') as destination:
                while True:
                    chunk = source.read(MIB)
                    if not chunk:
                        break
                    destination.write(chunk)
                destination.flush()
                os.fsync(destination.fileno())
            os.chown(inputs / filename, c['restore_uid'], c['restore_gid'])
    command = restore_command(c, name, str(inputs), str(scratch), script)
    # The restore receives only finalized files, no pgpass, production network,
    # upload mount, production PGDATA or application environment.
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               start_new_session=True)
    started = time.monotonic()
    try:
        while process.poll() is None:
            guard.check()
            if time.monotonic() - started > 1800:
                raise BackupError('Disposable restore timed out; result unproven')
            if available_memory() < GIB:
                raise BackupError('Disposable restore aborted: host memory pressure')
            time.sleep(5)
        if process.returncode:
            raise BackupError('Restore helper failed/resource limit reached; result unproven')
        print(json.dumps({'run_id': args.run_id, 'approval_id': args.approval_id,
                          'seconds': round(time.monotonic() - started, 1),
                          'retained_scratch': str(session),
                          'databases': manifest['database_names'],
                          'result': 'isolated SQL restore and table inventory passed; application/decryption/document walkthrough still required'}))
    finally:
        # Container removal does not delete backup files or the retained scratch.
        try:
            subprocess.run(DOCKER + ['rm', '-f', name], timeout=20, check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == '__main__':
    try:
        ensure_runtime_directory()
        with lock('/run/falcon-local-backup/lock'):
            main()
    except (BackupError, OSError, ValueError) as error:
        print('FALCON restore check refused/failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
