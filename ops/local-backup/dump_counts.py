#!/usr/bin/env python3
"""Count physical COPY rows from a bounded, private pg_restore data-only pipe.

The caller must hash the immutable custom dump before/after extraction and check
pg_restore's exit status. A caller-supplied SHA is a binding label, not proof that
an arbitrary input stream came from that dump. This module neither executes SQL
nor queries a database. It never retains, logs or reports business row values.

Supported extraction: PG18 pg_restore --data-only --no-owner --no-acl --file=-.
Empty physical tables have a COPY section and produce a zero count. Partition
children are distinct physical COPY destinations; compare COUNT(*) FROM ONLY.
Partitioned parents may have no COPY section. The caller must validate their
inventory separately, and reject positive-row COPY destinations of relkind=p
(load-via-partition-root routing cannot be inferred without inspecting row data).
INSERT, large-object data, trigger commands and unknown SQL fail closed.
"""
import argparse
import hashlib
import json
import re
import sys

MIB = 1024 ** 2
GIB = 1024 ** 3
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')
UNQUOTED_RE = re.compile(rb'[a-z_\x80-\xff][a-z0-9_$\x80-\xff]*')
HEADER = b'-- PostgreSQL database dump'
COMPLETE = b'-- PostgreSQL database dump complete'
FIXED_STATEMENTS = {
    b'SET statement_timeout = 0;', b'SET lock_timeout = 0;',
    b'SET idle_in_transaction_session_timeout = 0;', b'SET transaction_timeout = 0;',
    b"SET client_encoding = 'UTF8';", b'SET standard_conforming_strings = on;',
    b"SELECT pg_catalog.set_config('search_path', '', false);",
    b'SET check_function_bodies = false;', b'SET xmloption = content;',
    b'SET client_min_messages = warning;', b'SET row_security = off;',
}


class CountParseError(ValueError):
    """A content-free failure suitable for an operator's protected error log."""


def _require(condition, message):
    if not condition:
        raise CountParseError(message)


def _identifier_value(raw):
    _require(0 < len(raw) <= 63 and not any(x < 32 or x == 127 for x in raw),
             'Unsupported or oversized SQL identifier')
    try:
        return raw.decode('utf-8', 'strict')
    except UnicodeDecodeError:
        raise CountParseError('SQL identifiers must use UTF-8') from None


def _identifier(sql, start):
    """Parse pg_restore's ordinary or doubled-quote identifier spelling."""
    if start < len(sql) and sql[start] == 34:
        result = bytearray()
        pos = start + 1
        while pos < len(sql):
            char = sql[pos]
            if char == 34:
                if pos + 1 < len(sql) and sql[pos + 1] == 34:
                    result.append(34)
                    pos += 2
                    continue
                return _identifier_value(bytes(result)), pos + 1
            result.append(char)
            _require(len(result) <= 63, 'Oversized SQL identifier')
            pos += 1
        raise CountParseError('Unterminated quoted SQL identifier')
    match = UNQUOTED_RE.match(sql, start)
    _require(match is not None, 'Unsupported SQL identifier syntax')
    return _identifier_value(match[0]), match.end()


def _space(sql, pos):
    while pos < len(sql) and sql[pos] in (32, 9):
        pos += 1
    return pos


def _copy_header(sql, max_columns):
    schema, pos = _identifier(sql, 5)
    _require(sql[pos:pos + 1] == b'.', 'COPY needs an explicit schema-qualified table')
    table, pos = _identifier(sql, pos + 1)
    pos = _space(sql, pos)
    columns = set()
    if sql[pos:pos + 1] == b'(':
        pos += 1
        while True:
            column, pos = _identifier(sql, _space(sql, pos))
            _require(column not in columns, 'Duplicate COPY column')
            columns.add(column)
            _require(len(columns) <= max_columns, 'COPY column limit exceeded')
            pos = _space(sql, pos)
            if sql[pos:pos + 1] == b')':
                pos += 1
                break
            _require(sql[pos:pos + 1] == b',', 'Invalid COPY column list')
            pos += 1
    _require(sql[_space(sql, pos):] == b'FROM stdin;',
             'Unsupported COPY source, options or statement suffix')
    return (schema, table), len(columns)


def _validate_copy_row(row, columns):
    """Count delimiters while consuming escapes, without splitting/storing fields."""
    if columns == 0:
        _require(not row, 'Nonempty row for zero-column COPY')
        return
    fields, pos, field_start = 1, 0, 0
    while pos < len(row):
        char = row[pos]
        _require(char not in (0, 10, 13), 'Unescaped COPY control character')
        if char == 9:
            fields += 1
            _require(fields <= columns, 'COPY row has too many fields')
            pos += 1
            field_start = pos
            continue
        if char != 92:
            pos += 1
            continue
        _require(pos + 1 < len(row), 'Incomplete COPY escape')
        escaped = row[pos + 1]
        if escaped == 78:  # Null is exactly \N, never a partial field.
            _require(pos == field_start and
                     (pos + 2 == len(row) or row[pos + 2] == 9), 'Invalid COPY null field')
            pos += 2
        elif escaped in b'bfnrtv\\':
            pos += 2
        elif escaped in b'01234567':
            pos += 2
            for _ in range(2):
                if pos < len(row) and row[pos] in b'01234567':
                    pos += 1
                else:
                    break
        elif escaped == 120:
            pos += 2
            start = pos
            while pos < len(row) and pos - start < 2 and row[pos] in b'0123456789abcdefABCDEF':
                pos += 1
            _require(pos > start, 'Invalid COPY hexadecimal escape')
        else:
            # PostgreSQL accepts some additional backslash forms, but pg_dump
            # does not produce them. Refuse unsupported forms rather than guess.
            raise CountParseError('Unsupported COPY escape')
    _require(fields == columns, 'COPY row has too few fields')


def _sequence_statement(sql):
    prefix = b'SELECT pg_catalog.setval('
    if not sql.startswith(prefix):
        return False
    pos = len(prefix)
    escaped = sql[pos:pos + 1] == b'E'
    pos += int(escaped)
    _require(sql[pos:pos + 1] == b"'", 'Unsupported sequence literal')
    pos += 1
    while pos < len(sql):
        char = sql[pos]
        if char == 39:
            if sql[pos:pos + 2] == b"''":
                pos += 2
                continue
            pos += 1
            break
        _require(char not in (0, 10, 13), 'Unsupported sequence literal')
        if char == 92 and escaped:
            _require(pos + 1 < len(sql), 'Incomplete sequence literal')
            pos += 2
        else:
            pos += 1
    else:
        raise CountParseError('Unterminated sequence literal')
    _require(re.fullmatch(rb', -?[0-9]{1,19}, (?:true|false)\);', sql[pos:]) is not None,
             'Unsupported sequence statement suffix')
    return True


def parse_copy_stream(binary_stream, dump_sha256, *, max_stream_bytes=8 * GIB,
                      max_line_bytes=8 * MIB, max_tables=10000, max_sections=20000,
                      max_rows=1000000000, max_columns=1600, check=None):
    """Return metadata only; read at most max_line_bytes + 2 bytes at a time.

    check, if provided, is called for every physical line and at EOF so the caller
    can enforce a deadline/resource guard. A blocking pipe still needs a caller
    timeout/process supervisor. Every error message excludes input contents.
    """
    _require(isinstance(dump_sha256, str) and SHA256_RE.fullmatch(dump_sha256),
             'A lowercase custom-dump SHA-256 is required')
    for limit in (max_stream_bytes, max_line_bytes, max_tables, max_sections, max_rows, max_columns):
        _require(type(limit) is int and limit > 0, 'Positive integer parser limits are required')
    counts = {}
    current = None
    columns = 0
    started = complete = sql_started = False
    restrict_key = None
    restrict_closed = False
    utf8 = conforming = False
    stream_bytes = sections = rows = 0
    stream_digest = hashlib.sha256()
    while True:
        if check:
            check()
        line = binary_stream.readline(max_line_bytes + 2)
        _require(isinstance(line, bytes), 'A binary pg_restore stream is required')
        if not line:
            break
        stream_bytes += len(line)
        _require(stream_bytes <= max_stream_bytes, 'SQL stream byte limit exceeded')
        _require(len(line) <= max_line_bytes + 1, 'SQL stream line limit exceeded')
        _require(line.endswith(b'\n'), 'Truncated or oversized SQL stream line')
        stream_digest.update(line)
        body = line[:-1]
        if current is not None:
            if body == b'\\.':
                current = None
                continue
            _validate_copy_row(body, columns)
            rows += 1
            _require(rows <= max_rows, 'COPY row limit exceeded')
            counts[current] += 1
            continue
        statement = body.strip(b' \t')
        if statement == HEADER:
            _require(not started and not complete, 'Duplicate SQL dump header')
            started = True
            continue
        if statement == COMPLETE:
            _require(started and not complete, 'Unexpected SQL dump completion marker')
            complete = True
            continue
        if not statement or statement.startswith(b'--'):
            continue
        _require(started, 'Missing SQL dump header')
        if statement.startswith(b'\\restrict '):
            _require(not sql_started and not complete and restrict_key is None,
                     'Unexpected psql restriction marker')
            key = statement[len(b'\\restrict '):]
            _require(re.fullmatch(rb'[A-Za-z0-9]{1,256}', key) is not None,
                     'Invalid psql restriction key')
            restrict_key = key
            continue
        if statement.startswith(b'\\unrestrict '):
            _require(complete and restrict_key is not None and not restrict_closed and
                     statement[len(b'\\unrestrict '):] == restrict_key,
                     'Unmatched psql restriction marker')
            restrict_closed = True
            continue
        _require(not complete, 'SQL statement after dump completion')
        sql_started = True
        if statement in FIXED_STATEMENTS:
            utf8 = utf8 or statement == b"SET client_encoding = 'UTF8';"
            conforming = conforming or statement == b'SET standard_conforming_strings = on;'
            continue
        _require(utf8 and conforming, 'Required UTF-8/conforming-string preamble is missing')
        if statement.startswith(b'COPY '):
            current, columns = _copy_header(statement, max_columns)
            sections += 1
            _require(sections <= max_sections, 'COPY section limit exceeded')
            if current not in counts:
                _require(len(counts) < max_tables, 'COPY table limit exceeded')
                counts[current] = 0
        elif not _sequence_statement(statement):
            raise CountParseError('Unsupported data-only SQL statement')
    _require(started and complete and current is None, 'Truncated SQL dump or COPY block')
    _require(utf8 and conforming, 'Required UTF-8/conforming-string preamble is missing')
    _require(restrict_key is None or restrict_closed, 'Missing psql unrestrict marker')
    return {'schema_version': 1, 'dump_sha256': dump_sha256,
            'sql_stream_sha256': stream_digest.hexdigest(), 'stream_bytes': stream_bytes,
            'copy_sections': sections, 'total_rows': rows,
            'semantics': 'physical COPY destinations; compare COUNT(*) FROM ONLY; partition roots need separate inventory',
            'tables': [{'schema': schema, 'table': table, 'rows': count}
                       for (schema, table), count in sorted(counts.items())]}


def quote_identifier(name):
    """Quote a parsed identifier; never concatenate unvalidated names into SQL."""
    _require(isinstance(name, str), 'SQL identifier must be text')
    try:
        _identifier_value(name.encode('utf-8', 'strict'))
    except UnicodeEncodeError:
        raise CountParseError('SQL identifier must use UTF-8') from None
    return '"' + name.replace('"', '""') + '"'


def count_queries(metadata):
    """Return metadata and safe SQL for callers checking an isolated restore.

    Each query yields one scalar, avoiding delimiter-ambiguous table-name output.
    The caller must also compare the complete physical table inventory, detect
    unsupported partition-root targets, and check every query's exit status.
    """
    _require(isinstance(metadata, dict) and metadata.get('schema_version') == 1 and
             isinstance(metadata.get('dump_sha256'), str) and
             SHA256_RE.fullmatch(metadata['dump_sha256']), 'Invalid count metadata')
    tables = metadata.get('tables')
    _require(isinstance(tables, list) and len(tables) <= 10000, 'Invalid count table list')
    seen, queries = set(), []
    for entry in tables:
        _require(isinstance(entry, dict) and type(entry.get('rows')) is int and entry['rows'] >= 0,
                 'Invalid expected row count')
        schema, table = entry.get('schema'), entry.get('table')
        quoted = quote_identifier(schema) + '.' + quote_identifier(table)
        key = (schema, table)
        _require(key not in seen, 'Duplicate count table metadata')
        seen.add(key)
        queries.append({'schema': schema, 'table': table, 'rows': entry['rows'],
                        'sql': 'SELECT count(*) FROM ONLY ' + quoted + ';'})
    return queries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump-sha256', required=True)
    args = parser.parse_args()
    result = parse_copy_stream(sys.stdin.buffer, args.dump_sha256)
    print(json.dumps(result, ensure_ascii=True, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (CountParseError, OSError):
        # A broken/malicious stream must not echo row data or driver diagnostics.
        print('FALCON dump row-count extraction refused; no count result emitted', file=sys.stderr)
        sys.exit(1)
