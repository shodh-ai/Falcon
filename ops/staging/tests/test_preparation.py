import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('prepare',Path(__file__).parents[1]/'prepare.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)

class PreparationTests(unittest.TestCase):
 def test_external_schema_capabilities_require_review(self):
  for sql in ['CREATE FOREIGN TABLE x () SERVER outside','CREATE SERVER prod FOREIGN DATA WRAPPER postgres_fdw',
   'CREATE SUBSCRIPTION x CONNECTION anything','CREATE EVENT TRIGGER x ON ddl_command_end EXECUTE FUNCTION y()',
   'SELECT dblink(\'secret\')','COPY data TO PROGRAM \'anything\'']:
   self.assertRegex(sql,prepare.FORBIDDEN_SCHEMA)
 def test_normal_schema_is_not_mistaken_for_business_data(self):
  self.assertNotRegex('CREATE TABLE public.synthetic (id uuid PRIMARY KEY);',prepare.FORBIDDEN_SCHEMA)
 def test_preparation_writes_are_exclusive_and_staging_scoped(self):
  self.assertEqual(str(prepare.ROOT),'/data/falcon-staging')
  source=Path(prepare.__file__).read_text()
  self.assertIn('os.O_EXCL|os.O_NOFOLLOW',source)
  self.assertIn("'--schema-only'",source)
  self.assertIn("'--no-owner'",source)
  self.assertIn("'--no-privileges'",source)
  self.assertNotIn('pg_restore',source)
  self.assertNotIn('systemctl',source)

if __name__=='__main__':unittest.main()
