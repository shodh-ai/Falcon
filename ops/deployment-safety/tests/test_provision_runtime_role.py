"""Synthetic offline tests only; never invoke Docker or a database."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest

SPEC = importlib.util.spec_from_file_location('provision_reviewed',
    Path(__file__).resolve().parents[1] / 'provision-runtime-role-reviewed.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

HARNESS = r"""
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
async function run(mode){
 const stdin=new EventEmitter();stdin.setEncoding=()=>{};
 let output='',error='',clients=0,realPasswordReleased=0,guardLoaded=false;
 const password='a'.repeat(64),guard=Buffer.from('synthetic reviewed guard');
 const env={NODE_ENV:'production',DB_SYNCHRONIZE:'false',DB_HOST:'synthetic-pg',
   DB_PORT:'5432',DB_DATABASE:'postgres',DB_USERNAME:'postgres',DB_PASSWORD:'synthetic-admin'};
 const fakeProcess={stdin,env,stdout:{write:s=>{output+=s}},stderr:{write:s=>{error+=s}},
   exitCode:0,exit:()=>{throw Error('unexpected exit')}};
 class Client{
   constructor(options){this.options=options;this.connection=new EventEmitter();this.index=++clients}
   async connect(){
     if(mode==='trust')return;
     if(mode==='cleartext'||(mode==='correct-cleartext'&&this.index===2)){
       this.connection.emit('authenticationCleartextPassword');
       await this.options.password();throw Error('cleartext was accepted');
     }
     if(mode==='md5'){
       this.connection.emit('authenticationMD5Password');
       await this.options.password();throw Error('MD5 was accepted');
     }
     this.connection.emit('authenticationSASL');
     const received=await this.options.password();
     if(received===password)realPasswordReleased++;
     this.connection.emit('authenticationSASLContinue');
     if(this.index===1){
       if(mode==='wrong-accepted')return;
       throw Object.assign(Error('synthetic private driver failure'),{code:mode==='wrong-other-code'?'08006':'28P01'});
     }
     if(mode!=='no-final')this.connection.emit('authenticationSASLFinal');
   }
   async end(){}
 }
 const requireFake=name=>{
   if(name==='node:fs')return{readFileSync:()=>guard};
   if(name==='node:crypto')return crypto;
   if(name==='/app/node_modules/pg')return{Client};
   if(name==='/app/scripts/runtime-start.cjs'){
     guardLoaded=true;
     return{verifyDatabase:async({env,policy,Client:Driver})=>{
       if(policy.role!=='falcon_runtime'||policy.name!=='postgres'||!policy.enforce_least_privilege||
          env.DB_USERNAME!=='falcon_runtime'||env.DB_PASSWORD!==password)throw Error('probe contract');
       const client=new Driver({password:env.DB_PASSWORD});
       try{await client.connect()}finally{await client.end()}
       return{database_boundary_verified:true,least_privilege_enforced:true};
     }};
   }
   throw Error('unexpected require');
 };
 const payload={host:'synthetic-pg',port:5432,role:'falcon_runtime',password,
   runtime_sha256:crypto.createHash('sha256').update(guard).digest('hex')};
 if(mode==='wrong-config')env.DB_DATABASE='unreviewed';
 if(mode==='wrong-hash')payload.runtime_sha256='0'.repeat(64);
 if(mode==='precheck')payload.precheck=true;
 vm.runInNewContext(input.source,{require:requireFake,process:fakeProcess});
 stdin.emit('data',JSON.stringify(payload));
 await stdin.listeners('end')[0]();
 if(output.includes(password)||error.includes(password)||error.includes('private driver'))throw Error('output leak');
 return{mode,output:output?JSON.parse(output):null,error,exit:fakeProcess.exitCode,
   clients,realPasswordReleased,guardLoaded,environmentUnchanged:env.DB_USERNAME==='postgres'};
}
(async()=>{const result=[];for(const mode of input.modes)result.push(await run(mode));
 process.stdout.write(JSON.stringify(result))})().catch(()=>process.exitCode=1);
"""


class ProvisionOfflineTests(unittest.TestCase):
    def test_admin_connection_is_pinned_and_sensitive_sql_is_stdin_only(self):
        provision=MODULE.Provision(SimpleNamespace(pg_container='b'*64),None,None)
        calls=[]
        def command(arguments,**options):
            calls.append((arguments,options))
            return b''
        provision.command=command
        synthetic_sql=b"CREATE ROLE synthetic PASSWORD 'synthetic-verifier';"
        provision.psql(synthetic_sql,boundary=True)
        arguments,options=calls[0]
        self.assertEqual(options,{'data':synthetic_sql})
        self.assertNotIn('synthetic-verifier',' '.join(arguments))
        self.assertEqual(arguments[:5],['exec','-i','b'*64,'/usr/bin/env','-i'])
        self.assertNotIn('-e',arguments)
        for expected in ['PGHOST=/var/run/postgresql','PGPORT=5432',
                         'PGCONNECT_TIMEOUT=5','PGPASSFILE=/dev/null',
                         'runtime_role=falcon_runtime','runtime_database=postgres',
                         'runtime_schema=public']:
            self.assertIn(expected,arguments)
        pgoptions=next(value for value in arguments if value.startswith('PGOPTIONS='))
        for expected in ['lock_timeout=2s','statement_timeout=60s','log_statement=none',
                         'log_min_error_statement=panic','log_min_duration_statement=-1',
                         'log_min_duration_sample=-1','log_transaction_sample_rate=0']:
            self.assertIn(expected,pgoptions)
        assignments=arguments[5:arguments.index('psql')]
        expected_environment=dict(value.split('=',1) for value in assignments)
        self.assertEqual(set(expected_environment),{'PATH','LANG','PGCONNECT_TIMEOUT',
            'PGOPTIONS','PGHOST','PGPORT','PGPASSFILE'})
        # Execute the same clean-environment prefix offline with hostile inherited
        # libpq options. No psql, Docker, database or credentials are involved.
        inherited={**os.environ,'PGSERVICE':'','PGSERVICEFILE':'/synthetic/services',
            'PGHOSTADDR':'192.0.2.10','PGPASSWORD':'synthetic-only',
            'PGDATABASE':'unreviewed','PGUSER':'unreviewed'}
        result=subprocess.run(['/usr/bin/env','-i',*assignments,'/usr/bin/env'],env=inherited,
            capture_output=True,check=True,timeout=10)
        observed=dict(line.split('=',1) for line in result.stdout.decode().splitlines())
        self.assertEqual(observed,expected_environment)
        for key in ['PGSERVICE','PGSERVICEFILE','PGHOSTADDR','PGPASSWORD','PGDATABASE','PGUSER']:
            self.assertNotIn(key,observed)

    def test_scram_uses_independent_node_crypto_and_contains_no_plaintext(self):
        password, salt = 'a' * 64, bytes(range(16))
        actual = MODULE.scram_verifier(password, salt)
        code = """const c=require('node:crypto'),p='a'.repeat(64),s=Buffer.from([...Array(16).keys()]);
const salted=c.pbkdf2Sync(p,s,4096,32,'sha256');
const client=c.createHmac('sha256',salted).update('Client Key').digest();
const stored=c.createHash('sha256').update(client).digest('base64');
const server=c.createHmac('sha256',salted).update('Server Key').digest('base64');
process.stdout.write('SCRAM-SHA-256$4096:'+s.toString('base64')+'$'+stored+':'+server);"""
        expected = subprocess.run(['node','-e',code],capture_output=True,check=True,timeout=10).stdout.decode()
        self.assertEqual(actual,expected)
        self.assertNotIn(password,actual)
        for bad_password,bad_salt,iterations in [('a'*63,salt,4096),('x'*64,salt,4096),
                                                (password,b'x',4096),(password,salt,1000)]:
            with self.assertRaises(RuntimeError):
                MODULE.scram_verifier(bad_password,bad_salt,iterations)

    def test_auth_proof_is_scram_only_and_never_releases_real_password_on_other_methods(self):
        modes=['success','precheck','trust','cleartext','md5','correct-cleartext',
               'no-final','wrong-accepted','wrong-other-code','wrong-config','wrong-hash']
        result=subprocess.run(['node','-e',HARNESS],
            input=json.dumps({'source':MODULE.NODE_PROBE,'modes':modes}).encode(),
            capture_output=True,check=True,timeout=10)
        reports={row['mode']:row for row in json.loads(result.stdout)}
        self.assertEqual(reports['precheck']['output'],{'precheck':True})
        self.assertEqual(reports['precheck']['clients'],0)
        passed=reports['success']
        self.assertEqual(passed['exit'],0)
        self.assertEqual(passed['clients'],2)
        self.assertEqual(passed['realPasswordReleased'],1)
        self.assertTrue(all(passed['output'].values()))
        for mode in modes[2:]:
            self.assertEqual(reports[mode]['exit'],1,mode)
            self.assertIsNone(reports[mode]['output'],mode)
            self.assertEqual(reports[mode]['error'],'Standalone authentication proof failed\n',mode)
            self.assertTrue(reports[mode]['environmentUnchanged'],mode)
        for mode in ['trust','cleartext','md5','correct-cleartext','wrong-accepted',
                     'wrong-other-code','wrong-config','wrong-hash']:
            self.assertEqual(reports[mode]['realPasswordReleased'],0,mode)
        self.assertFalse(reports['wrong-hash']['guardLoaded'])

    def test_cli_requires_full_identities_hashes_and_explicit_endpoint(self):
        values={'api-container':'a'*64,'pg-container':'b'*64,
            'api-image':'sha256:'+'c'*64,'pg-image':'sha256:'+'d'*64,
            'api-revision':'e'*40,'target-dir':'/root/synthetic-private',
            'role-sql':'/root/synthetic-private/runtime-role.sql','role-sql-sha256':'f'*64,
            'runtime-script-sha256':'0'*64,'database-host':'synthetic-pg','database-port':'5432'}
        argv=lambda data:[item for key,value in data.items() for item in ['--'+key,value]]
        self.assertEqual(MODULE.arguments(argv(values)).database_port,5432)
        for key,value in [('api-container','short'),('pg-image','postgres:18'),
                          ('api-revision','main'),('database-host','/socket'),('database-port','0')]:
            with self.assertRaises(RuntimeError):
                MODULE.arguments(argv({**values,key:value}))


if __name__=='__main__':
    unittest.main()
