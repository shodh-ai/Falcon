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


def toc(entries=b'', count=None):
    if count is None:
        # PG18 --list does not print the three special archive entries.
        count = 3 + len(entries.splitlines())
    return (b';\n; Archive created at synthetic\n;     TOC Entries: ' + str(count).encode() +
            b'\n;     Compression: gzip\n;     Dump Version: 1.16-0\n;     Format: CUSTOM\n'
            b';     Integer: 4 bytes\n;     Offset: 8 bytes\n'
            b';     Dumped from database version: 18.4\n'
            b';     Dumped by pg_dump version: 18.4 (synthetic)\n'
            b';\n;\n; Selected TOC Entries:\n;\n' + entries)


VIEW = b'10; 1259 12345 MATERIALIZED VIEW public summary postgres\n'
REFRESH = b'20; 0 12345 MATERIALIZED VIEW DATA public summary postgres\n'


class MaterializedTocTests(unittest.TestCase):
    def parse(self, entries=b'', **limits):
        return dump_counts.parse_materialized_toc(io.BytesIO(toc(entries)), SHA, **limits)

    def test_empty_and_paired_view_bind_exact_dump_and_toc(self):
        self.assertEqual(self.parse()['materialized_views'], [])
        source = toc(VIEW + REFRESH)
        result = dump_counts.parse_materialized_toc(io.BytesIO(source), SHA)
        self.assertEqual(result['dump_sha256'], SHA)
        self.assertEqual(result['toc_stream_sha256'], hashlib.sha256(source).hexdigest())
        self.assertEqual(result['stream_bytes'], len(source))
        self.assertEqual(result['toc_entries'], 2)
        self.assertEqual(result['archive_toc_entries'], 5)
        self.assertEqual(result['materialized_views'], [
            {'schema': 'public', 'table': 'summary', 'object_oid': 12345,
             'definition_toc_id': 10, 'data_toc_id': 20, 'refresh_intended': True}])
        self.assertIn('no copied cached-row counts', result['semantics'])

    def test_schemas_sorted_and_data_before_definition_supported(self):
        other = (VIEW.replace(b'10;', b'11;').replace(b'12345', b'12346').replace(b'public', b'other') +
                 REFRESH.replace(b'20;', b'21;').replace(b'12345', b'12346').replace(b'public', b'other'))
        result = self.parse(REFRESH + VIEW + other)
        self.assertEqual([item['schema'] for item in result['materialized_views']], ['other', 'public'])

    def test_other_record_types_are_not_misclassified_or_reported(self):
        private = b'SYNTHETIC_PRIVATE_VALUE'
        ignored = (b'30; 1259 20000 TABLE public physical postgres\n'
                   b'31; 0 0 COMMENT public MATERIALIZED VIEW summary postgres\n'
                   b'32; 0 0 ACL public MATERIALIZED VIEW summary postgres\n'
                   b'33; 0 0 COMMENT public ' + private + b' postgres\n')
        result = self.parse(VIEW + ignored + REFRESH)
        self.assertEqual(len(result['materialized_views']), 1)
        self.assertEqual(result['toc_entries'], 6)
        self.assertNotIn(private.decode(), json.dumps(result))
        self.assertNotIn('postgres', json.dumps(result))

    def test_unpaired_definition_or_refresh_stays_unsupported(self):
        for entries in (VIEW, REFRESH, VIEW + REFRESH.replace(b'summary', b'different')):
            with self.subTest(length=len(entries)), self.assertRaises(dump_counts.CountParseError):
                self.parse(entries)

    def test_duplicate_records_ids_and_object_oids_fail(self):
        duplicate_definition = VIEW.replace(b'10;', b'11;')
        duplicate_data = REFRESH.replace(b'20;', b'21;')
        same_object_other_name = VIEW.replace(b'10;', b'11;').replace(b'summary', b'other')
        for entries in (VIEW + REFRESH + duplicate_definition,
                        VIEW + REFRESH + duplicate_data,
                        VIEW + REFRESH + same_object_other_name,
                        VIEW + REFRESH + b'10; 0 0 COMMENT public ignored postgres\n'):
            with self.subTest(length=len(entries)), self.assertRaises(dump_counts.CountParseError):
                self.parse(entries)

    def test_pair_oid_owner_and_catalog_class_must_match(self):
        for entries in (VIEW + REFRESH.replace(b'12345', b'12346'),
                        VIEW + REFRESH.replace(b'postgres', b'different_owner'),
                        VIEW.replace(b'1259', b'0') + REFRESH,
                        VIEW + REFRESH.replace(b'20; 0', b'20; 1259'),
                        VIEW.replace(b'12345', b'0') + REFRESH.replace(b'12345', b'0')):
            with self.subTest(length=len(entries)), self.assertRaises(dump_counts.CountParseError):
                self.parse(entries)

    def test_quoted_unicode_ambiguous_or_unsafe_identifiers_fail_without_echo(self):
        for name in (b'"summary"', b'two words', b'name.with.dot', b'synthetic;DROP',
                     b'x' * 64, b'SYNTHETIC_PRIVATE_VALUE\\evil', 'तาราง'.encode()):
            entries = (VIEW + REFRESH).replace(b'summary', name)
            with self.subTest(length=len(name)):
                with self.assertRaises(dump_counts.CountParseError) as raised:
                    self.parse(entries)
                self.assertNotIn(name.decode('utf-8'), str(raised.exception))

    def test_malformed_materialized_records_and_numeric_headers_fail(self):
        malformed = [b'10; 1259 12345 MATERIALIZED\n',
                     b'10; 1259 12345 materialized view public summary postgres\n',
                     b'10; 1259 12345 MATERIALIZED VIEW DATA EXTRA public summary postgres\n',
                     b'10; 1259 12345 MATERIALIZED_VIEW public summary postgres\n',
                     b'10; x 12345 MATERIALIZED VIEW public summary postgres\n',
                     b'10; 1259 4294967296 MATERIALIZED VIEW public summary postgres\n',
                     b'2147483648; 1259 12345 MATERIALIZED VIEW public summary postgres\n']
        for entries in malformed:
            with self.subTest(length=len(entries)), self.assertRaises(dump_counts.CountParseError):
                self.parse(entries)

    def test_framing_control_characters_and_truncated_physical_lines_fail(self):
        valid = toc(VIEW + REFRESH)
        streams = [valid.rstrip(b'\n'), VIEW + REFRESH,
                   valid.replace(b'Format: CUSTOM', b'Format: DIRECTORY'),
                   valid.replace(b'Dumped by pg_dump version: 18.4', b'Dumped by pg_dump version: 19.0'),
                   valid.replace(b'; Selected TOC Entries:\n', b''),
                   valid.replace(b'public summary', b'public sum\0mary'),
                   valid.replace(b'public summary', b'public sum\rmary'),
                   valid + b'; 30; 1259 67890 MATERIALIZED VIEW public hidden postgres\n',
                   valid + b'; Selected TOC Entries:\n',
                   toc(VIEW + REFRESH, count=1)]
        for index, source in enumerate(streams):
            with self.subTest(case=index), self.assertRaises(dump_counts.CountParseError):
                dump_counts.parse_materialized_toc(io.BytesIO(source), SHA)

    def test_stream_line_entry_view_limits_and_binary_input(self):
        second = (VIEW.replace(b'10;', b'11;').replace(b'12345', b'12346').replace(b'summary', b'other') +
                  REFRESH.replace(b'20;', b'21;').replace(b'12345', b'12346').replace(b'summary', b'other'))
        for limits in ({'max_stream_bytes': 10}, {'max_line_bytes': 10},
                       {'max_entries': 4}, {'max_views': 1}):
            with self.subTest(limit=next(iter(limits))), self.assertRaises(dump_counts.CountParseError):
                self.parse(VIEW + REFRESH + second, **limits)
        for invalid in (0, -1, True, 1.5):
            with self.assertRaises(dump_counts.CountParseError): self.parse(max_views=invalid)
        for invalid in ('', 'A' * 64, 'a' * 63, 'a' * 64 + '\n'):
            with self.assertRaises(dump_counts.CountParseError):
                dump_counts.parse_materialized_toc(io.BytesIO(toc()), invalid)
        with self.assertRaises(dump_counts.CountParseError):
            dump_counts.parse_materialized_toc(io.StringIO(toc().decode()), SHA)

    def test_read_size_and_monitor_callback_are_bounded(self):
        class Observed(io.BytesIO):
            requests = []
            def readline(self, size=-1):
                self.requests.append(size)
                return super().readline(size)
        source = toc(VIEW + REFRESH)
        stream = Observed(source)
        callbacks = []
        dump_counts.parse_materialized_toc(stream, SHA, max_line_bytes=256,
                                          check=lambda: callbacks.append(True))
        self.assertTrue(all(size == 258 for size in stream.requests))
        self.assertEqual(len(callbacks), len(source.splitlines()) + 1)


if __name__ == '__main__':
    unittest.main()
