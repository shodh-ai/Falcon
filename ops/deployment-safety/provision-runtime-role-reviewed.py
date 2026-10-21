#!/usr/bin/env python3
"""REVIEW BEFORE USE. Root/Linux-only, one-way role provisioning; no API cutover.

Run only after the migration-free guarded release is healthy. All credentials,
verifiers and raw failure output remain in an existing server-only 0700 folder.
This helper never changes Coolify, API environment/policy, ownership, PUBLIC,
business data, migrations, connection limits, existing keys or containers.
On partial failure retain the unused role and private files for investigation;
there is deliberately no automatic DROP, secret overwrite or production restore.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys


ROLE = 'falcon_runtime'
DOCKER = ['/usr/bin/docker', '--host', 'unix:///run/docker.sock']
REVISION = ('{{with index .Config "Labels"}}{{json (index . '
            '"org.opencontainers.image.revision")}}{{else}}null{{end}}')
CONTAINER = ('{"Id":{{json .Id}},"Image":{{json .Image}},"Revision":' + REVISION +
    ',"Mounts":{{json .Mounts}},"State":{"Running":{{json .State.Running}},'
    '"Paused":{{json .State.Paused}},"Restarting":{{json .State.Restarting}},'
    '"Health":{{with index .State "Health"}}{{json (index . "Status")}}'
    '{{else}}null{{end}}}}')
IMAGE = '{"Id":{{json .Id}},"Revision":' + REVISION + '}'

# Public source passed as node -e; secrets travel only through private stdin.
# Password callbacks refuse to release even a synthetic password to cleartext,
# MD5 or trust authentication. Event bodies/proofs are never retained or logged.
NODE_PROBE = r"""'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {Client}=require('/app/node_modules/pg');
let raw='';process.stdin.setEncoding('utf8');
process.stdin.on('data',s=>{raw+=s;if(raw.length>16384)process.exit(2)});
process.stdin.on('end',async()=>{
  try{
    const input=JSON.parse(raw), original=JSON.stringify(process.env);
    if(process.env.NODE_ENV!=='production'||process.env.DB_SYNCHRONIZE!=='false'||
       process.env.DB_HOST!==input.host||Number(process.env.DB_PORT||5432)!==input.port||
       process.env.DB_DATABASE!=='postgres'||process.env.DB_USERNAME!=='postgres'||
       (process.env.DB_USER&&process.env.DB_USER!=='postgres')||!process.env.DB_PASSWORD||
       Object.keys(process.env).some(k=>k.startsWith('MIGRATION_DB_')&&process.env[k]))throw Error();
    const file='/app/scripts/runtime-start.cjs';
    if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==input.runtime_sha256)throw Error();
    const {verifyDatabase}=require(file);
    if(typeof verifyDatabase!=='function')throw Error();
    if(input.precheck){process.stdout.write(JSON.stringify({precheck:true}));return}
    if(input.role!=='falcon_runtime'||typeof input.password!=='string'||
       !/^[0-9a-f]{64}$/.test(input.password))throw Error();
    const flags=[];
    class ScramClient extends Client{
      constructor(options){
        let state={sasl:false,continue:false,final:false,cleartext:false,md5:false};
        const supplied=options.password;
        super({...options,password:async()=>{
          if(!state.sasl||state.cleartext||state.md5)throw Error('SCRAM required');
          return supplied;
        }});
        this.proof=state;flags.push(state);
        this.connection.on('authenticationSASL',()=>{state.sasl=true});
        this.connection.on('authenticationSASLContinue',()=>{state.continue=true});
        this.connection.on('authenticationSASLFinal',()=>{state.final=true});
        this.connection.on('authenticationCleartextPassword',()=>{state.cleartext=true});
        this.connection.on('authenticationMD5Password',()=>{state.md5=true});
      }
    }
    const connection={host:input.host,port:input.port,database:'postgres',user:input.role,
      connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:5000,
      application_name:'falcon-runtime-auth-proof'};
    const wrong=new ScramClient({...connection,password:crypto.randomBytes(32).toString('hex')});
    let rejected=false;
    try{await wrong.connect()}catch(error){rejected=error.code==='28P01'}
    finally{try{await wrong.end()}catch{}}
    if(!rejected||!wrong.proof.sasl||!wrong.proof.continue||wrong.proof.cleartext||wrong.proof.md5)throw Error();
    // A copied object changes this standalone client's identity, never process.env
    // or the main API process. verifyDatabase executes metadata READ ONLY only.
    const env={...process.env,DB_USERNAME:input.role,DB_USER:input.role,DB_PASSWORD:input.password};
    const result=await verifyDatabase({env,policy:{host:input.host,port:input.port,
      name:'postgres',role:input.role,enforce_least_privilege:true},Client:ScramClient});
    const right=flags[1];
    if(flags.length!==2||!right.sasl||!right.continue||!right.final||right.cleartext||right.md5||
       result.database_boundary_verified!==true||result.least_privilege_enforced!==true||
       JSON.stringify(process.env)!==original)throw Error();
    process.stdout.write(JSON.stringify({wrong_password_rejected:true,scram_verified:true,
      database_boundary_verified:true,least_privilege_enforced:true,
      probe_process_environment_unchanged:true}));
  }catch{process.stderr.write('Standalone authentication proof failed\n');process.exitCode=1}
});
"""


def require(value, message):
    if not value:
        raise RuntimeError(message)


def secure_directory(path):
    """Hold an O_NOFOLLOW anchor; every ancestor is root-owned/non-writable."""
    require(path.is_absolute() and '..' not in path.parts, 'private directory must be absolute')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
            info = os.fstat(fd)
            require(info.st_uid == 0 and not stat.S_IMODE(info.st_mode) & 0o022,
                    'private path ancestry must be root-controlled')
        require(stat.S_IMODE(os.fstat(fd).st_mode) == 0o700,
                'private target directory must already be mode 0700')
        return fd
    except BaseException:
        os.close(fd)
        raise


def private_file(directory_fd, name):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=directory_fd)
    require(os.fstat(fd).st_uid == 0 and stat.S_IMODE(os.fstat(fd).st_mode) == 0o600,
            'private output permissions are invalid')
    return fd


def scram_verifier(password, salt, iterations=4096):
    require(re.fullmatch(r'[0-9a-f]{64}', password) and len(salt) >= 16 and iterations >= 4096,
            'invalid generated SCRAM parameters')
    salted = hashlib.pbkdf2_hmac('sha256', password.encode('ascii'), salt, iterations)
    client_key = hmac.new(salted, b'Client Key', hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b'Server Key', hashlib.sha256).digest()
    enc = lambda value: base64.b64encode(value).decode('ascii')
    return 'SCRAM-SHA-256${}:{}${}:{}'.format(iterations, enc(salt), enc(stored_key), enc(server_key))


class Provision:
    def __init__(self, args, directory_fd, log_fd):
        self.args, self.directory_fd, self.log_fd = args, directory_fd, log_fd
        self.report = {key: False for key in ['completed', 'api_healthy_before',
            'role_absent_before', 'credential_preserved', 'role_created', 'boundary_applied',
            'stored_scram_verified', 'wrong_password_rejected', 'scram_verified',
            'database_boundary_verified', 'least_privilege_enforced',
            'probe_process_environment_unchanged', 'api_healthy_after',
            'container_identities_and_mounts_unchanged']}
        self.stage = 'preflight'

    def command(self, arguments, *, data=None, timeout=75):
        try:
            result = subprocess.run(DOCKER + arguments, input=data, capture_output=True,
                timeout=timeout, env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin', 'LANG':'C'})
        except subprocess.TimeoutExpired as error:
            os.write(self.log_fd, (error.stdout or b'')[:65536] + (error.stderr or b'')[:65536])
            raise RuntimeError('bounded Docker operation timed out') from None
        if result.returncode:
            os.write(self.log_fd, b'\n[' + self.stage.encode('ascii') + b']\n' +
                     result.stdout[:65536] + result.stderr[:65536])
            os.fsync(self.log_fd)
            raise RuntimeError('Docker operation refused; inspect server-private failure file')
        require(len(result.stdout) <= 1024 * 1024, 'unexpectedly large Docker output')
        return result.stdout

    def inspect(self, container, image, revision=None):
        value = json.loads(self.command(['container','inspect','--format',CONTAINER,container]))
        state = value.get('State', {})
        require(value.get('Id') == container and value.get('Image') == image and
                state.get('Running') is True and state.get('Paused') is False and
                state.get('Restarting') is False and state.get('Health') == 'healthy',
                'expected existing resource is not unchanged and healthy')
        metadata = json.loads(self.command(['image','inspect','--format',IMAGE,image]))
        require(metadata.get('Id') == image, 'immutable image identity differs')
        if revision is not None:
            require(value.get('Revision') == revision and metadata.get('Revision') == revision,
                    'API release identity differs')
        return {key:value[key] for key in ['Id','Image','Revision','Mounts']}

    def identities(self):
        return [self.inspect(self.args.api_container,self.args.api_image,self.args.api_revision),
                self.inspect(self.args.pg_container,self.args.pg_image)]

    def health(self):
        self.command(['exec',self.args.api_container,'/usr/local/bin/node',
                      '/app/scripts/healthcheck.js'], timeout=10)

    def psql(self, sql, *, boundary=False):
        # Core statement/error-duration logging could otherwise retain the SCRAM
        # verifier. These settings apply only to this administrative connection;
        # external auditing extensions require separate review, never disabling.
        options = ('PGOPTIONS=-c lock_timeout=2s -c statement_timeout=60s '
            '-c log_statement=none -c log_min_error_statement=panic '
            '-c log_min_duration_statement=-1 -c log_min_duration_sample=-1 '
            '-c log_transaction_sample_rate=0')
        arguments = ['exec','-i','-e',options,
            '-e','PGHOST=/var/run/postgresql','-e','PGHOSTADDR=','-e','PGPORT=5432',
            '-e','PGCONNECT_TIMEOUT=5','-e','PGPASSWORD=',
            '-e','PGSERVICE=','-e','PGSERVICEFILE=/dev/null','-e','PGPASSFILE=/dev/null',
            self.args.pg_container,'psql','-X','-w','-U','postgres','-d','postgres',
            '-v','ON_ERROR_STOP=1','-At']
        if boundary:
            arguments += ['-v','runtime_role=' + ROLE,'-v','runtime_database=postgres',
                          '-v','runtime_schema=public']
        return self.command(arguments, data=sql)

    def node(self, payload):
        value = json.loads(self.command(['exec','-i',self.args.api_container,
            '/usr/local/bin/node','--max-old-space-size=64','-e',NODE_PROBE],
            data=json.dumps(payload, separators=(',',':')).encode(), timeout=35))
        require(isinstance(value, dict), 'invalid standalone probe response')
        return value

    def run(self, sql):
        before = self.identities()
        self.health()
        self.report['api_healthy_before'] = True
        payload = {'host':self.args.database_host,'port':self.args.database_port,
                   'runtime_sha256':self.args.runtime_script_sha256,'precheck':True}
        require(self.node(payload) == {'precheck':True}, 'API environment precheck refused')
        self.stage = 'fresh-role-check'
        require(self.psql(b"SELECT current_database()='postgres' AND current_user='postgres' "
            b"AND current_setting('server_version_num')::integer BETWEEN 180000 AND 189999 "
            b"AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='falcon_runtime');\n").strip() == b't',
            'wrong database/version/admin or role already exists; no reuse permitted')
        self.report['role_absent_before'] = True
        password = secrets.token_hex(32)
        verifier = scram_verifier(password, secrets.token_bytes(16))
        self.stage = 'preserve-credential'
        fd = private_file(self.directory_fd, 'falcon-runtime-credential.json')
        with os.fdopen(fd,'w') as output:
            json.dump({'role':ROLE,'database':'postgres','schema':'public',
                       'password':password,'scram_verifier':verifier},output)
            output.flush()
            os.fsync(output.fileno())
        os.fsync(self.directory_fd)
        self.report['credential_preserved'] = True
        self.stage = 'create-fresh-role'
        self.psql(("CREATE ROLE falcon_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '" + verifier + "';\n").encode())
        self.report['role_created'] = True
        self.stage = 'apply-reviewed-boundary'
        self.psql(sql, boundary=True)
        self.report['boundary_applied'] = True
        self.stage = 'stored-verifier-check'
        require(self.psql(b"SELECT rolpassword LIKE 'SCRAM-SHA-256$%' FROM pg_authid "
                          b"WHERE rolname='falcon_runtime';\n").strip() == b't',
                'stored verifier is not SCRAM')
        self.report['stored_scram_verified'] = True
        self.stage = 'standalone-auth-proof'
        payload.update({'precheck':False,'role':ROLE,'password':password})
        observed = self.node(payload)
        expected = {'wrong_password_rejected','scram_verified','database_boundary_verified',
                    'least_privilege_enforced','probe_process_environment_unchanged'}
        require(set(observed) == expected and all(value is True for value in observed.values()),
                'standalone authentication proof refused')
        self.report.update(observed)
        self.stage = 'postflight'
        self.health()
        self.report['api_healthy_after'] = True
        require(self.identities() == before, 'existing resource identities or mounts changed')
        self.report['container_identities_and_mounts_unchanged'] = True
        self.report['completed'] = True


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['api-container','pg-container','api-image','pg-image','api-revision',
                 'target-dir','role-sql','role-sql-sha256','runtime-script-sha256','database-host']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--database-port',type=int,required=True)
    args = parser.parse_args(argv)
    for value in [args.api_container,args.pg_container,args.role_sql_sha256,args.runtime_script_sha256]:
        require(re.fullmatch(r'[0-9a-f]{64}',value), 'explicit full IDs/hashes are required')
    for value in [args.api_image,args.pg_image]:
        require(re.fullmatch(r'sha256:[0-9a-f]{64}',value), 'immutable image IDs are required')
    require(re.fullmatch(r'[0-9a-f]{40}',args.api_revision), 'full API revision is required')
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,252}',args.database_host) and
            1 <= args.database_port <= 65535, 'explicit TCP endpoint is required')
    return args


def main():
    require(sys.platform.startswith('linux') and os.geteuid() == 0, 'Linux host root is required')
    os.umask(0o077)
    args = arguments()
    # The reviewed SQL is adjacent to this helper, never downloaded or inferred.
    sql_path = Path(args.role_sql)
    require(sql_path.is_absolute() and sql_path.parent == Path(__file__).absolute().parent,
            'reviewed role SQL must be adjacent to this helper')
    sql_directory = secure_directory(sql_path.parent)
    try:
        fd = os.open(sql_path.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=sql_directory)
        with os.fdopen(fd,'rb') as source:
            info = os.fstat(source.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and
                    not stat.S_IMODE(info.st_mode) & 0o022 and info.st_size < 65536,
                    'reviewed SQL file is not root-controlled and bounded')
            sql = source.read(65536)
        require(hashlib.sha256(sql).hexdigest() == args.role_sql_sha256, 'reviewed SQL hash differs')
    finally:
        os.close(sql_directory)
    directory_fd = secure_directory(Path(args.target_dir))
    try:
        report_fd = private_file(directory_fd,'provision-report.json')
        log_fd = private_file(directory_fd,'provision-private-failures.log')
        provision = Provision(args,directory_fd,log_fd)
        try:
            provision.run(sql)
        except Exception:
            # Raw driver details, if any, have already gone only to the private
            # file. Report a fixed stage label; never traceback/argv/env/stdin.
            provision.report['failed_stage'] = provision.stage
            try:
                provision.health()
                provision.report['api_healthy_after'] = True
            except Exception:
                pass
        finally:
            os.fsync(log_fd)
            os.close(log_fd)
        with os.fdopen(report_fd,'w') as output:
            json.dump(provision.report,output,sort_keys=True)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        os.fsync(directory_fd)
        print(json.dumps(provision.report,sort_keys=True))
        return 0 if provision.report['completed'] else 1
    finally:
        os.close(directory_fd)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('{"completed":false,"preflight_refused":true}',file=sys.stderr)
        sys.exit(1)
