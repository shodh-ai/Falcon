import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
root=Path(__file__).parents[1];sys.path.insert(0,str(root))
import watchdog
import host
import maintenance

class MonitorTests(unittest.TestCase):
    def test_guard_failure_stops_only_staging_work_and_records_it(self):
        class Fake:
            def guard(self):raise RuntimeError('MEMORY')
            def audit(self,event):self.event=event
        target=Fake()
        with patch.object(watchdog,'stop_staging') as stop:
            with self.assertRaises(RuntimeError):watchdog.check(target)
            stop.assert_called_once_with(target)
        self.assertTrue(target.event['data_preserved'])
    def test_older_successful_workflow_cannot_replace_newer_release(self):
        target=host.Host.__new__(host.Host);target.state={'last_run_number':25}
        with self.assertRaisesRegex(RuntimeError,'SUPERSEDED'):target.authorize_run({'run_number':'24'})
        target.authorize_run({'run_number':'26'});self.assertEqual(target.run_number,26)

class MaintenanceTests(unittest.TestCase):
    def manifest(self):return {'version':1,'postgres_id':'a'*64,'database':'falcon_staging',
        'storage':'/data/falcon-staging/postgres','migrations':[{'filename':'20261030_schema.sql','sha256':'b'*64}]}
    def test_production_targets_and_paths_are_refused(self):
        for patch_value in [{'database':'university_governance'},{'storage':'/data/coolify'},
            {'postgres_id':'c'*64},{'migrations':[{'filename':'historical_seed.sql','sha256':'b'*64}]}]:
            with self.assertRaises(RuntimeError):maintenance.validate_manifest({**self.manifest(),**patch_value},{'c'*64})
    def test_sql_transaction_escapes_and_shell_meta_commands_refused(self):
        for sql in ['COMMIT;','SELECT 1;COMMIT;','\\! whoami','BEGIN;','ROLLBACK;']:
            with self.assertRaises(RuntimeError):maintenance.reviewed_sql(sql,'reviewed.sql')
    def test_reviewed_staging_scope_allowed(self):
        self.assertEqual(len(maintenance.validate_manifest(self.manifest(),{'c'*64})),1)

if __name__=='__main__':unittest.main()
