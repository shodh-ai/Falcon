"""Owner implementation behind the bounded staging controller.

All targets come from owner-only state or the fixed stack compiler, never SSH.
No production container is started/stopped, and no volume is deleted here.
"""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import uuid

ROOT=Path('/data/falcon-staging')
ROUTE=Path('/data/coolify/proxy/dynamic/falcon-staging-guarded.yaml')
SAFE_ENV={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/root','LANG':'C.UTF-8'}
SERVICES=('falcon-staging-api','falcon-staging-frontend')


def load(name):
    spec=importlib.util.spec_from_file_location('falcon_stage_'+name,Path(__file__).with_name(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def trusted_json(path):
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1 or info.st_mode&0o022:
        raise RuntimeError('STAGING_OWNER_STATE_TRUST')
    if info.st_size>1024*1024:raise RuntimeError('STAGING_OWNER_STATE_SIZE')
    return json.loads(path.read_text())


def atomic_json(path,value):
    path.parent.mkdir(mode=0o700,exist_ok=True)
    if path.is_symlink():raise RuntimeError('STAGING_OWNER_STATE_SYMLINK')
    temp=path.parent/('.'+path.name+'.'+uuid.uuid4().hex+'.new')
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream:
        json.dump(value,stream,sort_keys=True,indent=2);stream.flush();os.fsync(stream.fileno())
    os.replace(temp,path)


class Host:
    private=ROOT/'private'
    def __init__(self,*,initial=False):
        self.stack=load('stack');self.network=load('network')
        self.state=trusted_json(self.private/'state.json')
        self.initial=initial
        self.initial_gate_passed=False
        if self.state.get('version')!=1 or not re.fullmatch(r'[a-z0-9]{16,64}',self.state.get('service_uuid','')):
            raise RuntimeError('STAGING_OWNER_STATE_SCHEMA')
        self.project=self.state['service_uuid']
        self.secrets=trusted_json(self.private/'secrets.json')

    def run(self,command,*,input=None,timeout=30):
        r=subprocess.run(command,input=input,capture_output=True,timeout=timeout,env=SAFE_ENV)
        if r.returncode:
            # Private diagnostics may contain staging configuration; never echo.
            path=self.private/('command-failure-'+uuid.uuid4().hex+'.log')
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as stream:stream.write(r.stderr[:262144])
            raise RuntimeError('STAGING_COMMAND_FAILED')
        if len(r.stdout)>2*1024*1024:raise RuntimeError('STAGING_COMMAND_OUTPUT_BOUND')
        return r.stdout

    def authorize_run(self,identity):
        number=int(identity['run_number'])
        if number < self.state.get('last_run_number',0):raise RuntimeError('STAGING_SUPERSEDED_RUN')
        self.run_number=number

    def require_ready(self):
        if not self.state.get('initialized'):raise RuntimeError('STAGING_BOOTSTRAP_REQUIRED')
        if not self.initial:
            report=load('acceptance').validate_acceptance(trusted_json(self.private/'acceptance.json'))
            evidence=self.private/'acceptance-evidence.json'
            trusted_json(evidence)
            if hashlib.sha256(evidence.read_bytes()).hexdigest()!=report['evidence_sha256']:
                raise RuntimeError('STAGING_ACCEPTANCE_EVIDENCE_HASH')

    def guard(self,*,candidate_mib=0):
        memory=int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))*1024
        disk=os.statvfs(ROOT)
        if time.monotonic()-getattr(self,'usage_checked_at',-120)>60:
            usage=self.run(['du','-s','-B1','--',str(ROOT)],timeout=15).decode().split()[0]
            if not usage.isdigit():raise RuntimeError('STAGING_WORKING_SET_MEASUREMENT')
            # Include retained generations; low space never authorizes cleanup.
            self.working_bytes=max(int(usage),self.state.get('working_bytes',0))
            self.usage_checked_at=time.monotonic()
        self.stack.capacity(memory,disk.f_bavail*disk.f_frsize,
                            initial=self.initial and not self.state.get('current') and not self.initial_gate_passed,candidate_mib=candidate_mib,
                            working_bytes=self.working_bytes)
        self.initial_gate_passed=True

    def inspect(self,identifier):
        return json.loads(self.run(['docker','inspect',identifier]))[0]

    def verify_production(self):
        baseline=trusted_json(self.private/'production-baseline.json')['resources']
        for expected in baseline.values():
            actual=self.inspect(expected['id'])
            envhash=hashlib.sha256(json.dumps(sorted(actual['Config']['Env'])).encode()).hexdigest()
            if actual['Id']!=expected['id'] or actual['Image']!=expected['image'] or actual['Mounts']!=expected['mounts'] or \
               actual['State']['StartedAt']!=expected['started'] or actual['RestartCount']!=expected['restarts'] or \
               envhash!=expected['environment_sha256'] or actual['State'].get('Health',{}).get('Status')!='healthy':
                raise RuntimeError('PRODUCTION_BASELINE_DRIFT')
        for url in ('https://falcon.jataka.io/','https://apifalcon.jataka.io/health'):
            healthy=False
            for attempt in range(2):
                result=subprocess.run(['curl','--silent','--show-error','--connect-timeout','3','--max-time','8',
                    '--output','/dev/null','--write-out','%{http_code}',url],capture_output=True,timeout=10,env=SAFE_ENV)
                if result.returncode==0 and result.stdout==b'200':healthy=True;break
                if attempt==0:time.sleep(1)
            if not healthy:raise RuntimeError('PRODUCTION_HEALTH_FAILURE')

    def pull_and_verify(self,request):
        images=dict(self.state['data_images'])
        for component,key in [('api','backend'),('frontend','frontend')]:
            image='ghcr.io/shodh-ai/falcon-staging-'+key+'@'+request[key+'_digest']
            self.run(['docker','pull',image],timeout=240)
            actual=json.loads(self.run(['docker','image','inspect',image]))[0]
            labels=actual['Config'].get('Labels') or {}
            expected_cmd=['node','scripts/runtime-start.cjs'] if component=='api' else ['node','server.js']
            expected_user='61001:61001' if component=='api' else 'nextjs'
            if labels.get('org.opencontainers.image.revision')!=request['sha'] or labels.get('io.falcon.environment')!='staging' or \
               actual['Config']['Cmd']!=expected_cmd or actual['Config']['User']!=expected_user:
                raise RuntimeError('STAGING_IMAGE_PROVENANCE')
            images[component]=image
            self.guard(candidate_mib=1280)
        return images

    def data_command(self):
        return ['docker','compose','--project-name',self.project,'--file',str(ROOT/'data-compose.json'),
                '--env-file',str(self.private/'runtime.env')]

    def ensure_data(self):
        self.network.install()
        self.run(self.data_command()+['up','-d','--no-build'],timeout=120)
        for name,expected in self.state['data_containers'].items():
            value=self.inspect(expected['id'])
            if value['Id']!=expected['id'] or value['Mounts']!=expected['mounts'] or value['Image']!=expected['image']:
                raise RuntimeError('STAGING_DATA_RESOURCE_DRIFT')
        self.wait_healthy(self.state['data_containers']['postgres']['id'])

    def verify_network(self):
        self.network.install()
        for name in ['falcon-staging-data','falcon-staging-ingress']:
            n=json.loads(self.run(['docker','network','inspect',name]))[0]
            if not n['Internal'] or n.get('EnableIPv6'):raise RuntimeError('STAGING_NETWORK_DRIFT')
        proxy=self.inspect('coolify-proxy')
        actual=proxy['NetworkSettings']['Networks'].get('falcon-staging-ingress',{})
        if actual.get('IPAddress')!='172.30.241.254':raise RuntimeError('STAGING_PROXY_NETWORK_REQUIRED')

    def verify_schema(self,images):
        source=Path(__file__).with_name('probe-database.cjs')
        info=source.stat()
        if info.st_uid!=0 or info.st_mode&0o222:raise RuntimeError('STAGING_PROBE_SOURCE_TRUST')
        result=json.loads(self.run(['docker','run','--rm','--pull','never','-i','--network','falcon-staging-data',
            '--user','61001:61001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true',
            '--memory','128m','--memory-swap','128m','--cpus','0.25','--pids-limit','64',
            '--mount','type=bind,src='+str(source)+',dst=/checks/probe.cjs,readonly',
            '-e','NODE_OPTIONS=--max-old-space-size=64','--entrypoint','node',images['api'],'/checks/probe.cjs'],
            input=json.dumps({'password':self.secrets['DB_PASSWORD']}).encode(),timeout=30))
        if result.get('restricted_runtime_verified') is not True or result.get('scram_verified') is not True or result.get('pending')!=[]:
            raise RuntimeError('STAGING_REVIEWED_MAINTENANCE_REQUIRED')
        atomic_json(self.private/'database-probe.json',result)

    def route_snapshot(self):
        current=self.state.get('current')
        if ROUTE.exists():
            if not current and hashlib.sha256(ROUTE.read_bytes()).hexdigest()==self.state.get('empty_route_sha256'):
                return None
            if not current or hashlib.sha256(ROUTE.read_bytes()).hexdigest()!=current['route_sha256']:
                raise RuntimeError('STAGING_ROUTE_DRIFT')
            return current
        if current:raise RuntimeError('STAGING_ROUTE_MISSING')
        return None

    def prepare_candidate(self,images,sha,release_id):
        directory=ROOT/'releases'/release_id
        directory.mkdir(mode=0o700,parents=True)
        compose=self.stack.app_release(images,release_id)
        for name,service in compose['services'].items():
            service['labels'].update(self.state.get('coolify_labels',{}).get(name,{}))
        path=directory/'compose.json';atomic_json(path,compose)
        candidate={'release_id':release_id,'sha':sha,'directory':str(directory),'images':images,'containers':{}}
        atomic_json(self.private/'candidate.json',candidate)
        return candidate

    def candidate_command(self,candidate):
        if not re.fullmatch(r'[0-9a-f]{16}',candidate['release_id']):raise RuntimeError('STAGING_RELEASE_ID')
        path=ROOT/'releases'/candidate['release_id']/'compose.json'
        return ['docker','compose','--project-name','falcon-staging-release-'+candidate['release_id'],
                '--file',str(path),'--env-file',str(self.private/'runtime.env')]

    def start_candidate(self,candidate):
        self.guard(candidate_mib=1280)
        self.run(self.candidate_command(candidate)+['up','-d','--no-build','--no-deps'],timeout=120)
        for name in SERVICES:
            expected_name=name+'-'+candidate['release_id']
            actual=self.inspect(expected_name)
            if actual['Config'].get('Labels',{}).get('io.falcon.release')!=candidate['release_id']:
                raise RuntimeError('STAGING_CANDIDATE_IDENTITY')
            candidate['containers'][name]=actual['Id']
        atomic_json(self.private/'candidate.json',candidate)

    def wait_healthy(self,identifier):
        deadline=time.monotonic()+150
        while time.monotonic()<deadline:
            self.guard()
            actual=self.inspect(identifier)
            health=actual['State'].get('Health',{}).get('Status')
            if health=='healthy':return
            if actual['State']['Status'] in ('exited','dead') or health=='unhealthy':break
            time.sleep(2)
        raise RuntimeError('STAGING_CANDIDATE_HEALTH')

    def verify_candidate(self,candidate):
        for identifier in candidate['containers'].values():self.wait_healthy(identifier)
        self.guard()
        # The acceptance probe operates only inside the staging API container.
        self.run(['docker','exec','-i',candidate['containers']['falcon-staging-api'],'node','-e',
            "const fs=require('fs');const e=process.env;if(e.FALCON_ENVIRONMENT!=='staging'||e.DB_DATABASE!=='falcon_staging')process.exit(1);"+
            "fetch('http://127.0.0.1:4000/health').then(async r=>{if(!r.ok)process.exit(1);"+
            "if(!fs.existsSync('/run/falcon/staging-access/invites.json'))process.exit(1);process.stdout.write('ok')}).catch(()=>process.exit(1))"])

    def publish(self,candidate):
        info=ROUTE.parent.stat()
        if info.st_uid!=0 or info.st_mode&0o022 or ROUTE.parent.is_symlink():raise RuntimeError('STAGING_PROXY_DIRECTORY_TRUST')
        auth=(self.private/'ui-access-hash').read_text().strip()
        document=self.stack.route_document(candidate['release_id'],auth)
        candidate['route_attempted']=True
        atomic_json(ROUTE,document)
        candidate['route_sha256']=hashlib.sha256(ROUTE.read_bytes()).hexdigest()
        atomic_json(self.private/'candidate.json',candidate)

    def verify_public(self,candidate):
        deadline=time.monotonic()+180
        while time.monotonic()<deadline:
            self.guard()
            results=[]
            for host,path in [('staging-apifalcon.jataka.io','/health'),('staging-falcon.jataka.io','/')]:
                config=None
                if host=='staging-falcon.jataka.io':
                    config=('user = "staging-owner:'+self.secrets['UI_PASSWORD']+'"\n').encode()
                command=['curl','--silent','--show-error','--connect-timeout','3','--max-time','8',
                    '--dump-header','-','--output','/dev/null','--write-out','FALCON_STATUS:%{http_code}',
                    'https://'+host+path+'?staging_release='+candidate['release_id']]
                if config:command+=['--config','-']
                r=subprocess.run(command,input=config,capture_output=True,timeout=10,env=SAFE_ENV)
                headers=r.stdout.decode(errors='replace').lower()
                results.append(r.returncode==0 and headers.endswith('falcon_status:200') and
                    ('x-falcon-release: '+candidate['release_id']) in headers and 'x-falcon-environment: staging' in headers)
            if all(results):return
            self.verify_production()
            time.sleep(3)
        raise RuntimeError('STAGING_PUBLIC_HEALTH_OR_RELEASE_IDENTITY')

    def commit(self,candidate):
        if self.state.get('current'):
            atomic_json(ROOT/'preservation'/('release-'+self.state['current']['release_id']+'.json'),self.state['current'])
        self.state['current']=candidate
        if hasattr(self,'run_number'):self.state['last_run_number']=self.run_number
        atomic_json(self.private/'state.json',self.state)
        atomic_json(self.private/'candidate.json',{'status':'committed','release_id':candidate['release_id']})

    def restore_route(self,previous):
        if previous:
            document=self.stack.route_document(previous['release_id'],(self.private/'ui-access-hash').read_text().strip())
            atomic_json(ROUTE,document)
        else:
            # Retain the failed route document, then publish no staging routes.
            # Replacing this one staging-only file leaves production routes intact.
            atomic_json(ROUTE,{'http':{'routers':{},'services':{},'middlewares':{}}})
            self.state['empty_route_sha256']=hashlib.sha256(ROUTE.read_bytes()).hexdigest()
            atomic_json(self.private/'state.json',self.state)

    def stop_candidate(self,candidate):
        for name in SERVICES:
            expected_name=name+'-'+candidate['release_id']
            result=subprocess.run(['docker','inspect',expected_name],capture_output=True,timeout=15,env=SAFE_ENV)
            if result.returncode:continue
            actual=json.loads(result.stdout)[0]
            labels=actual['Config'].get('Labels',{})
            if labels.get('io.falcon.release')!=candidate['release_id'] or labels.get('io.falcon.environment')!='staging':
                raise RuntimeError('STAGING_STOP_SCOPE')
            self.run(['docker','stop','--time','30',actual['Id']],timeout=40)

    def stop_previous(self,previous):
        self.stop_candidate(previous)

    def audit(self,value):
        atomic_json(self.private/'deployments'/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex+'.json'),value)
