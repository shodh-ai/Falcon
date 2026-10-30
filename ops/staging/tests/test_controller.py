import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('controller',Path(__file__).parents[1]/'controller.py')
controller=importlib.util.module_from_spec(spec);spec.loader.exec_module(controller)

class FakeHost:
 def __init__(self,fail=None):self.calls=[];self.fail=fail
 def call(self,name):
  self.calls.append(name)
  if name==self.fail:raise RuntimeError('SYNTHETIC_FAILURE')
 def require_ready(self):self.call('ready')
 def guard(self,**kwargs):self.call('guard')
 def verify_production(self):self.call('production')
 def pull_and_verify(self,request):self.call('images');return {}
 def ensure_data(self):self.call('data')
 def verify_network(self):self.call('network')
 def verify_schema(self,images):self.call('schema')
 def route_snapshot(self):self.call('snapshot');return {'previous':'healthy'}
 def prepare_candidate(self,images,sha,release):self.call('prepare');return {'release_id':release}
 def start_candidate(self,c):self.call('start')
 def verify_candidate(self,c):self.call('candidate')
 def publish(self,c):c['route_attempted']=True;self.call('publish')
 def verify_public(self,c):self.call('public')
 def commit(self,c):self.call('commit')
 def restore_route(self,p):self.call('rollback_route')
 def stop_candidate(self,c):self.call('stop_candidate')
 def stop_previous(self,p):self.call('stop_previous')

class ControllerTests(unittest.TestCase):
 def request(self):return {'version':1,'sha':'a'*40,'backend_digest':'sha256:'+'a'*64,
  'frontend_digest':'sha256:'+'b'*64,'oidc_token':'synthetic-token-'+'x'*80}
 def test_commands_mounts_sql_and_alternative_projects_are_never_accepted(self):
  for key in ['command','sql','mounts','project','database','purge','restore','environment']:
   with self.assertRaises(ValueError):controller.validate_request({**self.request(),key:'anything'})
 def test_mutable_images_invalid_refs_and_boolean_versions_refused(self):
  for patch in [{'version':True},{'sha':'main'},{'backend_digest':'latest'},
   {'frontend_digest':'ghcr.io/shodh-ai/falcon-backend:main'},{'oidc_token':''}]:
   with self.assertRaises(ValueError):controller.validate_request({**self.request(),**patch})
 def test_previous_release_is_retired_only_after_all_verification_and_commit(self):
  host=FakeHost();result=controller.deploy_release(host,self.request())
  self.assertEqual(result['status'],'healthy')
  self.assertLess(host.calls.index('candidate'),host.calls.index('publish'))
  self.assertLess(host.calls.index('public'),host.calls.index('commit'))
  self.assertLess(host.calls.index('commit'),host.calls.index('stop_previous'))
 def test_failed_candidate_keeps_old_route_and_old_containers(self):
  host=FakeHost('candidate')
  with self.assertRaises(RuntimeError):controller.deploy_release(host,self.request())
  self.assertIn('stop_candidate',host.calls)
  self.assertNotIn('publish',host.calls);self.assertNotIn('stop_previous',host.calls)
 def test_partial_start_is_cleaned_without_touching_old_release(self):
  host=FakeHost('start')
  with self.assertRaises(RuntimeError):controller.deploy_release(host,self.request())
  self.assertIn('stop_candidate',host.calls);self.assertNotIn('stop_previous',host.calls)
 def test_publish_failure_still_restores_previous_route(self):
  host=FakeHost('publish')
  with self.assertRaises(RuntimeError):controller.deploy_release(host,self.request())
  self.assertIn('rollback_route',host.calls);self.assertIn('stop_candidate',host.calls)
 def test_failed_public_check_restores_only_previous_staging_route(self):
  host=FakeHost('public')
  with self.assertRaises(RuntimeError):controller.deploy_release(host,self.request())
  self.assertIn('rollback_route',host.calls);self.assertIn('stop_candidate',host.calls)
  self.assertNotIn('commit',host.calls);self.assertNotIn('stop_previous',host.calls)
 def test_capacity_and_production_identity_failures_precede_candidates(self):
  for step in ['guard','production','images','network','schema']:
   host=FakeHost(step)
   with self.assertRaises(RuntimeError):controller.deploy_release(host,self.request())
   self.assertNotIn('start',host.calls);self.assertNotIn('publish',host.calls)

if __name__=='__main__':unittest.main()
