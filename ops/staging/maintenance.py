#!/usr/bin/python3 -I
"""Local owner-only, manifest-bounded staging schema maintenance. No resets."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from host import Host, trusted_json


def validate_manifest(value,production_ids):
    if not isinstance(value,dict) or set(value)!={'version','postgres_id','database','storage','migrations'} or value['version']!=1:
        raise RuntimeError('STAGING_MAINTENANCE_SCHEMA')
    if value['database']!='falcon_staging' or value['storage']!='/data/falcon-staging/postgres' or \
       not re.fullmatch(r'[a-f0-9]{64}',value['postgres_id']) or value['postgres_id'] in production_ids:
        raise RuntimeError('STAGING_MAINTENANCE_TARGET_REFUSED')
    files=value['migrations']
    if not isinstance(files,list) or not 1<=len(files)<=10:raise RuntimeError('STAGING_MAINTENANCE_BOUND')
    names=[]
    for item in files:
        if not isinstance(item,dict) or set(item)!={'filename','sha256'} or \
           not re.fullmatch(r'[A-Za-z0-9_-]+\.sql',item['filename']) or 'seed' in item['filename'].lower() or \
           not re.fullmatch(r'[a-f0-9]{64}',item['sha256']):raise RuntimeError('STAGING_MAINTENANCE_FILE')
        names.append(item['filename'])
    if len(set(names))!=len(names):raise RuntimeError('STAGING_MAINTENANCE_DUPLICATE')
    return files


def reviewed_sql(text,filename):
    # psql meta-commands and transaction escapes would defeat the one bounded
    # transaction. Reviewed files must omit their own outer transaction wrapper.
    if re.search(r'(?im)^\s*\\|\b(?:BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\b|\bEND\s*;',text):
        raise RuntimeError('STAGING_MAINTENANCE_TRANSACTION_ESCAPE')
    return text+"\nINSERT INTO schema_migrations(filename) VALUES ('"+filename+"') ON CONFLICT DO NOTHING;\n"


def main():
    if os.geteuid()!=0 or sys.argv[1:]!=['--reviewed-manifest']:
        raise RuntimeError('STAGING_MAINTENANCE_OWNER_ONLY')
    host=Host(initial=True)
    manifest=trusted_json(host.private/'maintenance-approved.json')
    production={v['id'] for v in trusted_json(host.private/'production-baseline.json')['resources'].values()}
    files=validate_manifest(manifest,production)
    if manifest['postgres_id']!=host.state['data_containers']['postgres']['id']:
        raise RuntimeError('STAGING_MAINTENANCE_IDENTITY')
    lockfd=os.open(host.private/'deploy.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(lockfd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        host.guard();host.verify_production();host.verify_network()
        if host.state.get('current'):raise RuntimeError('STAGING_MAINTENANCE_STOP_STAGING_FIRST')
        pg=host.inspect(manifest['postgres_id'])
        if not pg['State']['Running'] or pg['Mounts']!=host.state['data_containers']['postgres']['mounts']:
            raise RuntimeError('STAGING_MAINTENANCE_MOUNTS')
        schema=[]
        for item in files:
            path=host.private/'reviewed-migrations'/item['filename'];info=path.lstat()
            if path.is_symlink() or info.st_uid!=0 or info.st_mode&0o222 or info.st_size>1024*1024:
                raise RuntimeError('STAGING_MAINTENANCE_SOURCE_TRUST')
            data=path.read_bytes()
            if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('STAGING_MAINTENANCE_HASH')
            schema.append(reviewed_sql(data.decode(),item['filename']))
        # Exactly one staging instance, one bounded transaction, no deployment credentials in the API.
        sql="SET statement_timeout='90s';SET lock_timeout='5s';SELECT pg_advisory_xact_lock(740033);\n"+'\n'.join(schema)
        host.run(['docker','exec','-i',pg['Id'],'psql','-X','-q','--single-transaction',
            '-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-U','postgres','-d','falcon_staging','-f','-'],input=sql.encode(),timeout=110)
        policy=Path(__file__).with_name('runtime-role.sql')
        info=policy.lstat()
        if policy.is_symlink() or info.st_uid!=0 or info.st_mode&0o222:
            raise RuntimeError('STAGING_RUNTIME_POLICY_TRUST')
        host.run(['docker','exec','-i',pg['Id'],'psql','-X','-q','-v','ON_ERROR_STOP=1',
            '-v','runtime_role=falcon_staging_runtime','-v','runtime_database=falcon_staging',
            '-v','runtime_schema=public','-h','/var/run/postgresql','-U','postgres',
            '-d','falcon_staging','-f','-'],input=policy.read_bytes(),timeout=90)
        host.verify_production();host.audit({'staging_maintenance':files,'postgres_id':pg['Id']})

if __name__=='__main__':main()
