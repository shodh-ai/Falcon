"""Verify GitHub's short-lived deployment identity without a production token."""
import base64
import json
import re
import subprocess
import tempfile
from pathlib import Path
import time
import urllib.request

ISSUER='https://token.actions.githubusercontent.com'
JWKS=ISSUER+'/.well-known/jwks'
REPOSITORY='shodh-ai/Falcon'
WORKFLOW=REPOSITORY+'/.github/workflows/falcon-tests.yml@refs/heads/staging'
JOB_WORKFLOW=REPOSITORY+'/.github/workflows/publish-staging-images.yml@refs/heads/staging'


def require(value,code):
    if not value:raise ValueError(code)


def decode(value):
    require(isinstance(value,str) and re.fullmatch(r'[A-Za-z0-9_-]+',value),'OIDC_ENCODING')
    return base64.urlsafe_b64decode(value+'='*((-len(value))%4))


def claims_allowed(claims,sha,now,audience='falcon-staging-deploy'):
    for name,expected in {'iss':ISSUER,'aud':audience,'repository':REPOSITORY,
        'ref':'refs/heads/staging','event_name':'push','sha':sha,
        'sub':'repo:'+REPOSITORY+':environment:staging',
        'workflow_ref':WORKFLOW,'job_workflow_ref':JOB_WORKFLOW,'runner_environment':'github-hosted'}.items():
        require(claims.get(name)==expected,'OIDC_CLAIM_'+name.upper())
    require(isinstance(claims.get('iat'),int) and isinstance(claims.get('exp'),int),'OIDC_TIME')
    require(now-600<=claims['iat']<=now+30 and now<claims['exp']<=claims['iat']+600,'OIDC_EXPIRED')
    require(isinstance(claims.get('nbf',claims['iat']),int) and claims.get('nbf',claims['iat'])<=now+30,'OIDC_NOT_YET_VALID')
    require(re.fullmatch(r'[A-Za-z0-9-]{16,128}',str(claims.get('jti',''))),'OIDC_NONCE')
    require(re.fullmatch(r'[0-9]+',str(claims.get('run_id',''))),'OIDC_RUN')
    require(re.fullmatch(r'[1-9][0-9]{0,15}',str(claims.get('run_number',''))),'OIDC_RUN_NUMBER')
    return {k:claims[k] for k in ['sha','jti','run_id','run_number','iat','exp']}


def verify_rsa(message,signature,key):
    require(key.get('kty')=='RSA' and key.get('alg','RS256')=='RS256','OIDC_KEY')
    n=int.from_bytes(decode(key['n']),'big');e=int.from_bytes(decode(key['e']),'big')
    require(2048<=n.bit_length()<=4096 and e==65537,'OIDC_RSA_KEY')
    size=(n.bit_length()+7)//8
    require(len(signature)==size and int.from_bytes(signature,'big')<n,'OIDC_SIGNATURE_SIZE')
    # Serialize the trusted public key; OpenSSL performs signature verification.
    def der(tag,value):
        length=len(value)
        raw=bytes([length]) if length<128 else bytes([0x80+(length.bit_length()+7)//8])+length.to_bytes((length.bit_length()+7)//8,'big')
        return bytes([tag])+raw+value
    def integer(value):
        raw=value.to_bytes((value.bit_length()+7)//8,'big')
        return der(2,(b'\x00' if raw[0]&0x80 else b'')+raw)
    rsa=der(0x30,integer(n)+integer(e))
    algorithm=bytes.fromhex('300d06092a864886f70d0101010500')
    spki=der(0x30,algorithm+der(3,b'\x00'+rsa))
    with tempfile.TemporaryDirectory(prefix='falcon-staging-oidc-') as directory:
        public=Path(directory)/'public.der';signed=Path(directory)/'signature.bin'
        public.write_bytes(spki);signed.write_bytes(signature)
        result=subprocess.run(['openssl','dgst','-sha256','-keyform','DER','-verify',str(public),
            '-signature',str(signed)],input=message,capture_output=True,timeout=3)
    require(result.returncode==0,'OIDC_SIGNATURE')



def trusted_keys():
    # No caller-controlled issuer, key URL, proxy setting or insecure TLS option.
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(JWKS,timeout=10) as response:
        raw=response.read(131073)
    require(len(raw)<=131072,'OIDC_KEYSET_SIZE')
    keys=json.loads(raw)['keys']
    require(isinstance(keys,list) and 1<=len(keys)<=32,'OIDC_KEYSET')
    return keys


def verify(token,sha,*,keys=None,now=None,audience='falcon-staging-deploy'):
    require(isinstance(token,str) and len(token)<=16384,'OIDC_TOKEN_SIZE')
    require(re.fullmatch(r'[0-9a-f]{40}',sha),'OIDC_SHA')
    parts=token.split('.');require(len(parts)==3,'OIDC_FORMAT')
    header=json.loads(decode(parts[0]))
    require(header.get('alg')=='RS256' and header.get('typ')=='JWT' and
            not any(k in header for k in ['jku','jwk','x5u','crit']),'OIDC_HEADER')
    matches=[key for key in (trusted_keys() if keys is None else keys) if key.get('kid')==header.get('kid')]
    require(len(matches)==1,'OIDC_KEY_ID')
    verify_rsa((parts[0]+'.'+parts[1]).encode(),decode(parts[2]),matches[0])
    return claims_allowed(json.loads(decode(parts[1])),sha,int(time.time()) if now is None else now,audience)
