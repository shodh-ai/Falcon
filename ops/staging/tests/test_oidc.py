import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('oidc',Path(__file__).parents[1]/'oidc.py')
oidc=importlib.util.module_from_spec(spec);spec.loader.exec_module(oidc)

class OidcTests(unittest.TestCase):
 def claims(self):return {'iss':oidc.ISSUER,'aud':'falcon-staging-deploy','repository':oidc.REPOSITORY,
  'ref':'refs/heads/staging','event_name':'push','sha':'a'*40,
  'sub':'repo:'+oidc.REPOSITORY+':environment:staging','workflow_ref':oidc.WORKFLOW,
  'job_workflow_ref':oidc.JOB_WORKFLOW,'runner_environment':'github-hosted',
  'iat':1000,'nbf':1000,'exp':1300,'jti':'synthetic-nonce-123456789','run_id':'1234','run_number':'12'}
 def test_only_staging_push_and_deployment_environment_allowed(self):
  self.assertEqual(oidc.claims_allowed(self.claims(),'a'*40,1100)['run_id'],'1234')
  for key in ['iss','aud','repository','ref','event_name','sha','sub','workflow_ref','job_workflow_ref','runner_environment']:
   with self.assertRaises(ValueError,msg=key):oidc.claims_allowed({**self.claims(),key:'wrong'},'a'*40,1100)
 def test_production_pull_request_and_expired_identities_refused(self):
  for patch in [{'ref':'refs/heads/main'},{'event_name':'pull_request'},{'exp':1050},{'iat':1500},
    {'exp':5000},{'nbf':1600},{'jti':'../anything'},{'run_id':'shell;command'},{'run_number':'-1'},{'run_number':None}]:
   with self.assertRaises(ValueError):oidc.claims_allowed({**self.claims(),**patch},'a'*40,1100)
 def test_identity_is_bound_to_exact_release_digest_audience(self):
  audience='falcon-staging-deploy:'+'a'*40+':sha256:'+'b'*64+':sha256:'+'c'*64
  claims={**self.claims(),'aud':audience}
  self.assertEqual(oidc.claims_allowed(claims,'a'*40,1100,audience)['sha'],'a'*40)
  with self.assertRaises(ValueError):oidc.claims_allowed(claims,'a'*40,1100,audience.replace('b'*64,'d'*64))
 def test_untrusted_key_locations_algorithms_and_malformed_tokens_refused(self):
  enc=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
  for header in [{'alg':'none','typ':'JWT'},{'alg':'HS256','typ':'JWT'},
    {'alg':'RS256','typ':'JWT','jku':'https://untrusted.invalid'}]:
   with self.assertRaises(ValueError):oidc.verify(enc(header)+'.'+enc(self.claims())+'.c2ln','a'*40,keys=[],now=1100)
  for token in ['a.b','a.b.c.d','='*100,'x'*17000]:
   with self.assertRaises((ValueError,UnicodeError)):oidc.verify(token,'a'*40,keys=[],now=1100)
 def test_real_rsa_signature_verified_and_payload_tampering_refused(self):
  enc=lambda x:base64.urlsafe_b64encode(x).decode().rstrip('=')
  with tempfile.TemporaryDirectory(prefix='falcon-synthetic-oidc-') as temp:
   p=Path(temp);key=p/'test-key.pem'
   subprocess.run(['openssl','genrsa','-out',str(key),'2048'],check=True,capture_output=True)
   modulus=subprocess.check_output(['openssl','rsa','-in',str(key),'-noout','-modulus'],stderr=subprocess.DEVNULL).decode().strip().split('=')[1]
   public={'kid':'synthetic','kty':'RSA','alg':'RS256','n':enc(bytes.fromhex(modulus)),'e':enc((65537).to_bytes(3,'big'))}
   first=enc(json.dumps({'alg':'RS256','typ':'JWT','kid':'synthetic'}).encode())
   second=enc(json.dumps(self.claims()).encode());message=(first+'.'+second).encode()
   signature=subprocess.check_output(['openssl','dgst','-sha256','-sign',str(key)],input=message)
   token=message.decode()+'.'+enc(signature)
   self.assertEqual(oidc.verify(token,'a'*40,keys=[public],now=1100)['sha'],'a'*40)
   tampered=first+'.'+enc(json.dumps({**self.claims(),'ref':'refs/heads/main'}).encode())+'.'+enc(signature)
   with self.assertRaisesRegex(ValueError,'OIDC_SIGNATURE'):oidc.verify(tampered,'a'*40,keys=[public],now=1100)

if __name__=='__main__':unittest.main()
