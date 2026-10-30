#!/usr/bin/python3 -I
"""Forced-command staging deployer. Never accepts commands, targets or SQL."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import sys
import uuid

FIELDS={'version','sha','backend_digest','frontend_digest','oidc_token'}


def validate_request(value):
    if not isinstance(value,dict) or set(value)!=FIELDS or type(value['version']) is not int or value['version']!=1:
        raise ValueError('STAGING_REQUEST_SCOPE')
    if not isinstance(value['sha'],str) or not re.fullmatch(r'[0-9a-f]{40}',value['sha']):
        raise ValueError('STAGING_REQUEST_SHA')
    for key in ['backend_digest','frontend_digest']:
        if not isinstance(value[key],str) or not re.fullmatch(r'sha256:[0-9a-f]{64}',value[key]):
            raise ValueError('STAGING_REQUEST_IMAGE')
    if not isinstance(value['oidc_token'],str) or not 64<=len(value['oidc_token'])<=16384:
        raise ValueError('STAGING_REQUEST_IDENTITY')
    return value


def identity_audience(request):
    return ':'.join(['falcon-staging-deploy',request['sha'],request['backend_digest'],request['frontend_digest']])


def deploy_release(host,request):
    """The old release stays alive until candidate AND public checks pass."""
    host.require_ready()
    host.guard(candidate_mib=1280)
    host.verify_production()
    images=host.pull_and_verify(request)
    host.ensure_data()
    host.verify_network()
    host.verify_schema(images)
    previous=host.route_snapshot()
    candidate=None
    published=False
    committed=False
    try:
        candidate=host.prepare_candidate(images,request['sha'],uuid.uuid4().hex[:16])
        host.start_candidate(candidate)
        host.verify_candidate(candidate)
        host.verify_production()
        host.publish(candidate)
        published=True
        host.verify_public(candidate)
        host.verify_production()
        host.commit(candidate)
        committed=True
    finally:
        if not committed:
            if published or (candidate and candidate.get('route_attempted')):host.restore_route(previous)
            if candidate:host.stop_candidate(candidate)
    if previous:host.stop_previous(previous)
    return {'status':'healthy','sha':request['sha'],'release_id':candidate['release_id']}


def load_module(name):
    p=Path(__file__).resolve().with_name(name+'.py')
    info=p.stat()
    if info.st_uid!=0 or info.st_mode&0o022 or p.is_symlink():raise RuntimeError('STAGING_CODE_TRUST')
    spec=importlib.util.spec_from_file_location('falcon_staging_'+name,p)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def main():
    if os.geteuid()!=0 or sys.platform!='linux' or sys.argv[1:]!=['--request-stdin']:
        raise RuntimeError('STAGING_OWNER_ENTRYPOINT')
    os.umask(0o077)
    signal.alarm(30)
    raw=sys.stdin.buffer.read(20001)
    if len(raw)>20000:raise ValueError('STAGING_REQUEST_SIZE')
    request=validate_request(json.loads(raw))
    oidc=load_module('oidc');host_module=load_module('host')
    identity=oidc.verify(request['oidc_token'],request['sha'],audience=identity_audience(request))
    host=host_module.Host()
    host.require_ready()
    # Consume short-lived identities once. Never persist the bearer token.
    receipt=host.private/'requests'/identity['jti']
    receipt.parent.mkdir(mode=0o700,exist_ok=True)
    fd=os.open(receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(identity,stream)
    lockfd=os.open(str(host.private/'deploy.lock'),os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(lockfd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        signal.alarm(900)
        try:
            result=deploy_release(host,request)
            host.audit({'identity':identity,'result':result})
        except Exception:
            host.audit({'identity':identity,'result':{'status':'failed'}})
            raise
    print(json.dumps(result,separators=(',',':')))

if __name__=='__main__':
    try:main()
    except Exception as error:
        # Subprocess stderr, credentials, token and SQL never reach SSH output.
        code=str(error) if isinstance(error,(ValueError,RuntimeError)) and re.fullmatch(r'[A-Z0-9_]+',str(error)) else 'STAGING_DEPLOYMENT_REFUSED'
        print(json.dumps({'status':'refused','code':code}),file=sys.stderr)
        raise SystemExit(1)
