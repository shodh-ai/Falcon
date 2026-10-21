import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import dump_counts

SHA = 'a' * 64
PREAMBLE = (b'--\n-- PostgreSQL database dump\n--\n\n'
            b'SET client_encoding = \'UTF8\';\n'
            b'SET standard_conforming_strings = on;\n')
END = b'\n--\n-- PostgreSQL database dump complete\n--\n\n'


def script(data=b'', restrict=False):
    if restrict:
        return (PREAMBLE.replace(b'SET client_encoding', b'\\restrict SafeKey123\nSET client_encoding', 1)
                + data + END + b'\\unrestrict SafeKey123\n')
    return PREAMBLE + data + END


def parse(data=b'', **limits):
    return dump_counts.parse_copy_stream(io.BytesIO(script(data)), SHA, **limits)


class DumpCountsTests(unittest.TestCase):
    def test_empty_database_and_empty_physical_table(self):
        empty = parse()
        self.assertEqual(empty['tables'], [])
        self.assertEqual(empty['total_rows'], 0)
        table = parse(b'COPY public.empty (id, payload) FROM stdin;\n\\.\n')
        self.assertEqual(table['tables'], [{'schema': 'public', 'table': 'empty', 'rows': 0}])

    def test_escaped_newlines_tabs_nulls_and_literal_end_marker_are_rows(self):
        data = (b'COPY public.events (a, b) FROM stdin;\n'
                b'first\\nsecond\t\\N\n'
                b'\\\\.\tliteral\\tinside\n'
                b'\\141\\x42\t\\b\\f\\r\\v\\\\\n'
                b'\t\n'
                b'\\.\n')
        result = parse(data)
        self.assertEqual(result['tables'][0]['rows'], 4)
        self.assertEqual(result['copy_sections'], 1)

    def test_comment_like_values_and_escaped_restrict_do_not_change_framing(self):
        result = parse(b'COPY public.t (value) FROM stdin;\n'
                       b'-- PostgreSQL database dump complete\n'
                       b'\\\\unrestrict notaframeworkkey\n\\.\n')
        self.assertEqual(result['total_rows'], 2)

    def test_pg18_markers_and_full_fixed_preamble(self):
        settings = b'\n'.join(sorted(dump_counts.FIXED_STATEMENTS)) + b'\n'
        result = dump_counts.parse_copy_stream(io.BytesIO(script(settings, restrict=True)), SHA)
        self.assertEqual(result['total_rows'], 0)
        self.assertEqual(result['dump_sha256'], SHA)

    def test_quoted_schema_table_columns_unicode_and_safe_only_query(self):
        data = ('COPY "A.schema"."T""x;select 1;--" ("column,one", "c""two") FROM stdin;\n'
                'α\tβ\n\\.\n').encode('utf-8')
        result = parse(data)
        self.assertEqual(result['tables'], [{'schema': 'A.schema', 'table': 'T"x;select 1;--', 'rows': 1}])
        self.assertEqual(dump_counts.count_queries(result)[0]['sql'],
                         'SELECT count(*) FROM ONLY "A.schema"."T""x;select 1;--";')
        unicode_name = parse('COPY public."तาราง" (id) FROM stdin;\n1\n\\.\n'.encode())
        self.assertEqual(unicode_name['tables'][0]['table'], 'तาราง')

    def test_zero_column_tables_count_empty_physical_lines(self):
        result = parse(b'COPY public.no_columns FROM stdin;\n\n\n\\.\n')
        self.assertEqual(result['tables'][0]['rows'], 2)
        with self.assertRaises(dump_counts.CountParseError):
            parse(b'COPY public.no_columns FROM stdin;\nnonempty\n\\.\n')

    def test_repeated_sections_aggregate_and_partition_children_stay_separate(self):
        result = parse(b'COPY public.events_2025 (id) FROM stdin;\n1\n2\n\\.\n'
                       b'COPY public.events_2026 (id) FROM stdin;\n\\.\n'
                       b'COPY public.events_2025 (id) FROM stdin;\n3\n\\.\n')
        self.assertEqual(result['tables'], [
            {'schema': 'public', 'table': 'events_2025', 'rows': 3},
            {'schema': 'public', 'table': 'events_2026', 'rows': 0}])
        self.assertEqual(result['copy_sections'], 3)
        self.assertIn('partition roots need separate inventory', result['semantics'])
        self.assertTrue(all('FROM ONLY ' in item['sql'] for item in dump_counts.count_queries(result)))

    def test_sequence_setval_with_quoted_literals_is_not_a_row(self):
        result = parse(b"SELECT pg_catalog.setval('public.\"a''b\"', 123, true);\n"
                       b"SELECT pg_catalog.setval(E'public.\"back\\\\slash\"', -1, false);\n")
        self.assertEqual(result['total_rows'], 0)
        self.assertEqual(result['tables'], [])

    def test_insert_large_object_and_custom_sql_fail_without_echoing_contents(self):
        secret = 'SYNTHETIC_SENSITIVE_ROW_DO_NOT_ECHO'
        statements = [f"INSERT INTO public.t VALUES ('{secret}');\n",
                      f"SELECT pg_catalog.lo_create('{secret}');\n",
                      f"SELECT pg_catalog.lowrite(1, '{secret}');\n",
                      'ALTER TABLE public.t DISABLE TRIGGER ALL;\n',
                      'COPY public.t (id) FROM stdin WITH (FORMAT csv);\n',
                      "SELECT pg_catalog.setval('x', 1, true); INSERT INTO t VALUES (1);\n"]
        for statement in statements:
            with self.subTest(kind=statement.split(' ', 1)[0]):
                with self.assertRaises(dump_counts.CountParseError) as raised:
                    parse(statement.encode())
                self.assertNotIn(secret, str(raised.exception))

    def test_truncated_sections_dump_lines_and_restriction_pairs_fail(self):
        streams = [PREAMBLE + b'COPY public.t (id) FROM stdin;\n1\n',
                   PREAMBLE + b'COPY public.t (id) FROM stdin;\n1\n\\.\n',
                   script(b'COPY public.t (id) FROM stdin;\n1\n\\.\n').rstrip(b'\n'),
                   script(restrict=True).replace(b'\\unrestrict SafeKey123\n', b''),
                   script(restrict=True).replace(b'\\unrestrict SafeKey123', b'\\unrestrict WrongKey'),
                   script() + b'SELECT 1;\n', script() + script(),
                   b'COPY public.t (id) FROM stdin;\n1\n\\.\n' + END]
        for index, stream in enumerate(streams):
            with self.subTest(case=index), self.assertRaises(dump_counts.CountParseError):
                dump_counts.parse_copy_stream(io.BytesIO(stream), SHA)

    def test_malformed_copy_rows_and_identifiers_fail_closed(self):
        for row in (b'1\n', b'1\t2\t3\n', b'1\t\\Nextra\n', b'1\ttrailing\\\n',
                    b'1\t\\xGG\n', b'1\t\\Q\n', b'1\tbad\x00data\n', b'1\tbad\rdata\n'):
            with self.subTest(row_length=len(row)), self.assertRaises(dump_counts.CountParseError):
                parse(b'COPY public.t (a, b) FROM stdin;\n' + row + b'\\.\n')
        for header in (b'COPY t (id) FROM stdin;', b'COPY public.t (id, id) FROM stdin;',
                       b'COPY public."unterminated (id) FROM stdin;',
                       b'COPY public."" (id) FROM stdin;', b'COPY public.t () FROM stdin;',
                       b'COPY public.t (id) FROM program \'anything\';'):
            with self.subTest(header_length=len(header)), self.assertRaises(dump_counts.CountParseError):
                parse(header + b'\n\\.\n')

    def test_stream_line_table_section_column_and_row_bounds(self):
        one = b'COPY public.t (a, b) FROM stdin;\n1\t2\n\\.\n'
        cases = [(one, {'max_stream_bytes': 10}), (one, {'max_line_bytes': 10}),
                 (one, {'max_columns': 1}),
                 (one + one, {'max_rows': 1}), (one + one, {'max_sections': 1}),
                 (one + one.replace(b'public.t ', b'public.other '), {'max_tables': 1})]
        for data, limits in cases:
            with self.subTest(limit=next(iter(limits))), self.assertRaises(dump_counts.CountParseError):
                parse(data, **limits)
        for invalid in (0, -1, True, 1.5):
            with self.assertRaises(dump_counts.CountParseError):
                parse(max_rows=invalid)

    def test_bounded_reads_and_callback_without_row_materialization(self):
        class Observed(io.BytesIO):
            requests = []
            def readline(self, size=-1):
                self.requests.append(size)
                return super().readline(size)
        stream = Observed(script(b'COPY public.t (value) FROM stdin;\n' + b'row\n' * 5000 + b'\\.\n'))
        callbacks = []
        result = dump_counts.parse_copy_stream(stream, SHA, max_line_bytes=256,
                                              check=lambda: callbacks.append(True))
        self.assertEqual(result['total_rows'], 5000)
        self.assertTrue(all(size == 258 for size in stream.requests))
        self.assertGreater(len(callbacks), 5000)

    def test_metadata_binds_exact_stream_digest_and_never_contains_row_values(self):
        sensitive = b'SYNTHETIC_SENSITIVE_ROW_DO_NOT_ECHO'
        source = script(b'COPY public.t (value) FROM stdin;\n' + sensitive + b'\n\\.\n')
        result = dump_counts.parse_copy_stream(io.BytesIO(source), SHA)
        self.assertEqual(result['dump_sha256'], SHA)
        self.assertEqual(result['sql_stream_sha256'], hashlib.sha256(source).hexdigest())
        self.assertEqual(result['stream_bytes'], len(source))
        self.assertNotIn(sensitive.decode(), json.dumps(result))

    def test_count_query_metadata_is_validated_and_quoted(self):
        result = parse(b'COPY public.t (id) FROM stdin;\n\\.\n')
        for name in ('bad\x00name', 'bad\nname', 'x' * 64):
            with self.assertRaises(dump_counts.CountParseError):
                dump_counts.quote_identifier(name)
        result['tables'].append(dict(result['tables'][0]))
        with self.assertRaises(dump_counts.CountParseError): dump_counts.count_queries(result)
        for bad_sha in ('', 'A' * 64, 'a' * 63, 'a' * 64 + '\n'):
            with self.assertRaises(dump_counts.CountParseError):
                dump_counts.parse_copy_stream(io.BytesIO(script()), bad_sha)
        with self.assertRaises(dump_counts.CountParseError):
            dump_counts.parse_copy_stream(io.StringIO(script().decode()), SHA)

    def test_cli_refusal_never_echoes_input_and_emits_no_partial_json(self):
        source = script(b"INSERT INTO public.t VALUES ('SYNTHETIC_PRIVATE_VALUE');\n")
        process = subprocess.run([sys.executable, '-B', str(ROOT / 'dump_counts.py'),
                                  '--dump-sha256', SHA], input=source,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(process.stdout, b'')
        self.assertNotIn(b'SYNTHETIC_PRIVATE_VALUE', process.stderr)


if __name__ == '__main__':
    unittest.main()
