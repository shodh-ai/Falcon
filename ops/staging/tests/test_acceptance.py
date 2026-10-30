import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('acceptance',Path(__file__).parents[1]/'acceptance.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class AcceptanceTests(unittest.TestCase):
 def report(self):return {'version':1,'enabled':True,'tested_sha':'a'*40,'tested_release_id':'b'*16,
  'checks':{k:True for k in a.CHECKS},'evidence_sha256':'c'*64}
 def test_single_boolean_or_incomplete_report_never_enables_deployment(self):
  for report in [{'enabled':True},{**self.report(),'checks':{}},{**self.report(),'enabled':False}]:
   with self.assertRaises(RuntimeError):a.validate_acceptance(report)
 def test_each_unproven_category_blocks_automatic_deployment(self):
  for key in a.CHECKS:
   report=self.report();report['checks'][key]=False
   with self.assertRaises(RuntimeError):a.validate_acceptance(report)
 def test_all_categories_and_hashed_evidence_required(self):a.validate_acceptance(self.report())
if __name__=='__main__':unittest.main()
