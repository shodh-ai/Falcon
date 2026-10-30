#!/usr/bin/python3 -I
"""Owner-only synthetic reset, preserving every old staging generation on disk."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parent))
from host import Host, trusted_json, atomic_json
from watchdog import stop_staging

PATHS=['/data/falcon-staging/'+x for x in ['postgres','redis','mail','uploads']]


def validate_reset(request,state,production_ids):
    if not isinstance(request,dict) or set(request)!={'version','database','postgres_id','paths','release_id','acknowledge_dummy_data_reset'} or request['version']!=1:
        raise RuntimeError('STAGING_RESET_SCHEMA')
    if request['database']!='falcon_staging' or request['paths']!=PATHS or \
       request['postgres_id'] in production_ids or request['postgres_id']!=state['data_containers']['postgres']['id'] or \
       request['acknowledge_dummy_data_reset'] is not True or \
       not state.get('current') or request['release_id']!=state['current']['release_id']:
        raise RuntimeError('STAGING_RESET_TARGET_REFUSED')


def main():
    if os.geteuid()!=0 or sys.argv[1:]!=['--owner-approved-preserve-reset']:
        raise RuntimeError('STAGING_RESET_OWNER_ONLY')
    host=Host(initial=True)
    request=trusted_json(host.private/'reset-approved.json')
    production={v['id'] for v in trusted_json(host.private/'production-baseline.json')['resources'].values()}
    validate_reset(request,host.state,production)
    fd=os.open(host.private/'deploy.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        host.guard();host.verify_production();host.verify_network()
        for key,expected in host.state['data_containers'].items():
            actual=host.inspect(expected['id'])
            if actual['Mounts']!=expected['mounts'] or actual['Image']!=expected['image']:
                raise RuntimeError('STAGING_RESET_MOUNT_DRIFT')
        for path in PATHS:
            p=Path(path)
            if p.is_symlink() or not p.is_dir():raise RuntimeError('STAGING_RESET_PATH_DRIFT')
        archive=Path('/data/falcon-staging/preservation')/('reset-'+uuid.uuid4().hex)
        archive.mkdir(mode=0o700,parents=True)
        atomic_json(archive/'reset-request.json',request)
        stop_staging(host)
        host.restore_route(None)
        route=Path('/data/coolify/proxy/dynamic/falcon-staging-guarded.yaml')
        atomic_json(host.private/'reset-pending.json',{'empty_route_sha256':hashlib.sha256(route.read_bytes()).hexdigest()})
        # First disable the automatic deployer's acceptance gate. No old files
        # are deleted; only these exact staging paths can be moved.
        if (host.private/'acceptance.json').exists():os.rename(host.private/'acceptance.json',archive/'acceptance.json')
        for name in ['state.json','candidate.json','storage-boundary.json','reset-approved.json']:
            path=host.private/name
            if path.exists():os.rename(path,archive/name)
        invites=host.private/'access/invites.json'
        if invites.exists():os.rename(invites,archive/'invites.json')
        for path,uid in zip(PATHS,[70,999,61002,61001]):
            source=Path(path);os.rename(source,archive/source.name)
            source.mkdir(mode=0o700);os.chown(source,uid,uid)
        bootstrap=Path('/data/falcon-staging/bootstrap');os.rename(bootstrap,archive/'bootstrap')
        bootstrap.mkdir(mode=0o700)
        for name in ['schema.sql','migration-ledger.json','extensions.json','preparation.json']:
            source=archive/'bootstrap'/name
            fd=os.open(bootstrap/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,'wb') as stream:stream.write(source.read_bytes())
        host.verify_production()
        host.audit({'manual_reset_preserved':str(archive),'automatic_deployment_disabled':True})
    # It remains cold. The owner must rerun cold bootstrap, reviewed migration
    # maintenance, the first release and every acceptance check before re-enabling.
    print(json.dumps({'preserved':str(archive),'staging_enabled':False}))

if __name__=='__main__':main()
