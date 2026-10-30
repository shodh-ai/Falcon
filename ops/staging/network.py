"""Narrow staging firewall rules. Never flush or replace an existing host chain."""
import os
import shlex
import subprocess

SUBNETS=('172.30.241.0/24','172.30.242.0/24')
PROXY_IP='172.30.241.254'
OUT='FALCON-STAGING-OUT'
HOST='FALCON-STAGING-HOST'


def rules():
    return {OUT:[
      ['-m','conntrack','--ctstate','RELATED,ESTABLISHED','-j','RETURN'],
      ['-d',PROXY_IP+'/32','-j','DROP'],
      *[['-d',subnet,'-j','RETURN'] for subnet in SUBNETS],['-j','DROP']],
      HOST:[['-m','conntrack','--ctstate','RELATED,ESTABLISHED','-j','RETURN'],['-j','DROP']]}


def run(args,check=True):
    r=subprocess.run(['iptables','-w','5',*args],capture_output=True,text=True,timeout=10)
    if check and r.returncode:raise RuntimeError('STAGING_FIREWALL_COMMAND_FAILED')
    return r


def install(execute=run):
    if os.geteuid()!=0:raise RuntimeError('OWNER_REQUIRED')
    execute(['-S','DOCKER-USER'])  # Unsupported firewall backend must fail closed.
    for chain,expected in rules().items():
        current=execute(['-S',chain],check=False)
        if current.returncode:
            execute(['-N',chain])
            for rule in expected:execute(['-A',chain,*rule])
        else:
            observed=[shlex.split(line)[2:] for line in current.stdout.splitlines() if line.startswith('-A ')]
            def normalized(rule):
                rule=list(rule)
                if '--ctstate' in rule:
                    index=rule.index('--ctstate')+1;rule[index]=','.join(sorted(rule[index].split(',')))
                return rule
            if [normalized(r) for r in observed]!=[normalized(r) for r in expected]:raise RuntimeError('STAGING_FIREWALL_RULE_DRIFT')
    for parent,child in [('DOCKER-USER',OUT),('INPUT',HOST)]:
        for subnet in SUBNETS:
            match=['-s',subnet,'-j',child]
            if execute(['-C',parent,*match],check=False).returncode:
                execute(['-I',parent,'1',*match])
    return {'staging_firewall_installed':True,'proxy_new_connections_denied':PROXY_IP,
            'source_subnets':list(SUBNETS),'existing_rules_flushed':False}
