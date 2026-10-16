'use strict';
// Default is offline inspection. No dotenv, general migrations or implicit action.
const fs=require('node:fs');
const dns=require('node:dns/promises');
const {
  selectedScript,target,assertIdentity,assertEmpty,assertCatalog,assertPrivileges,invariant,TABLES,
}=require('./policy.cjs');
function executionGuard(env,platform=process.platform,container=fs.existsSync('/.dockerenv')) {
  invariant(platform==='linux'&&container&&env.NOTIFICATION_STAGING_SCHEMA_WRITE_APPROVAL==='approved-new-notification-staging-only',
    'Explicit isolated schema execution approval required');
  return target(env);
}
async function checkedWrite(client,sql,params,lookup=dns.lookup) {
  await assertIdentity(client,lookup);
  return client.query(sql,params);
}
async function executePhase(client,phase,lookup=dns.lookup) {
  const selected=selectedScript(phase);
  await assertIdentity(client,lookup);
  if(phase==='base') await assertEmpty(client);
  else await assertCatalog(client);
  await assertPrivileges(client,false,phase==='base');
  await client.query('BEGIN');
  try {
    // Recheck after acquiring the single-runner transaction lock, before DDL.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('falcon-notification-staging:schema-v1',0))");
    await assertIdentity(client,lookup);
    if(phase==='base') await assertEmpty(client);
    else await assertCatalog(client);
    await assertPrivileges(client,false,phase==='base');
    for(const sql of selected.statements) await checkedWrite(client,sql,undefined,lookup);
    await assertCatalog(client);
    await assertPrivileges(client,phase==='grants');
    await client.query('COMMIT');
    return {status:'EXECUTED',phase,tables:TABLES.length,fixturesCreated:false,indexExecuted:false};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  }
}
async function main(args=process.argv.slice(2),env=process.env) {
  const phaseArg=args.find(a=>a.startsWith('--phase='));
  const phase=phaseArg?.slice(8)??'base';
  invariant(args.every(a=>a===phaseArg||['--dry-run','--execute'].includes(a))&&!(args.includes('--dry-run')&&args.includes('--execute'))&&args.filter(a=>a===phaseArg).length<=1,'Only a single explicit base/grants phase is allowed');
  const selected=selectedScript(phase);
  if(!args.includes('--execute')) return {status:'PREPARED_ONLY',phase,statements:selected.statements.length,tables:TABLES.length,connected:false,executed:false};
  invariant(Boolean(phaseArg),'Explicit base/grants phase required for execution');
  const config=executionGuard(env);
  const addresses=await dns.lookup('falcon-notification-staging-postgres',{all:true});
  invariant(addresses.length>0&&addresses.every(a=>a.address===config.host&&a.family===4),'Dedicated database DNS identity required');
  const {Client}=require('pg'); // Loaded only after explicit execution guard.
  const client=new Client(config);
  try {await client.connect();return await executePhase(client,phase);}
  finally {await client.end().catch(()=>undefined);}
}
module.exports={executionGuard,checkedWrite,executePhase,main};
if(require.main===module) void main().then(result=>console.log(JSON.stringify(result))).catch(()=>{
  console.error('Notification staging schema operation refused (REVIEW_REQUIRED)');process.exitCode=1;
});
