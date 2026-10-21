'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {databasePolicy,verifyDatabase,runRuntime,MATERIALIZED_VIEWS}=require('./runtime-start.cjs');
const policy={host:'isolated-db',port:5432,name:'fixture',role:'fixture_runtime',enforce_least_privilege:true};
const env={NODE_ENV:'production',DB_HOST:policy.host,DB_PORT:'5432',DB_DATABASE:policy.name,
  DB_USERNAME:policy.role,DB_PASSWORD:'synthetic-only',DB_SYNCHRONIZE:'false'};
function client(rowOverrides={},fail=false,viewRows) {
  const calls=[];
  const flags=['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls',
    'database_create','schema_create','memberships','owns_objects','security_definers',
    'elevated_tables','elevated_sequences','ledger_mutation','missing_ledger_read',
    'missing_schema_usage','missing_sequence_access','unexpected_maintain',
    'invalid_materialized_access','unsupported_relations','privilege_delegation',
    'configuration_grants','missing_business_access'];
  class Client {
    constructor(options){calls.push(['CONFIG',options]);}
    async connect(){if(fail)throw new Error('credential-containing-driver-error');}
    async query(sql,args){calls.push([sql,args]);if(sql.includes('FROM pg_roles'))return {rows:[{
      database_name:policy.name,role_name:policy.role,...Object.fromEntries(flags.map(k=>[k,false])),...rowOverrides}]};
      if(sql.includes('maintainable'))return {rows:viewRows || MATERIALIZED_VIEWS.map(relname=>({relname,readable:true,maintainable:true}))};
      return {rows:[]};}
    async end(){calls.push(['END']);}
  }
  return {Client,calls,flags};
}
test('runtime starts only after both boundaries pass and never calls a migration',async()=>{
  const order=[];
  await runRuntime({env,verifyStorage:()=>{order.push('storage');return {baseline:{database:policy}};},
    verifyDb:async()=>{order.push('database');return {least_privilege_enforced:true};},
    loadApplication:()=>order.push('app'),log:()=>{}});
  assert.deepEqual(order,['storage','database','app']);
});
test('production image uses the guarded launcher and cannot source a late dotenv target',()=>{
  const docker=fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8');
  const commands=docker.split('\n').filter(line=>/^CMD\s/.test(line));
  assert.deepEqual(commands,['CMD ["node", "scripts/runtime-start.cjs"]']);
  assert.doesNotMatch(docker,/COPY[^\n]*--chown=node:node/);
  const app=fs.readFileSync(path.join(__dirname,'../src/app.module.ts'),'utf8');
  assert.match(app,/ignoreEnvFile:\s*process\.env\.NODE_ENV\s*===\s*'production'/);
});
test('storage failure prevents any database connection or app startup',async()=>{
  await assert.rejects(runRuntime({env,verifyStorage:()=>{throw new Error('wrong mount');},
    verifyDb:()=>assert.fail('database'),loadApplication:()=>assert.fail('app')}),/wrong mount/);
});
test('configuration changes, sync, migration credentials and role aliases fail closed',()=>{
  for(const patch of [{DB_HOST:'other'},{DB_DATABASE:'other'},{DB_USERNAME:'postgres'},
    {DB_USER:'postgres'},{DB_PORT:'5433'},{DB_PASSWORD:''},{DB_SYNCHRONIZE:'true'},
    {DB_SYNCHRONIZE:undefined},{MIGRATION_DB_PASSWORD:'never-print'}]) {
    assert.throws(()=>databasePolicy({...env,...patch},policy));
  }
  assert.throws(()=>databasePolicy(env,{...policy,unexpected:true}));
});
test('restricted role probes only metadata inside a read-only transaction',async()=>{
  const {Client,calls}=client();
  assert.equal((await verifyDatabase({env,policy,Client})).least_privilege_enforced,true);
  assert.equal(calls[1][0],'BEGIN READ ONLY');
  assert.equal(calls.at(-2)[0],'ROLLBACK');
  assert.equal(calls.at(-1)[0],'END');
  for(const [sql] of calls.slice(2,-2)) assert.match(sql,/^SELECT/);
});
test('actual driver target follows the protected Unix socket policy without implicit production defaults',async()=>{
  const {Client,calls}=client({database_name:'restorecheck'});
  const isolated={...policy,host:'/restore-socket',port:55432,name:'restorecheck'};
  const isolatedEnv={...env,DB_HOST:isolated.host,DB_PORT:'55432',DB_DATABASE:isolated.name};
  await verifyDatabase({env:isolatedEnv,policy:isolated,Client});
  assert.deepEqual(calls[0][1],{host:'/restore-socket',port:55432,database:'restorecheck',
    user:policy.role,password:'synthetic-only',connectionTimeoutMillis:5000,
    query_timeout:5000,statement_timeout:5000,application_name:'falcon-runtime-boundary'});
});
test('each forbidden authority or missing business permission prevents startup',async()=>{
  for(const flag of client().flags){
    const {Client}=client({[flag]:true});
    await assert.rejects(verifyDatabase({env,policy,Client}),/boundary check failed/);
  }
});
test('unknown privilege values and actual connected identity mismatch are refused',async()=>{
  for(const override of [{rolsuper:null},{role_name:'postgres'},{database_name:'other'}]){
    const {Client}=client(override);
    await assert.rejects(verifyDatabase({env,policy,Client}),/boundary check failed/);
  }
});
test('all eight named reporting views require explicit readable and maintainable booleans',async()=>{
  const valid=MATERIALIZED_VIEWS.map(relname=>({relname,readable:true,maintainable:true}));
  for(const rows of [valid.slice(1),valid.map((row,i)=>i?row:{...row,readable:false}),
    valid.map((row,i)=>i?row:{...row,maintainable:false}),
    valid.map((row,i)=>i?row:{...row,maintainable:'false'})]){
    const {Client}=client({},false,rows);
    await assert.rejects(verifyDatabase({env,policy,Client}),/boundary check failed/);
  }
});
test('driver failures are sanitized and connection cleanup is attempted',async()=>{
  const {Client,calls}=client({},true);
  await assert.rejects(verifyDatabase({env,policy,Client}),error=>{
    assert.equal(error.message.includes('credential-containing'),false);return true;
  });
  assert.equal(calls.at(-1)[0],'END');
});
test('protected transition policy can pin the existing administrator only before cutover',async()=>{
  const {Client}=client({rolsuper:true});
  const transition={...policy,enforce_least_privilege:false};
  assert.equal((await verifyDatabase({env,policy:transition,Client})).least_privilege_enforced,false);
  assert.throws(()=>databasePolicy(env,{...policy,enforce_least_privilege:'false'}));
});
test('database denial prevents app bootstrap and no secret is logged',async()=>{
  const output=[];
  await assert.rejects(runRuntime({env,verifyStorage:()=>({baseline:{database:policy}}),
    verifyDb:async()=>{throw new Error('boundary denied');},
    loadApplication:()=>assert.fail('app'),log:x=>output.push(x)}));
  assert.deepEqual(output,[]);
});
