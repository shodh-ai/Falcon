'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const policy=require('./policy.cjs');
const bootstrap=require('./bootstrap.cjs');
const fixtures=require('./fixtures.cjs');
const contract=JSON.parse(policy.readRegular('catalog.review.json'));
const lookup=async()=>[{address:policy.TARGET.address,family:4}];
function ownerEnv() {return {
  NODE_ENV:'production',FALCON_NOTIFICATION_STAGING:'approved',
  NOTIFICATION_STAGING_SCHEMA_HOST:policy.TARGET.host,NOTIFICATION_STAGING_SCHEMA_PORT:'5432',
  NOTIFICATION_STAGING_SCHEMA_DATABASE:policy.TARGET.database,NOTIFICATION_STAGING_SCHEMA_USER:policy.TARGET.owner,
  NOTIFICATION_STAGING_SCHEMA_PASSWORD:'synthetic-test-only-never-a-runtime-credential',
  NOTIFICATION_STAGING_SCHEMA_WRITE_APPROVAL:'approved-new-notification-staging-only',
};}
function fakeClient(initial={}) {
  const state={base:false,granted:false,counts:Object.fromEntries(policy.TABLES.map(t=>[t,0])),...initial};
  const queries=[];let snapshot;
  const identity={database:policy.TARGET.database,username:policy.TARGET.owner,address:policy.TARGET.address,
    port:5432,schema:'public',version:160010,database_owner:policy.TARGET.owner,marker:policy.TARGET.comment};
  const roles=[policy.TARGET.owner,policy.TARGET.app].map(name=>({name,login:true,superuser:false,createdb:false,createrole:false,
    replication:false,bypassrls:false,inherit:false,memberships:false,database_create:name===policy.TARGET.owner,
    temporary:name===policy.TARGET.owner,schema_create:name===policy.TARGET.owner,owns_objects:name===policy.TARGET.owner}));
  const client={state,queries,identity,roles,async query(sql) {
    queries.push(sql);
    if(sql.includes('notification-stage:identity')) return {rows:[identity]};
    if(sql.includes('notification-stage:roles')) return {rows:roles};
    if(sql.includes('notification-stage:container-acl')) return {rows:state.unsafeAcl?[{}]:[]};
    if(sql.includes('notification-stage:empty')) return {rows:state.base?[{kind:'object'}]:[]};
    if(sql.includes('notification-stage:objects')) return {rows:[...contract.tables.map(name=>({name,kind:'r'})),...contract.sequences.map(name=>({name,kind:'S'})),...contract.indexes.map(i=>({name:i.name,kind:'i'}))].map(r=>({...r,owner:policy.TARGET.owner}))};
    if(sql.includes('notification-stage:columns')) return {rows:contract.columns.map(c=>({...c,...(state.badColumn&&c.table==='users'&&c.name==='official_email'?{type:'text'}:{})}))};
    if(sql.includes('notification-stage:constraints')) return {rows:contract.constraints.map(c=>({...c,valid:true,deferrable:false,deferred:false,
      definition:c.kind==='c'?`CHECK (${c.expression})`:null,reference_schema:c.kind==='f'?'public':null,
      reference_columns:c.referenceColumns??[],on_delete:c.onDelete??' ',on_update:state.badForeignUpdate&&c.kind==='f'?'c':c.onUpdate??' '}))};
    if(sql.includes('notification-stage:indexes')) return {rows:contract.indexes.map(i=>({...i,valid:!state.invalidIndex,ready:true,live:true,
      method:'btree',no_include:true,predicate:null,expressions:null,...(state.badIndexOrder?{options:i.options.map(()=>3)}:{})}))};
    if(sql.includes('notification-stage:extras')) return {rows:state.extraObjects?[{kind:'function'}]:[]};
    if(sql.includes('notification-stage:marker')) return {rows:state.markerRows??[{id:true,environment:'falcon-notification-staging',version:1}]};
    if(sql.includes('notification-stage:privileges')) return {rows:state.base?contract.columns.flatMap(c=>['SELECT','INSERT','UPDATE','REFERENCES'].map(privilege=>({
      table:c.table,column:c.name,privilege,allowed:state.granted&&Boolean(
        (privilege==='SELECT'&&policy.PRIVILEGES.select.includes(c.table))||
        (privilege==='INSERT'&&(policy.PRIVILEGES.insert.includes(c.table)||policy.PRIVILEGES.columnInsert[c.table]?.includes(c.name)))||
        (privilege==='UPDATE'&&policy.PRIVILEGES.update[c.table]?.includes(c.name)))}))):[]};
    if(sql.includes('notification-stage:unsafe-privileges')) return {rows:state.unsafePrivileges?[{kind:'acl'}]:[]};
    if(sql.includes('notification-stage:access')) return {rows:[{connect:state.granted,usage:state.granted}]};
    if(sql==='BEGIN') {snapshot=structuredClone(state);return {rows:[]};}
    if(sql==='ROLLBACK') {Object.assign(state,snapshot);return {rows:[]};}
    if(sql==='COMMIT'||sql.includes('pg_advisory_xact_lock')) return {rows:[]};
    if(sql.startsWith('CREATE TABLE ')) {state.base=true;return {rows:[]};}
    if(sql.startsWith('CREATE INDEX ')||sql.startsWith('ALTER TABLE ')) return {rows:[]};
    if(sql.startsWith('GRANT ')) {state.granted=true;return {rows:[]};}
    const count=/^SELECT count\(\*\)::integer AS count FROM public\.([a-z_]+)$/.exec(sql);
    if(count) return {rows:[{count:state.counts[count[1]]}]};
    const insert=/^INSERT INTO public\.([a-z_]+)/.exec(sql);
    if(insert) {state.counts[insert[1]]++;return {rows:insert[1]==='tenants'?[{tenant_id:'synthetic-tenant'}]:insert[1]==='roles'?[{role_id:1}]:insert[1]==='users'?[{user_id:'synthetic-user'}]:[]};}
    if(sql.startsWith('SELECT u.official_email,u.is_active')) return {rows:[{official_email:fixtures.RECIPIENT,is_active:true,tenant_active:true,
      subdomain:'notification-staging',role_name:'Faculty',onboarding_status:'COMPLETED',account_status:'ACTIVE',is_primary:true}]};
    throw Error('Unexpected offline SQL contract');
  }};return client;
}
function seededBase(options={}) {return fakeClient({base:true,counts:Object.fromEntries(policy.TABLES.map(t=>[t,t==='notification_staging_environment'?1:0])),...options});}

test('reviewed hashes, exact base objects and no unrelated tables/extensions are prepared',()=>{
  const manifest=JSON.parse(policy.readRegular('reviewed-manifest.json'));
  for(const [name,digest] of Object.entries(manifest.files)) assert.equal(crypto.createHash('sha256').update(policy.readRegular(name)).digest('hex'),digest,'reviewed input checksum drift');
  assert.deepEqual(policy.parseBase(policy.selectedScript('base').sql),contract);
  assert.equal(contract.tables.length,16);assert.equal(contract.columns.length,137);assert.equal(contract.sequences.length,5);
  assert.equal(contract.indexes.length,34);assert.equal(contract.constraints.length,56);
  assert.equal(contract.tables.some(t=>/task|reset|student|queue|storage/.test(t)),false);
  assert.equal(policy.statements(policy.selectedScript('base').sql).some(s=>/^(CREATE EXTENSION|DROP |TRUNCATE |DELETE |CREATE ROLE|BEGIN;|COMMIT;)/.test(s)||s.includes('IF NOT EXISTS')),false);
  assert.equal(policy.statements("SELECT ';'; -- ignored;\n SELECT 'it''s';").length,2);
  assert.throws(()=>policy.selectedScript('roles'));assert.throws(()=>policy.selectedScript('../base'));
});
test('offline default/dry-run performs no execution and refuses arbitrary phases/flags',async()=>{
  for(const phase of ['base','grants']) {const r=await bootstrap.main([`--phase=${phase}`,'--dry-run'],{});assert.equal(r.connected,false);assert.equal(r.executed,false);}
  const r=await fixtures.main(['--dry-run'],{});assert.equal(r.connected,false);assert.equal(r.emailSent,false);
  await assert.rejects(bootstrap.main(['--phase=roles','--dry-run'],{}));
  await assert.rejects(bootstrap.main(['--execute'],{}));
  await assert.rejects(bootstrap.main(['--phase=base','--execute','--dry-run'],{}));
  await assert.rejects(fixtures.main(['--execute','--password=forbidden'],{}));
});
test('execution guards require an approved isolated Linux container and owner-only explicit config',()=>{
  const env=ownerEnv();assert.equal(bootstrap.executionGuard(env,'linux',true).host,policy.TARGET.address);
  assert.throws(()=>bootstrap.executionGuard(env,'darwin',true));assert.throws(()=>bootstrap.executionGuard(env,'linux',false));
  for(const [key,value] of [['NOTIFICATION_STAGING_SCHEMA_DATABASE','university_governance'],['NOTIFICATION_STAGING_SCHEMA_HOST','127.0.0.1'],['NOTIFICATION_STAGING_SCHEMA_PORT','5433'],['NOTIFICATION_STAGING_SCHEMA_USER','postgres'],['NOTIFICATION_STAGING_SCHEMA_WRITE_APPROVAL',undefined],['PGPASSWORD','forbidden'],['NOTIFICATION_STAGING_DB_PASSWORD','forbidden']]) {
    assert.throws(()=>bootstrap.executionGuard({...env,[key]:value},'linux',true),'unsafe owner configuration must fail');
  }
});
test('identity rejects wrong database/server/role, unsafe memberships/ownership and inherited ACLs before writes',async()=>{
  const client=fakeClient();await policy.assertIdentity(client,lookup);client.identity.address+='/32';await policy.assertIdentity(client,lookup);
  for(const key of ['database','username','address','marker']) {const c=fakeClient();c.identity[key]='wrong';await assert.rejects(policy.assertIdentity(c,lookup));assert.equal(c.queries.every(s=>s.trim().startsWith('/*')),true);}
  for(const key of ['superuser','createdb','createrole','bypassrls','replication','inherit','memberships','schema_create','temporary','owns_objects']) {
    const c=fakeClient();c.roles[1][key]=true;await assert.rejects(policy.assertIdentity(c,lookup));
  }
  await assert.rejects(policy.assertIdentity(fakeClient({unsafeAcl:true}),lookup));
  await assert.rejects(policy.assertIdentity(fakeClient(),async()=>[{address:'8.8.8.8',family:4}]));
});
test('base owns one transaction, rechecks identity for every write and starts from empty privileges',async()=>{
  const c=fakeClient();const r=await bootstrap.executePhase(c,'base',lookup);assert.equal(r.phase,'base');
  assert.equal(c.queries.filter(s=>s==='BEGIN').length,1);assert.equal(c.queries.filter(s=>s==='COMMIT').length,1);
  assert.equal(c.queries.includes('ROLLBACK'),false);assert.equal(c.state.granted,false);
  const writes=c.queries.filter(s=>/^(CREATE|ALTER|INSERT)/.test(s));assert.equal(writes.length,policy.selectedScript('base').statements.length);
  assert.ok(c.queries.filter(s=>s.includes('notification-stage:identity')).length>=writes.length);
  await assert.rejects(bootstrap.executePhase(c,'base',lookup));
});
test('grants are separate, exact and never include password, provisioning, audit updates or sequence privileges',async()=>{
  const c=seededBase();await bootstrap.executePhase(c,'grants',lookup);assert.equal(c.state.granted,true);
  assert.doesNotMatch(policy.runtimeGrantSql(),/ALL PRIVILEGES|\bCREATE\b|\bDELETE\b|\bSEQUENCE\b|password_hash|UPDATE .*admin_|INSERT .*public\.users\b/i);
  assert.deepEqual(policy.PRIVILEGES.update.users,['last_login_at','account_status','updated_at']);
  assert.equal(policy.PRIVILEGES.select.includes('admin_login_history'),false);
  await assert.rejects(bootstrap.executePhase(c,'grants',lookup));
  await assert.rejects(policy.assertPrivileges(seededBase({granted:true,unsafePrivileges:true}),true));
});
test('catalog rejects altered columns, invalid indexes, unexpected functions and extra marker rows',async()=>{
  await policy.assertCatalog(seededBase());
  for(const option of [{badColumn:true},{invalidIndex:true},{extraObjects:true},{markerRows:[{id:true,environment:'falcon-notification-staging',version:1},{id:false,environment:'other',version:1}]}])
    await assert.rejects(policy.assertCatalog(seededBase(option)));
});
test('catalog requires NO ACTION foreign-key updates and ASC NULLS LAST btree keys',async()=>{
  assert.ok(contract.constraints.filter(c=>c.kind==='f').every(c=>c.onUpdate==='a'));
  assert.ok(contract.indexes.every(i=>i.options.length===i.columns.length&&i.options.every(option=>option===0)));
  const valid=seededBase();await policy.assertCatalog(valid);
  assert.ok(valid.queries.some(sql=>sql.includes('k.confupdtype AS on_update')));
  assert.ok(valid.queries.some(sql=>sql.includes('unnest(x.indoption)')&&sql.includes('::integer')));
  await assert.rejects(policy.assertCatalog(seededBase({badForeignUpdate:true})),/Constraint\/FK\/check mismatch/);
  await assert.rejects(policy.assertCatalog(seededBase({badIndexOrder:true})),/Base index definition\/readiness mismatch/);
});
test('catalog array projections use pg-supported text[] and integer[] decoding',async()=>{
  const types=require('pg-types');
  // This installed driver leaves PostgreSQL name[] unparsed; attname must be
  // cast to text before ARRAY aggregation, rather than relying on mock arrays.
  assert.equal(typeof types.getTypeParser(1003)('{one,two}'),'string');
  assert.deepEqual(types.getTypeParser(1009)('{one,two}'),['one','two']);
  assert.deepEqual(types.getTypeParser(1007)('{0,0}'),[0,0]);
  const c=seededBase();await policy.assertCatalog(c);
  const probes=c.queries.filter(sql=>sql.includes('notification-stage:constraints')||sql.includes('notification-stage:indexes')).join('\n');
  assert.equal((probes.match(/SELECT a\.attname::text FROM unnest\(/g)||[]).length,3);
  assert.doesNotMatch(probes,/ARRAY\(SELECT a\.attname FROM/);
  assert.match(probes,/ARRAY\(SELECT k\.option::integer FROM unnest\(x\.indoption\)/);
});
test('write failure rolls back instead of continuing, repairing or migrating other objects',async()=>{
  const c=fakeClient();const query=c.query.bind(c);let writes=0;
  c.query=async(sql,params)=>{if(sql.startsWith('CREATE ')&&++writes===2) throw Error('mock failure');return query(sql,params);};
  await assert.rejects(bootstrap.executePhase(c,'base',lookup));assert.equal(c.queries.includes('ROLLBACK'),true);
  assert.equal(c.state.base,false);assert.equal(c.queries.includes('COMMIT'),false);
});
test('private fixture input is bounded, password-only and never passed in CLI/environment',()=>{
  for(const value of ['not json','{}','{"password":"short"}',JSON.stringify({password:'x'.repeat(73)}),JSON.stringify({password:'synthetic\ninput rejected'}),JSON.stringify({password:'long synthetic fixture input',email:'real@example.com'})]) assert.throws(()=>fixtures.passwordInput(value));
  assert.equal(fixtures.passwordInput(JSON.stringify({password:'long synthetic fixture input'})).length>16,true);
});
test('synthetic fixture is separate, one-time, scoped and creates no notification or reset token',async()=>{
  const c=seededBase({granted:true});let hashCalls=0;
  const hash=async(_value,cost)=>{assert.equal(cost,12);hashCalls++;return '$2b$12$'+'A'.repeat(53);};
  const r=await fixtures.createFixtures(c,'long synthetic fixture input',lookup,hash);
  assert.equal(hashCalls,1);assert.equal(r.syntheticAccounts,1);assert.equal(r.notificationsCreated,0);assert.equal(r.resetTokensCreated,0);assert.equal(r.emailSent,false);
  assert.equal(c.queries.some(s=>/^INSERT.*(?:falcon_notifications|reset)/.test(s)),false);
  await assert.rejects(fixtures.createFixtures(c,'long synthetic fixture input',lookup,hash));assert.equal(hashCalls,1);
});
test('actual entity metadata matches every modeled column, key, index and deletion policy without a database',async()=>{
  require('ts-node').register({transpileOnly:true,project:path.resolve(__dirname,'../../../../tsconfig.json')});require('reflect-metadata');
  const {DataSource}=require('typeorm');const entities=Object.values(require('../../../../src/entities')).filter(x=>typeof x==='function');
  const db=new DataSource({type:'postgres',entities,synchronize:false,migrationsRun:false,installExtensions:false});
  db.initialize=()=>{throw Error('Forbidden offline database initialization');};db.driver.connect=()=>{throw Error('Forbidden offline database connection');};
  await db.buildMetadatas();
  const modeled=['tenants','tenant_subscriptions','roles','campuses','schools','departments','users','user_roles','falcon_notifications'];
  for(const name of modeled) {
    const metadata=db.entityMetadatas.find(m=>m.tableName===name);assert.ok(metadata);
    const expected=contract.columns.filter(c=>c.table===name);
    for(const column of metadata.columns) {
      const prepared=expected.find(c=>c.name===column.databaseName);assert.ok(prepared,'entity column missing');
      assert.equal(prepared.type,policy.normalizeType(db.driver.createFullType({...column,type:db.driver.normalizeType(column)})),`${name}.${column.databaseName} type`);
      assert.equal(prepared.nullable,column.isNullable,`${name}.${column.databaseName} nullability`);
      if(column.default!==undefined) assert.equal(prepared.default,policy.normalizeExpression(db.driver.normalizeDefault(column)),`${name}.${column.databaseName} default`);
    }
    const extra=expected.filter(c=>!metadata.columns.some(x=>x.databaseName===c.name)).map(c=>c.name).sort();
    assert.deepEqual(extra,name==='users'?['last_login_at','onboarding_profile']:[]);
    for(const fk of metadata.foreignKeys) assert.ok(contract.constraints.some(c=>c.table===name&&c.kind==='f'&&JSON.stringify(c.columns)===JSON.stringify(fk.columnNames)&&c.reference===fk.referencedTablePath.replace(/^public\./,'')&&JSON.stringify(c.referenceColumns)===JSON.stringify(fk.referencedColumnNames)&&c.onDelete===({'NO ACTION':'a',CASCADE:'c','SET NULL':'n'})[fk.onDelete]),'entity FK/deletion policy missing');
    for(const index of [...metadata.indices.map(i=>({columns:i.columns,unique:i.isUnique})),...metadata.uniques.map(i=>({columns:i.columns,unique:true}))]) assert.ok(contract.indexes.some(i=>i.table===name&&i.unique===index.unique&&JSON.stringify(i.columns)===JSON.stringify(index.columns.map(c=>c.databaseName))),'entity index/unique policy missing');
  }
});
test('manual role phase and runner are separate, review-only and cannot launch application/old migrations',()=>{
  const roles=policy.readRegular('roles.review.sql');assert.match(roles,/IS DISTINCT FROM '172\.30\.71\.2'::inet/);
  assert.equal((roles.match(/PASSWORD NULL/g)||[]).length,2);assert.match(roles,/NOINHERIT/);assert.match(roles,/REVOKE ALL ON DATABASE falcon_notification_staging FROM PUBLIC/);
  const runner=fs.readFileSync(path.join(__dirname,'runner.review.yml'),'utf8');
  assert.match(runner,/profiles: \[manual-notification-schema\]/);assert.match(runner,/--dry-run/);
  assert.doesNotMatch(runner,/roles\.review\.sql:|ports:|docker\.sock|db:migrate|\/migrations|\.env:|dist\/main/);
});
