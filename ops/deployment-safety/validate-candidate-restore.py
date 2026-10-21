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


def validate_relay_endpoint(current, named, sock, original, expected_socket, names):
    if ((current.st_dev, current.st_ino) != (original.st_dev, original.st_ino) or
            (named.st_dev, named.st_ino) != (original.st_dev, original.st_ino) or
            not stat.S_ISDIR(current.st_mode) or current.st_uid != 70 or current.st_gid != 61001 or
            stat.S_IMODE(current.st_mode) != 0o710 or names != ['.s.PGSQL.55432'] or
            not stat.S_ISSOCK(sock.st_mode) or sock.st_uid != 70 or sock.st_gid != 61001 or
            stat.S_IMODE(sock.st_mode) != 0o660 or sock.st_nlink != 1 or
            (sock.st_dev, sock.st_ino) != expected_socket):
        fail('relay-endpoint-identity')


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


IDENTITY_JS = r"""
const fs=require('fs');
try {
 const read=p=>Object.fromEntries(fs.readFileSync(p,'utf8').split('\n').filter(x=>x.includes(':')).map(x=>[x.slice(0,x.indexOf(':')),x.slice(x.indexOf(':')+1).trim()]));
 const one=read('/proc/1/status'),self=read('/proc/self/status');
 const nums=x=>x?x.split(/\s+/).map(Number):[];
 const zero=x=>['CapEff','CapPrm','CapInh','CapBnd','CapAmb'].every(k=>/^[0-9a-f]+$/i.test(x[k]||'')&&BigInt('0x'+x[k])===0n);
 process.stdout.write(JSON.stringify({uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),
  pid1_uids:nums(one.Uid),pid1_gids:nums(one.Gid),pid1_groups:nums(one.Groups),
  capabilities_zero:zero(one)&&zero(self),no_new_privileges:one.NoNewPrivs==='1'&&self.NoNewPrivs==='1'}));
} catch {process.exitCode=1;}
"""


CODE_PERMISSIONS_JS = r"""
'use strict';
const fs=require('fs'),path=require('path').posix;
const roots=['/app/dist','/app/scripts','/app/node_modules','/app/migrations','/app/data','/app/package.json'];
let files=0,dirs=0,links=0,total=0;
try {
 const app=fs.lstatSync('/app');
 if(!app.isDirectory()||app.isSymbolicLink()||app.uid!==0||(app.mode&0o222)||(app.mode&0o6000))throw Error();
 const stack=roots.map(p=>[p,0]);
 while(stack.length){
  const [p,depth]=stack.pop();
  if(++total>100000||depth>64||p.length>4096)throw Error();
  const item=fs.lstatSync(p);
  if(item.uid!==0)throw Error();
  if(item.isSymbolicLink()){
   const real=fs.realpathSync(p);
   if(!roots.some(r=>real===r||real.startsWith(r+'/')))throw Error();
   const target=fs.statSync(real);
   if(target.uid!==0||(target.mode&0o222)||(target.mode&0o6000)||(!target.isFile()&&!target.isDirectory()))throw Error();
   links++;continue;
  }
  if((item.mode&0o222)||(item.mode&0o6000))throw Error();
  if(item.isDirectory()){
   dirs++;
   for(const child of fs.readdirSync(p)){
    if(!child||child==='.'||child==='..'||child.includes('/')||child.includes('\0'))throw Error();
    stack.push([path.join(p,child),depth+1]);
   }
  }else if(item.isFile())files++;else throw Error();
 }
 process.stdout.write(JSON.stringify({schema_version:1,code_permission_inventory_complete:true,
  code_owned_by_root:true,code_write_bits_clear:true,code_setid_bits_clear:true,
  files_checked:files,directories_checked:dirs+1,symlinks_checked:links}));
} catch {process.stdout.write(JSON.stringify({schema_version:1,code_permission_inventory_complete:false,error_code:'code-permissions-refused'}));process.exitCode=1;}
"""


RELAY_JS = r"""
'use strict';
const fs=require('fs'),net=require('net');
const endpoint='/relay/.s.PGSQL.55432',upstream='/upstream-socket/.s.PGSQL.55432';
const pairs=new Set();let stopping=false;
function stop(code){if(stopping)return;stopping=true;for(const p of pairs){p[0].destroy();p[1].destroy();}process.exit(code);}
try {
 const d=fs.lstatSync('/relay');
 if(process.getuid()!==70||process.getgid()!==61001||!d.isDirectory()||d.isSymbolicLink()||d.uid!==70||d.gid!==61001||(d.mode&0o777)!==0o710||fs.readdirSync('/relay').length)throw Error();
 process.umask(0o117);
 const server=net.createServer({pauseOnConnect:true,allowHalfOpen:false},client=>{
  if(pairs.size>=4){client.destroy();return;}
  const remote=net.createConnection({path:upstream,allowHalfOpen:false,highWaterMark:65536});
  const pair=[client,remote];pairs.add(pair);
  const timer=setTimeout(()=>{client.destroy();remote.destroy();},5000);
  const close=()=>{clearTimeout(timer);pairs.delete(pair);client.destroy();remote.destroy();};
  client.on('error',close);remote.on('error',close);client.on('close',close);remote.on('close',close);
  remote.once('connect',()=>{clearTimeout(timer);client.pipe(remote);remote.pipe(client);client.resume();});
 });
 server.on('error',()=>stop(1));
 server.listen(endpoint,()=>{
  fs.chmodSync(endpoint,0o660);
  process.stdout.write('{"schema_version":1,"relay_ready":true}\n');
 });
 setTimeout(()=>stop(1),300000);
 process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
} catch {stop(1);}
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


def relay_command(docker, name, image, metadata, upstream, endpoint):
    command = base_run(docker, name, image, memory='64m', cpus='0.1', user='70:61001', remove=False)
    command += image_environment_resets(metadata, {'NODE_OPTIONS'})
    command += ['--env', 'NODE_OPTIONS=--max-old-space-size=32', '--detach']
    command += mount_arg(upstream, '/upstream-socket')
    command += mount_arg(endpoint, '/relay', False)
    return command + ['--entrypoint', 'node', image, '-e', RELAY_JS]


class CandidateHook:
    def __init__(self, restore, backup, config, image, redis_source, role_sql, user_mode='root'):
        self.restore, self.backup, self.config = restore, backup, config
        self.image, self.redis_source, self.role_sql = image, redis_source, role_sql
        if user_mode not in ('root', 'nonroot'):
            fail('candidate-user-mode')
        self.user_mode = user_mode
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

    def observe_identity(self, docker, monitor, name, uid, gid):
        code, data = run_guarded(docker + ['exec', name, 'node', '-e', IDENTITY_JS], monitor)
        value = decode_json(data)
        if (code or not isinstance(value, dict) or value.get('uid') != uid or value.get('gid') != gid or
                value.get('pid1_uids') != [uid] * 4 or value.get('pid1_gids') != [gid] * 4 or
                not isinstance(value.get('groups'), list) or not isinstance(value.get('pid1_groups'), list) or
                any(item != gid for item in value['groups'] + value['pid1_groups']) or
                value.get('capabilities_zero') is not True or value.get('no_new_privileges') is not True):
            fail('observed-nonroot-identity-or-caps')
        return {'uid': uid, 'gid': gid, 'all_capabilities_zero': True, 'no_new_privileges': True}

    def observe_code_permissions(self, docker, monitor, name, inputs):
        code, data = run_guarded(docker + ['exec', name, 'node', '-e', CODE_PERMISSIONS_JS], monitor, timeout=90)
        private_write(inputs, 'code-permissions.json', data)
        value = decode_json(data)
        flags = ['code_permission_inventory_complete', 'code_owned_by_root', 'code_write_bits_clear', 'code_setid_bits_clear']
        counts = ['files_checked', 'directories_checked', 'symlinks_checked']
        if (code or not isinstance(value, dict) or value.get('schema_version') != 1 or
                any(value.get(key) is not True for key in flags) or
                any(type(value.get(key)) is not int or value[key] < 0 for key in counts) or
                value['files_checked'] < 1 or value['directories_checked'] < 1):
            fail('observed-code-permissions')
        return value

    @contextlib.contextmanager
    def relay(self, context, monitor, inputs, image):
        docker = self.backup.DOCKER
        name = checked_name(context['sandbox_name'] + '-content')
        endpoint = inputs / 'relay-socket'
        os.mkdir(str(endpoint), 0o710)
        directory_fd = os.open(str(endpoint), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        expected_socket = None
        try:
            os.fchown(directory_fd, 70, 61001)
            os.fchmod(directory_fd, 0o710)
            original = os.fstat(directory_fd)
            command = relay_command(docker, name, self.image, image, context['socket_mount_source'], endpoint)
            with self.detached(command, monitor, name, inputs, 'relay-operations.log') as process:
                bounded = DeadlineMonitor(monitor, 30)
                with self.restore.GuardedStream(process.stdout, bounded) as stream:
                    container_id = stream.read(129).strip().decode()
                wait_bounded(process, bounded)
                if not ID_RE.fullmatch(container_id):
                    fail('relay-id')
                runtime = docker_json(docker, monitor, ['inspect', '--format', '{{json .HostConfig}}', name])
                if (runtime.get('NetworkMode') != 'none' or runtime.get('PortBindings') or runtime.get('Privileged') or
                        not runtime.get('ReadonlyRootfs') or runtime.get('Memory') != 64 * 1024 * 1024 or
                        runtime.get('NanoCpus') != 100000000 or 'ALL' not in (runtime.get('CapDrop') or []) or runtime.get('CapAdd')):
                    fail('relay-isolation')
                identity = self.observe_identity(docker, monitor, name, 70, 61001)
                deadline = time.monotonic() + 15
                while True:
                    bounded.tick()
                    try:
                        candidate = os.stat('.s.PGSQL.55432', dir_fd=directory_fd, follow_symlinks=False)
                    except FileNotFoundError:
                        if time.monotonic() >= deadline:
                            fail('relay-not-ready')
                        time.sleep(0.1)
                        continue
                    expected_socket = (candidate.st_dev, candidate.st_ino)
                    break
                def check_endpoint():
                    monitor.tick()
                    current = os.fstat(directory_fd)
                    named = os.stat(str(endpoint), follow_symlinks=False)
                    sock = os.stat('.s.PGSQL.55432', dir_fd=directory_fd, follow_symlinks=False)
                    validate_relay_endpoint(current, named, sock, original, expected_socket, os.listdir(directory_fd))
                    running = docker_json(docker, monitor, ['inspect', '--format', '{{json .State.Running}}', name])
                    if running is not True:
                        fail('relay-exited')
                check_endpoint()
                yield endpoint, identity, check_endpoint
                check_endpoint()
            if not monitor.container_absent(name):
                fail('relay-cleanup-unconfirmed')
        finally:
            os.close(directory_fd)

    def __call__(self, context, monitor):
        if context['database'] != 'postgres':
            return {'execution_complete': True, 'candidate_check': 'not-applicable-non-business-database'}
        if self.backup.available_memory() < 2 * GIB:
            fail('candidate-memory-start-gate')
        docker = self.backup.DOCKER
        core_name = checked_name(context['sandbox_name'] + '-content')
        nonroot = self.user_mode == 'nonroot'
        name = checked_name(context['sandbox_name'] + ('-candidate' if nonroot else '-content'))
        redis_name = checked_name(context['sandbox_name'] + '-redis')
        session = Path(context['session_path'])
        session_fd = self.restore.open_anchor_directory(session)
        os.close(session_fd)
        inputs = session / 'candidate-validation'
        os.mkdir(str(inputs), 0o700)
        for child in ('uploads', 'wrong-uploads'):
            os.mkdir(str(inputs / child), 0o700)
        stage = 'image-review'
        relay_stack = contextlib.ExitStack()
        report = {'schema_version': 1, 'candidate_image_id': self.image,
                  'production_connection': False, 'production_credentials_mounted': False,
                  'production_uploads_mounted': False, 'external_network': False,
                  'execution_complete': False, 'candidate_checks_passed': False,
                  'candidate_user_mode': self.user_mode}
        try:
            image = image_metadata(docker, monitor, self.image)
            config = image.get('Config') or {}
            approved_users = ('61001:61001',) if nonroot else ('', '0', '0:0', 'root', 'root:root')
            if (config.get('Volumes') or config.get('Cmd') != ['node', 'scripts/runtime-start.cjs'] or
                    config.get('Entrypoint') not in (None, [], ['docker-entrypoint.sh']) or
                    config.get('User', '') not in approved_users):
                fail('unreviewed-entrypoint-or-uid-stage')
            report['image_default_user'] = config.get('User') or 'root (image default)'
            report['nonroot_proven'] = False
            report['test_capability_exception'] = None if nonroot else 'DAC_OVERRIDE'
            report['all_capabilities_dropped_proven'] = False
            redis_image = docker_json(docker, monitor, ['inspect', '--type', 'container', '--format', '{{json .Image}}', self.redis_source])
            image_metadata(docker, monitor, redis_image)
            report['redis_image_id'] = redis_image
            image_metadata(docker, monitor, self.config['image'])
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
            command = base_run(docker, core_name, self.config['image'], user='%s:%s' % (self.config['restore_uid'], self.config['restore_gid']))
            command += mount_arg(context['socket_mount_source'], '/restore-socket')
            command += mount_arg(inputs / 'fixture.sql', '/checks/fixture.sql') + mount_arg(self.role_sql, '/checks/runtime-role.sql')
            command += ['--entrypoint', 'psql', self.config['image'], '-X', '-w', '-h', '/restore-socket',
                '-p', '55432', '-U', 'restorecheck', '-d', 'restorecheck', '-v', 'ON_ERROR_STOP=1',
                '-v', 'runtime_role=falcon_runtime', '-v', 'runtime_database=restorecheck', '-v', 'runtime_schema=public',
                '-f', '/checks/fixture.sql', '-f', '/checks/runtime-role.sql']
            _, data = self.capture(command, monitor, core_name)
            private_write(inputs, 'role-operations.log', data)
            socket_source = context['socket_mount_source']
            check_endpoint = lambda: None
            if nonroot:
                stage = 'relay-start'
                socket_source, identity, check_endpoint = relay_stack.enter_context(self.relay(context, monitor, inputs, image))
                report['relay_identity'] = identity
                for child in ('uploads', 'wrong-uploads'):
                    os.chown(str(inputs / child), 61001, 61001)
                    os.chmod(str(inputs / child), 0o700)
            mountinfo = Path('/proc/self/mountinfo').read_text()
            boundary = {'schema_version': 1,
                'upload_mounts': [boundary_entry(inputs / 'uploads', '/app/uploads', mountinfo)],
                'readonly_mounts': [boundary_entry(socket_source, '/restore-socket', mountinfo, 'directory')],
                'database': {'host': '/restore-socket', 'port': 55432, 'name': 'restorecheck',
                             'role': 'falcon_runtime', 'enforce_least_privilege': True}}
            write_json(inputs, 'storage-boundary.json', boundary, 0o444)
            if nonroot:
                fd = os.open(str(inputs / 'storage-boundary.json'), os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    os.fchmod(fd, 0o444)
                finally:
                    os.close(fd)
            stage = 'storage-guard-tests'
            resets = image_environment_resets(image, environment)
            def api_command(uploads, guard_only=True, network='none', detached=False):
                command = base_run(docker, name, self.image, network=network, memory='1g', cpus='0.5', remove=not detached)
                # Current production stage is root with Docker's DAC_OVERRIDE.
                # The private PG socket is UID70/0700. No other cap is restored;
                # readonly mounts still prevent filesystem writes through aliases.
                if not nonroot:
                    command += ['--cap-add', 'DAC_OVERRIDE']
                if detached:
                    command += ['--detach']
                command += resets + ['--env-file', str(inputs / 'candidate.env'), '--workdir', '/app']
                command += mount_arg(socket_source, '/restore-socket')
                command += mount_arg(inputs / 'storage-boundary.json', '/run/falcon/storage-boundary.json')
                if uploads is not None:
                    command += mount_arg(uploads, '/app/uploads', False)
                if guard_only:
                    command += ['--entrypoint', 'node', self.image, '-e', GUARD_JS]
                else:
                    command += [self.image]
                return command
            check_endpoint()
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
                            {item.removeprefix('CAP_') for item in (runtime.get('CapAdd') or [])} != (set() if nonroot else {'DAC_OVERRIDE'})):
                        fail('candidate-isolation')
                    if nonroot:
                        report['candidate_identity'] = self.observe_identity(docker, monitor, name, 61001, 61001)
                        report['code_permissions'] = self.observe_code_permissions(docker, monitor, name, inputs)
                        report['fixture_readonly_root'] = True
                        report['fixture_no_new_privileges'] = True
                        report['production_readonly_root_proven'] = False
                        report['production_no_new_privileges_proven'] = False
                    stage = 'candidate-health'
                    deadline = time.monotonic() + 180
                    while True:
                        check_endpoint()
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
                    check_endpoint()
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
            stage = 'relay-cleanup'
            relay_stack.close()
            if nonroot and not monitor.container_absent(core_name):
                fail('relay-cleanup-unconfirmed')
            report['nonroot_proven'] = nonroot
            report['all_capabilities_dropped_proven'] = nonroot
            report.update(execution_complete=True, candidate_checks_passed=True,
                          synthetic_fixture_added_after_count_proof=True,
                          full_application_recovery_proven=False)
            write_json(inputs, 'passed.json', report)
            self.reports.append(report)
            return report
        except BaseException as error:
            try:
                relay_stack.close()
            except BaseException as cleanup_error:
                error = cleanup_error
            write_json(inputs, 'failed.json', dict(report, stage=stage, error_type=type(error).__name__,
                error_code=str(error) if isinstance(error, CandidateError) else 'guard-or-process-failed', result='unproven'))
            raise error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/etc/falcon-local-backup/config.json')
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--approval-id', required=True)
    parser.add_argument('--candidate-image', required=True)
    parser.add_argument('--candidate-user-mode', choices=('root', 'nonroot'), default='root')
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
        hook = CandidateHook(restore, backup, config, args.candidate_image, args.redis_source_container, str(role_sql), args.candidate_user_mode)
        result = restore.run_restore(config, args.run_id, args.approval_id, hook)
        if len(hook.reports) != 1 or not hook.reports[0].get('candidate_checks_passed'):
            fail('candidate-checks-incomplete')
        print(json.dumps({'schema_version': 1, 'run_id': args.run_id,
            'candidate_image_id': args.candidate_image,
            'isolated_sql_restore_passed': result['isolated_sql_restore_passed'],
            'same_dump_counts_passed': result['same_dump_counts_passed'],
            'physical_tables_checked': result['physical_tables_checked'], 'rows_checked': result['rows_checked'],
            'candidate_checks_passed': True, 'actual_runtime_login': True, 'authenticated_me': True,
            'synthetic_disk_upload': True, 'candidate_user_mode': args.candidate_user_mode,
            'nonroot_proven': hook.reports[0]['nonroot_proven'],
            'test_capability_exception': hook.reports[0]['test_capability_exception'],
            'all_capabilities_dropped_proven': hook.reports[0]['all_capabilities_dropped_proven'],
            'code_permissions_verified': bool(hook.reports[0].get('code_permissions', {}).get('code_permission_inventory_complete')),
            'production_readonly_root_proven': False, 'production_no_new_privileges_proven': False,
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
