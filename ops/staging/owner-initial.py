#!/usr/bin/python3 -I
"""Local root-only first release. No SSH access, reset, SQL or arbitrary target."""
import fcntl
import os
import re
import sys
from pathlib import Path
# -I ignores cwd and PYTHONPATH. Admit only this installed package directory.
sys.path.insert(0,str(Path(__file__).resolve().parent))
from host import Host, trusted_json
from controller import deploy_release
from watchdog import stop_staging


def main():
    if os.geteuid()!=0 or sys.argv[1:]!=['--reviewed-initial-release']:
        raise RuntimeError('STAGING_INITIAL_OWNER_ONLY')
    host=Host(initial=True)
    if host.state.get('current'):raise RuntimeError('STAGING_INITIAL_ALREADY_DEPLOYED')
    request=trusted_json(host.private/'initial-approved-release.json')
    if set(request)!={'version','sha','backend_digest','frontend_digest','protected_staging_ci_run'} or request['version']!=1:
        raise RuntimeError('STAGING_INITIAL_APPROVAL_SCHEMA')
    if not re.fullmatch(r'[0-9a-f]{40}',request['sha']) or \
       any(not re.fullmatch(r'sha256:[0-9a-f]{64}',request[k]) for k in ['backend_digest','frontend_digest']) or \
       not re.fullmatch(r'https://github.com/shodh-ai/Falcon/actions/runs/[0-9]+',request['protected_staging_ci_run']):
        raise RuntimeError('STAGING_INITIAL_APPROVAL_IDENTITY')
    fd=os.open(host.private/'deploy.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        try:
            result=deploy_release(host,request)
            host.audit({'initial_owner_release':True,'result':result,'acceptance_required':True})
        except Exception:
            stop_staging(host);raise

if __name__=='__main__':main()
