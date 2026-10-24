"""Synthetic SQL/source catalog tests; no server or production data access."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[1] / 'build-document-seed-catalog.py'
SPEC = importlib.util.spec_from_file_location('document_seed_catalog', SOURCE)
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
REVISION = 'a' * 40


class DocumentSeedCatalogTests(unittest.TestCase):
    def test_sql_literal_escaping_and_comments(self):
        sql = """-- '/uploads/comment.pdf'
        INSERT INTO synthetic(file_path) VALUES ('/uploads/it''s-an-original.pdf');
        /* nested /* '/uploads/comment2.pdf' */ '/uploads/comment3.pdf' */
        SELECT "/uploads/identifier.pdf", 'ordinary business text', 'document.pdf';
        """
        self.assertEqual(m.references_from_sql(sql), [("/uploads/it's-an-original.pdf", 2)])

    def test_anonymous_do_body_and_dollar_data(self):
        sql = """DO $body$
        BEGIN INSERT INTO synthetic VALUES ('/uploads/do-seed.pdf'); END;
        $body$; SELECT $$ business '/uploads/not-a-sql-literal.pdf' $$;"""
        self.assertEqual(m.references_from_sql(sql), [('/uploads/do-seed.pdf', 2)])

    def test_dynamic_concatenation_is_not_a_complete_reference(self):
        sql = """SELECT '/uploads/not-complete.pdf' || suffix,
        prefix || '/uploads/also-not-complete.pdf',
        ('/uploads/cast.pdf'::text) || value,
        concat('/uploads/concat.pdf', suffix),
        format('/uploads/format.pdf', suffix),
        concat_ws('/', '/uploads/parts.pdf', suffix),
        '/uploads/whole.pdf';"""
        self.assertEqual(m.references_from_sql(sql), [('/uploads/whole.pdf', 7)])

    def test_qualified_casts_cast_calls_and_adjacent_literals_are_not_inferred(self):
        sql = """SELECT '/uploads/qualified.pdf'::pg_catalog.text || suffix,
        prefix || CAST('/uploads/cast.pdf' AS text),
        '/uploads/adjacent.pdf'
        'suffix', '/uploads/whole.pdf';"""
        self.assertEqual(m.references_from_sql(sql), [('/uploads/whole.pdf', 4)])

    def test_reference_accepts_exact_local_routes_and_safe_external_fixtures(self):
        values = ['/uploads/tenant/original', 'uploads/tenant/file.png', './uploads/tenant/file.pdf',
                  '/smoke/fixture.pdf', '/policies/example.pdf', '/documents/example.pdf',
                  '/api/admin/registrar-desk/certificates/test/pdf', 'tenant/course-materials/file.pdf',
                  'https://example.com/evidence/file.pdf', 'http://example.com:8080/evidence/file.jpg']
        for value in values:
            with self.subTest(value=value):
                self.assertTrue(m.safe_reference(value))

    def test_reference_rejects_controls_traversal_queries_and_credentials(self):
        values = ['/uploads/../file.pdf', '/uploads/./file.pdf', '/uploads//file.pdf',
                  '/uploads/a\x00.pdf', '/uploads/a\n.pdf', '/uploads/a\x85.pdf', '/uploads/a\u200b.pdf',
                  '/uploads/file.pdf?token=secret', '/uploads/file.pdf#anchor', '/uploads/%2e%2e/file.pdf',
                  '/uploads/a\\file.pdf', '/uploads/', '/uploads/a /file.pdf',
                  'https://user:password@example.com/file.pdf', 'https://example.com/file.pdf?',
                  'https://example.com/file.pdf#', 'https://example.com:99999/file.pdf',
                  'file:///uploads/file.pdf', 's3://bucket/file.pdf', 'data:application/pdf;base64,AAAA',
                  ' /uploads/file.pdf', 'file.pdf', 'business text about file.pdf']
        for value in values:
            with self.subTest(value=repr(value)):
                self.assertFalse(m.safe_reference(value))

    def test_escape_strings_with_backslashes_are_never_guessed(self):
        sql = r"SELECT E'/uploads/it\'s.pdf', E'/uploads/plain.pdf', '/uploads/it''s.pdf';"
        self.assertEqual(m.references_from_sql(sql), [('/uploads/plain.pdf', 1), ("/uploads/it's.pdf", 1)])

    def test_unterminated_sql_is_refused(self):
        for sql in ["SELECT '/uploads/file.pdf", '/* no closing comment', 'SELECT "unclosed', 'DO $$ unclosed']:
            with self.subTest(sql=sql), self.assertRaises(m.CatalogError):
                m.references_from_sql(sql)

    def test_catalog_groups_exact_duplicate_literals_with_source_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / 'backend/migrations'
            migrations.mkdir(parents=True)
            (migrations / '1_seed.sql').write_text("SELECT '/uploads/exact.pdf';\nSELECT '/uploads/exact.pdf';\n", encoding='utf-8')
            (migrations / '2_seed.sql').write_text("SELECT '/uploads/exact.pdf', '/documents/other.pdf';", encoding='utf-8')
            catalog = m.build_catalog(root, REVISION)
            self.assertEqual(catalog['schema_version'], 1)
            self.assertEqual(catalog['source_revision'], REVISION)
            self.assertEqual(catalog['match_label'], 'matches_repository_seed_literal')
            self.assertEqual(catalog['entries'][1], {'reference': '/uploads/exact.pdf', 'source_files': [
                'backend/migrations/1_seed.sql:1', 'backend/migrations/1_seed.sql:2', 'backend/migrations/2_seed.sql:1']})
            self.assertEqual(json.loads(m.encode_catalog(catalog)), catalog)

    def test_revision_is_full_lowercase_sha_and_matches_head(self):
        for value in ['a' * 39, 'A' * 40, 'b' * 41, 'main', 'a' * 40 + '\n']:
            with self.subTest(value=value), self.assertRaisesRegex(m.CatalogError, 'revision-invalid'):
                m.build_catalog(Path('/nonexistent'), value)
        result = subprocess.CompletedProcess([], 0, (REVISION + '\n').encode(), b'')
        with patch.object(m.subprocess, 'run', side_effect=[result, subprocess.CompletedProcess([], 0, b'', b'')]):
            self.assertEqual(m.checked_revision(Path('/synthetic'), REVISION), REVISION)
        with patch.object(m.subprocess, 'run', return_value=result), self.assertRaisesRegex(m.CatalogError, 'revision-mismatch'):
            m.checked_revision(Path('/synthetic'), 'b' * 40)

    def test_uncommitted_source_is_refused(self):
        outputs = [subprocess.CompletedProcess([], 0, (REVISION + '\n').encode(), b''),
                   subprocess.CompletedProcess([], 0, b' M backend/migrations/example.sql\n', b'')]
        with patch.object(m.subprocess, 'run', side_effect=outputs), self.assertRaisesRegex(m.CatalogError, 'uncommitted'):
            m.checked_revision(Path('/synthetic'))

    def test_symlink_migration_is_refused_and_output_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / 'backend/migrations'
            migrations.mkdir(parents=True)
            source = root / 'private.sql'
            source.write_text("SELECT '/uploads/private.pdf';", encoding='utf-8')
            (migrations / 'seed.sql').symlink_to(source)
            with self.assertRaises(OSError):
                m.build_catalog(root, REVISION)
        with patch.object(m, 'MAX_OUTPUT', 10), self.assertRaisesRegex(m.CatalogError, 'catalog-size-limit'):
            m.encode_catalog({'schema_version': 1})


if __name__ == '__main__':
    unittest.main()
