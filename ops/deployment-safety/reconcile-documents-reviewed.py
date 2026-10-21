#!/usr/bin/env python3
"""Opt-in document reconciliation against a counted disposable restore only."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
import types

TOOLS = Path('/opt/falcon-local-backup')
CONFIG = '/etc/falcon-local-backup/config.json'
LOCK = '/run/falcon-local-backup/lock'
RESTORE_ROOT = Path('/data/falcon-backups/restore-check')
MIB, GIB = 1024 ** 2, 1024 ** 3
MAX_PRIVATE = 2 * MIB
NOFOLLOW = getattr(os, 'O_NOFOLLOW', 0)
DIRECTORY = getattr(os, 'O_DIRECTORY', 0)
RUN_RE = re.compile(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}')
IMAGE_RE = re.compile(r'sha256:[0-9a-f]{64}')
FROZEN = {
    'falcon_backup.py': 'cdb228fff1b2d5c8bcb1ba1a430835360f7f52830ec19a0fc602aec195c43074',
    'restore_check.py': '5da1c3626ce02c3fcc9d389dab709eb000c5df5ab91347160d2bb29aa9e3eb00',
    'recovery_content_check.js': '0b0ae0c72313732aa3d93929d2438c08eff3ac8b5bfcec0a77c4bf8c305da520',
}
COUNT_FIELDS = frozenset('''files_hashed legacy_missing_occurrences legacy_missing_distinct
    legacy_outside_coverage legacy_external_http legacy_unsupported_json legacy_uncovered_columns
    sources_checked reference_pairs local_distinct missing_local_occurrences missing_local_distinct
    normalization_changes seed_literal_occurrences metadata_only_attachments unsupported_json_rows
    populated_unclassified_columns empty_unclassified_columns oversized_values embedded_originals_checked
    embedded_originals_validated pdf_parsed png_decoded jpeg_headers_opened parser_rejected
    media_budget_exceeded extension_mismatches raw_references_omitted'''.split())
FALSE_FIELDS = frozenset(('production_mutations', 'external_requests', 'hr_values_selected',
                          'documents_fully_recovered'))


class ReconciliationError(RuntimeError):
    pass


def fail(code):
    # Fixed codes only. References, filenames, samples and raw errors stay private.
    raise ReconciliationError(code)


def unique_json(data):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                fail('duplicate-json-key')
            value[key] = item
        return value
    def invalid(value):
        fail('invalid-json-number')
    try:
        return json.loads(data, object_pairs_hook=unique, parse_constant=invalid)
    except (ValueError, UnicodeError):
        fail('invalid-json')


def trusted_open(path, *, private=False):
    """Root ownership and nonwritable, nonsymlink ancestors, including root."""
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts or ',' in str(path):
        fail('trusted-path')
    fd = os.open('/', os.O_RDONLY | DIRECTORY | NOFOLLOW)
    try:
        root = os.fstat(fd)
        if root.st_uid != 0 or root.st_mode & 0o022:
            fail('trusted-ancestor')
        for index, component in enumerate(path.parts[1:]):
            last = index == len(path.parts) - 2
            following = os.open(component, os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK |
                                (0 if last else DIRECTORY), dir_fd=fd)
            os.close(fd)
            fd = following
            info = os.fstat(fd)
            if info.st_uid != 0 or info.st_mode & 0o022:
                fail('trusted-ancestor')
            if last and (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1):
                fail('trusted-regular-file')
        if len(path.parts) < 2 or (private and stat.S_IMODE(os.fstat(fd).st_mode) != 0o600):
            fail('private-file-mode')
        return fd
    except BaseException:
        os.close(fd)
        raise


def stable_read(fd, maximum, monitor=None):
    before = os.fstat(fd)
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 <= before.st_size <= maximum:
        fail('input-size-or-type')
    os.lseek(fd, 0, os.SEEK_SET)
    result = bytearray()
    while True:
        block = os.read(fd, min(MIB, maximum + 1 - len(result)))
        if not block:
            break
        result.extend(block)
        if len(result) > maximum:
            fail('input-size')
        if monitor is not None:
            monitor.tick()
    after = os.fstat(fd)
    identity = lambda x: (x.st_dev, x.st_ino, x.st_size, x.st_mtime_ns, x.st_ctime_ns,
                           x.st_uid, x.st_gid, x.st_mode, x.st_nlink)
    if len(result) != before.st_size or identity(before) != identity(after):
        fail('input-changed')
    return bytes(result)


def trusted_bytes(path, expected=None, maximum=MAX_PRIVATE):
    fd = trusted_open(path)
    try:
        data = stable_read(fd, maximum)
        if expected is not None and hashlib.sha256(data).hexdigest() != expected:
            fail('frozen-component-hash')
        return data
    finally:
        os.close(fd)


def load_frozen():
    """Execute exactly the hashed bytes, rather than reopening verified code."""
    sources = {name: trusted_bytes(TOOLS / name, digest) for name, digest in FROZEN.items()}
    sys.path.insert(0, str(TOOLS))
    loaded = []
    for name in ('falcon_backup', 'restore_check'):
        filename = str(TOOLS / (name + '.py'))
        module = types.ModuleType(name)
        module.__file__ = filename
        sys.modules[name] = module
        exec(compile(sources[name + '.py'], filename, 'exec'), module.__dict__)
        loaded.append(module)
    return tuple(loaded)


def validate_catalog(data):
    value = unique_json(data)
    if (not isinstance(value, dict) or set(value) != {'schema_version', 'source_revision', 'match_label', 'entries'}
            or value.get('schema_version') != 1
            or not isinstance(value.get('source_revision'), str)
            or not re.fullmatch(r'[0-9a-f]{40}', value['source_revision'])
            or value.get('match_label') != 'matches_repository_seed_literal'
            or not isinstance(value.get('entries'), list) or len(value['entries']) > 5000):
        fail('seed-catalog-format')
    references = []
    for entry in value['entries']:
        if not isinstance(entry, dict) or set(entry) != {'reference', 'source_files'}:
            fail('seed-catalog-entry')
        reference, sources = entry['reference'], entry['source_files']
        if (not isinstance(reference, str) or not 1 <= len(reference.encode('utf8')) <= 8192
                or any(ord(character) < 32 or ord(character) == 127 for character in reference)
                or not isinstance(sources, list) or not 1 <= len(sources) <= 5000
                or any(not isinstance(source, str) or not re.fullmatch(
                    r'backend/migrations/[A-Za-z0-9_.-]+\.sql:[1-9][0-9]{0,7}', source) for source in sources)
                or sources != sorted(set(sources))):
            fail('seed-catalog-entry')
        references.append(reference)
    if references != sorted(set(references)):
        fail('seed-catalog-order')
    return value


@contextlib.contextmanager
def catalog_input(path, digest):
    if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
        fail('seed-catalog-digest')
    fd = trusted_open(path, private=True)
    try:
        data = stable_read(fd, MAX_PRIVATE)
        if hashlib.sha256(data).hexdigest() != digest:
            fail('seed-catalog-hash')
        validate_catalog(data)
        yield fd
    finally:
        os.close(fd)


def capture_inspect(command, monitor):
    """Bound image metadata; no daemon output or inherited ENV is displayed."""
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, start_new_session=True)
    selector = selectors.DefaultSelector()
    result = bytearray()
    deadline = time.monotonic() + 30
    try:
        selector.register(process.stdout, selectors.EVENT_READ)
        while selector.get_map() or process.poll() is None:
            monitor.tick()
            if time.monotonic() >= deadline:
                fail('image-inspect-timeout')
            for key, _ in selector.select(0.2):
                block = os.read(key.fileobj.fileno(), 65536)
                if not block:
                    selector.unregister(key.fileobj)
                else:
                    result.extend(block)
                    if len(result) > 128 * 1024:
                        fail('image-inspect-bound')
        if process.returncode:
            fail('local-image-inspect')
        return unique_json(bytes(result))
    finally:
        selector.close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if process.stdout:
            process.stdout.close()


def environment_resets(metadata, image):
    if (not isinstance(metadata, dict) or metadata.get('Id') != image
            or not isinstance(metadata.get('Config'), dict) or metadata['Config'].get('Volumes')):
        fail('local-image-identity-or-volumes')
    entries = metadata['Config'].get('Env') or []
    if not isinstance(entries, list) or len(entries) > 512:
        fail('image-environment')
    keys = set()
    for entry in entries:
        if not isinstance(entry, str) or '=' not in entry:
            fail('image-environment')
        key = entry.split('=', 1)[0]
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,127}', key) or key in keys:
            fail('image-environment')
        keys.add(key)
    keys -= {'PATH', 'NODE_VERSION', 'YARN_VERSION'}
    keys.add('NODE_OPTIONS')
    return [argument for key in sorted(keys) for argument in ('--env', key + '=')]


def checked_context(context):
    session = Path(context.get('session_path', ''))
    if (session.parent != RESTORE_ROOT or not re.fullmatch(r'falcon-restore-check-[0-9a-f]{32}', session.name)
            or not isinstance(context.get('sandbox_name'), str)
            or not re.fullmatch(re.escape(session.name) + r'-db-[0-9]+', context['sandbox_name'])
            or not re.fullmatch(r'[0-9a-f]{64}', context.get('dump_sha256', ''))):
        fail('disposable-context')
    socket = Path(context.get('socket_mount_source', ''))
    if socket.parent != session / 'ipc-anchors' or not re.fullmatch(r'socket-[0-9a-f]{32}', socket.name):
        fail('disposable-socket-alias')
    return session


def helper_command(docker, image, context, inputs, script, frozen_script, resets):
    if not isinstance(image, str) or not IMAGE_RE.fullmatch(image):
        fail('immutable-image')
    session = checked_context(context)
    if inputs != session / 'document-inputs':
        fail('disposable-inputs')
    name = context['sandbox_name'] + '-content'
    command = docker + ['run', '--pull', 'never', '--rm', '--name', name, '--network', 'none',
        '--user', '70:70', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--memory', '128m', '--memory-swap', '128m',
        '--cpus', '0.25', '--pids-limit', '32', '--log-driver', 'local',
        '--log-opt', 'max-size=4m', '--log-opt', 'max-file=2',
        '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m'] + resets
    mounts = [(Path(context['socket_mount_source']), '/restore-socket'),
              (Path(frozen_script), '/checks/recovery_content_check.js'),
              (Path(script), '/checks/document-reconciliation.cjs')]
    mounts += [(inputs / filename, '/inputs/' + filename) for filename in
               ('uploads.tar.gz', 'manifest.json', 'mapping.json', 'binding.json', 'seed-catalog.json')]
    for source, destination in mounts:
        if not source.is_absolute() or ',' in str(source) or '..' in source.parts:
            fail('mount-path')
        command += ['--mount', 'type=bind,src=%s,dst=%s,readonly' % (source, destination)]
    return command + ['--entrypoint', 'node', image, '--max-old-space-size=64',
                      '/checks/document-reconciliation.cjs']


def checked_report(data):
    if len(data) > MAX_PRIVATE:
        fail('private-report-bound')
    report = unique_json(data)
    if (not isinstance(report, dict) or report.get('schema_version') != 1
            or report.get('execution_complete') is not True or not isinstance(report.get('summary'), dict)
            or any(not isinstance(report.get(name), list) for name in ('references', 'sources', 'samples'))):
        fail('incomplete-document-report')
    summary = report['summary']
    if set(summary) != COUNT_FIELDS | FALSE_FIELDS:
        fail('summary-protocol')
    if (any(type(summary[key]) is not int or not 0 <= summary[key] <= 10 ** 9 for key in COUNT_FIELDS)
            or any(summary[key] is not False for key in FALSE_FIELDS)):
        fail('summary-protocol')
    return report


def write_private(directory_fd, name, data, *, reader=False):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o600, dir_fd=directory_fd)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as target:
            target.write(data)
            target.flush()
            os.fchmod(fd, 0o400 if reader else 0o600)
            if reader:
                os.fchown(fd, 70, 70)
            os.fsync(fd)
    finally:
        os.close(fd)


def require_headroom(backup):
    if backup.available_memory() < 2 * GIB:
        fail('start-memory-below-2gib')


def content_hook(backup, restore, config, run_id, image, catalog_fd, catalog_sha256):
    if (config.get('restore_uid') != 70 or config.get('restore_gid') != 70
            or not RUN_RE.fullmatch(run_id) or not IMAGE_RE.fullmatch(image)):
        fail('reviewed-restore-scope')
    script = Path(__file__).resolve().with_name('document-reconciliation.cjs')
    frozen_script = TOOLS / 'recovery_content_check.js'
    for path, digest in ((script, None), (frozen_script, FROZEN['recovery_content_check.js'])):
        trusted_bytes(path, digest)
        fd = trusted_open(path)
        try:
            if not os.fstat(fd).st_mode & 0o004:
                fail('helper-script-readable')
        finally:
            os.close(fd)

    def check(context, monitor):
        if context['database'] != 'postgres':
            return {'execution_complete': True, 'business_database_checked': False}
        require_headroom(backup)
        monitor.tick(force=True)
        session = checked_context(context)
        session_fd = restore.open_anchor_directory(session)
        inputs_fd = None
        try:
            restore._private(os.fstat(session_fd), directory=True)
            os.mkdir('document-inputs', 0o700, dir_fd=session_fd)
            inputs_fd = os.open('document-inputs', os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=session_fd)
            restore._private(os.fstat(inputs_fd), directory=True)
            inputs = session / 'document-inputs'
            with restore.checked_set(config, run_id, monitor) as (source, manifest):
                if manifest != context['manifest']:
                    fail('restore-manifest-binding')
                database = next(entry for entry in manifest['files'] if entry['name'] == 'database-postgres.dump')
                if database['sha256'] != context['dump_sha256']:
                    fail('restore-dump-binding')
                archive = next(entry for entry in manifest['files'] if entry['name'] == 'uploads.tar.gz')
                source_fd = restore._open_regular(source, archive['name'])
                try:
                    out = os.open('uploads.tar.gz', os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                                  0o400, dir_fd=inputs_fd)
                    with os.fdopen(out, 'wb') as target:
                        restore._matches(restore._hash(source_fd, config['working_bytes'], monitor, target), archive)
                        target.flush()
                        os.fchmod(target.fileno(), 0o400)
                        os.fchown(target.fileno(), 70, 70)
                        os.fsync(target.fileno())
                finally:
                    os.close(source_fd)
                mapping = {'source_upload_roots': list(dict.fromkeys(
                    ['/app/uploads', manifest['sources']['uploads_directory']])),
                    'working_directory': '/app',
                    'same_origin_hosts': ['apifalcon.jataka.io', 'falcon.jataka.io'],
                    'object_storage_enabled': False}
                binding = {'schema_version': 1, 'source_database': 'postgres',
                           'dump_sha256': context['dump_sha256']}
                for filename, value in (('manifest.json', manifest), ('mapping.json', mapping), ('binding.json', binding)):
                    write_private(inputs_fd, filename, (json.dumps(value, sort_keys=True) + '\n').encode(), reader=True)
            data = stable_read(catalog_fd, MAX_PRIVATE, monitor)
            if hashlib.sha256(data).hexdigest() != catalog_sha256:
                fail('seed-catalog-changed')
            validate_catalog(data)
            write_private(inputs_fd, 'seed-catalog.json', data, reader=True)
            metadata = capture_inspect(backup.DOCKER + ['image', 'inspect', '--format', '{{json .}}', image], monitor)
            resets = environment_resets(metadata, image)
            # Validate the frozen checker again immediately before its RO bind.
            trusted_bytes(frozen_script, FROZEN['recovery_content_check.js'])
            command = helper_command(backup.DOCKER, image, context, inputs, script, frozen_script, resets)
            name = context['sandbox_name'] + '-content'
            raw = monitor.run_capture(command, name, max_bytes=MAX_PRIVATE)
            write_private(session_fd, 'document-reconciliation-private.json', raw)
            if monitor.container_absent(name) is not True:
                fail('consumer-cleanup-unproven')
            report = checked_report(raw)
            result = {'execution_complete': True, 'content_image_id': image, 'summary': report['summary'],
                      'production_database_credentials_mounted': False, 'application_keys_mounted': False,
                      'full_application_recovery_proven': False, 'consumer_cleanup_verified': True}
            check.reports.append(result)
            return result
        finally:
            if inputs_fd is not None:
                os.close(inputs_fd)
            os.close(session_fd)
    check.reports = []
    return check


def argument_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--approval-id', required=True)
    parser.add_argument('--content-image', required=True)
    parser.add_argument('--seed-catalog', required=True)
    parser.add_argument('--seed-catalog-sha256', required=True)
    parser.add_argument('--disk-storage-confirmed', action='store_true', required=True)
    parser.add_argument('--i-confirm-disposable-restore', action='store_true', required=True)
    return parser


def main(argv=None):
    args = argument_parser().parse_args(argv)
    if (not RUN_RE.fullmatch(args.run_id) or not IMAGE_RE.fullmatch(args.content_image)
            or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', args.approval_id)):
        fail('explicit-reviewed-scope')
    if os.geteuid() != 0:
        fail('dispatcher-root-required')
    backup, restore = load_frozen()
    def interrupted(signum, frame):
        fail('disposable-restore-interrupted')
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    backup.ensure_runtime_directory()
    with backup.lock(LOCK):
        require_headroom(backup)
        config = backup.load_config(CONFIG)
        # run_restore also enforces disk, continuous memory and public health gates.
        with catalog_input(args.seed_catalog, args.seed_catalog_sha256) as seed_fd:
            hook = content_hook(backup, restore, config, args.run_id, args.content_image,
                                seed_fd, args.seed_catalog_sha256)
            started = time.monotonic()
            result = restore.run_restore(config, args.run_id, args.approval_id, hook)
        if len(hook.reports) != 1:
            fail('business-database-check-missing')
        # The core result contains only aggregate counts and generated scratch IDs.
        result.update({'document_reconciliation': hook.reports[0],
                       'isolated_reconciliation_seconds': round(time.monotonic() - started, 1),
                       'application_recovery_proven': False, 'production_mutations': False})
        print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ReconciliationError, OSError, ValueError, KeyError, TypeError, StopIteration, RuntimeError):
        print('FALCON document reconciliation refused/failed; inspect private server evidence', file=sys.stderr)
        sys.exit(1)
