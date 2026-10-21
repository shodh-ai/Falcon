"""Opt-in PostgreSQL 18 integration tests; never connect to an existing database.

Default discovery skips this suite. Explicit execution needs an already-local
immutable PG18 image and a local Unix Docker socket, plus 1.5 GiB host headroom:
FALCON_RUN_ISOLATED_SQL_TESTS=1 FALCON_TEST_DOCKER_SOCKET=/var/run/docker.sock
FALCON_TEST_PG_IMAGE=sha256:<approved existing image> python3 -B -m unittest ...
No image pulls, published ports, host data mounts or production credentials.
"""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import unittest
import uuid


SQL = Path(__file__).resolve().parents[1] / 'runtime-role.sql'
VIEWS = ('iqac_mv_placement_stats', 'iqac_mv_faculty_metrics',
         'iqac_mv_student_counts', 'iqac_mv_repository_health',
         'exec_daily_university_health', 'exec_mv_finance_summary',
         'exec_mv_academic_schools', 'exec_mv_placement_trends')


class RuntimeRoleIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get('FALCON_RUN_ISOLATED_SQL_TESTS') != '1':
            raise unittest.SkipTest('isolated PostgreSQL integration was not explicitly enabled')
        image = os.environ.get('FALCON_TEST_PG_IMAGE', '')
        docker_socket = os.environ.get('FALCON_TEST_DOCKER_SOCKET', '')
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', image):
            raise RuntimeError('a reviewed existing immutable PG18 image is required')
        if not os.path.isabs(docker_socket) or not stat.S_ISSOCK(os.stat(docker_socket).st_mode):
            raise RuntimeError('an explicit local Unix Docker socket is required')
        meminfo = Path('/proc/meminfo')
        if not meminfo.exists():
            raise unittest.SkipTest('Linux host memory evidence is required')
        match = re.search(r'^MemAvailable:\s+(\d+)\s+kB$', meminfo.read_text(), re.M)
        if not match or int(match.group(1)) * 1024 < 1536 * 1024 * 1024:
            raise RuntimeError('at least 1.5 GiB available host memory is required')
        cls.docker = ['docker', '--host', 'unix://' + docker_socket]
        cls.name = 'falcon-role-fixture-' + uuid.uuid4().hex
        cls.sequence = 0
        cls.command(['image', 'inspect', '--format', '{{.Id}}', image])
        cls.addClassCleanup(cls.cleanup)
        cls.command(['run', '-d', '--name', cls.name, '--network', 'none',
                     '--read-only', '--user', '70:70', '--cap-drop', 'ALL',
                     '--security-opt', 'no-new-privileges', '--memory', '256m',
                     '--memory-swap', '256m', '--cpus', '0.5', '--pids-limit', '64',
                     '--tmpfs', '/var/lib/postgresql:rw,nosuid,nodev,size=128m,uid=70,gid=70',
                     '--tmpfs', '/var/run/postgresql:rw,nosuid,nodev,size=16m,uid=70,gid=70',
                     '--tmpfs', '/tmp:rw,nosuid,nodev,size=16m,uid=70,gid=70',
                     '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image,
                     'postgres', '-c', 'shared_buffers=16MB', '-c', 'max_connections=10',
                     '-c', 'autovacuum=off'], timeout=30)
        for _ in range(120):
            ready = cls.command(['exec', cls.name, 'pg_isready', '-U', 'postgres',
                                 '-d', 'postgres'], check=False)
            if ready.returncode == 0:
                break
            time.sleep(0.25)
        else:
            raise RuntimeError('isolated PG fixture did not become ready')
        version = cls.psql('SHOW server_version_num;').stdout.decode().strip()
        if not 180000 <= int(version) < 190000:
            raise RuntimeError('PostgreSQL 18 is required')
        # Inspect only minimized sandbox metadata, not environment or private data.
        raw = cls.command(['inspect', '--format',
                           '{{json .HostConfig}}', cls.name]).stdout
        config = json.loads(raw)
        if config['NetworkMode'] != 'none' or config['Binds'] or config['PortBindings']:
            raise RuntimeError('isolated fixture unexpectedly has a network, bind or published port')
        setup = '''
CREATE TABLE public.schema_migrations(filename text PRIMARY KEY, applied_at timestamptz DEFAULT now());
CREATE ROLE fixture_recipient;
INSERT INTO public.schema_migrations(filename) VALUES ('synthetic_existing.sql');
CREATE TABLE public.business_records(id bigserial PRIMARY KEY, value text);
INSERT INTO public.business_records(value) VALUES ('synthetic baseline');
'''
        for view in (*VIEWS, 'unreviewed_summary'):
            setup += ('CREATE MATERIALIZED VIEW public.' + view +
                      ' AS SELECT id, value FROM public.business_records;\n' +
                      'CREATE UNIQUE INDEX ' + view + '_id ON public.' + view + '(id);\n')
        cls.psql(setup)

    @classmethod
    def command(cls, args, *, data=None, check=True, timeout=20):
        result = subprocess.run(cls.docker + args, input=data, capture_output=True,
                                timeout=timeout, env={**os.environ, 'DOCKER_CONTEXT': ''})
        if check and result.returncode:
            # Fixture SQL is synthetic, but never dump arbitrary daemon output.
            raise AssertionError('isolated fixture command failed with exit ' + str(result.returncode))
        return result

    @classmethod
    def cleanup(cls):
        if getattr(cls, 'name', None):
            cls.command(['rm', '-f', cls.name], check=False)

    @classmethod
    def psql(cls, sql, *, role=None, check=True):
        args = ['exec', '-i', cls.name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                '-U', 'postgres', '-d', 'postgres', '-At']
        if role:
            args += ['-v', 'runtime_role=' + role, '-v', 'runtime_database=postgres',
                     '-v', 'runtime_schema=public']
        return cls.command(args, data=sql.encode(), check=check)

    def new_role(self, attributes=''):
        type(self).sequence += 1
        role = 'fixture_api_' + str(self.sequence)
        self.psql('CREATE ROLE ' + role + ' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
                  'NOREPLICATION NOBYPASSRLS NOINHERIT ' + attributes + ';')
        return role

    def apply(self, role, check=True):
        return self.psql(SQL.read_text(), role=role, check=check)

    def denied(self, role, command):
        # SET ROLE is possible only because this disposable fixture is the owner.
        result = self.psql('SET ROLE ' + role + '; ' + command, check=False)
        self.assertNotEqual(result.returncode, 0, 'runtime unexpectedly performed forbidden SQL')
        self.assertRegex(result.stderr, b'permission denied|must be owner')

    def test_business_crud_sequences_ledger_read_and_exact_view_refresh(self):
        role = self.new_role()
        self.apply(role)
        # A second application preserves data and the same boundaries.
        self.apply(role)
        self.psql('SET ROLE ' + role + ''';
INSERT INTO public.business_records(value) VALUES ('synthetic new');
UPDATE public.business_records SET value='synthetic edited' WHERE value='synthetic new';
SELECT id, value FROM public.business_records;
DELETE FROM public.business_records WHERE value='synthetic edited';
SELECT filename FROM public.schema_migrations;
SELECT nextval('public.business_records_id_seq');
SELECT currval('public.business_records_id_seq');
''' + '\n'.join('REFRESH MATERIALIZED VIEW CONCURRENTLY public.' + view + ';' for view in VIEWS))
        for sql in ["INSERT INTO public.schema_migrations(filename) VALUES ('forbidden')",
                    "UPDATE public.schema_migrations SET filename='forbidden'",
                    'DELETE FROM public.schema_migrations', 'TRUNCATE public.business_records',
                    'CREATE TABLE public.forbidden(id int)',
                    'ALTER TABLE public.business_records ADD COLUMN forbidden int',
                    'DROP TABLE public.business_records',
                    "SELECT setval('public.business_records_id_seq',1)",
                    'REFRESH MATERIALIZED VIEW public.unreviewed_summary']:
            self.denied(role, sql)
        # PostgreSQL can warn rather than error on an ineffective GRANT; verify
        # the recipient's actual authority after the attempted delegation.
        self.psql('SET ROLE ' + role + '; GRANT UPDATE ON public.business_records TO fixture_recipient;')
        self.assertEqual(self.psql("SELECT has_table_privilege('fixture_recipient',"
                                  "'public.business_records','UPDATE');").stdout.decode().strip(), 'f')
        rows = self.psql("SELECT count(*) FROM public.business_records;").stdout.decode().strip()
        self.assertEqual(rows, '1')

    def test_owner_and_membership_and_elevated_attribute_refused(self):
        role = self.new_role()
        self.psql('CREATE TABLE public.fixture_owned(id int); ALTER TABLE public.fixture_owned OWNER TO ' + role + ';')
        self.assertNotEqual(self.apply(role, check=False).returncode, 0)
        self.psql('ALTER TABLE public.fixture_owned OWNER TO postgres; DROP TABLE public.fixture_owned;')
        self.psql('CREATE ROLE fixture_group; GRANT fixture_group TO ' + role + ';')
        self.assertNotEqual(self.apply(role, check=False).returncode, 0)
        self.psql('REVOKE fixture_group FROM ' + role + '; ALTER ROLE ' + role + ' BYPASSRLS;')
        self.assertNotEqual(self.apply(role, check=False).returncode, 0)

    def test_public_or_column_level_ledger_writes_and_sequence_reset_refused(self):
        for grant, revoke in [
            ('GRANT CREATE ON SCHEMA public TO PUBLIC', 'REVOKE CREATE ON SCHEMA public FROM PUBLIC'),
            ('GRANT UPDATE(filename) ON public.schema_migrations TO PUBLIC', 'REVOKE UPDATE(filename) ON public.schema_migrations FROM PUBLIC'),
            ('GRANT UPDATE ON public.business_records_id_seq TO PUBLIC', 'REVOKE UPDATE ON public.business_records_id_seq FROM PUBLIC'),
            ('GRANT MAINTAIN ON public.business_records TO PUBLIC', 'REVOKE MAINTAIN ON public.business_records FROM PUBLIC')]:
            role = self.new_role()
            self.psql(grant + ';')
            try:
                result = self.apply(role, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.psql("SELECT has_table_privilege('" + role +
                    "','public.business_records','INSERT');").stdout.decode().strip(), 'f')
            finally:
                self.psql(revoke + ';')
        role = self.new_role()
        self.psql('GRANT INSERT(filename) ON public.schema_migrations TO ' + role + ';')
        self.assertNotEqual(self.apply(role, check=False).returncode, 0)

    def test_definer_trigger_grant_delegation_and_rls_refused(self):
        role = self.new_role()
        self.psql('GRANT UPDATE ON public.business_records TO ' + role + ' WITH GRANT OPTION;')
        self.assertNotEqual(self.apply(role, check=False).returncode, 0)
        self.psql('REVOKE UPDATE ON public.business_records FROM ' + role + ';')
        self.psql("CREATE FUNCTION public.fixture_definer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$BEGIN RETURN NEW; END$$; REVOKE ALL ON FUNCTION public.fixture_definer() FROM PUBLIC;")
        self.psql('CREATE TRIGGER fixture_trigger BEFORE INSERT ON public.business_records FOR EACH ROW EXECUTE FUNCTION public.fixture_definer();')
        try:
            self.assertNotEqual(self.apply(role, check=False).returncode, 0)
        finally:
            self.psql('DROP TRIGGER fixture_trigger ON public.business_records; DROP FUNCTION public.fixture_definer();')
        self.psql('ALTER TABLE public.business_records ENABLE ROW LEVEL SECURITY;')
        try:
            self.assertNotEqual(self.apply(role, check=False).returncode, 0)
        finally:
            self.psql('ALTER TABLE public.business_records DISABLE ROW LEVEL SECURITY;')


if __name__ == '__main__':
    unittest.main()
