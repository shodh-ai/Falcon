#!/usr/bin/env python3
"""Owner-only preparation. Reads production schema; writes only new staging paths.

Does not start containers, create Coolify records, restore production or deploy.
Generated credentials are never printed. A separate start gate is mandatory.
"""
import base64
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import uuid

ROOT=Path('/data/falcon-staging')
PROD_POSTGRES='acdz53zfy2eqstxeybua41rs'
PROD_POSTGRES_ID='22a981f49c28b9ccf57488b839135864c0f907d7264a5be2b31a22569d81b121'
FORBIDDEN_SCHEMA=re.compile(r'CREATE\s+(?:FOREIGN|SERVER|SUBSCRIPTION|EVENT\s+TRIGGER)|USER\s+MAPPING|\bdblink\b|\bCOPY\b[^;]*\bPROGRAM\b|\bpg_read_file\b|\blo_import\b',re.I)


def run(command,**kwargs):
    r=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=kwargs.pop('timeout',30),**kwargs)
    if r.returncode:raise RuntimeError('STAGING_PREPARATION_COMMAND_FAILED')
    return r.stdout


def private_write(path,data,uid=0,mode=0o600):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        os.fchmod(fd,mode);os.fchown(fd,uid,uid)
        with os.fdopen(fd,'wb',closefd=False) as f:f.write(data if isinstance(data,bytes) else data.encode())
    finally:os.close(fd)


def read_memory():
    return int(re.search(r'^MemAvailable:\s+(\d+) kB',Path('/proc/meminfo').read_text(),re.M)[1])*1024


def main():
    if os.geteuid()!=0 or sys.platform!='linux':raise RuntimeError('LINUX_OWNER_REQUIRED')
    os.umask(0o077);os.nice(15)
    spec=importlib.util.spec_from_file_location('stack',Path(__file__).with_name('stack.py'))
    stack=importlib.util.module_from_spec(spec);spec.loader.exec_module(stack)
    disk=os.statvfs('/data');stack.capacity(read_memory(),disk.f_bavail*disk.f_frsize,initial=True)
    if ROOT.exists() or ROOT.is_symlink():raise RuntimeError('STAGING_ROOT_ALREADY_EXISTS_RESUME_REQUIRES_REVIEW')
    prod=json.loads(run(['docker','inspect',PROD_POSTGRES]))[0]
    if prod['Id']!=PROD_POSTGRES_ID or prod['State'].get('Health',{}).get('Status')!='healthy':
        raise RuntimeError('PRODUCTION_IDENTITY_DRIFT')
    networks=json.loads(run(['docker','network','inspect',*run(['docker','network','ls','-q']).decode().split()]))
    stack.validate_subnets(stack.docker_subnets(networks))
    # Preserve a fresh completed backup before writing any staging resources.
    events=[]
    for p in Path('/data/falcon-backups/status').glob('*-completed-*.json'):
        try:events.append(json.loads(p.read_text()))
        except (ValueError,OSError):pass
    latest=max(events,key=lambda x:x['recorded_at'])
    now=datetime.datetime.now(datetime.timezone.utc)
    if (now-datetime.datetime.fromisoformat(latest['recorded_at'])).total_seconds()>3600:
        raise RuntimeError('FRESH_PRODUCTION_BACKUP_REQUIRED')
    for url in ['https://falcon.jataka.io/','https://apifalcon.jataka.io/health']:
        result=run(['curl','--silent','--show-error','--connect-timeout','3','--max-time','8',
                    '--output','/dev/null','--write-out','%{http_code}',url],timeout=10)
        if result!=b'200':raise RuntimeError('PRODUCTION_HEALTH_GATE')
    ROOT.mkdir(mode=0o750)
    for name,uid in [('private',0),('bootstrap',0),('postgres',70),('redis',999),('mail',61002),('uploads',61001)]:
        p=ROOT/name;p.mkdir(mode=0o700 if name in ('private','bootstrap') else 0o750);os.chown(p,uid,uid)
    (ROOT/'private/access').mkdir(mode=0o755)
    values={name:secrets.token_urlsafe(48) for name in ['DB_PASSWORD','REDIS_PASSWORD','JWT_SECRET','EMAIL_PASSWORD','OWNER_PASSWORD','UI_PASSWORD']}
    values['HR_ENCRYPTION_KEY']=base64.b64encode(secrets.token_bytes(32)).decode()
    values['ACQUISITION_ENCRYPTION_KEY']=base64.b64encode(secrets.token_bytes(32)).decode()
    values['POSTGRES_PASSWORD']=secrets.token_urlsafe(48)
    values['NOTIFICATION_CUTOFF']=now.isoformat(timespec='milliseconds').replace('+00:00','Z')
    private_write(ROOT/'private/secrets.json',json.dumps(values,indent=2))
    private_write(ROOT/'private/postgres-password',values['POSTGRES_PASSWORD'],uid=70,mode=0o400)
    private_write(ROOT/'private/redis.conf',
        'bind 0.0.0.0\nprotected-mode yes\nport 6379\ndir /data\nappendonly yes\nmaxmemory 80mb\nmaxmemory-policy noeviction\nrequirepass '+values['REDIS_PASSWORD']+'\n',uid=999,mode=0o400)
    ca=ROOT/'private/smtp-ca';key=ROOT/'private/smtp-key.pem';cert=ROOT/'private/smtp-cert.pem'
    run(['openssl','req','-x509','-newkey','rsa:3072','-sha256','-days','3650','-nodes',
         '-keyout',str(ca)+'.key','-out',str(ca)+'.pem','-subj','/CN=FALCON Staging SMTP CA'])
    run(['openssl','req','-newkey','rsa:2048','-nodes','-keyout',str(key),
         '-out',str(ROOT/'private/smtp.csr'),'-subj','/CN=falcon-staging-mail',
         '-addext','subjectAltName=DNS:falcon-staging-mail'])
    private_write(ROOT/'private/smtp.ext','subjectAltName=DNS:falcon-staging-mail\nextendedKeyUsage=serverAuth\n')
    run(['openssl','x509','-req','-in',str(ROOT/'private/smtp.csr'),'-CA',str(ca)+'.pem',
         '-CAkey',str(ca)+'.key','-CAcreateserial','-out',str(cert),'-days','365','-sha256',
         '-extfile',str(ROOT/'private/smtp.ext')])
    os.chown(key,61002,61002);os.chmod(key,0o400)
    os.chown(cert,61002,61002);os.chmod(cert,0o444)
    os.chmod(str(ca)+'.pem',0o444);os.chmod(str(ca)+'.key',0o600)
    schema=run(['docker','exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000',
                PROD_POSTGRES,'pg_dump','-U','falcon_backup','-d','postgres','--schema-only',
                '--schema=public','--no-owner','--no-privileges','--no-tablespaces','--lock-wait-timeout=1s'],timeout=45)
    private_write(ROOT/'bootstrap/schema.sql',schema)
    if FORBIDDEN_SCHEMA.search(schema.decode()):
        raise RuntimeError('SCHEMA_EXTERNAL_CAPABILITY_REQUIRES_REVIEW')
    metadata=run(['docker','exec','-i',PROD_POSTGRES,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
                  '-U','falcon_backup','-d','postgres'],input=b"BEGIN READ ONLY; SELECT json_agg(extname) FROM pg_extension WHERE extname<>'plpgsql'; COMMIT;")
    extensions=json.loads(metadata) or []
    if set(extensions)-{'uuid-ossp','pg_trgm','pgcrypto'}:raise RuntimeError('SCHEMA_EXTENSION_REQUIRES_REVIEW')
    private_write(ROOT/'bootstrap/extensions.json',json.dumps(extensions))
    ledger=run(['docker','exec','-i',PROD_POSTGRES,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
                '-U','falcon_backup','-d','postgres'],input=b"BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SELECT json_agg(filename ORDER BY filename) FROM public.schema_migrations; COMMIT;")
    filenames=json.loads(ledger)
    if not filenames or any(not re.fullmatch(r'[A-Za-z0-9_.-]+\.sql',f) for f in filenames):
        raise RuntimeError('MIGRATION_LEDGER_FORMAT')
    private_write(ROOT/'bootstrap/migration-ledger.json',json.dumps(filenames))
    report={'prepared_at':now.isoformat(),'schema_only':True,'production_business_rows_copied':0,
            'production_roles_copied':0,'schema_sha256':hashlib.sha256(schema).hexdigest(),
            'migration_ledger_entries':len(filenames),'production_postgres_id':prod['Id'],
            'fresh_backup_run':latest['run_id'],'staging_started':False,
            'source_schema_external_capability_scan_passed':True}
    private_write(ROOT/'bootstrap/preparation.json',json.dumps(report,indent=2))
    print(json.dumps(report,separators=(',',':')))

if __name__=='__main__':
    try:main()
    except Exception as e:
        # Never print subprocess stderr, SQL, environment values or credentials.
        print(json.dumps({'status':'refused','code':str(e) if isinstance(e,RuntimeError) else type(e).__name__}),file=sys.stderr)
        raise SystemExit(1)
