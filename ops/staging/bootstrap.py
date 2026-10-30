#!/usr/bin/env python3
"""Owner-only cold staging initialization. No application deployment or purge."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

ROOT=Path('/data/falcon-staging')
SOURCE=Path(__file__).resolve().parent
ENV={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/root','LANG':'C.UTF-8'}


def load(name):
    spec=importlib.util.spec_from_file_location('stage_boot_'+name,SOURCE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def write(path,value,mode=0o600):
    data=value if isinstance(value,str) else json.dumps(value,indent=2)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'w') as stream:stream.write(data)


def run(command,*,input=None,timeout=30):
    r=subprocess.run(command,input=input,capture_output=True,timeout=timeout,env=ENV)
    if r.returncode:
        write(ROOT/'private'/('bootstrap-command-'+uuid.uuid4().hex+'.log'),r.stderr.decode(errors='replace')[:262144])
        raise RuntimeError('STAGING_BOOTSTRAP_COMMAND_FAILED')
    return r.stdout


def inspect(identifier):return json.loads(run(['docker','inspect',identifier]))[0]


def check_production(baseline):
    for expected in baseline['resources'].values():
        value=inspect(expected['id'])
        if value['Image']!=expected['image'] or value['Mounts']!=expected['mounts'] or \
           value['State']['StartedAt']!=expected['started'] or value['RestartCount']!=expected['restarts'] or \
           hashlib.sha256(json.dumps(sorted(value['Config']['Env'])).encode()).hexdigest()!=expected['environment_sha256'] or \
           value['State'].get('Health',{}).get('Status')!='healthy':raise RuntimeError('PRODUCTION_BASELINE_DRIFT')
    for url in ['https://falcon.jataka.io/','https://apifalcon.jataka.io/health']:
        healthy=False
        for attempt in range(2):
            result=subprocess.run(['curl','--silent','--show-error','--connect-timeout','3','--max-time','8',
                '-o','/dev/null','-w','%{http_code}',url],capture_output=True,timeout=10,env=ENV)
            if result.returncode==0 and result.stdout==b'200':healthy=True;break
            if attempt==0:time.sleep(1)
        if not healthy:raise RuntimeError('PRODUCTION_HEALTH_FAILURE')



def memory():return int(next(x.split()[1] for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024


def main():
    if os.geteuid()!=0 or sys.platform!='linux':raise RuntimeError('OWNER_REQUIRED')
    os.umask(0o077);os.nice(15)
    stack=load('stack');network=load('network')
    private=ROOT/'private';prep=json.loads((ROOT/'bootstrap/preparation.json').read_text())
    if (private/'state.json').exists():raise RuntimeError('STAGING_ALREADY_INITIALIZED')
    if hashlib.sha256((ROOT/'bootstrap/schema.sql').read_bytes()).hexdigest()!=prep['schema_sha256']:
        raise RuntimeError('STAGING_SCHEMA_BASELINE_HASH')
    inputs=json.loads((private/'bootstrap-inputs.json').read_text())
    baseline=json.loads((private/'production-baseline.json').read_text())
    check_production(baseline)
    disk=os.statvfs(ROOT);stack.capacity(memory(),disk.f_bavail*disk.f_frsize,initial=True)
    images=inputs['data_images']
    data_compose=stack.build(images)
    seed_image=inputs['seed_image_id']
    if not re.fullmatch(r'sha256:[0-9a-f]{64}',seed_image):raise RuntimeError('STAGING_SEED_IMAGE_ID')
    source_backend=[x for x in baseline['resources'].values() if any(m['Destination']=='/app/uploads' for m in x['mounts'])]
    if len(source_backend)!=1 or source_backend[0]['image']!=seed_image:raise RuntimeError('STAGING_SEED_SOURCE_PROVENANCE')
    secrets=json.loads((private/'secrets.json').read_text())
    env_values={'STAGING_'+name:secrets[name] for name in ['DB_PASSWORD','REDIS_PASSWORD','JWT_SECRET','EMAIL_PASSWORD','HR_ENCRYPTION_KEY','ACQUISITION_ENCRYPTION_KEY','NOTIFICATION_CUTOFF']}
    if not (private/'runtime.env').exists():write(private/'runtime.env',''.join(k+"='"+v+"'\n" for k,v in env_values.items()))
    php=(SOURCE/'coolify-stage.php').read_text().removeprefix('<?php')
    if not (private/'coolify.json').exists():
        result=run(['docker','exec','-i','coolify','php','-r',php],input=json.dumps({'action':'create','compose':data_compose,'environment':env_values}).encode(),timeout=90)
        record=json.loads(result);write(private/'coolify.json',record)
    else:record=json.loads((private/'coolify.json').read_text())
    project=record['service_uuid']
    if not re.fullmatch(r'[a-z0-9]{16,64}',project):raise RuntimeError('STAGING_PROJECT_SCOPE')
    for name,service in data_compose['services'].items():
        service.setdefault('labels',{}).update(record.get('coolify_labels',{}).get(name,{}))
        service['labels'].update({'traefik.enable':'false','io.falcon.environment':'staging'})
    if not (ROOT/'data-compose.json').exists():write(ROOT/'data-compose.json',data_compose)
    if json.loads((ROOT/'data-compose.json').read_text())!=data_compose:raise RuntimeError('STAGING_DATA_COMPOSE_DRIFT')
    all_networks=json.loads(run(['docker','network','inspect',*run(['docker','network','ls','-q']).decode().split()]))
    stack.validate_subnets(stack.docker_subnets([n for n in all_networks if n['Name'] not in ('falcon-staging-ingress','falcon-staging-data')]))
    network.install()
    # Separate ingress network, with the shared proxy outside the app allocation pool.
    existing={n['Name']:n for n in all_networks}
    if 'falcon-staging-ingress' not in existing:
        run(['docker','network','create','--internal','--subnet','172.30.241.0/24',
          '--ip-range','172.30.241.0/25','--label','com.docker.compose.project='+project,
          '--label','com.docker.compose.network=ingress','--label','io.falcon.environment=staging','falcon-staging-ingress'])
    else:
        n=existing['falcon-staging-ingress']
        if not n['Internal'] or n.get('Labels',{}).get('com.docker.compose.project')!=project:raise RuntimeError('STAGING_INGRESS_OWNERSHIP')
    proxy=inspect('coolify-proxy');pid=str(proxy['State']['Pid'])
    default_before=run(['nsenter','-t',pid,'-n','ip','route','show','default'])
    if 'falcon-staging-ingress' not in proxy['NetworkSettings']['Networks']:
        run(['docker','network','connect','--ip','172.30.241.254','--gw-priority','-1','falcon-staging-ingress','coolify-proxy'])
    after=inspect('coolify-proxy')
    if after['State']['StartedAt']!=proxy['State']['StartedAt'] or after['RestartCount']!=proxy['RestartCount'] or \
       after['NetworkSettings']['Networks']['falcon-staging-ingress']['IPAddress']!='172.30.241.254' or \
       run(['nsenter','-t',pid,'-n','ip','route','show','default'])!=default_before:
        raise RuntimeError('PROXY_NETWORK_OR_RESTART_DRIFT')
    command=['docker','compose','--project-name',project,'--file',str(ROOT/'data-compose.json'),'--env-file',str(private/'runtime.env')]
    stack.capacity(memory(),disk.f_bavail*disk.f_frsize,initial=True)
    run(command+['up','-d','--no-build'],timeout=180)
    identifiers={}
    for key in ['postgres','redis','mail']:
        identifier=run(command+['ps','-q','falcon-staging-'+key]).decode().strip()
        value=inspect(identifier)
        if value['Config'].get('Labels',{}).get('io.falcon.environment')!='staging':raise RuntimeError('STAGING_DATA_IDENTITY')
        if not all(m['Source'].startswith(str(ROOT)+'/') for m in value['Mounts']):raise RuntimeError('STAGING_DATA_MOUNT_SCOPE')
        identifiers[key]={'id':value['Id'],'image':value['Image'],'mounts':value['Mounts']}
    pg=identifiers['postgres']['id'];deadline=time.monotonic()+120
    while inspect(pg)['State'].get('Health',{}).get('Status')!='healthy':
        if time.monotonic()>deadline:raise RuntimeError('STAGING_POSTGRES_STARTUP')
        stack.capacity(memory(),disk.f_bavail*disk.f_frsize);time.sleep(2)
    def sql(text,variables=(),atomic=True):
        if inspect(pg)['Id']==prep['production_postgres_id']:raise RuntimeError('PRODUCTION_TARGET_REFUSED')
        return run(['docker','exec','-i',pg,'psql','-X','-q','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-U','postgres','-d','falcon_staging',
                    *variables,*(['--single-transaction'] if atomic else []),'-f','-'],input=text.encode(),timeout=90)
    ext=json.loads((ROOT/'bootstrap/extensions.json').read_text())
    if set(ext)-{'uuid-ossp','pg_trgm','pgcrypto'}:raise RuntimeError('STAGING_EXTENSION_SCOPE')
    sql(''.join('CREATE EXTENSION IF NOT EXISTS "'+name+'" WITH SCHEMA public;\n' for name in ext))
    if not (ROOT/'bootstrap/schema-restored.json').exists():
        sql((ROOT/'bootstrap/schema.sql').read_text())
        write(ROOT/'bootstrap/schema-restored.json',{'schema_sha256':prep['schema_sha256'],'postgres_id':pg})
    if not (ROOT/'bootstrap/role-created.json').exists():
        password=secrets['DB_PASSWORD']
        if not re.fullmatch(r'[A-Za-z0-9_-]{64}',password):raise RuntimeError('STAGING_RUNTIME_PASSWORD_FORMAT')
        sql("CREATE ROLE falcon_staging_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8 PASSWORD '"+password+"';\nREVOKE ALL ON DATABASE falcon_staging FROM PUBLIC;\nGRANT CONNECT ON DATABASE falcon_staging TO falcon_staging_runtime;\nREVOKE CREATE ON SCHEMA public FROM PUBLIC;")
        write(ROOT/'bootstrap/role-created.json',{'runtime_role':'falcon_staging_runtime'})
    ledger=json.loads((ROOT/'bootstrap/migration-ledger.json').read_text())
    if any(not re.fullmatch(r'[A-Za-z0-9_.-]+\.sql',name) for name in ledger):raise RuntimeError('STAGING_LEDGER_FORMAT')
    sql('INSERT INTO schema_migrations(filename) VALUES '+','.join("('"+name+"')" for name in ledger)+' ON CONFLICT DO NOTHING;')
    seed_path=ROOT/'bootstrap/seed-report.json'
    if not seed_path.exists():
        source=SOURCE/'seed-staging.cjs'
        os.chmod(source,0o444)
        worker='falcon-staging-seed-'+uuid.uuid4().hex
        cmd=['docker','run','--rm','--name',worker,'--pull','never','-i','--network','falcon-staging-data',
             '--user','61001:61001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true',
             '--memory','256m','--memory-swap','256m','--cpus','0.5','--pids-limit','64',
             '--tmpfs','/tmp:rw,nosuid,nodev,size=32m,uid=61001,mode=0700',
             '--mount','type=bind,src='+str(ROOT/'uploads')+',dst=/app/uploads',
             '--mount','type=bind,src='+str(source)+',dst=/checks/seed.cjs,readonly',
             '-e','NODE_OPTIONS=--max-old-space-size=128','--entrypoint','node',seed_image,'/checks/seed.cjs']
        result=run(cmd,input=json.dumps({'owner_password':secrets['OWNER_PASSWORD'],'postgres_password':secrets['POSTGRES_PASSWORD']}).encode(),timeout=120)
        write(seed_path,json.loads(result))
    seeded=json.loads(seed_path.read_text());owners=[u for u in seeded['users'] if u['active']]
    if len(owners)!=1 or owners[0]['role']!='SuperAdmin':raise RuntimeError('STAGING_OWNER_FIXTURE')
    if not (private/'access/invites.json').exists():
        write(private/'access/invites.json',{'version':1,'users':[{'user_id':owners[0]['user_id'],'tenant_id':owners[0]['tenant_id']}]},0o444)
    role=(SOURCE/'runtime-role.sql').read_text()
    sql(role,('-v','runtime_role=falcon_staging_runtime','-v','runtime_database=falcon_staging','-v','runtime_schema=public'),atomic=False)
    def boundary_entry(source,destination,kind=None):
        info=source.lstat()
        if source.is_symlink():raise RuntimeError('STAGING_STORAGE_SYMLINK')
        item={'destination':destination,'mount_root':str(source),'device':str(os.major(info.st_dev))+':'+str(os.minor(info.st_dev)),'inode':str(info.st_ino)}
        if kind:item['kind']=kind
        return item
    policy={'schema_version':1,'upload_mounts':[boundary_entry(ROOT/'uploads','/app/uploads')],
       'readonly_mounts':[boundary_entry(private/'smtp-ca.pem','/run/falcon/staging-smtp-ca.pem','file'),
                          boundary_entry(private/'access','/run/falcon/staging-access','directory')],
       'database':{'host':'falcon-staging-postgres','port':5432,'name':'falcon_staging','role':'falcon_staging_runtime','enforce_least_privilege':True}}
    if not (private/'storage-boundary.json').exists():write(private/'storage-boundary.json',policy,0o444)
    if not (private/'ui-access-hash').exists():
        hashed=run(['docker','run','--rm','--pull','never','-i','--network','none','--user','61001:61001','--read-only',
           '--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','128m','--memory-swap','128m','--cpus','0.25',
           '-e','NODE_OPTIONS=--max-old-space-size=64','--entrypoint','node',seed_image,'-e',
           "let d='';process.stdin.on('data',b=>d+=b);process.stdin.on('end',async()=>process.stdout.write(await require('bcrypt').hash(d,12)))"],
           input=secrets['UI_PASSWORD'].encode(),timeout=30).decode()
        if not re.fullmatch(r'\$2[aby]\$12\$[./A-Za-z0-9]{53}',hashed):raise RuntimeError('STAGING_ACCESS_HASH_FORMAT')
        write(private/'ui-access-hash','staging-owner:'+hashed)
    if not (private/'owner-login.txt').exists():
        write(private/'owner-login.txt','STAGING ONLY — NO PRODUCTION ACCESS\nWeb: https://staging-falcon.jataka.io\nGateway user: staging-owner\nGateway password: '+secrets['UI_PASSWORD']+'\nApplication user: owner@falcon-staging.invalid\nApplication password: '+secrets['OWNER_PASSWORD']+'\nTenant: staging\n')
    check_production(baseline)
    state={'version':1,'service_uuid':project,'coolify_labels':record['coolify_labels'],
       'data_images':images,'data_containers':identifiers,'initialized':True,
       'working_bytes':1024**3,'current':None,'source_schema_sha256':prep['schema_sha256'],
       'owner_user_id':owners[0]['user_id'],'owner_tenant_id':owners[0]['tenant_id']}
    write(private/'state.json',state)
    # Cold until the protected staging branch and acceptance gates are ready.
    for value in identifiers.values():run(['docker','stop','--time','30',value['id']],timeout=40)
    print(json.dumps({'initialized':True,'project_uuid':record['project_uuid'],'service_uuid':project,
      'synthetic_tenants':2,'synthetic_users':len(seeded['users']),'synthetic_files':len(seeded['files']),
      'active_accounts':1,'application_started':False,'data_containers_stopped_with_storage_preserved':True},separators=(',',':')))

if __name__=='__main__':
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,(RuntimeError,ValueError)) and re.fullmatch(r'[A-Z0-9_]+',str(error)) else type(error).__name__
        print(json.dumps({'status':'refused','code':code}),file=sys.stderr)
        raise SystemExit(1)
