#!/usr/bin/env python3
"""Validate minimized operator observations offline; never collect or deploy."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys

import preflight

ROOT = Path(__file__).resolve().parents[2]
REQUIRED_MIGRATIONS = (
    '20261019113000_faculty_ai_deploy_schema.sql',
    '20261019170000_finance_receipt_versions.sql',
)
REQUIRED_COLUMNS = {
    'faculty_ai_conversations': {'conversation_id', 'tenant_id', 'faculty_user_id',
        'title', 'prompt_type', 'token_usage', 'created_at', 'updated_at', 'deleted_at'},
    'faculty_ai_messages': {'message_id', 'tenant_id', 'conversation_id', 'role',
        'content', 'prompt_type', 'token_usage', 'attachments', 'created_at', 'deleted_at'},
    'finance_receipt_versions': {'version_id', 'tenant_id', 'transaction_id',
        'receipt_number', 'receipt_url', 'sha256', 'source', 'actor_user_id', 'created_at'},
}
REQUIRED_INDEXES = {'idx_faculty_ai_conversations_owner',
    'idx_faculty_ai_messages_thread', 'idx_finance_receipt_versions_transaction'}
RESTORE_CHECKS = ('external_side_effects_disabled', 'database_restored',
    'snapshot_record_counts_verified', 'documents_verified', 'encrypted_fields_verified',
    'restricted_runtime_workflows_verified')


def keys(record, allowed):
    preflight.require(isinstance(record, dict) and set(record) <= set(allowed),
                      'Evidence contains missing structure or non-whitelisted fields')


def stamp(value, now):
    try:
        observed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        preflight.require(observed.tzinfo is not None and
                          observed <= now + dt.timedelta(seconds=30),
                          'Restore timestamp needs a timezone and cannot be future dated')
    except (AttributeError, TypeError, ValueError) as error:
        raise preflight.Refused('Invalid isolated restore timestamp') from error


def minimized_inspection(record):
    keys(record, {'observed_at', 'inspect', 'image_inspect'})
    data = record.get('inspect')
    if isinstance(data, list):
        preflight.require(len(data) == 1, 'Exactly one minimized container is required')
        data = data[0]
    keys(data, {'Id', 'Image', 'Mounts', 'Config', 'State', 'HostConfig'})
    config = data.get('Config', {})
    keys(config, {'User', 'Labels'})
    if config.get('Labels') is not None:
        keys(config['Labels'], {preflight.REVISION_LABEL})
    state = data.get('State', {})
    keys(state, {'Running', 'Paused', 'Restarting', 'Health'})
    keys(state.get('Health', {}), {'Status'})
    keys(data.get('HostConfig', {}), {'ReadonlyRootfs', 'Privileged', 'CapDrop',
        'CapAdd', 'SecurityOpt', 'Tmpfs', 'Memory', 'MemorySwap', 'PidMode',
        'IpcMode', 'NetworkMode'})
    preflight.require(isinstance(data.get('Mounts'), list), 'Minimized mount metadata is required')
    for mount in data['Mounts']:
        keys(mount, {'Type', 'Source', 'Destination', 'RW', 'Name'})
    if 'image_inspect' in record:
        keys(record['image_inspect'], {'Id'})


def validate(evidence, release_sha, backend_image, frontend_image,
             require_frontend=False, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    keys(evidence, {'schema_version', 'release_sha', 'observer', 'database',
                    'restore', 'runtime', 'frontend'})
    preflight.require(evidence.get('schema_version') == 1 and
                      re.fullmatch(r'[0-9a-f]{40}', release_sha) is not None and
                      evidence.get('release_sha') == release_sha,
                      'Readiness must identify the exact intended release')
    preflight.require(preflight.IMAGE.fullmatch(backend_image) and
                      preflight.IMAGE.fullmatch(frontend_image),
                      'Registry image identities are required')
    preflight.require(isinstance(evidence.get('observer'), str) and
                      re.fullmatch(r'[A-Za-z0-9._@ -]{1,120}', evidence['observer']),
                      'A named observation collector is required; this is not an approval')

    database = evidence.get('database')
    keys(database, {'observed_at', 'database_name', 'schema_name', 'applied_migrations',
                    'migration_sources', 'columns', 'indexes', 'unique_keys'})
    preflight.fresh(database, now)
    preflight.require(database.get('database_name') == 'postgres' and
                      database.get('schema_name') == 'public',
                      'Observed schema must be the current FALCON application database')
    applied = database.get('applied_migrations')
    preflight.require(isinstance(applied, list) and all(isinstance(v, str) for v in applied) and
                      set(REQUIRED_MIGRATIONS) <= set(applied),
                      'Required migration ledger entries are absent; no migration is authorized')
    sources = database.get('migration_sources')
    keys(sources, REQUIRED_MIGRATIONS)
    for name in REQUIRED_MIGRATIONS:
        expected = hashlib.sha256((ROOT / 'backend/migrations' / name).read_bytes()).hexdigest()
        preflight.require(sources.get(name) == expected,
                          'Observed migration source differs from the intended release')
    columns = database.get('columns')
    keys(columns, REQUIRED_COLUMNS)
    for table, required in REQUIRED_COLUMNS.items():
        observed = columns.get(table)
        preflight.require(isinstance(observed, list) and all(isinstance(v, str) for v in observed) and
                          required <= set(observed), 'Required application columns are absent')
    indexes = database.get('indexes')
    preflight.require(isinstance(indexes, list) and all(isinstance(v, str) for v in indexes) and
                      REQUIRED_INDEXES <= set(indexes), 'Required application indexes are absent')
    unique = database.get('unique_keys')
    keys(unique, {'finance_receipt_versions'})
    preflight.require(['tenant_id', 'transaction_id', 'receipt_url'] in
                      unique.get('finance_receipt_versions', []),
                      'Receipt history uniqueness has not been observed')

    restore = evidence.get('restore')
    keys(restore, {'tested_at', 'candidate_revision', 'candidate_image_id',
                   'backup_manifest_sha256', 'evidence_reference', *RESTORE_CHECKS})
    stamp(restore.get('tested_at'), now)
    preflight.require(restore.get('candidate_revision') == release_sha and
                      restore.get('candidate_image_id') == backend_image,
                      'Isolated restore/workflow evidence must cover this exact backend release')
    preflight.require(all(restore.get(check) is True for check in RESTORE_CHECKS),
                      'Isolated restore or restricted-runtime workflow verification is incomplete')
    preflight.require(isinstance(restore.get('backup_manifest_sha256'), str) and
                      re.fullmatch(r'[0-9a-f]{64}', restore['backup_manifest_sha256']) and
                      isinstance(restore.get('evidence_reference'), str) and
                      re.fullmatch(r'[A-Za-z0-9/_:.-]{1,256}', restore['evidence_reference']),
                      'A protected on-server restore evidence reference and manifest hash are required')

    runtime = evidence.get('runtime')
    keys(runtime, {'baseline', 'previous_inspect', 'candidate_inspect', 'headroom'})
    baseline = runtime.get('baseline')
    keys(baseline, {'schema_version', 'container_id', 'image_id', 'revision',
                    'revision_evidence', 'persistent_mounts', 'writable_upload_targets',
                    'allowed_tmpfs_targets'})
    for mount in baseline.get('persistent_mounts', []):
        keys(mount, {'Type', 'Source', 'Destination', 'RW', 'Name'})
    minimized_inspection(runtime.get('previous_inspect'))
    minimized_inspection(runtime.get('candidate_inspect'))
    keys(runtime.get('headroom'), {'observed_at', 'available_memory_bytes',
        'free_disk_bytes', 'working_bytes'})
    preflight.validate(baseline, runtime['previous_inspect'], runtime['candidate_inspect'],
                       runtime['headroom'], backend_image, release_sha, now)

    if require_frontend:
        frontend = evidence.get('frontend')
        preflight.require(frontend is not None,
                          'Fresh exact frontend readiness is required before the backend webhook')
        minimized_inspection(frontend)
        actual = preflight.inspection(frontend, now)
        preflight.require(actual['Image'] == frontend_image and
                          (actual.get('Config', {}).get('Labels') or {}).get(preflight.REVISION_LABEL) == release_sha and
                          (frontend.get('image_inspect') or {}).get('Id') == frontend_image,
                          'Running frontend revision/image does not match the intended release')
        state = actual.get('State', {})
        preflight.require(state.get('Running') is True and state.get('Paused') is False and
                          state.get('Restarting') is False and
                          state.get('Health', {}).get('Status') == 'healthy',
                          'The exact intended frontend must already be running and healthy')
    elif 'frontend' in evidence:
        # Even unused optional fields must not smuggle a full inspection/config.
        minimized_inspection(evidence['frontend'])
    return {'result': 'operator observations accepted offline; deployment not performed',
            'release_sha': release_sha, 'frontend_observation_accepted': require_frontend}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        preflight.require(key not in result, 'Duplicate JSON evidence fields are forbidden')
        result[key] = value
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-sha', required=True)
    parser.add_argument('--backend-image', required=True)
    parser.add_argument('--frontend-image', required=True)
    parser.add_argument('--require-frontend', action='store_true')
    args = parser.parse_args()
    raw = os.environ.get('FALCON_ROLLOUT_EVIDENCE', '')
    preflight.require(raw and len(raw.encode('utf-8')) <= 256 * 1024,
                      'Minimized readiness evidence is absent or exceeds its bound')
    evidence = json.loads(raw, object_pairs_hook=unique_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(preflight.Refused('Non-finite JSON number')))
    print(json.dumps(validate(evidence, args.release_sha, args.backend_image,
                             args.frontend_image, args.require_frontend), sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, TypeError, KeyError, AttributeError) as error:
        # Never echo supplied evidence: even rejected input could contain secrets.
        print('FALCON release readiness refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
