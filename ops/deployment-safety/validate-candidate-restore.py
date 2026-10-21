#!/usr/bin/env python3
"""Opt-in candidate startup against a disposable counted restore; never production."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
import uuid

TOOLS = Path('/opt/falcon-local-backup')
IMAGE_RE = re.compile(r'sha256:[0-9a-f]{64}')
ID_RE = re.compile(r'[0-9a-f]{64}')
NAME_RE = re.compile(r'falcon-restore-check-[0-9a-f]{32}-db-[0-9]+(?:-[a-z0-9-]{1,32})?')
GIB = 1024 ** 3
MAX_OUTPUT = 65536
MAX_LOG = 8 * 1024 * 1024


class CandidateError(RuntimeError):
    pass


def fail(code):
    # Only fixed stage codes are exposed; raw daemon/SQL/application output stays local.
    raise CandidateError(code)


def private_write(directory, name, data, mode=0o400):
    if not re.fullmatch(r'[a-z0-9_.-]{1,80}', name):
        fail('evidence-name')
    fd = os.open(str(directory / name), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def write_json(directory, name, value, mode=0o400):
    private_write(directory, name, (json.dumps(value, sort_keys=True) + '\n').encode(), mode)


def checked_name(value):
    if not NAME_RE.fullmatch(value):
        fail('generated-name')
    return value


def run_guarded(command, monitor, *, data=None, timeout=30, maximum=MAX_OUTPUT):
    """Drain bounded output while the existing health/memory/disk guard runs."""
    process = subprocess.Popen(command, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    selector = selectors.DefaultSelector()
    output = bytearray()
    deadline = time.monotonic() + timeout
    try:
        if data is not None:
            if len(data) > 4096:
                fail('input-bound')
            process.stdin.write(data)
            process.stdin.close()
        selector.register(process.stdout, selectors.EVENT_READ)
        while selector.get_map():
            monitor.tick()
            if time.monotonic() >= deadline:
                fail('command-timeout')
            for key, _ in selector.select(0.2):
                block = os.read(key.fileobj.fileno(), 65536)
                if not block:
                    selector.unregister(key.fileobj)
                else:
                    output.extend(block)
                    if len(output) > maximum:
                        fail('command-output-bound')
        while process.poll() is None:
            monitor.tick()
            if time.monotonic() >= deadline:
                fail('command-timeout')
            time.sleep(0.1)
        return process.returncode, bytes(output)
    finally:
        selector.close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if process.stdout:
            process.stdout.close()
        if process.stdin and not process.stdin.closed:
            process.stdin.close()


class DeadlineMonitor:
    def __init__(self, monitor, seconds):
        self.monitor = monitor
        self.deadline = time.monotonic() + seconds

    def tick(self, force=False):
        if time.monotonic() >= self.deadline:
            fail('helper-timeout')
        self.monitor.tick(force=force)


def wait_bounded(process, monitor):
    while process.poll() is None:
        monitor.tick()
        time.sleep(0.1)
    if process.returncode:
        fail('helper-failed')


def decode_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                fail('duplicate-metadata')
            result[key] = value
        return result
    try:
        return json.loads(data.decode('utf8'), object_pairs_hook=unique)
    except (ValueError, UnicodeError):
        fail('invalid-metadata')


def probe_report(data):
    prefix = b'FALCON_CANDIDATE_V1 '
    records = [line[len(prefix):] for line in data.splitlines() if line.startswith(prefix)]
    if len(records) != 1:
        fail('candidate-probe-protocol')
    return decode_json(records[0])


def docker_json(docker, monitor, args):
    code, data = run_guarded(docker + args, monitor)
    if code:
        fail('docker-metadata')
    return decode_json(data)


def image_metadata(docker, monitor, image):
    if not IMAGE_RE.fullmatch(image):
        fail('immutable-image')
    value = docker_json(docker, monitor, ['image', 'inspect', '--format', '{{json .}}', image])
    if not isinstance(value, dict) or value.get('Id') != image:
        fail('local-image-identity')
    return value


def image_environment_resets(metadata, supplied_keys=()):
    # Docker otherwise inherits image ENV even when a fresh env file is supplied.
    resets = []
    allowed = {'PATH', 'NODE_VERSION', 'YARN_VERSION'} | set(supplied_keys)
    for entry in metadata.get('Config', {}).get('Env') or []:
        if not isinstance(entry, str) or '=' not in entry:
            fail('image-environment')
        key = entry.split('=', 1)[0]
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
            fail('image-environment')
        if key not in allowed:
            resets += ['--env', key + '=']
    return resets


def mount_root_for(target, mountinfo):
    """Resolve only a protected normal host path; Docker later checks its inode."""
    target = str(target)
    candidates = []
    def unescape(value):
        if re.search(r'\\(?!040|011|012|134)', value):
            fail('mountinfo-escape')
        return re.sub(r'\\(040|011|012|134)', lambda m: chr(int(m.group(1), 8)), value)
    for line in mountinfo.splitlines():
        fields = line.split(' ')
        if len(fields) < 10 or '-' not in fields:
            fail('mountinfo-format')
        root, point = unescape(fields[3]), unescape(fields[4])
        if target == point or target.startswith(point.rstrip('/') + '/'):
            candidates.append((len(point), root, point))
    if not candidates:
        fail('mountinfo-target')
    length = max(row[0] for row in candidates)
    found = [row for row in candidates if row[0] == length]
    if len(found) != 1:
        fail('mountinfo-stacked')
    _, root, point = found[0]
    relative = os.path.relpath(target, point)
    return root if relative == '.' else os.path.normpath(root.rstrip('/') + '/' + relative)


def boundary_entry(host_path, destination, mountinfo, kind=None):
    info = os.stat(str(host_path), follow_symlinks=False)
    if not stat.S_ISDIR(info.st_mode):
        fail('fixture-directory')
    result = {'destination': destination, 'mount_root': mount_root_for(host_path, mountinfo),
              'device': '%s:%s' % (os.major(info.st_dev), os.minor(info.st_dev)), 'inode': str(info.st_ino)}
    if kind:
        result['kind'] = kind
    return result


def base_run(docker, name, image, *, network='none', memory='128m', cpus='0.25', user=None, remove=True):
    checked_name(name)
    if not IMAGE_RE.fullmatch(image):
        fail('immutable-image')
    command = docker + ['run', '--pull', 'never'] + (['--rm'] if remove else []) + ['--name', name,
        '--network', network, '--read-only', '--cap-drop', 'ALL',
        '--log-driver', 'local', '--log-opt', 'max-size=4m', '--log-opt', 'max-file=2',
        '--security-opt', 'no-new-privileges:true', '--memory', memory,
        '--memory-swap', memory, '--cpus', cpus, '--pids-limit', '128',
        '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=32m']
    if user is not None:
        command += ['--user', user]
    return command


def mount_arg(source, destination, readonly=True):
    if ',' in str(source) or not str(source).startswith('/'):
        fail('mount-source')
    return ['--mount', 'type=bind,src=%s,dst=%s%s' % (source, destination, ',readonly' if readonly else '')]


GUARD_JS = r"""
try {
 const result=require('./scripts/storage-boundary.cjs').assertStorageBoundary();
 process.stdout.write(JSON.stringify({storage_boundary_verified:true,upload_roots_verified:result.upload_roots_verified}));
} catch(error) {
 process.stdout.write(JSON.stringify({storage_boundary_refused:error.name==='StorageBoundaryError',error_code:error.code||'unknown'}));
 process.exitCode=1;
}
"""


PROBE_JS = r"""
'use strict';
const fs=require('fs'),http=require('http'),crypto=require('crypto');
require('reflect-metadata');
const {Client}=require('pg');
const emit=x=>process.stdout.write('FALCON_CANDIDATE_V1 '+JSON.stringify(x)+'\n');
function request(path,token){return new Promise((resolve,reject)=>{
 const req=http.get({hostname:'127.0.0.1',port:4000,path,headers:token?{Authorization:'Bearer '+token}:{}},res=>{
  let body='';res.setEncoding('utf8');res.on('data',x=>{body+=x;if(body.length>262144)req.destroy(new Error('bound'));});
  res.on('end',()=>{try{resolve({code:res.statusCode,body:JSON.parse(body)});}catch{reject(new Error('json'));}});
 });req.setTimeout(5000,()=>req.destroy(new Error('timeout')));req.on('error',reject);
});}
(async()=>{
 const client=new Client({host:'/restore-socket',port:55432,database:'restorecheck',user:'falcon_runtime',
  password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000,statement_timeout:5000});
 await client.connect();
 try{
  const identity=(await client.query('SELECT current_user AS role,current_database() AS database')).rows[0];
  if(identity.role!=='falcon_runtime'||identity.database!=='restorecheck')throw Error('identity');
  await client.query('BEGIN');
  await client.query("INSERT INTO public.falcon_candidate_fixture(value) VALUES ('synthetic-candidate')");
  await client.query("UPDATE public.falcon_candidate_fixture SET value='synthetic-updated' WHERE value='synthetic-candidate'");
  if((await client.query('SELECT count(*)::int AS n FROM public.falcon_candidate_fixture')).rows[0].n!==1)throw Error('crud');
  await client.query('DELETE FROM public.falcon_candidate_fixture');await client.query('ROLLBACK');
  for(const sql of ['CREATE TABLE public.falcon_forbidden(id int)','TRUNCATE public.falcon_candidate_fixture',
    'DELETE FROM public.schema_migrations']){
   await client.query('BEGIN');let denied=false;try{await client.query(sql);}catch(e){denied=e.code==='42501';}
   await client.query('ROLLBACK');if(!denied)throw Error('denial');
  }
  const health=await request('/health');if(health.code!==200||health.body.status!=='ok')throw Error('health');
  const users=await client.query(`SELECT u.user_id,u.tenant_id FROM public.users u JOIN public.roles r ON r.role_id=u.role_id
    WHERE u.is_active=true AND u.deleted_at IS NULL AND u.tenant_id IS NOT NULL
    AND r.role_name NOT IN ('FacultyReadOnly','Parent') ORDER BY u.user_id LIMIT 1`);
  if(users.rows.length!==1)throw Error('no-active-fixture-user');
  const user=users.rows[0],now=Math.floor(Date.now()/1000);
  const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.user_id,tenantId:user.tenant_id,tenantSchema:'public',iat:now,exp:now+120});
  const token=unsigned+'.'+crypto.createHmac('sha256',process.env.JWT_SECRET).update(unsigned).digest('base64url');
  const me=await request('/auth/me',token);
  if(me.code!==200||me.body.user_id!==user.user_id||me.body.tenant_id!==user.tenant_id)throw Error('authenticated-me');
  const {ObjectStorageService}=require('./dist/storage/object-storage.service');
  const service=new ObjectStorageService({get:(key,fallback)=>process.env[key]===undefined?fallback:process.env[key]});
  if(service.isEnabled())throw Error('external-storage');
  const key='candidate-validation/synthetic-'+crypto.randomBytes(8).toString('hex')+'.txt';
  const contents=Buffer.from('FALCON disposable candidate upload check\n');
  const stored=await service.upload('synthetic',key,contents,'text/plain');
  if(stored.bucket!=='disk'||!fs.readFileSync('/app/uploads/'+key).equals(contents))throw Error('upload');
  emit({schema_version:1,execution_complete:true,actual_runtime_login:true,
   business_crud:true,ddl_and_ledger_denials:true,health:true,authenticated_me:true,synthetic_disk_upload:true});
 }finally{await client.end();}
})().catch(()=>{emit({schema_version:1,execution_complete:false,error_code:'candidate-probe-failed'});process.exitCode=1;});
"""


class CandidateHook:
    def __init__(self, restore, backup, config, image, redis_source, role_sql):
        self.restore, self.backup, self.config = restore, backup, config
        self.image, self.redis_source, self.role_sql = image, redis_source, role_sql
        self.reports = []

    def capture(self, command, monitor, name, *, allow_failure=False):
        bounded = DeadlineMonitor(monitor, 120)
        with monitor.helper(command, checked_name(name)) as process:
            with self.restore.GuardedStream(process.stdout, bounded) as stream:
                data = stream.read(MAX_OUTPUT + 1)
            if len(data) > MAX_OUTPUT:
                fail('helper-output-bound')
            while process.poll() is None:
                bounded.tick()
                time.sleep(0.1)
            code = process.returncode
        if not monitor.container_absent(name):
            fail('helper-cleanup-unconfirmed')
        if code and not allow_failure:
            fail('helper-failed')
        return code, data

    @contextlib.contextmanager
    def detached(self, command, monitor, name, directory, log_name):
        with monitor.helper(command, checked_name(name)) as process:
            try:
                yield process
            finally:
                # These logs may include restored values. Retain only on server.
                code, logs = run_guarded(self.backup.DOCKER + ['logs', '--tail', '2000', name],
                                         monitor, maximum=MAX_LOG)
                private_write(directory, log_name, logs)
                if code:
                    fail('private-log-retention')

    def __call__(self, context, monitor):
        if context['database'] != 'postgres':
            return {'execution_complete': True, 'candidate_check': 'not-applicable-non-business-database'}
        if self.backup.available_memory() < 2 * GIB:
            fail('candidate-memory-start-gate')
        docker = self.backup.DOCKER
        name = checked_name(context['sandbox_name'] + '-content')
        redis_name = checked_name(context['sandbox_name'] + '-redis')
        session = Path(context['session_path'])
        session_fd = self.restore.open_anchor_directory(session)
        os.close(session_fd)
        inputs = session / 'candidate-validation'
        os.mkdir(str(inputs), 0o700)
        for child in ('uploads', 'wrong-uploads'):
            os.mkdir(str(inputs / child), 0o700)
        stage = 'image-review'
        report = {'schema_version': 1, 'candidate_image_id': self.image,
                  'production_connection': False, 'production_credentials_mounted': False,
                  'production_uploads_mounted': False, 'external_network': False,
                  'execution_complete': False, 'candidate_checks_passed': False}
        try:
            image = image_metadata(docker, monitor, self.image)
            config = image.get('Config') or {}
            if (config.get('Volumes') or config.get('Cmd') != ['node', 'scripts/runtime-start.cjs'] or
                    config.get('Entrypoint') not in (None, [], ['docker-entrypoint.sh']) or
                    config.get('User', '') not in ('', '0', '0:0', 'root', 'root:root')):
                fail('unreviewed-entrypoint-or-uid-stage')
            report['image_default_user'] = config.get('User') or 'root (image default)'
            report['nonroot_proven'] = False
            report['test_capability_exception'] = 'DAC_OVERRIDE'
            report['all_capabilities_dropped_proven'] = False
            redis_image = docker_json(docker, monitor, ['inspect', '--type', 'container', '--format', '{{json .Image}}', self.redis_source])
            image_metadata(docker, monitor, redis_image)
            report['redis_image_id'] = redis_image
            image_metadata(docker, monitor, self.config['image'])
            mountinfo = Path('/proc/self/mountinfo').read_text()
            boundary = {'schema_version': 1,
                'upload_mounts': [boundary_entry(inputs / 'uploads', '/app/uploads', mountinfo)],
                'readonly_mounts': [boundary_entry(context['socket_mount_source'], '/restore-socket', mountinfo, 'directory')],
                'database': {'host': '/restore-socket', 'port': 55432, 'name': 'restorecheck',
                             'role': 'falcon_runtime', 'enforce_least_privilege': True}}
            write_json(inputs, 'storage-boundary.json', boundary, 0o444)
            password, jwt = os.urandom(32).hex(), os.urandom(48).hex()
            environment = {'NODE_ENV': 'production', 'PORT': '4000', 'NODE_OPTIONS': '--max-old-space-size=768',
                'DB_HOST': '/restore-socket', 'DB_PORT': '55432', 'DB_DATABASE': 'restorecheck',
                'DB_USERNAME': 'falcon_runtime', 'DB_PASSWORD': password, 'DB_SYNCHRONIZE': 'false',
                'DB_POOL_MAX': '1', 'DB_POOL_MIN': '0', 'JWT_SECRET': jwt, 'UPLOAD_PATH': '/app/uploads',
                'REDIS_HOST': '127.0.0.1', 'REDIS_PORT': '6379', 'REDIS_TLS': 'false',
                'PORTAL_EMAIL_DELIVERY_ENABLED': 'false', 'S3_ENDPOINT': '', 'AUTH_PROVIDER': 'local',
                'FRONTEND_URL': 'http://localhost:3000', 'SAAS_BASE_DOMAIN': 'localhost',
                'TYPEORM_LOGGING': 'false'}
            private_write(inputs, 'candidate.env', ''.join('%s=%s\n' % item for item in environment.items()).encode())
            # Synthetic-only role and table are created AFTER the core's exact restored counts.
            initialization = ("\\set ON_ERROR_STOP on\nDO $$BEGIN IF current_database()<>'restorecheck' OR current_user<>'restorecheck' "
                "OR inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'wrong disposable target'; END IF; END$$;\n"
                "CREATE ROLE falcon_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '" + password + "';\n"
                "CREATE TABLE public.falcon_candidate_fixture(id bigserial PRIMARY KEY,value text);\n")
            private_write(inputs, 'fixture.sql', initialization.encode())
            os.chown(str(inputs / 'fixture.sql'), self.config['restore_uid'], self.config['restore_gid'])
            stage = 'disposable-role-boundary'
            command = base_run(docker, name, self.config['image'], user='%s:%s' % (self.config['restore_uid'], self.config['restore_gid']))
            command += mount_arg(context['socket_mount_source'], '/restore-socket')
            command += mount_arg(inputs / 'fixture.sql', '/checks/fixture.sql') + mount_arg(self.role_sql, '/checks/runtime-role.sql')
            command += ['--entrypoint', 'psql', self.config['image'], '-X', '-w', '-h', '/restore-socket',
                '-p', '55432', '-U', 'restorecheck', '-d', 'restorecheck', '-v', 'ON_ERROR_STOP=1',
                '-v', 'runtime_role=falcon_runtime', '-v', 'runtime_database=restorecheck', '-v', 'runtime_schema=public',
                '-f', '/checks/fixture.sql', '-f', '/checks/runtime-role.sql']
            _, data = self.capture(command, monitor, name)
            private_write(inputs, 'role-operations.log', data)
            stage = 'storage-guard-tests'
            resets = image_environment_resets(image, environment)
            def api_command(uploads, guard_only=True, network='none', detached=False):
                command = base_run(docker, name, self.image, network=network, memory='1g', cpus='0.5', remove=not detached)
                # Current production stage is root with Docker's DAC_OVERRIDE.
                # The private PG socket is UID70/0700. No other cap is restored;
                # readonly mounts still prevent filesystem writes through aliases.
                command += ['--cap-add', 'DAC_OVERRIDE']
                if detached:
                    command += ['--detach']
                command += resets + ['--env-file', str(inputs / 'candidate.env'), '--workdir', '/app']
                command += mount_arg(context['socket_mount_source'], '/restore-socket')
                command += mount_arg(inputs / 'storage-boundary.json', '/run/falcon/storage-boundary.json')
                if uploads is not None:
                    command += mount_arg(uploads, '/app/uploads', False)
                if guard_only:
                    command += ['--entrypoint', 'node', self.image, '-e', GUARD_JS]
                else:
                    command += [self.image]
                return command
            code, data = self.capture(api_command(inputs / 'uploads'), monitor, name)
            positive = decode_json(data)
            if positive != {'storage_boundary_verified': True, 'upload_roots_verified': 1}:
                fail('positive-storage-guard')
            for label, source in [('missing', None), ('wrong', inputs / 'wrong-uploads')]:
                code, data = self.capture(api_command(source), monitor, name, allow_failure=True)
                private_write(inputs, 'guard-' + label + '.log', data)
                if code != 1 or decode_json(data) != {'storage_boundary_refused': True, 'error_code': 'mount-identity'}:
                    fail('negative-storage-guard')
            report['storage_guard_positive_and_negative_checks'] = True
            stage = 'redis-start'
            ids = []
            for flag in ('-u', '-g'):
                probe_name = checked_name(context['sandbox_name'] + '-redis-id')
                command = base_run(docker, probe_name, redis_image)
                _, data = self.capture(command + ['--entrypoint', 'id', redis_image, flag, 'redis'], monitor, probe_name)
                if not re.fullmatch(rb'[1-9][0-9]{0,8}\n?', data):
                    fail('redis-numeric-user')
                ids.append(data.strip().decode())
            redis_command = base_run(docker, redis_name, redis_image, memory='64m', cpus='0.1', user=':'.join(ids), remove=False)
            redis_command += ['--detach', '--entrypoint', 'redis-server', redis_image, '--bind', '127.0.0.1',
                '--protected-mode', 'yes', '--port', '6379', '--save', '', '--appendonly', 'no',
                '--maxmemory', '32mb', '--maxmemory-policy', 'noeviction']
            with self.detached(redis_command, monitor, redis_name, inputs, 'redis-operations.log') as redis_process:
                launch_monitor = DeadlineMonitor(monitor, 30)
                with self.restore.GuardedStream(redis_process.stdout, launch_monitor) as stream:
                    redis_id = stream.read(129).strip().decode()
                wait_bounded(redis_process, launch_monitor)
                if not ID_RE.fullmatch(redis_id):
                    fail('redis-id')
                redis_config = docker_json(docker, monitor, ['inspect', '--format', '{{json .HostConfig}}', redis_name])
                if redis_config.get('NetworkMode') != 'none' or redis_config.get('PortBindings') or redis_config.get('Binds'):
                    fail('redis-isolation')
                stage = 'candidate-start'
                with self.detached(api_command(inputs / 'uploads', False, 'container:' + redis_id, True), monitor, name, inputs, 'candidate-application.log') as process:
                    launch_monitor = DeadlineMonitor(monitor, 30)
                    with self.restore.GuardedStream(process.stdout, launch_monitor) as stream:
                        app_id = stream.read(129).strip().decode()
                    wait_bounded(process, launch_monitor)
                    if not ID_RE.fullmatch(app_id):
                        fail('candidate-id')
                    runtime = docker_json(docker, monitor, ['inspect', '--format', '{{json .HostConfig}}', name])
                    if (runtime.get('NetworkMode') != 'container:' + redis_id or runtime.get('PortBindings') or
                            runtime.get('Privileged') or not runtime.get('ReadonlyRootfs') or
                            runtime.get('Memory') != GIB or runtime.get('NanoCpus') != 500000000 or
                            'ALL' not in (runtime.get('CapDrop') or []) or
                            {item.removeprefix('CAP_') for item in (runtime.get('CapAdd') or [])} != {'DAC_OVERRIDE'}):
                        fail('candidate-isolation')
                    stage = 'candidate-health'
                    deadline = time.monotonic() + 180
                    while True:
                        monitor.tick()
                        code, _ = run_guarded(docker + ['exec', name, 'node', 'scripts/healthcheck.js'], monitor, timeout=10)
                        if code == 0:
                            break
                        if time.monotonic() >= deadline:
                            fail('candidate-health-timeout')
                        state = docker_json(docker, monitor, ['inspect', '--format', '{{json .State.Running}}', name])
                        if state is not True:
                            fail('candidate-exited')
                        time.sleep(1)
                    stage = 'candidate-auth-crud-upload'
                    code, data = run_guarded(docker + ['exec', '-i', '--workdir', '/app', name, 'node', '-'], monitor,
                                             data=PROBE_JS.encode(), timeout=60)
                    private_write(inputs, 'candidate-probe.log', data)
                    probe = probe_report(data)
                    required = ['execution_complete', 'actual_runtime_login', 'business_crud', 'ddl_and_ledger_denials',
                                'health', 'authenticated_me', 'synthetic_disk_upload']
                    if (code or not isinstance(probe, dict) or set(probe) != set(required) | {'schema_version'} or
                            probe.get('schema_version') != 1 or any(probe.get(key) is not True for key in required)):
                        fail('candidate-probe-incomplete')
                    report['checks'] = probe
                if not monitor.container_absent(name):
                    fail('candidate-cleanup-unconfirmed')
            if not monitor.container_absent(redis_name):
                fail('redis-cleanup-unconfirmed')
            report.update(execution_complete=True, candidate_checks_passed=True,
                          synthetic_fixture_added_after_count_proof=True,
                          full_application_recovery_proven=False)
            write_json(inputs, 'passed.json', report)
            self.reports.append(report)
            return report
        except BaseException as error:
            write_json(inputs, 'failed.json', dict(report, stage=stage, error_type=type(error).__name__,
                error_code=str(error) if isinstance(error, CandidateError) else 'guard-or-process-failed', result='unproven'))
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/falcon-local-backup/config.json')
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--approval-id', required=True)
    parser.add_argument('--candidate-image', required=True)
    parser.add_argument('--redis-source-container', required=True, help='Existing full container ID; read only image observation')
    parser.add_argument('--i-confirm-disposable-restore', action='store_true', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0 or sys.platform != 'linux':
        fail('linux-root-dispatcher-required')
    if not IMAGE_RE.fullmatch(args.candidate_image) or not ID_RE.fullmatch(args.redis_source_container):
        fail('explicit-immutable-identities-required')
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', args.approval_id):
        fail('approval-reference')
    # Fixed reviewed installed tools only. No import path or shell plugin option.
    sys.path.insert(0, str(TOOLS))
    import restore_check as restore
    import falcon_backup as backup
    backup.ensure_runtime_directory()
    def interrupted(signum, frame):
        fail('interrupted')
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    with backup.lock('/run/falcon-local-backup/lock'):
        if backup.available_memory() < 2 * GIB:
            fail('candidate-memory-start-gate')
        config = backup.load_config(args.config)
        if config.get('restore_uid') != 70 or config.get('restore_gid') != 70 or 'postgres' not in config['databases']:
            fail('reviewed-restore-scope')
        role_sql = Path(__file__).resolve().with_name('runtime-role.sql')
        os.close(backup.trusted_file(str(role_sql)))
        hook = CandidateHook(restore, backup, config, args.candidate_image, args.redis_source_container, str(role_sql))
        result = restore.run_restore(config, args.run_id, args.approval_id, hook)
        if len(hook.reports) != 1 or not hook.reports[0].get('candidate_checks_passed'):
            fail('candidate-checks-incomplete')
        print(json.dumps({'schema_version': 1, 'run_id': args.run_id,
            'candidate_image_id': args.candidate_image,
            'isolated_sql_restore_passed': result['isolated_sql_restore_passed'],
            'same_dump_counts_passed': result['same_dump_counts_passed'],
            'physical_tables_checked': result['physical_tables_checked'], 'rows_checked': result['rows_checked'],
            'candidate_checks_passed': True, 'actual_runtime_login': True, 'authenticated_me': True,
            'synthetic_disk_upload': True, 'nonroot_proven': False,
            'test_capability_exception': 'DAC_OVERRIDE', 'all_capabilities_dropped_proven': False,
            'production_restore': False, 'full_application_recovery_proven': False}))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except BaseException as error:
        # Do not forward exception values, SQL, user records, tokens or logs.
        if isinstance(error, KeyboardInterrupt):
            code = 'interrupted'
        elif isinstance(error, CandidateError):
            code = str(error)
        else:
            code = type(error).__name__
        print('FALCON candidate restore refused/failed; result unproven (' + code + ')', file=sys.stderr)
        sys.exit(1)
