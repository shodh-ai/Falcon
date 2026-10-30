#!/usr/bin/python3 -I
"""Resource and isolation safety monitor: may stop only registered staging units."""
import fcntl
import os
import sys
from pathlib import Path
# -I ignores cwd and PYTHONPATH. Admit only this installed package directory.
sys.path.insert(0,str(Path(__file__).resolve().parent))
from host import Host, trusted_json


def stop_staging(host):
    ids={v['id'] for v in host.state['data_containers'].values()}
    current=host.state.get('current')
    if current:ids.update(current['containers'].values())
    candidate_path=host.private/'candidate.json'
    if candidate_path.exists():ids.update(trusted_json(candidate_path).get('containers',{}).values())
    production={v['id'] for v in trusted_json(host.private/'production-baseline.json')['resources'].values()}
    for identifier in ids:
        if identifier in production:raise RuntimeError('STAGING_STOP_PRODUCTION_REFUSED')
        value=host.inspect(identifier);labels=value['Config'].get('Labels') or {}
        if labels.get('io.falcon.environment')!='staging' or \
           not all(m['Source'].startswith('/data/falcon-staging/') for m in value['Mounts']):
            raise RuntimeError('STAGING_STOP_IDENTITY_REFUSED')
        if value['State']['Running']:host.run(['docker','stop','--time','30',identifier],timeout=40)


def check(host):
    try:
        host.guard();host.verify_network();host.verify_production()
    except Exception:
        stop_staging(host)
        host.audit({'safety_stop':True,'data_preserved':True})
        raise


def main():
    if os.geteuid()!=0 or sys.argv[1:]:raise RuntimeError('STAGING_MONITOR_OWNER_ONLY')
    host=Host(initial=True)
    fd=os.open(host.private/'deploy.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return # The serialized deployer runs these same guards.
        check(host)

if __name__=='__main__':main()
