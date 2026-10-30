import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('reset',Path(__file__).parents[1]/'reset.py')
reset=importlib.util.module_from_spec(spec);spec.loader.exec_module(reset)

class ResetTests(unittest.TestCase):
    def state(self):return {'data_containers':{'postgres':{'id':'a'*64}},'current':{'release_id':'b'*16}}
    def request(self):return {'version':1,'database':'falcon_staging','postgres_id':'a'*64,
        'paths':reset.PATHS,'release_id':'b'*16,'acknowledge_dummy_data_reset':True}
    def test_production_and_unexpected_paths_never_reach_reset(self):
        for patch in [{'database':'postgres'},{'database':'university_governance'},
            {'postgres_id':'c'*64},{'paths':['/data/coolify']},{'paths':['/data/falcon-backups']},
            {'release_id':'old-release'},{'acknowledge_dummy_data_reset':False}]:
            with self.assertRaises(RuntimeError):reset.validate_reset({**self.request(),**patch},self.state(),{'c'*64})
    def test_current_staging_generation_and_explicit_owner_acknowledgment_required(self):
        reset.validate_reset(self.request(),self.state(),{'c'*64})
        with self.assertRaises(RuntimeError):reset.validate_reset(self.request(),{**self.state(),'current':None},{'c'*64})

if __name__=='__main__':unittest.main()
