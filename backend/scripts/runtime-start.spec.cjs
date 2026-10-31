'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {databasePolicy,verifyDatabase,runRuntime,MATERIALIZED_VIEWS,ROLE_QUERY,LIMITED_BUSINESS_TABLES}=require('./runtime-start.cjs');
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
  await runRuntime({env,setUmask:mask=>{assert.equal(mask,0o027);order.push('umask');},
    verifyStorage:()=>{order.push('storage');return {baseline:{database:policy}};},
    verifyDb:async()=>{order.push('database');return {least_privilege_enforced:true};},
    loadApplication:()=>order.push('app'),log:()=>{}});
  assert.deepEqual(order,['umask','storage','database','app']);
});
test('umask failure prevents boundary checks and application startup',async()=>{
  await assert.rejects(runRuntime({env,setUmask:()=>{throw new Error('umask failed');},
    verifyStorage:()=>assert.fail('storage'),verifyDb:()=>assert.fail('database'),
    loadApplication:()=>assert.fail('app')}),/umask failed/);
});
test('real launcher umask restricts default and ACL-compatible explicit file modes',()=>{
  // Use a separate process: process.umask is global, and parallel tests must not
  // inherit a changed mask. The temporary files contain synthetic bytes only.
  const source=`
    const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
    const {runRuntime}=require(process.argv[1]);
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'falcon-umask-'));
    const policy=${JSON.stringify(policy)},env=${JSON.stringify(env)};
    (async()=>{let pending;
      try{
        process.umask(0);
        await runRuntime({env,verifyStorage:()=>{
          if(process.umask()!==0o027)throw Error('mask was not applied before checks');
          return {baseline:{database:policy}};
        },verifyDb:async()=>({least_privilege_enforced:true}),log:()=>{},loadApplication:()=>{
          const directory=path.join(root,'uploads');fs.mkdirSync(directory);
          fs.writeFileSync(path.join(directory,'default'),'synthetic');
          pending=new Promise((resolve,reject)=>{
            const stream=fs.createWriteStream(path.join(directory,'explicit'),{flags:'wx',mode:0o660});
            stream.on('finish',resolve);stream.on('error',reject);stream.end('synthetic');
          });
        }});
        await pending;
        process.stdout.write(JSON.stringify(['uploads','uploads/default','uploads/explicit']
          .map(name=>fs.statSync(path.join(root,name)).mode&0o777)));
      }finally{fs.rmSync(root,{recursive:true,force:true})}
    })().catch(()=>process.exitCode=1);
  `;
  const result=spawnSync(process.execPath,['-e',source,path.join(__dirname,'runtime-start.cjs')],
    {encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[0o750,0o640,0o640]);
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
  await assert.rejects(runRuntime({env,setUmask:()=>{},verifyStorage:()=>{throw new Error('wrong mount');},
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
test('relation-specific privilege probes are CASE-guarded against planner predicate reordering',()=>{
  for(const flag of ['elevated_tables','elevated_sequences','missing_sequence_access',
    'unexpected_maintain','invalid_materialized_access','missing_business_access']){
    const end=ROLE_QUERY.indexOf(' AS '+flag);
    assert.ok(end>0);
    const start=ROLE_QUERY.lastIndexOf('EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace',end);
    const query=ROLE_QUERY.slice(start,end);
    assert.match(query,/WHERE CASE WHEN n\.nspname='public' AND c\.relkind/);
    assert.match(query,/THEN[\s\S]*has_(?:table|sequence|any_column)_privilege/);
    assert.match(query,/ELSE false END\)$/);
  }
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
  for(const override of [{rolsuper:null},{missing_business_access:null},{missing_business_access:undefined},
    {role_name:'postgres'},{database_name:'other'}]){
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
  await assert.rejects(runRuntime({env,setUmask:()=>{},verifyStorage:()=>({baseline:{database:policy}}),
    verifyDb:async()=>{throw new Error('boundary denied');},
    loadApplication:()=>assert.fail('app'),log:x=>output.push(x)}));
  assert.deepEqual(output,[]);
});

const limitedPolicy={
  department_leadership:{insert:true,updateColumns:['structure','higher_officer_id','revision','dean_enabled','dean_user_id']},
  department_offices:{insert:true,updateColumns:['login_alias']},
  department_office_appointments:{insert:true,updateColumns:['valid_to']},
  department_office_session_revisions:{insert:true,updateColumns:['revision']},
  department_leadership_events:{insert:true,updateColumns:[]},
  student_identity_email_changes:{insert:false,updateColumns:[]},
  hr_department_request_routes:{insert:true,updateColumns:['approver_ids','current_index','leadership_revision','updated_at']},
  department_leadership_changes:{insert:true,updateColumns:[]},
  hr_staff_request_appeals:{insert:true,updateColumns:['rejecting_user_id','reviewer_user_id','status','reconsideration_count','revision','updated_at']},
  hr_staff_request_appeal_events:{insert:true,updateColumns:[]},
};
test('leadership boundary lists only reviewed exact immutable object policies',()=>{
  assert.deepEqual(LIMITED_BUSINESS_TABLES,limitedPolicy);
  assert.ok(Object.isFrozen(LIMITED_BUSINESS_TABLES));
  for(const table of Object.values(LIMITED_BUSINESS_TABLES)){
    assert.ok(Object.isFrozen(table));
    assert.ok(Object.isFrozen(table.updateColumns));
  }
  assert.equal(Object.hasOwn(LIMITED_BUSINESS_TABLES,'business_records'),false);
  assert.equal(Object.hasOwn(LIMITED_BUSINESS_TABLES,'schema_migrations'),false);
});
test('leadership metadata query checks effective column permissions without a schema mutation',()=>{
  for(const name of Object.keys(limitedPolicy)) assert.ok(ROLE_QUERY.includes(name));
  assert.match(ROLE_QUERY,/has_column_privilege/);
  assert.match(ROLE_QUERY,/has_any_column_privilege/);
  assert.match(ROLE_QUERY,/pg_attribute/);
  assert.doesNotMatch(ROLE_QUERY,/\b(?:GRANT|REVOKE|ALTER|CREATE|DROP|TRUNCATE)\s+(?:ON|TABLE|SCHEMA|ROLE|ALL)\b/);
});

test('runtime launcher and both reviewed SQL policies share exactly the same limited matrix',()=>{
  const directory=path.join(__dirname,'../../ops/deployment-safety');
  const expected=Object.fromEntries(Object.entries(limitedPolicy).map(([name,entry])=>
    [name,{insert:entry.insert,update_columns:entry.updateColumns}]));
  for(const file of ['runtime-role.sql','department-leadership-grants.sql']){
    const sql=fs.readFileSync(path.join(directory,file),'utf8');
    const match=sql.match(/limited_business_tables\s+constant\s+jsonb\s*:=\s*'([\s\S]*?)'::jsonb/);
    assert.ok(match,'exact JSON matrix missing from '+file);
    assert.deepEqual(JSON.parse(match[1]),expected,file+' differs from runtime policy');
  }
});
