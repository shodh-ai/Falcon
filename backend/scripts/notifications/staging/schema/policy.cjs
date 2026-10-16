'use strict';
// Offline policy and explicit future catalog probes. Importing connects nowhere.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const TARGET = Object.freeze({
  host: 'falcon-notification-staging-postgres', address: '172.30.71.2', port: 5432,
  database: 'falcon_notification_staging', owner: 'notification_staging_owner',
  app: 'notification_staging_app', schema: 'public',
  comment: 'falcon-notification-staging:approved-empty-v1',
});
const SCRIPTS = Object.freeze({ base: 'base.review.sql', grants: 'runtime-grants.review.sql' });
const TABLES = Object.freeze([
  'notification_staging_environment','tenants','tenant_subscriptions','roles','campuses',
  'schools','departments','org_entities','users','user_roles','user_entity_access',
  'hr_permissions','hr_access_controls','admin_login_history','admin_control_audit','falcon_notifications',
]);
const PRIVILEGES = Object.freeze({
  select: TABLES.filter(t => !['admin_login_history','admin_control_audit'].includes(t)),
  insert: ['user_roles','falcon_notifications'],
  update: {
    users: ['last_login_at','account_status','updated_at'],
    user_roles: ['is_primary','deleted_at'],
    falcon_notifications: ['metadata','is_read','read_at','deleted_at'],
  },
  columnInsert: {
    admin_login_history: ['tenant_id','user_id','email','success'],
    admin_control_audit: ['tenant_id','actor_user_id','action','resource_type','resource_id','details'],
  },
});
function invariant(value, message) { if (!value) throw new Error(message); }
function normalizeType(value) {
  return value.toLowerCase().replace(/\s+/g,' ').replace(/^serial$/,'integer')
    .replace(/^varchar/,'character varying').replace(/^timestamptz$/,'timestamp with time zone')
    .replace(/^timestamp$/,'timestamp without time zone').replace(/,\s+/g,',');
}
function normalizeExpression(value) {
  return String(value ?? '').replace(/\b(?:pg_catalog|public)\./g,'')
    .replace(/::(?:character varying|varchar|text|jsonb|regclass|integer|boolean)/g,'')
    .replace(/\s+/g,'').replace(/[()]/g,'');
}
function cleanSql(sql) {
  let output='',quote=false,line=false,block=false;
  for(let i=0;i<sql.length;i++) {
    const c=sql[i],n=sql[i+1];
    if(line) { if(c==='\n') { line=false;output+='\n'; } continue; }
    if(block) { if(c==='*'&&n==='/') {block=false;i++;output+=' ';} continue; }
    if(!quote&&c==='-'&&n==='-') {line=true;i++;continue;}
    if(!quote&&c==='/'&&n==='*') {block=true;i++;continue;}
    if(c==="'") {output+=c;if(quote&&n==="'") {output+=n;i++;}else quote=!quote;continue;}
    invariant(quote||c!=='$','Dollar SQL is outside the reviewed grammar');
    output+=c;
  }
  invariant(!quote&&!block,'Unterminated reviewed SQL');
  return output;
}
function splitOutside(sql,separator) {
  let quote=false,depth=0,start=0;const result=[];
  for(let i=0;i<sql.length;i++) {
    const c=sql[i];
    if(c==="'") {if(quote&&sql[i+1]==="'") i++;else quote=!quote;continue;}
    if(quote) continue;
    if(c==='(') depth++; else if(c===')') depth--;
    invariant(depth>=0,'Unbalanced reviewed SQL');
    if(c===separator&&depth===0) {const s=sql.slice(start,i).trim();if(s) result.push(s);start=i+1;}
  }
  invariant(!quote&&depth===0,'Unbalanced reviewed SQL');
  const tail=sql.slice(start).trim();if(tail) result.push(tail);return result;
}
const statements = sql => splitOutside(cleanSql(sql),';').map(s=>s+';');
const names = value => value.split(',').map(s=>s.trim());
function constraint(table,name,body) {
  let m= /^(PRIMARY KEY|UNIQUE)\s*\(([^)]+)\)$/.exec(body);
  if(m) return {table,name,kind:m[1]==='PRIMARY KEY'?'p':'u',columns:names(m[2])};
  m=/^FOREIGN KEY\s*\(([^)]+)\) REFERENCES public\.([a-z_]+)\s*\(([^)]+)\) ON DELETE (NO ACTION|CASCADE|SET NULL)$/.exec(body);
  if(m) return {table,name,kind:'f',columns:names(m[1]),reference:m[2],referenceColumns:names(m[3]),onDelete:{'NO ACTION':'a',CASCADE:'c','SET NULL':'n'}[m[4]],onUpdate:'a'};
  m=/^CHECK\s*\((.+)\)$/.exec(body);
  invariant(m,'Constraint outside the reviewed grammar');
  return {table,name,kind:'c',expression:normalizeExpression(m[1])};
}
function parseBase(sql) {
  const catalog={tables:[],columns:[],constraints:[],indexes:[],sequences:[]};
  let markerInsert=0;
  for(const statement of statements(sql)) {
    const s=statement.slice(0,-1).trim();let m;
    if((m=/^CREATE TABLE public\.([a-z_]+)\s*\(([\s\S]+)\)$/.exec(s))) {
      const table=m[1];invariant(TABLES.includes(table)&&!catalog.tables.includes(table),'Table outside allowlist');catalog.tables.push(table);
      for(const part of splitOutside(m[2],',')) {
        const c=/^CONSTRAINT ([a-z_]+) ([\s\S]+)$/.exec(part);
        if(c) {catalog.constraints.push(constraint(table,c[1],c[2]));continue;}
        const column=/^([a-z_]+) (numeric\(\d+,\d+\)|varchar\(\d+\)|integer\[\]|serial|integer|boolean|timestamp|timestamptz|uuid|jsonb|date|text)(?: (NOT NULL))?(?: DEFAULT ([\s\S]+))?$/.exec(part);
        invariant(column,'Column outside reviewed grammar');
        const serial=column[2]==='serial';
        catalog.columns.push({table,name:column[1],type:normalizeType(column[2]),nullable:!column[3],
          default:normalizeExpression(serial?`nextval('${table}_${column[1]}_seq')`:column[4]??''),serial});
        if(serial) catalog.sequences.push(`${table}_${column[1]}_seq`);
      }
    } else if((m=/^ALTER TABLE public\.([a-z_]+) ADD CONSTRAINT ([a-z_]+) ([\s\S]+)$/.exec(s))) {
      invariant(catalog.tables.includes(m[1]),'Unexpected ALTER target');catalog.constraints.push(constraint(m[1],m[2],m[3]));
    } else if((m=/^CREATE INDEX ([a-z_]+) ON public\.([a-z_]+)\s*\(([^)]+)\)$/.exec(s))) {
      invariant(catalog.tables.includes(m[2]),'Unexpected index target');catalog.indexes.push({table:m[2],name:m[1],columns:names(m[3]),unique:false,options:names(m[3]).map(()=>0)});
    } else {
      invariant(s==="INSERT INTO public.notification_staging_environment (id,environment,version) VALUES (true,'falcon-notification-staging',1)",'Statement outside base allowlist');markerInsert++;
    }
  }
  invariant(markerInsert===1&&JSON.stringify([...catalog.tables].sort())===JSON.stringify([...TABLES].sort()),'Incomplete table/marker allowlist');
  for(const c of catalog.constraints) if(['p','u'].includes(c.kind)) {
    catalog.indexes.push({table:c.table,name:c.name,columns:c.columns,unique:true,options:c.columns.map(()=>0)});
    if(c.kind==='p') for(const col of catalog.columns.filter(x=>x.table===c.table&&c.columns.includes(x.name))) col.nullable=false;
  }
  return catalog;
}
function readRegular(name) {
  invariant(/^[a-z][a-z.-]+$/.test(name),'Unapproved review input');
  const file=path.join(__dirname,name);invariant(!fs.lstatSync(file).isSymbolicLink(),'Symlinked review input rejected');return fs.readFileSync(file,'utf8');
}
function selectedScript(phase) {
  invariant(Object.hasOwn(SCRIPTS,phase),'Only base or grants phase is allowed');
  const name=SCRIPTS[phase],sql=readRegular(name);
  const manifest=JSON.parse(readRegular('reviewed-manifest.json'));
  invariant(manifest.files?.[name]===crypto.createHash('sha256').update(sql).digest('hex'),'Reviewed script checksum mismatch');
  if(phase==='base') parseBase(sql);
  else invariant(cleanSql(sql).trim()===runtimeGrantSql(),'Grant file differs from the least-privilege policy');
  return {name,sql,statements:statements(sql)};
}
function runtimeGrantSql() {
  return [
    `GRANT CONNECT ON DATABASE ${TARGET.database} TO ${TARGET.app};`,
    `GRANT USAGE ON SCHEMA public TO ${TARGET.app};`,
    `GRANT SELECT ON TABLE ${PRIVILEGES.select.map(t=>'public.'+t).join(',')} TO ${TARGET.app};`,
    `GRANT INSERT ON TABLE ${PRIVILEGES.insert.map(t=>'public.'+t).join(',')} TO ${TARGET.app};`,
    ...Object.entries(PRIVILEGES.update).map(([t,c])=>`GRANT UPDATE (${c.join(',')}) ON TABLE public.${t} TO ${TARGET.app};`),
    ...Object.entries(PRIVILEGES.columnInsert).map(([t,c])=>`GRANT INSERT (${c.join(',')}) ON TABLE public.${t} TO ${TARGET.app};`),
  ].join('\n');
}
function target(env) {
  invariant(env.NODE_ENV==='production'&&env.FALCON_NOTIFICATION_STAGING==='approved'&&
    env.NOTIFICATION_STAGING_SCHEMA_HOST===TARGET.host&&env.NOTIFICATION_STAGING_SCHEMA_PORT==='5432'&&
    env.NOTIFICATION_STAGING_SCHEMA_DATABASE===TARGET.database&&env.NOTIFICATION_STAGING_SCHEMA_USER===TARGET.owner&&
    typeof env.NOTIFICATION_STAGING_SCHEMA_PASSWORD==='string'&&env.NOTIFICATION_STAGING_SCHEMA_PASSWORD.length>=24&&
    !/^(<|change|example|placeholder|password|postgres|your-)/i.test(env.NOTIFICATION_STAGING_SCHEMA_PASSWORD),
    'Dedicated staging owner configuration required');
  invariant(!Object.keys(env).some(k=>/^(DB_|PG[A-Z_]|DATABASE_URL$|EMAIL_|SMTP_|NOTIFICATION_STAGING_DB_PASSWORD$)/.test(k)),'Inherited database/mail credentials forbidden');
  return {host:TARGET.address,port:5432,database:TARGET.database,user:TARGET.owner,password:env.NOTIFICATION_STAGING_SCHEMA_PASSWORD,
    ssl:false,options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=5000',
    connectionTimeoutMillis:3000,application_name:'falcon-notification-staging-schema'};
}
async function assertIdentity(client,lookup) {
  const addresses=await lookup(TARGET.host,{all:true});
  invariant(addresses.length>0&&addresses.every(a=>a.address===TARGET.address&&a.family===4),'Dedicated PostgreSQL DNS identity required');
  const {rows}=await client.query(`/* notification-stage:identity */ SELECT current_database() AS database,current_user AS username,
    inet_server_addr()::text AS address,inet_server_port() AS port,current_schema() AS schema,
    current_setting('server_version_num')::integer AS version,pg_get_userbyid(d.datdba) AS database_owner,
    shobj_description(d.oid,'pg_database') AS marker FROM pg_database d WHERE d.datname=current_database()`);
  const r=rows[0];invariant(rows.length===1&&r.database===TARGET.database&&r.username===TARGET.owner&&[TARGET.address,TARGET.address+'/32'].includes(r.address)&&
    Number(r.port)===5432&&r.schema==='public'&&Number(r.version)>=160000&&Number(r.version)<170000&&r.database_owner===TARGET.owner&&r.marker===TARGET.comment,
    'Dedicated staging database/owner marker required');
  const roles=await client.query(`/* notification-stage:roles */ SELECT r.rolname AS name,r.rolcanlogin AS login,r.rolsuper AS superuser,
    r.rolcreatedb AS createdb,r.rolcreaterole AS createrole,r.rolreplication AS replication,r.rolbypassrls AS bypassrls,r.rolinherit AS inherit,
    EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS memberships,
    has_database_privilege(r.rolname,current_database(),'CREATE') AS database_create,
    has_database_privilege(r.rolname,current_database(),'TEMPORARY') AS temporary,
    has_schema_privilege(r.rolname,'public','CREATE') AS schema_create,
    (EXISTS(SELECT 1 FROM pg_class c WHERE c.relowner=r.oid) OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspowner=r.oid)
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.proowner=r.oid) OR EXISTS(SELECT 1 FROM pg_type y WHERE y.typowner=r.oid)
      OR EXISTS(SELECT 1 FROM pg_database d WHERE d.datdba=r.oid)) AS owns_objects
    FROM pg_roles r WHERE r.rolname IN ('notification_staging_owner','notification_staging_app')`);
  invariant(roles.rows.length===2,'Both restricted staging roles required');
  for(const name of [TARGET.owner,TARGET.app]) {
    const role=roles.rows.find(x=>x.name===name);
    invariant(role&&role.login===true&&['superuser','createdb','createrole','replication','bypassrls','inherit','memberships'].every(k=>role[k]===false),'Unsafe staging role attributes or membership');
    if(name===TARGET.app) invariant(['database_create','temporary','schema_create','owns_objects'].every(k=>role[k]===false),'Runtime role must have no DDL/ownership capability');
    else invariant(role.database_create===true&&role.schema_create===true,'Restricted owner must own dedicated database and public schema');
  }
  const {rows:unsafeAcl}=await client.query(`/* notification-stage:container-acl */ SELECT 'database' AS kind FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE d.datname=current_database() AND (a.grantee=0 OR (pg_get_userbyid(a.grantee)='notification_staging_app' AND a.is_grantable) OR pg_get_userbyid(a.grantee) NOT IN ('notification_staging_owner','notification_staging_app'))
    UNION ALL SELECT 'schema' FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname='public' AND (a.grantee=0 OR (pg_get_userbyid(a.grantee)='notification_staging_app' AND a.is_grantable) OR pg_get_userbyid(a.grantee) NOT IN ('notification_staging_owner','notification_staging_app'))
    UNION ALL SELECT 'default-acl' FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole WHERE r.rolname IN ('notification_staging_owner','notification_staging_app')`);
  invariant(unsafeAcl.length===0,'Unexpected PUBLIC/shared/default/grant-option privileges');
}
async function assertEmpty(client) {
  const {rows}=await client.query(`/* notification-stage:empty */ SELECT 'schema' AS kind FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')
    UNION ALL SELECT 'object' FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'function' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION ALL SELECT 'type' FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'extension' FROM pg_extension WHERE extname<>'plpgsql'`);
  invariant(rows.length===0,'Base requires a completely empty dedicated application schema');
}
function canonical(value) {return JSON.stringify(value);}
async function assertCatalog(client) {
  const expected=JSON.parse(readRegular('catalog.review.json'));
  invariant(canonical(expected)===canonical(parseBase(selectedScript('base').sql)),'Catalog contract differs from reviewed base');
  const {rows:objects}=await client.query(`/* notification-stage:objects */ SELECT c.relname AS name,c.relkind AS kind,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname`);
  const names=[...expected.tables.map(name=>({name,kind:'r'})),...expected.sequences.map(name=>({name,kind:'S'})),...expected.indexes.map(x=>({name:x.name,kind:'i'}))].sort((a,b)=>a.name.localeCompare(b.name));
  invariant(objects.length===names.length&&objects.every(o=>o.owner===TARGET.owner)&&canonical(objects.map(o=>({name:o.name,kind:o.kind})).sort((a,b)=>a.name.localeCompare(b.name)))===canonical(names),'Unexpected application relations/ownership');
  const {rows:columns}=await client.query(`/* notification-stage:columns */ SELECT c.relname AS table,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,NOT a.attnotnull AS nullable,pg_get_expr(d.adbin,d.adrelid) AS default FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`);
  invariant(columns.length===expected.columns.length&&expected.columns.every(e=>columns.some(c=>c.table===e.table&&c.name===e.name&&normalizeType(c.type)===e.type&&c.nullable===e.nullable&&normalizeExpression(c.default)===e.default)),'Column type/default/nullability mismatch');
  const {rows:constraints}=await client.query(`/* notification-stage:constraints */ SELECT c.relname AS table,k.conname AS name,k.contype AS kind,k.convalidated AS valid,k.condeferrable AS deferrable,k.condeferred AS deferred,
    ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(attnum,pos) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.attnum ORDER BY x.pos) AS columns,
    r.relname AS reference,nr.nspname AS reference_schema,ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(attnum,pos) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.attnum ORDER BY x.pos) AS reference_columns,
    k.confdeltype AS on_delete,k.confupdtype AS on_update,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_class r ON r.oid=k.confrelid LEFT JOIN pg_namespace nr ON nr.oid=r.relnamespace WHERE n.nspname='public'`);
  invariant(constraints.length===expected.constraints.length&&expected.constraints.every(e=>constraints.some(c=>
    c.table===e.table&&c.name===e.name&&c.kind===e.kind&&c.valid===true&&c.deferrable===false&&c.deferred===false&&
    (e.kind==='c'?normalizeExpression(c.definition.replace(/^CHECK\s*/i,''))===e.expression:canonical(c.columns)===canonical(e.columns))&&
    (e.kind!=='f'||(c.reference_schema==='public'&&c.reference===e.reference&&canonical(c.reference_columns)===canonical(e.referenceColumns)&&c.on_delete===e.onDelete&&c.on_update===e.onUpdate)))),'Constraint/FK/check mismatch');
  const {rows:indexes}=await client.query(`/* notification-stage:indexes */ SELECT c.relname AS table,i.relname AS name,x.indisunique AS unique,x.indisvalid AS valid,x.indisready AS ready,x.indislive AS live,
    m.amname AS method,x.indnatts=x.indnkeyatts AS no_include,pg_get_expr(x.indpred,x.indrelid) AS predicate,pg_get_expr(x.indexprs,x.indrelid) AS expressions,
    ARRAY(SELECT a.attname::text FROM unnest(x.indkey) WITH ORDINALITY k(attnum,pos) JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=k.attnum ORDER BY k.pos) AS columns,
    ARRAY(SELECT k.option::integer FROM unnest(x.indoption) WITH ORDINALITY k(option,pos) ORDER BY k.pos) AS options
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_am m ON m.oid=i.relam WHERE n.nspname='public'`);
  invariant(indexes.length===expected.indexes.length&&expected.indexes.every(e=>indexes.some(i=>i.table===e.table&&i.name===e.name&&i.unique===e.unique&&i.valid===true&&i.ready===true&&i.live===true&&i.method==='btree'&&i.no_include===true&&i.predicate===null&&i.expressions===null&&canonical(i.columns)===canonical(e.columns)&&canonical(i.options)===canonical(e.options))),'Base index definition/readiness mismatch');
  const {rows:extras}=await client.query(`/* notification-stage:extras */ SELECT 'schema' AS kind FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')
    UNION ALL SELECT 'function' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION ALL SELECT 'extension' FROM pg_extension WHERE extname<>'plpgsql'
    UNION ALL SELECT 'type' FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND NOT (t.typtype='c' AND EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='r')) AND NOT (t.typelem<>0 AND EXISTS(SELECT 1 FROM pg_type e JOIN pg_class c ON c.oid=e.typrelid WHERE e.oid=t.typelem AND e.typtype='c' AND c.relkind='r'))
    UNION ALL SELECT 'trigger' FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT g.tgisinternal
    UNION ALL SELECT 'rule' FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`);
  invariant(extras.length===0,'Unexpected schema/type/function/extension/trigger/rule');
  const {rows:marker}=await client.query('/* notification-stage:marker */ SELECT id,environment,version FROM public.notification_staging_environment');
  invariant(marker.length===1&&marker[0].id===true&&marker[0].environment==='falcon-notification-staging'&&marker[0].version===1,'Sole staging marker required');
  return expected;
}
async function assertPrivileges(client,granted,empty=false) {
  const catalog=JSON.parse(readRegular('catalog.review.json'));
  const {rows}=await client.query(`/* notification-stage:privileges */ SELECT c.relname AS table,a.attname AS column,p.privilege,
    has_column_privilege('notification_staging_app',c.oid,a.attname,p.privilege) AS allowed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege) WHERE n.nspname='public' AND c.relkind='r'`);
  invariant(rows.length===(empty?0:catalog.columns.length*4)&&rows.every(r=>r.allowed===(granted&&(
    (r.privilege==='SELECT'&&PRIVILEGES.select.includes(r.table))||
    (r.privilege==='INSERT'&&(PRIVILEGES.insert.includes(r.table)||PRIVILEGES.columnInsert[r.table]?.includes(r.column)))||
    (r.privilege==='UPDATE'&&PRIVILEGES.update[r.table]?.includes(r.column))||false))),'Effective runtime column privileges differ from policy');
  const {rows:unsafe}=await client.query(`/* notification-stage:unsafe-privileges */ SELECT 'table' AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('notification_staging_app',c.oid,'DELETE') OR has_table_privilege('notification_staging_app',c.oid,'TRUNCATE') OR has_table_privilege('notification_staging_app',c.oid,'REFERENCES') OR has_table_privilege('notification_staging_app',c.oid,'TRIGGER'))
    UNION ALL SELECT 'sequence' FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND (has_sequence_privilege('notification_staging_app',c.oid,'USAGE') OR has_sequence_privilege('notification_staging_app',c.oid,'SELECT') OR has_sequence_privilege('notification_staging_app',c.oid,'UPDATE'))
    UNION ALL SELECT 'acl' FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE n.nspname='public' AND (a.grantee=0 OR a.is_grantable OR pg_get_userbyid(a.grantee) NOT IN ('notification_staging_owner','notification_staging_app'))
    UNION ALL SELECT 'column-acl' FROM pg_attribute x JOIN pg_class c ON c.oid=x.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(x.attacl) a WHERE n.nspname='public' AND (a.grantee=0 OR a.is_grantable OR pg_get_userbyid(a.grantee) NOT IN ('notification_staging_owner','notification_staging_app'))`);
  invariant(unsafe.length===0,'Unexpected public/grant-option/destructive/sequence privilege');
  const {rows:access}=await client.query(`/* notification-stage:access */ SELECT has_database_privilege('notification_staging_app',current_database(),'CONNECT') AS connect,has_schema_privilege('notification_staging_app','public','USAGE') AS usage`);
  invariant(access.length===1&&access[0].connect===granted&&access[0].usage===granted,'Runtime CONNECT/USAGE policy mismatch');
}
module.exports={TARGET,SCRIPTS,TABLES,PRIVILEGES,normalizeType,normalizeExpression,statements,parseBase,readRegular,selectedScript,runtimeGrantSql,target,assertIdentity,assertEmpty,assertCatalog,assertPrivileges,invariant};
