#!/usr/bin/env python3
"""Describe exact document references present in committed migration source.

This is source evidence, not proof that a document is a seed, exists, or can be
recovered. The CLI reads only this checkout's fixed backend/migrations directory.
It never connects to an application, database, storage service, or server.
"""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import unicodedata
from urllib.parse import urlsplit


MAX_OUTPUT = 2 * 1024 * 1024
MAX_SOURCE = 2 * 1024 * 1024
MAX_TOTAL_SOURCE = 64 * 1024 * 1024
MAX_FILES = 2000
MAX_ENTRIES = 5000
MAX_REFERENCE = 4096
REVISION = re.compile(r'[0-9a-f]{40}\Z')
FILENAME = re.compile(r'[A-Za-z0-9_.-]{1,200}\.sql\Z')
DOCUMENT = re.compile(r'\.(?:pdf|png|jpe?g|webp|docx?|pptx?|xlsx?|zip|csv|txt|mp4|webm)\Z', re.I)
DOLLAR = re.compile(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$')
IDENTIFIER = re.compile(r'[A-Za-z_][A-Za-z_0-9$]*')


class CatalogError(Exception):
    pass


def need(condition, code):
    if not condition:
        raise CatalogError(code)


def safe_reference(value):
    """Conservatively recognize complete references without normalization."""
    if not isinstance(value, str) or not 1 <= len(value) <= MAX_REFERENCE:
        return False
    if value != value.strip() or any(unicodedata.category(c).startswith('C') for c in value):
        return False
    # Reject encoded aliases too; this catalog never decodes a stored reference.
    if any(c in value for c in ('\\', '?', '#', '%')):
        return False
    candidate = value
    if re.match(r'^[A-Za-z][A-Za-z0-9+.-]*:', value):
        try:
            parsed = urlsplit(value)
            if parsed.scheme not in ('http', 'https') or not parsed.netloc:
                return False
            if parsed.username is not None or parsed.password is not None:
                return False
            if not parsed.hostname or not re.fullmatch(r'[A-Za-z0-9.-]+', parsed.hostname):
                return False
            if parsed.port is not None and not 1 <= parsed.port <= 65535:
                return False
            if parsed.query or parsed.fragment:
                return False
            candidate = parsed.path
        except ValueError:
            return False
    elif ':' in value:
        return False
    if candidate.startswith('./'):
        candidate = candidate[2:]
    if not candidate or candidate.endswith('/') or candidate.startswith('//'):
        return False
    segments = candidate.lstrip('/').split('/')
    if len(segments) > 64 or any(not part or part in ('.', '..') or part != part.strip() for part in segments):
        return False
    if candidate.startswith('/uploads/') or candidate.startswith('uploads/'):
        return True
    if candidate.startswith('/api/') and candidate.endswith('/pdf'):
        return True
    return '/' in candidate and bool(DOCUMENT.search(candidate))


def sql_tokens(source, offset=0, initial_line=1):
    """Lex ordinary SQL literals; inspect DO bodies, never comments/identifiers.

    SQL doubled quotes are decoded. Escape strings containing backslashes are
    intentionally excluded rather than guess at PostgreSQL escape semantics.
    Dollar-quoted data is not treated as SQL; anonymous DO bodies are.
    """
    tokens = []
    i, line = 0, initial_line
    while i < len(source):
        c = source[i]
        if c.isspace():
            line += c == '\n'
            i += 1
            continue
        if source.startswith('--', i):
            end = source.find('\n', i + 2)
            i = len(source) if end < 0 else end
            continue
        if source.startswith('/*', i):
            start, depth = i, 1
            i += 2
            while i < len(source) and depth:
                if source.startswith('/*', i):
                    depth += 1
                    i += 2
                elif source.startswith('*/', i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            need(depth == 0, 'unterminated-sql-comment')
            line += source[start:i].count('\n')
            continue
        if c == '"':
            start = i
            i += 1
            while i < len(source):
                if source.startswith('""', i):
                    i += 2
                elif source[i] == '"':
                    i += 1
                    break
                else:
                    i += 1
            else:
                raise CatalogError('unterminated-sql-identifier')
            tokens.append(('identifier', '', line, offset + start))
            line += source[start:i].count('\n')
            continue
        delimiter = DOLLAR.match(source, i)
        if delimiter:
            start = i
            end = source.find(delimiter.group(), delimiter.end())
            need(end >= 0, 'unterminated-sql-dollar-string')
            body = source[delimiter.end():end]
            if tokens and tokens[-1][0:2] == ('identifier', 'do'):
                tokens.extend(sql_tokens(body, offset + delimiter.end(), line))
            else:
                tokens.append(('dollar-data', '', line, offset + start))
            i = end + len(delimiter.group())
            line += source[start:i].count('\n')
            continue
        escaped = c in ('E', 'e') and i + 1 < len(source) and source[i + 1] == "'"
        if c == "'" or escaped:
            start, start_line = i, line
            if escaped:
                i += 1
            i += 1
            value = []
            unsafe_escape = False
            while i < len(source):
                if source.startswith("''", i):
                    value.append("'")
                    i += 2
                elif source[i] == "'":
                    i += 1
                    break
                elif escaped and source[i] == '\\':
                    unsafe_escape = True
                    value.append(source[i:i + 2])
                    i += 2
                else:
                    value.append(source[i])
                    i += 1
            else:
                raise CatalogError('unterminated-sql-literal')
            tokens.append(('unsafe-string' if unsafe_escape else 'string', ''.join(value), start_line, offset + start))
            line += source[start:i].count('\n')
            continue
        identifier = IDENTIFIER.match(source, i)
        if identifier:
            tokens.append(('identifier', identifier.group().lower(), line, offset + i))
            i = identifier.end()
            continue
        symbol = source[i:i + 2] if source[i:i + 2] in ('||', '::') else c
        tokens.append(('symbol', symbol, line, offset + i))
        i += len(symbol)
    return tokens


def references_from_sql(source):
    tokens = sql_tokens(source)
    result = []
    stack = []
    functions = {}
    # A literal in concat/format is a component, even if it resembles a file.
    for i, token in enumerate(tokens):
        if token[1] == '(' and token[0] == 'symbol':
            parent = tokens[i - 1][1] if i and tokens[i - 1][0] == 'identifier' else ''
            stack.append(parent)
        functions[i] = tuple(stack)
        if token[1] == ')' and token[0] == 'symbol' and stack:
            stack.pop()
    for i, token in enumerate(tokens):
        if token[0] != 'string' or not safe_reference(token[1]):
            continue
        if any(fn in ('concat', 'concat_ws', 'format') for fn in functions[i]):
            continue
        # PostgreSQL also concatenates adjacent string literals separated by a
        # newline. Never present either component as an entire stored reference.
        if any(0 <= index < len(tokens) and tokens[index][0] in ('string', 'unsafe-string')
               for index in (i - 1, i + 1)):
            continue
        # Scan the surrounding expression, including qualified casts and CAST
        # parentheses. This deliberately declines ambiguous expressions rather
        # than reconstruct a dynamic reference or pretend to parse all SQL.
        boundaries = {'select', 'values', 'from', 'where', 'and', 'or', 'when',
                      'then', 'else', 'end', 'begin', 'returning', 'set', 'into'}
        dynamic = False
        for direction in (-1, 1):
            cursor, scanned = i + direction, 0
            while 0 <= cursor < len(tokens):
                kind, value = tokens[cursor][0:2]
                if value in (',', ';') or (kind == 'identifier' and value in boundaries):
                    break
                scanned += 1
                if value == '||' or scanned > 200:
                    dynamic = True
                    break
                cursor += direction
        if dynamic:
            continue
        result.append((token[1], token[2]))
    return result


def read_source(filename):
    fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= MAX_SOURCE, 'migration-file-invalid')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            data = stream.read(MAX_SOURCE + 1)
        after = os.fstat(fd)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'migration-file-changed')
        need(len(data) <= MAX_SOURCE and len(data) == before.st_size, 'migration-size-invalid')
        return data.decode('utf-8')
    finally:
        os.close(fd)


def encode_catalog(catalog):
    data = (json.dumps(catalog, ensure_ascii=True, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')
    need(len(data) <= MAX_OUTPUT, 'catalog-size-limit')
    return data


def build_catalog(repo, revision):
    need(isinstance(revision, str) and REVISION.fullmatch(revision), 'revision-invalid')
    migrations = Path(repo) / 'backend' / 'migrations'
    need(migrations.is_dir() and not migrations.is_symlink(), 'migration-directory-invalid')
    paths = sorted(migrations.glob('*.sql'))
    need(len(paths) <= MAX_FILES, 'migration-count-limit')
    entries, total = {}, 0
    for filename in paths:
        need(FILENAME.fullmatch(filename.name), 'migration-name-invalid')
        source = read_source(filename)
        total += len(source.encode('utf-8'))
        need(total <= MAX_TOTAL_SOURCE, 'migration-total-limit')
        for value, line in references_from_sql(source):
            entries.setdefault(value, set()).add('backend/migrations/' + filename.name + ':' + str(line))
            need(len(entries) <= MAX_ENTRIES, 'catalog-entry-limit')
    catalog = {'schema_version': 1, 'source_revision': revision,
               'match_label': 'matches_repository_seed_literal',
               'entries': [{'reference': value, 'source_files': sorted(locations)}
                           for value, locations in sorted(entries.items())]}
    encode_catalog(catalog)
    return catalog


def checked_revision(repo, requested=None):
    if requested is not None:
        need(REVISION.fullmatch(requested), 'revision-invalid')
    def git(*args):
        return subprocess.run(['git', '-C', str(repo), *args], check=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=15, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}).stdout
    actual = git('rev-parse', '--verify', 'HEAD^{commit}').decode('ascii').strip()
    need(REVISION.fullmatch(actual) and (requested is None or actual == requested), 'revision-mismatch')
    need(not git('status', '--porcelain', '--untracked-files=all', '--', 'backend/migrations'), 'migration-source-uncommitted')
    return actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', help='Expected full lowercase commit SHA; must equal this checkout HEAD')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    try:
        revision = checked_revision(repo, args.revision)
        catalog = build_catalog(repo, revision)
        need(checked_revision(repo, revision) == revision, 'source-revision-changed')
        sys.stdout.buffer.write(encode_catalog(catalog))
    except (CatalogError, OSError, UnicodeError, subprocess.SubprocessError) as error:
        code = str(error) if isinstance(error, CatalogError) else 'source-read-refused'
        print('Document source catalog refused: ' + code, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
