"""Opt-in PostgreSQL 18 integration tests; never connect to an existing database.

Default discovery skips this suite. Explicit execution needs an already-local
immutable PG18 image and a local Unix Docker socket, plus 1.5 GiB host headroom:
FALCON_RUN_ISOLATED_SQL_TESTS=1 FALCON_TEST_DOCKER_SOCKET=/var/run/docker.sock
FALCON_TEST_PG_IMAGE=sha256:<approved existing image> python3 -B -m unittest ...
No image pulls, published ports, host data mounts or production credentials.
"""
from contextlib import contextmanager
import importlib.util
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
RUNTIME = SQL.parents[2] / 'backend' / 'scripts' / 'runtime-start.cjs'
SCOPED_SQL = SQL.parent / 'department-leadership-grants.sql'
HOST_SPEC = importlib.util.spec_from_file_location('fixture_host_preflight', SQL.parent / 'host-preflight.py')
HOST = importlib.util.module_from_spec(HOST_SPEC)
HOST_SPEC.loader.exec_module(HOST)
LIMITED_TABLES = {
    'department_leadership': {'insert': True, 'updateColumns': ['structure', 'higher_officer_id', 'revision']},
    'department_offices': {'insert': True, 'updateColumns': ['login_alias']},
    'department_office_appointments': {'insert': True, 'updateColumns': ['valid_to']},
    'department_office_session_revisions': {'insert': True, 'updateColumns': ['revision']},
    'department_leadership_events': {'insert': True, 'updateColumns': []},
    'student_identity_email_changes': {'insert': False, 'updateColumns': []},
}
VIEWS = ('iqac_mv_placement_stats', 'iqac_mv_faculty_metrics',
         'iqac_mv_student_counts', 'iqac_mv_repository_health',
         'exec_daily_university_health', 'exec_mv_finance_summary',
         'exec_mv_academic_schools', 'exec_mv_placement_trends')


def wait_for_final_postgres(command, probe, name, *, timeout=60,
                            now=time.monotonic, pause=time.sleep):
    """Ignore the entrypoint's temporary server; require final PID1 plus SQL.

    pg_isready can return success while docker-entrypoint.sh is still using its
    temporary initdb server. That server deliberately stops before exec postgres.
    No fixture setup/role SQL may run during that initialization window.
    """
    deadline = now() + timeout
    final_process = False
    last_sql_exit = None
    while now() < deadline:
        try:
            process = command(['exec', name, 'cat', '/proc/1/comm'],
                              check=False, timeout=5)
            final_process = process.returncode == 0 and process.stdout.strip() == b'postgres'
            if final_process:
                result = probe('SHOW server_version_num;', check=False, timeout=5)
                last_sql_exit = result.returncode
                if result.returncode == 0:
                    value = result.stdout.strip()
                    if not re.fullmatch(rb'[0-9]{6}', value) or not 180000 <= int(value) < 190000:
                        raise RuntimeError('isolated fixture requires a valid PostgreSQL 18 version probe')
                    return
        except subprocess.TimeoutExpired:
            # Startup probes are retryable and bounded; never echo driver output.
            pass
        remaining = deadline - now()
        if remaining > 0:
            pause(min(0.25, remaining))
    raise RuntimeError('isolated PG fixture did not become ready: final_pid1=' +
                       str(final_process).lower() + ', sql_exit=' + str(last_sql_exit))


def fixture_state_summary(result):
    match = re.fullmatch(rb'(true|false) ([0-9]{1,3}) (true|false)', result.stdout.strip())
    if result.returncode != 0 or not match:
        return 'unavailable'
    return ('running=' + match[1].decode() + ',exit=' + match[2].decode() +
            ',oom=' + match[3].decode())


def synthetic_sql_diagnostic(result):
    # Called only for this generated synthetic fixture's role application. Never
    # include connection failures, DETAIL/CONTEXT, stdout, environment or logs.
    match = re.search(rb'ERROR:\s+([0-9A-Z]{5}):\s*([^\r\n]*)', result.stderr[:8192])
    if not match:
        return 'sqlstate=unavailable'
    message = ''.join(chr(value) if 32 <= value < 127 else '?' for value in match[2][:240])
    return 'sqlstate=' + match[1].decode() + ', message=' + message


def fixture_projected_output(command, arguments):
    """Run only the caller's projected synthetic-fixture inspection.

    Never forward Docker stderr or arbitrary output on failure. The real
    projection regression below does not request Config.Env or health logs.
    """
    result = command(arguments, check=False)
    if result.returncode:
        raise AssertionError('synthetic Docker metadata inspection failed with exit ' + str(result.returncode))
    if len(result.stdout) > HOST.MAX_DOCUMENT_BYTES:
        raise AssertionError('synthetic Docker metadata inspection exceeded its bound')
    try:
        return result.stdout.decode('utf-8')
    except UnicodeError:
        raise AssertionError('synthetic Docker metadata inspection encoding is invalid') from None


class RuntimeReadinessTests(unittest.TestCase):
    class Clock:
        value = 0

        def now(self):
            return self.value

        def pause(self, duration):
            self.value += duration

    def wait(self, processes, probes, *, timeout=1):
        clock = self.Clock()
        calls = []

        def command(args, **options):
            calls.append(('process', args, options))
            value = processes.pop(0) if len(processes) > 1 else processes[0]
            if isinstance(value, Exception):
                raise value
            return subprocess.CompletedProcess(args, value[0], value[1], b'')

        def probe(sql, **options):
            calls.append(('sql', sql, options))
            value = probes.pop(0) if len(probes) > 1 else probes[0]
            if isinstance(value, Exception):
                raise value
            return subprocess.CompletedProcess([], value[0], value[1], b'')

        return clock, calls, lambda: wait_for_final_postgres(
            command, probe, 'synthetic-fixture', timeout=timeout,
            now=clock.now, pause=clock.pause)

    def test_temporary_server_never_triggers_setup_probe(self):
        _, calls, run = self.wait([(0, b'docker-entrypoi\n'), (0, b'postgres\n')],
                                  [(0, b'180004\n')])
        run()
        self.assertEqual([item[0] for item in calls], ['process', 'process', 'sql'])
        self.assertEqual(calls[-1][1], 'SHOW server_version_num;')

    def test_final_process_with_transient_sql_exit_two_is_retried(self):
        _, calls, run = self.wait([(0, b'postgres\n')], [(2, b''), (0, b'180004\n')])
        run()
        self.assertEqual(sum(item[0] == 'sql' for item in calls), 2)
        self.assertTrue(all(item[2]['timeout'] == 5 for item in calls))

    def test_no_final_process_or_failed_sql_times_out_without_success(self):
        for processes, probes in [([(0, b'docker-entrypoi\n')], [(0, b'180004\n')]),
                                  ([(0, b'postgres\n')], [(2, b'')]),
                                  ([(1, b'')], [(0, b'180004\n')])]:
            clock, calls, run = self.wait(processes, probes)
            with self.assertRaisesRegex(RuntimeError, 'did not become ready'):
                run()
            self.assertEqual(clock.value, 1)
            if processes[0][1] != b'postgres\n':
                self.assertFalse(any(item[0] == 'sql' for item in calls))

    def test_wrong_version_or_probe_timeouts_do_not_bypass_gate(self):
        for version in [b'170010\n', b'190000\n', b'', b'not-version-or-secret']:
            _, _, run = self.wait([(0, b'postgres\n')], [(0, version)])
            with self.assertRaisesRegex(RuntimeError, 'valid PostgreSQL 18 version probe') as error:
                run()
            if version.strip():
                self.assertNotIn(version.decode().strip(), str(error.exception))
        clock, _, run = self.wait([(0, b'postgres\n')],
                                  [subprocess.TimeoutExpired('synthetic-probe', 5)])
        with self.assertRaisesRegex(RuntimeError, 'did not become ready'):
            run()
        self.assertEqual(clock.value, 1)

    def test_fixture_state_diagnostics_are_minimized_and_sanitized(self):
        result = subprocess.CompletedProcess([], 0, b'false 137 true\n', b'')
        self.assertEqual(fixture_state_summary(result), 'running=false,exit=137,oom=true')
        for status, value in [(1, b'false 137 true'), (0, b'private-error-or-environment'),
                              (0, b'false not-an-exit true')]:
            self.assertEqual(fixture_state_summary(subprocess.CompletedProcess(
                [], status, value, b'not-printed')), 'unavailable')

    def test_positive_sql_diagnostics_only_expose_bounded_state_and_first_error(self):
        result = subprocess.CompletedProcess([], 3, b'not-printed',
            b'ERROR:  42809: "pg_toast_16384" is not a sequence\n'
            b'DETAIL: not-printed\nCONTEXT: not-printed\n')
        self.assertEqual(synthetic_sql_diagnostic(result),
            'sqlstate=42809, message="pg_toast_16384" is not a sequence')
        self.assertEqual(synthetic_sql_diagnostic(subprocess.CompletedProcess(
            [], 2, b'', b'FATAL: credential-containing-driver-error')), 'sqlstate=unavailable')
        self.assertLess(len(synthetic_sql_diagnostic(subprocess.CompletedProcess(
            [], 3, b'', b'ERROR:  42501: ' + b'x' * 1000))), 280)

    def test_role_sql_guards_sequence_types_with_case_not_predicate_order(self):
        self.assertRegex(SQL.read_text(), r'WHERE CASE\s+WHEN c\.relnamespace = schema_oid AND '
                         r"c\.relkind = 'S'\s+THEN has_sequence_privilege\([^;]+ELSE false END")

    def test_projected_metadata_failure_diagnostics_never_echo_docker_output(self):
        for status, stdout in [(1, b'synthetic-private-output'), (0, b'\xff'),
                               (0, b'x' * (HOST.MAX_DOCUMENT_BYTES + 1))]:
            def command(arguments, **options):
                self.assertEqual(options, {'check': False})
                return subprocess.CompletedProcess(arguments, status, stdout, b'synthetic-private-stderr')
            with self.assertRaises(AssertionError) as error:
                fixture_projected_output(command, ['image', 'inspect'])
            self.assertNotIn('synthetic-private', str(error.exception))


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
        cls.image = image
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
        try:
            wait_for_final_postgres(cls.command, cls.psql, cls.name)
        except RuntimeError as error:
            try:
                state = cls.command(['inspect', '--format',
                                     '{{.State.Running}} {{.State.ExitCode}} {{.State.OOMKilled}}',
                                     cls.name], check=False, timeout=5)
                summary = fixture_state_summary(state)
            except (OSError, subprocess.TimeoutExpired):
                summary = 'unavailable'
            raise RuntimeError(str(error) + '; fixture_state=' + summary) from None
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
    def psql(cls, sql, *, role=None, check=True, timeout=20):
        args = ['exec', '-i', '-e', 'PGCONNECT_TIMEOUT=2', cls.name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                '-v', 'VERBOSITY=verbose',
                '-U', 'postgres', '-d', 'postgres', '-At']
        if role:
            args += ['-v', 'runtime_role=' + role, '-v', 'runtime_database=postgres',
                     '-v', 'runtime_schema=public']
        return cls.command(args, data=sql.encode(), check=check, timeout=timeout)

    def new_role(self, attributes=''):
        type(self).sequence += 1
        role = 'fixture_api_' + str(self.sequence)
        self.psql('CREATE ROLE ' + role + ' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
                  'NOREPLICATION NOBYPASSRLS NOINHERIT ' + attributes + ';')
        return role

    def apply(self, role, check=True):
        if not re.fullmatch(r'fixture_api_[0-9]+', role):
            raise AssertionError('invalid generated synthetic role')
        result = self.psql(SQL.read_text(), role=role, check=False)
        if check and result.returncode:
            raise AssertionError('synthetic runtime-role SQL refused: ' + synthetic_sql_diagnostic(result))
        return result

    def denied(self, role, command):
        # SET ROLE is possible only because this disposable fixture is the owner.
        result = self.psql('SET ROLE ' + role + '; ' + command, check=False)
        self.assertNotEqual(result.returncode, 0, 'runtime unexpectedly performed forbidden SQL')
        self.assertRegex(result.stderr, b'permission denied|must be owner')

    def startup_metadata(self, role):
        query = subprocess.run(['node', '-e',
            'process.stdout.write(require(process.argv[1]).ROLE_QUERY)', str(RUNTIME)],
            capture_output=True, check=True, timeout=10).stdout.decode()
        return json.loads(self.psql('SET ROLE ' + role + '; SELECT row_to_json(boundary) '
            'FROM (' + query + ') boundary;').stdout.decode().splitlines()[-1])

    def assert_startup_accepts(self, role):
        metadata = self.startup_metadata(role)
        self.assertEqual(metadata.pop('database_name'), 'postgres')
        self.assertEqual(metadata.pop('role_name'), role)
        self.assertTrue(all(value is False for value in metadata.values()), metadata)

    @contextmanager
    def leadership_tables(self):
        # This database exists only in the generated no-network PG18 fixture.
        # These are deliberately reduced synthetic relations for ACL validation;
        # production migration contents and business behavior are separate tests.
        self.psql("""
CREATE TABLE public.department_leadership (
 tenant_id uuid NOT NULL, dept_id integer NOT NULL,
 structure text NOT NULL, higher_officer_id uuid, revision integer NOT NULL DEFAULT 1,
 PRIMARY KEY (tenant_id,dept_id));
CREATE TABLE public.department_offices (
 office_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
 dept_id integer NOT NULL,kind text NOT NULL,login_alias text NOT NULL);
CREATE TABLE public.department_office_appointments (
 appointment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,
 user_id uuid NOT NULL,valid_from timestamptz NOT NULL DEFAULT now(),valid_to timestamptz,
 assigned_by uuid NOT NULL);
CREATE TABLE public.department_office_session_revisions (
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY (tenant_id,user_id));
CREATE TABLE public.department_leadership_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,
 dept_id integer NOT NULL,actor_user_id uuid NOT NULL,action text NOT NULL,
 details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.student_identity_email_changes (
 tenant_id uuid NOT NULL,user_id uuid NOT NULL,student_login_id text NOT NULL,
 old_email text,new_email text NOT NULL,mailbox_provisioned boolean NOT NULL DEFAULT false,
 changed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY (tenant_id,user_id));
INSERT INTO public.student_identity_email_changes
 (tenant_id,user_id,student_login_id,old_email,new_email)
 VALUES ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
 'synthetic-student','synthetic-old@example.invalid','synthetic-new@example.invalid');
""")
        try:
            yield
        finally:
            self.psql('DROP TABLE ' + ','.join('public.' + table for table in LIMITED_TABLES) + ';')

    def limited_acl_snapshot(self, role):
        return self.psql("SELECT c.relname,c.relacl::text,coalesce(string_agg(a.attname||':'||"
            "coalesce(a.attacl::text,''),'|' ORDER BY a.attnum),'') "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped "
            "WHERE n.nspname='public' AND c.relname=ANY(ARRAY[" +
            ','.join("'" + table + "'" for table in LIMITED_TABLES) +
            "]) GROUP BY c.oid,c.relname,c.relacl ORDER BY c.relname;").stdout

    def test_leadership_exact_column_grants_are_usable_idempotent_and_preserve_business(self):
        with self.leadership_tables():
            role = self.new_role()
            before = self.psql('TABLE public.business_records;').stdout
            self.apply(role)
            first_acl = self.limited_acl_snapshot(role)
            self.apply(role)
            self.assertEqual(self.limited_acl_snapshot(role), first_acl)
            self.assert_startup_accepts(role)
            tenant = "'10000000-0000-4000-8000-000000000001'"
            user = "'10000000-0000-4000-8000-000000000002'"
            office = "'10000000-0000-4000-8000-000000000003'"
            self.psql('SET ROLE ' + role + ';' + f"""
INSERT INTO public.department_leadership(tenant_id,dept_id,structure)
 VALUES ({tenant},43,'PRINCIPAL_HOD');
INSERT INTO public.department_leadership(tenant_id,dept_id,structure)
 VALUES ({tenant},43,'HOD_ONLY') ON CONFLICT (tenant_id,dept_id)
 DO UPDATE SET structure=EXCLUDED.structure,revision=department_leadership.revision+1;
UPDATE public.department_leadership SET higher_officer_id={user};
INSERT INTO public.department_offices(office_id,tenant_id,dept_id,kind,login_alias)
 VALUES ({office},{tenant},43,'HOD','synthetic@example.invalid');
UPDATE public.department_offices SET login_alias='synthetic-updated@example.invalid';
INSERT INTO public.department_office_appointments(office_id,user_id,assigned_by)
 VALUES ({office},{user},{user});
UPDATE public.department_office_appointments SET valid_to=now();
INSERT INTO public.department_office_session_revisions(tenant_id,user_id,revision)
 VALUES ({tenant},{user},1) ON CONFLICT (tenant_id,user_id)
 DO UPDATE SET revision=department_office_session_revisions.revision+1;
UPDATE public.department_office_session_revisions SET revision=revision+1;
INSERT INTO public.department_leadership_events(tenant_id,dept_id,actor_user_id,action,details)
 VALUES ({tenant},43,{user},'SYNTHETIC','{{}}');
""" + '\n'.join('SELECT * FROM public.' + table + ';' for table in LIMITED_TABLES))
            for table, matrix in LIMITED_TABLES.items():
                self.assertEqual(self.psql("SELECT has_table_privilege('" + role +
                    "','public." + table + "','UPDATE');").stdout.decode().strip(), 'f')
                self.assertEqual(self.psql("SELECT has_table_privilege('" + role +
                    "','public." + table + "','INSERT');").stdout.decode().strip(),
                    't' if matrix['insert'] else 'f')
                # Appointments inherit tenant scope through their office FK;
                # exercise an existing protected column instead of a SQL typo.
                protected_column = 'user_id' if table == 'department_office_appointments' else 'tenant_id'
                for forbidden in ['DELETE FROM public.' + table, 'TRUNCATE public.' + table,
                                  'UPDATE public.' + table + ' SET ' + protected_column + '=' + protected_column]:
                    self.denied(role, forbidden)
            for forbidden in [
                "UPDATE public.department_leadership_events SET action='forbidden'",
                "UPDATE public.student_identity_email_changes SET mailbox_provisioned=true",
                "INSERT INTO public.student_identity_email_changes(tenant_id,user_id,student_login_id,new_email) "
                    "VALUES (gen_random_uuid(),gen_random_uuid(),'forbidden','forbidden@example.invalid')"]:
                self.denied(role, forbidden)
            # Existing business objects keep the same CRUD boundary and bytes.
            self.psql('SET ROLE ' + role + "; BEGIN; INSERT INTO public.business_records(value) "
                "VALUES ('synthetic rollback'); UPDATE public.business_records SET value=value; "
                "DELETE FROM public.business_records WHERE value='synthetic rollback'; ROLLBACK;")
            self.assertEqual(self.psql('TABLE public.business_records;').stdout, before)

    def test_leadership_public_extra_authority_is_refused_atomically_and_guard_denies(self):
        with self.leadership_tables():
            role = self.new_role()
            self.apply(role)
            for grant, revoke in [
                ('GRANT UPDATE ON public.department_leadership_events TO PUBLIC',
                 'REVOKE UPDATE ON public.department_leadership_events FROM PUBLIC'),
                ('GRANT UPDATE(action) ON public.department_leadership_events TO PUBLIC',
                 'REVOKE UPDATE(action) ON public.department_leadership_events FROM PUBLIC'),
                ('GRANT UPDATE(tenant_id) ON public.department_leadership TO PUBLIC',
                 'REVOKE UPDATE(tenant_id) ON public.department_leadership FROM PUBLIC'),
                ('GRANT INSERT ON public.student_identity_email_changes TO PUBLIC',
                 'REVOKE INSERT ON public.student_identity_email_changes FROM PUBLIC'),
                ('GRANT INSERT(new_email) ON public.student_identity_email_changes TO PUBLIC',
                 'REVOKE INSERT(new_email) ON public.student_identity_email_changes FROM PUBLIC'),
                ('GRANT DELETE ON public.department_offices TO PUBLIC',
                 'REVOKE DELETE ON public.department_offices FROM PUBLIC'),
            ]:
                with self.subTest(grant=grant):
                    self.psql(grant + ';')
                    try:
                        before = self.limited_acl_snapshot(role)
                        self.assertTrue(self.startup_metadata(role)['missing_business_access'])
                        self.assertNotEqual(self.apply(role, check=False).returncode, 0)
                        self.assertEqual(self.limited_acl_snapshot(role), before)
                    finally:
                        self.psql(revoke + ';')
                    self.assert_startup_accepts(role)

    def test_leadership_wrong_relation_kind_and_missing_allowed_columns_fail_closed(self):
        with self.leadership_tables():
            role = self.new_role()
            self.apply(role)
            self.psql('ALTER TABLE public.department_leadership_events RENAME TO fixture_saved_events; '
                'CREATE VIEW public.department_leadership_events AS SELECT * FROM public.fixture_saved_events;')
            try:
                self.assertTrue(self.startup_metadata(role)['missing_business_access'])
                self.assertNotEqual(self.apply(role, check=False).returncode, 0)
            finally:
                self.psql('DROP VIEW public.department_leadership_events; '
                    'ALTER TABLE public.fixture_saved_events RENAME TO department_leadership_events;')
            self.assert_startup_accepts(role)
            self.psql('ALTER TABLE public.department_offices RENAME COLUMN login_alias TO fixture_login_alias;')
            try:
                self.assertTrue(self.startup_metadata(role)['missing_business_access'])
                self.assertNotEqual(self.apply(role, check=False).returncode, 0)
            finally:
                self.psql('ALTER TABLE public.department_offices RENAME COLUMN fixture_login_alias TO login_alias;')
            self.assert_startup_accepts(role)

    def test_leadership_direct_extra_columns_normalize_but_membership_never_bypasses(self):
        with self.leadership_tables():
            role = self.new_role()
            self.psql('GRANT UPDATE(action) ON public.department_leadership_events TO ' + role +
                '; GRANT INSERT(new_email) ON public.student_identity_email_changes TO ' + role + ';')
            self.apply(role)
            self.assertEqual(self.psql("SELECT has_any_column_privilege('" + role +
                "','public.department_leadership_events','UPDATE');").stdout.decode().strip(), 'f')
            self.assertEqual(self.psql("SELECT has_any_column_privilege('" + role +
                "','public.student_identity_email_changes','INSERT,UPDATE');").stdout.decode().strip(), 'f')
            self.assert_startup_accepts(role)
            group = 'fixture_limited_group_' + str(type(self).sequence)
            self.psql('CREATE ROLE ' + group + '; GRANT UPDATE(action) ON '
                'public.department_leadership_events TO ' + group + '; GRANT ' + group + ' TO ' + role + ';')
            try:
                self.assertNotEqual(self.apply(role, check=False).returncode, 0)
                self.assertTrue(self.startup_metadata(role)['memberships'])
            finally:
                self.psql('REVOKE ' + group + ' FROM ' + role + '; REVOKE UPDATE(action) ON '
                    'public.department_leadership_events FROM ' + group + '; DROP ROLE ' + group + ';')

    def nonlimited_acl_snapshot(self):
        return self.psql("SELECT c.relname,c.relacl::text,coalesce(string_agg(a.attname||':'||"
            "coalesce(a.attacl::text,''),'|' ORDER BY a.attnum),'') "
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped "
            "WHERE n.nspname='public' AND NOT c.relname=ANY(ARRAY[" +
            ','.join("'" + table + "'" for table in LIMITED_TABLES) +
            "]) GROUP BY c.oid,c.relname,c.relacl ORDER BY c.relname;").stdout

    def test_scoped_leadership_job_changes_only_six_objects_and_refuses_incomplete_schema(self):
        # The production helper pins the existing role name. It is created only
        # within this generated synthetic database, with no real credentials.
        role = 'falcon_runtime'
        self.psql('CREATE ROLE falcon_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
            'NOREPLICATION NOBYPASSRLS NOINHERIT;')
        try:
            self.psql(SQL.read_text(), role=role)
            with self.leadership_tables():
                before = self.nonlimited_acl_snapshot()
                self.psql(SCOPED_SQL.read_text(), role=role)
                self.assertEqual(self.nonlimited_acl_snapshot(), before)
                first_acl = self.limited_acl_snapshot(role)
                self.psql(SCOPED_SQL.read_text(), role=role)
                self.assertEqual(self.limited_acl_snapshot(role), first_acl)
                self.assertEqual(self.nonlimited_acl_snapshot(), before)
                self.assert_startup_accepts(role)
                self.denied(role, "UPDATE public.department_leadership_events SET action='forbidden'")
                self.denied(role, 'DELETE FROM public.department_office_appointments')
                self.denied(role, 'INSERT INTO public.student_identity_email_changes '
                    "(tenant_id,user_id,student_login_id,new_email) VALUES "
                    "(gen_random_uuid(),gen_random_uuid(),'forbidden','forbidden@example.invalid')")
                for grant, revoke in [
                    ('GRANT UPDATE(action) ON public.department_leadership_events TO PUBLIC',
                     'REVOKE UPDATE(action) ON public.department_leadership_events FROM PUBLIC'),
                    ('GRANT INSERT(new_email) ON public.student_identity_email_changes TO PUBLIC',
                     'REVOKE INSERT(new_email) ON public.student_identity_email_changes FROM PUBLIC')]:
                    self.psql(grant + ';')
                    try:
                        current = self.limited_acl_snapshot(role)
                        result = self.psql(SCOPED_SQL.read_text(), role=role, check=False)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertEqual(self.limited_acl_snapshot(role), current)
                        self.assertEqual(self.nonlimited_acl_snapshot(), before)
                    finally:
                        self.psql(revoke + ';')
                self.psql('ALTER TABLE public.student_identity_email_changes RENAME TO fixture_saved_email_ledger;')
                try:
                    before_incomplete = self.nonlimited_acl_snapshot()
                    limited_before = self.limited_acl_snapshot(role)
                    result = self.psql(SCOPED_SQL.read_text(), role=role, check=False)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(self.nonlimited_acl_snapshot(), before_incomplete)
                    self.assertEqual(self.limited_acl_snapshot(role), limited_before)
                finally:
                    self.psql('ALTER TABLE public.fixture_saved_email_ledger RENAME TO student_identity_email_changes;')
                self.assert_startup_accepts(role)
        finally:
            self.psql('DROP OWNED BY falcon_runtime; DROP ROLE falcon_runtime;')

    def test_docker_go_projection_formats_handle_missing_labels_and_health(self):
        # Execute the actual Go templates in Docker, not FakeDocker. The official
        # PG18 fixture has no OCI revision labels and no image HEALTHCHECK.
        # Docker 29's strict missing-key mode used to reject .Config.Labels
        # before our JSON parser ran; a dotted lookup inside `if` also fails.
        probe = HOST.Preflight(run=lambda args: fixture_projected_output(self.command, args))
        image = probe.document(['image', 'inspect', '--format', HOST.IMAGE_FORMAT, self.image])
        self.assertEqual(set(image), {'Id', 'Revision'})
        self.assertEqual(image['Id'], self.image)
        self.assertIsNone(image['Revision'])
        container = probe.document(['container', 'inspect', '--format', HOST.CONTAINER_FORMAT, self.name])
        self.assertEqual(set(container), {'Id', 'Name', 'Image', 'Mounts', 'Revision', 'State'})
        self.assertRegex(container['Id'], r'^[0-9a-f]{64}$')
        self.assertEqual(container['Name'], '/' + self.name)
        self.assertEqual(container['Image'], self.image)
        self.assertIsInstance(container['Mounts'], list)
        self.assertIsNone(container['Revision'])
        self.assertEqual(container['State'], {'Running': True, 'Paused': False,
                                             'Restarting': False, 'Health': None})
        output = fixture_projected_output(self.command,
            ['container', 'inspect', '--format', HOST.PGDATA_FORMAT, self.name])
        try:
            pgdata = json.loads(output)
        except ValueError:
            raise AssertionError('synthetic PGDATA projection is not one valid JSON value') from None
        self.assertTrue(isinstance(pgdata, str) and
                        pgdata.startswith('PGDATA=/var/lib/postgresql/'),
                        'synthetic PGDATA projection must select only its expected absolute path')

    def test_business_crud_sequences_ledger_read_and_exact_view_refresh(self):
        role = self.new_role()
        self.assertEqual(self.psql("SELECT reltoastrelid <> 0 FROM pg_class "
                                  "WHERE oid='public.business_records'::regclass;").stdout.decode().strip(), 't')
        self.apply(role)
        # A second application preserves data and the same boundaries.
        self.apply(role)
        # Evaluate the real exported startup query too: catalog rows include
        # TOAST tables and indexes which must not reach sequence-only probes.
        query = subprocess.run(['node', '-e',
            'process.stdout.write(require(process.argv[1]).ROLE_QUERY)', str(RUNTIME)],
            capture_output=True, check=True, timeout=10).stdout.decode()
        metadata = json.loads(self.psql('SET ROLE ' + role + '; SELECT row_to_json(boundary) '
                                       'FROM (' + query + ') boundary;').stdout.decode().splitlines()[-1])
        self.assertEqual(metadata.pop('database_name'), 'postgres')
        self.assertEqual(metadata.pop('role_name'), role)
        self.assertTrue(all(value is False for value in metadata.values()))
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

    def test_public_ledger_writes_sequence_reset_and_elevated_grants_refused(self):
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

    def test_direct_column_ledger_write_is_removed_and_select_preserved(self):
        role = self.new_role()
        self.psql('GRANT INSERT(filename) ON public.schema_migrations TO ' + role + ';')
        self.assertEqual(self.psql("SELECT has_column_privilege('" + role +
            "','public.schema_migrations','filename','INSERT');").stdout.decode().strip(), 't')
        # PG18 REVOKE on a table also removes corresponding direct column ACLs.
        # Normalization is safe only if the effective ledger boundary is SELECT-only.
        self.apply(role)
        self.assertEqual(self.psql("SELECT has_table_privilege('" + role +
            "','public.schema_migrations','SELECT');").stdout.decode().strip(), 't')
        self.assertEqual(self.psql("SELECT has_table_privilege('" + role +
            "','public.schema_migrations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN');"
            ).stdout.decode().strip(), 'f')
        self.assertEqual(self.psql("SELECT has_any_column_privilege('" + role +
            "','public.schema_migrations','INSERT,UPDATE,REFERENCES');").stdout.decode().strip(), 'f')
        self.psql('SET ROLE ' + role + '; SELECT filename FROM public.schema_migrations;')
        self.denied(role, "INSERT INTO public.schema_migrations(filename) VALUES ('forbidden')")

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
