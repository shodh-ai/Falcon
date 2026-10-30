'use strict';
const fs=require('node:fs');
const {createRequire}=require('node:module');
const appRequire=createRequire('/app/package.json');
const {Client}=appRequire('pg');
const {verifyDatabase}=require('/app/scripts/runtime-start.cjs');
async function main(){
 let raw='';for await(const bytes of process.stdin){raw+=bytes;if(raw.length>4096)throw Error();}
 const payload=JSON.parse(raw);
 if(Object.keys(payload).join(',')!=='password'||typeof payload.password!=='string'||payload.password.length<32)throw Error();
 const events=[];
 class ScramClient extends Client{
  constructor(options){super(options);for(const name of ['authenticationSASL','authenticationSASLContinue','authenticationSASLFinal'])this.connection.on(name,()=>events.push(name));}
 }
 const env={DB_HOST:'falcon-staging-postgres',DB_PORT:'5432',DB_DATABASE:'falcon_staging',
  DB_USERNAME:'falcon_staging_runtime',DB_PASSWORD:payload.password,DB_SYNCHRONIZE:'false'};
 const policy={host:env.DB_HOST,port:5432,name:env.DB_DATABASE,role:env.DB_USERNAME,enforce_least_privilege:true};
 await verifyDatabase({env,policy,Client:ScramClient});
 if(!['authenticationSASL','authenticationSASLContinue','authenticationSASLFinal'].every(x=>events.includes(x)))throw Error();
 const client=new ScramClient({host:env.DB_HOST,port:5432,database:env.DB_DATABASE,user:env.DB_USERNAME,
  password:payload.password,connectionTimeoutMillis:5000,statement_timeout:5000});
 try{
  await client.connect();await client.query('BEGIN READ ONLY');
  const address=(await client.query('SELECT host(inet_server_addr()) address')).rows[0].address;
  if(!/^172\.30\.242\.\d+$/.test(address))throw Error();
  const ledger=(await client.query('SELECT filename FROM public.schema_migrations ORDER BY filename')).rows.map(x=>x.filename);
  const files=fs.readdirSync('/app/migrations').filter(n=>n.endsWith('.sql')&&!n.endsWith('.seed.sql'));
  const pending=files.filter(n=>!ledger.includes(n));
  await client.query('ROLLBACK');
  process.stdout.write(JSON.stringify({restricted_runtime_verified:true,scram_verified:true,read_only:true,
    connected_address:address,ledger_count:ledger.length,pending}));
 }finally{await client.end();}
}
main().catch(()=>{process.stderr.write('STAGING_DATABASE_PROBE_REFUSED\n');process.exitCode=1;});
