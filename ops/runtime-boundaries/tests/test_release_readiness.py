import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import preflight
import release_readiness
import test_preflight as fixtures


class ReleaseReadinessTests(unittest.TestCase):
    """Synthetic observations only; never a deployable readiness artifact."""

    def setUp(self):
        fixture = fixtures.PreflightTests()
        fixture.setUp()
        self.now = fixture.now
        self.revision = fixture.revision
        self.backend_image = fixture.image
        self.frontend_image = 'sha256:' + '9' * 64
        frontend = copy.deepcopy(fixture.previous)
        frontend['inspect'][0]['Image'] = self.frontend_image
        frontend['inspect'][0]['Config']['Labels'] = {preflight.REVISION_LABEL: self.revision}
        frontend['image_inspect']['Id'] = self.frontend_image
        self.evidence = {
            'schema_version': 1, 'release_sha': self.revision, 'observer': 'synthetic-test-collector',
            'database': {'observed_at': self.now.isoformat(),
                'database_name': 'postgres', 'schema_name': 'public',
                'applied_migrations': list(release_readiness.REQUIRED_MIGRATIONS),
                'migration_sources': {name: hashlib.sha256((release_readiness.ROOT /
                    'backend/migrations' / name).read_bytes()).hexdigest()
                    for name in release_readiness.REQUIRED_MIGRATIONS},
                'columns': {table: sorted(columns) for table, columns in release_readiness.REQUIRED_COLUMNS.items()},
                'indexes': sorted(release_readiness.REQUIRED_INDEXES),
                'unique_keys': {'finance_receipt_versions': [['tenant_id', 'transaction_id', 'receipt_url']]}},
            'restore': {'tested_at': self.now.isoformat(), 'candidate_revision': self.revision,
                'candidate_image_id': self.backend_image, 'backup_manifest_sha256': '1' * 64,
                'evidence_reference': 'SYNTHETIC-TEST-ONLY:not-production',
                **{check: True for check in release_readiness.RESTORE_CHECKS}},
            'runtime': {'baseline': fixture.baseline, 'previous_inspect': fixture.previous,
                'candidate_inspect': fixture.candidate, 'headroom': fixture.headroom},
            'frontend': frontend,
        }

    def check(self, require_frontend=True):
        return release_readiness.validate(self.evidence, self.revision, self.backend_image,
                                         self.frontend_image, require_frontend, self.now)

    def test_accepts_only_complete_observations_without_mutating_or_collecting_them(self):
        original = copy.deepcopy(self.evidence)
        self.assertTrue(self.check()['frontend_observation_accepted'])
        self.assertIn('deployment not performed', self.check()['result'])
        self.assertEqual(original, self.evidence)

    def test_missing_or_wrong_release_observations_fail_closed(self):
        for field in ('database', 'restore', 'runtime', 'observer'):
            original = self.evidence.pop(field)
            with self.subTest(field=field), self.assertRaises(preflight.Refused):
                self.check()
            self.evidence[field] = original
        self.evidence['release_sha'] = 'c' * 40
        with self.assertRaises(preflight.Refused): self.check()

    def test_missing_ledger_columns_indexes_and_unique_key_refused(self):
        original = copy.deepcopy(self.evidence['database'])
        for change in ('ledger', 'columns', 'index', 'unique', 'source', 'database'):
            self.evidence['database'] = copy.deepcopy(original)
            database = self.evidence['database']
            if change == 'ledger': database['applied_migrations'].pop()
            elif change == 'columns': database['columns']['finance_receipt_versions'].remove('receipt_url')
            elif change == 'index': database['indexes'].pop()
            elif change == 'unique': database['unique_keys']['finance_receipt_versions'] = []
            elif change == 'source': database['migration_sources'][release_readiness.REQUIRED_MIGRATIONS[0]] = '0' * 64
            else: database['database_name'] = 'another_database'
            with self.subTest(change=change), self.assertRaises(preflight.Refused): self.check()

    def test_restore_checks_must_be_true_and_for_this_exact_candidate(self):
        for check in release_readiness.RESTORE_CHECKS:
            self.evidence['restore'][check] = 'true'
            with self.subTest(check=check), self.assertRaises(preflight.Refused): self.check()
            self.evidence['restore'][check] = True
        self.evidence['restore']['candidate_image_id'] = 'sha256:' + '0' * 64
        with self.assertRaises(preflight.Refused): self.check()

    def test_alternate_nearly_empty_database_cannot_satisfy_live_business_schema_gate(self):
        self.evidence['database']['database_name'] = 'university_governance'
        with self.assertRaises(preflight.Refused): self.check()

    def test_relation_inventory_alone_cannot_satisfy_snapshot_record_comparison(self):
        self.evidence['restore'].pop('snapshot_record_counts_verified')
        with self.assertRaises(preflight.Refused): self.check()
        self.evidence['restore']['snapshot_record_counts_verified'] = False
        with self.assertRaises(preflight.Refused): self.check()

    def test_real_runtime_validator_is_repeated_instead_of_trusting_passed_boolean(self):
        self.evidence['runtime']['candidate_inspect']['inspect'][0]['HostConfig']['ReadonlyRootfs'] = False
        with self.assertRaises(preflight.Refused): self.check()

    def test_schema_and_runtime_observations_expire_before_any_webhook(self):
        old = (self.now - preflight.dt.timedelta(minutes=6)).isoformat()
        for record in (self.evidence['database'], self.evidence['runtime']['headroom']):
            original = record['observed_at']
            record['observed_at'] = old
            with self.assertRaises(preflight.Refused): self.check()
            record['observed_at'] = original

    def test_frontend_is_optional_for_staging_but_mandatory_for_backend(self):
        self.evidence.pop('frontend')
        self.assertFalse(self.check(require_frontend=False)['frontend_observation_accepted'])
        with self.assertRaises(preflight.Refused): self.check()

    def test_previous_frontend_http_health_cannot_replace_exact_revision_and_image(self):
        original = copy.deepcopy(self.evidence['frontend'])
        for change in ('image', 'revision', 'healthy', 'running', 'paused', 'restarting', 'freshness', 'image_inspect'):
            self.evidence['frontend'] = copy.deepcopy(original)
            frontend = self.evidence['frontend']
            container = frontend['inspect'][0]
            if change == 'image': container['Image'] = 'sha256:' + '0' * 64
            elif change == 'revision': container['Config']['Labels'][preflight.REVISION_LABEL] = '0' * 40
            elif change == 'healthy': container['State']['Health']['Status'] = 'starting'
            elif change == 'running': container['State']['Running'] = False
            elif change == 'paused': container['State']['Paused'] = True
            elif change == 'restarting': container['State']['Restarting'] = True
            elif change == 'freshness': frontend['observed_at'] = (self.now - preflight.dt.timedelta(minutes=6)).isoformat()
            else: frontend.pop('image_inspect')
            with self.subTest(change=change), self.assertRaises(preflight.Refused): self.check()

    def test_full_inspect_environments_private_configs_and_business_rows_are_not_allowed(self):
        for container in (self.evidence['frontend']['inspect'][0],
                          self.evidence['runtime']['previous_inspect']['inspect'][0]):
            container['Config']['Env'] = ['SYNTHETIC-NOT-A-SECRET']
            with self.assertRaises(preflight.Refused): self.check(require_frontend=False)
            container['Config'].pop('Env')
            container['DockerVersion'] = 'not-minimized'
            with self.assertRaises(preflight.Refused): self.check()
            container.pop('DockerVersion')
        self.evidence['database']['business_rows'] = []
        with self.assertRaises(preflight.Refused): self.check()

    def test_duplicate_fields_and_missing_cli_input_refused_without_echoing_evidence(self):
        with self.assertRaises(preflight.Refused):
            json.loads('{"field":1,"field":2}', object_pairs_hook=release_readiness.unique_object)
        environment = os.environ.copy()
        environment.pop('FALCON_ROLLOUT_EVIDENCE', None)
        process = subprocess.run([sys.executable, '-B', str(Path(release_readiness.__file__)),
            '--release-sha', self.revision, '--backend-image', self.backend_image,
            '--frontend-image', self.frontend_image], env=environment, text=True, capture_output=True)
        self.assertEqual(process.returncode, 1)
        self.assertEqual(process.stdout, '')
        self.assertIn('evidence is absent', process.stderr)


if __name__ == '__main__':
    unittest.main()
