import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('network',Path(__file__).parents[1]/'network.py')
network=importlib.util.module_from_spec(spec);spec.loader.exec_module(network)

class NetworkTests(unittest.TestCase):
 @patch.object(network.os,'geteuid',return_value=0)
 def test_only_staging_source_jumps_are_installed_without_flushing(self,_):
  calls=[]
  def execute(args,check=True):
   calls.append(args)
   missing=args[0]=='-C' or (args[0]=='-S' and args[1]!='DOCKER-USER')
   return SimpleNamespace(returncode=int(missing),stdout='')
  result=network.install(execute)
  self.assertFalse(result['existing_rules_flushed'])
  self.assertFalse(any(x in c for c in calls for x in ['-F','--flush','-P','--policy','-X']))
  jumps=[c for c in calls if c[0]=='-I']
  self.assertEqual(len(jumps),4)
  self.assertTrue(all(c[3]=='-s' and c[4] in network.SUBNETS for c in jumps))
 def test_stage_cannot_initiate_connections_to_shared_proxy_or_host(self):
  out=network.rules()[network.OUT]
  self.assertEqual(out[1],['-d','172.30.241.254/32','-j','DROP'])
  self.assertEqual(out[-1],['-j','DROP'])
  self.assertEqual(network.rules()[network.HOST][-1],['-j','DROP'])
 @patch.object(network.os,'geteuid',return_value=0)
 def test_drifted_chain_refused_without_repair(self,_):
  calls=[]
  def execute(args,check=True):
   calls.append(args)
   return SimpleNamespace(returncode=0,stdout='-A '+network.OUT+' -j ACCEPT\n' if args[1]==network.OUT else '')
  with self.assertRaisesRegex(RuntimeError,'RULE_DRIFT'):network.install(execute)
  self.assertFalse(any(c[0] in ['-A','-I','-F'] for c in calls))
 @patch.object(network.os,'geteuid',return_value=123)
 def test_unprivileged_install_refused(self,_):
  with self.assertRaises(RuntimeError):network.install(lambda *a,**kw:self.fail())

if __name__=='__main__':unittest.main()
