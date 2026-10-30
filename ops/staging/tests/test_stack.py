import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('stack',Path(__file__).parents[1]/'stack.py')
stack=importlib.util.module_from_spec(spec);spec.loader.exec_module(stack)

class StackTests(unittest.TestCase):
 def setUp(self):
  self.images={k:v+'@sha256:'+'a'*64 for k,v in {'api':'ghcr.io/shodh-ai/falcon-staging-backend',
   'frontend':'ghcr.io/shodh-ai/falcon-staging-frontend','postgres':'postgres','redis':'redis','mail':'axllent/mailpit'}.items()}
 def test_bootstrap_has_no_applications(self):
  self.assertEqual(len(stack.build(self.images)['services']),3)
 def test_only_private_networks_and_no_host_ports(self):
  c=stack.build(self.images,applications=True)
  self.assertTrue(all(n['internal'] for n in c['networks'].values()))
  self.assertTrue(all(not s.get('ports') and not s.get('privileged') and not s.get('network_mode') for s in c['services'].values()))
 def test_production_images_and_mutable_tags_refused(self):
  for image in ['ghcr.io/shodh-ai/falcon-backend@sha256:'+'a'*64,'ghcr.io/shodh-ai/falcon-staging-backend:latest']:
   self.images['api']=image
   with self.assertRaises(ValueError):stack.build(self.images)
 def test_every_mount_is_staging_only_and_existing(self):
  for s in stack.build(self.images,applications=True)['services'].values():
   for v in s.get('volumes',[]):
    self.assertTrue(v['source'].startswith(stack.ROOT+'/'))
    self.assertFalse(v['bind']['create_host_path'])
    self.assertNotIn('docker.sock',v['target'])
 def test_production_mount_refused(self):
  for p in ['/data/coolify/uploads','/data/falcon-staging/../falcon-backups']:
   with self.assertRaises(ValueError):stack.mount(p,'/app/uploads')
 def test_runtime_limits_and_immutable_code(self):
  c=stack.build(self.images,applications=True)
  for s in c['services'].values():
   self.assertEqual(s['cap_drop'],['ALL']);self.assertTrue(s['read_only'])
   self.assertEqual(s['mem_limit'],s['memswap_limit'])
  self.assertEqual(c['services']['falcon-staging-api']['mem_limit'],'768m')
 def test_new_staging_secrets_only(self):
  e=stack.build(self.images,applications=True)['services']['falcon-staging-api']['environment']
  self.assertEqual(e['DB_DATABASE'],'falcon_staging')
  self.assertEqual(e['DB_PASSWORD'],'${STAGING_DB_PASSWORD}')
  self.assertEqual(e['EMAIL_HOST'],'falcon-staging-mail')
  self.assertFalse(any(k.startswith(('GOOGLE_','RAZORPAY_','AWS_')) for k in e))
 def test_capacity_initial_and_rollout_reserve(self):
  stack.capacity(4096*1024**2,21*1024**3,initial=True)
  for m,kw in [(4095,{'initial':True}),(1535,{}),(2303,{'candidate_mib':768})]:
   with self.assertRaises(ValueError):stack.capacity(m*1024**2,21*1024**3,**kw)
 def test_backup_disk_space_cannot_be_consumed(self):
  with self.assertRaises(ValueError):stack.capacity(8*1024**3,19*1024**3)
  with self.assertRaises(ValueError):stack.capacity(8*1024**3,21*1024**3,working_bytes=8*1024**3)
 def test_host_and_none_networks_can_have_null_ipam_configuration(self):
  self.assertEqual(stack.docker_subnets([{'IPAM':{'Config':None}},{'IPAM':None},
   {'IPAM':{'Config':[{'Subnet':'10.0.1.0/24'}]}}]),['10.0.1.0/24'])
 def test_subnet_overlap_refused(self):
  with self.assertRaises(ValueError):stack.validate_subnets(['172.30.0.0/16'])
  stack.validate_subnets(['10.0.1.0/24','172.18.0.0/16'])
 def test_containers_do_not_publish_routes_before_acceptance(self):
  c=stack.build(self.images,applications=True)
  for name in ['api','frontend']:
   self.assertEqual(c['services']['falcon-staging-'+name]['labels'],{'traefik.enable':'false'})


class ReleaseTests(unittest.TestCase):
 setUp=StackTests.setUp
 def test_candidate_has_no_public_routes_and_no_data_service_replacement(self):
  release=stack.app_release(self.images,'a'*16)
  self.assertEqual(set(release['services']),{'falcon-staging-api','falcon-staging-frontend'})
  self.assertTrue(all(s['labels']['traefik.enable']=='false' for s in release['services'].values()))
  self.assertTrue(all(n['external'] for n in release['networks'].values()))
  self.assertEqual(release['services']['falcon-staging-frontend']['environment']['INTERNAL_API_URL'],
   'http://falcon-staging-api-'+'a'*16+':4000')
 def test_routes_cannot_include_a_production_host_or_untrusted_target(self):
  import json
  route=stack.route_document('a'*16,'staging-owner:$2b$12$'+'a'*53)
  text=json.dumps(route)
  self.assertNotIn('https://apifalcon.jataka.io',text)
  self.assertNotIn('Host(`falcon.jataka.io`)',text)
  self.assertNotIn('Host(`apifalcon.jataka.io`)',text)
  self.assertEqual(len(route['http']['services']),2)
  self.assertEqual(route['http']['routers']['falcon-staging-web']['middlewares'],['falcon-staging-access'])
  self.assertNotIn('middlewares',route['http']['routers']['falcon-staging-api'])
  with self.assertRaises(ValueError):stack.route_document('prod;command','x')
  with self.assertRaises(ValueError):stack.route_document('a'*16,'weak')

if __name__=='__main__':unittest.main()
