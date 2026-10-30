import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('bootstrap',Path(__file__).resolve().parents[1]/'bootstrap.py')
bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)

class SchemaImportTests(unittest.TestCase):
    def test_only_existing_public_declaration_changes(self):
        original='-- schema only\nCREATE SCHEMA public;\nCREATE TABLE public.example(id integer);\n'
        self.assertEqual(bootstrap.reviewed_schema(original),original.replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;'))
    def test_ambiguous_or_missing_declaration_refused(self):
        for text in ['CREATE SCHEMA other;', 'CREATE SCHEMA public;\nCREATE SCHEMA public;']:
            with self.assertRaisesRegex(RuntimeError,'STAGING_PUBLIC_SCHEMA_DECLARATION'):bootstrap.reviewed_schema(text)

if __name__=='__main__':unittest.main()
