'use strict';
// Separate one-time synthetic fixture step; importing/default dry-run writes nothing.
const crypto=require('node:crypto');
const dns=require('node:dns/promises');
const {executionGuard,checkedWrite}=require('./bootstrap.cjs');
const {assertIdentity,assertCatalog,assertPrivileges,TABLES,invariant,readRegular}=require('./policy.cjs');
const RECIPIENT='notification-staging@example.invalid';
function passwordInput(text) {
  invariant(typeof text==='string'&&Buffer.byteLength(text,'utf8')<=512,'Private fixture input rejected');
  let input;try {input=JSON.parse(text);} catch {throw new Error('Private fixture input rejected');}
  invariant(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===1&&
    typeof input.password==='string'&&input.password.length>=16&&Buffer.byteLength(input.password,'utf8')<=72&&
    !/[\u0000-\u001f\u007f]/.test(input.password),'Private fixture input rejected');
  return input.password;
}
async function privateInput(stream) {
  let text='';for await(const chunk of stream) {text+=Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk);invariant(Buffer.byteLength(text,'utf8')<=512,'Private fixture input rejected');}
  return passwordInput(text);
}
function reviewedFixture() {
  const manifest=JSON.parse(readRegular('reviewed-manifest.json'));
  const source=readRegular('fixtures.cjs');
  invariant(manifest.files['fixtures.cjs']===crypto.createHash('sha256').update(source).digest('hex'),'Fixture preparation checksum mismatch');
}
async function assertFixtureCounts(client,seeded) {
  for(const table of TABLES) {
    // Identifiers are a code-owned constant allowlist, never requester input.
    const {rows}=await client.query(`SELECT count(*)::integer AS count FROM public.${table}`);
    const expected=table==='notification_staging_environment'||(seeded&&['tenants','roles','users','user_roles'].includes(table))?1:0;
    invariant(rows.length===1&&rows[0].count===expected,'Synthetic fixture requires exact empty/seeded table counts');
  }
}
async function createFixtures(client,password,lookup=dns.lookup,hashPassword) {
  reviewedFixture();
  // Validation does not echo the private value; hash it only after DB safeguards.
  invariant(passwordInput(JSON.stringify({password}))===password,'Private fixture input rejected');
  await assertIdentity(client,lookup);await assertCatalog(client);await assertPrivileges(client,true);await assertFixtureCounts(client,false);
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('falcon-notification-staging:fixtures-v1',0))");
    await assertIdentity(client,lookup);await assertCatalog(client);await assertPrivileges(client,true);await assertFixtureCounts(client,false);
    const hash=hashPassword??((value,cost)=>require('bcrypt').hash(value,cost));
    const passwordHash=await hash(password,12);
    invariant(typeof passwordHash==='string'&&/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(passwordHash),'Private bcrypt fixture hashing failed');
    const tenant=await checkedWrite(client,
      `INSERT INTO public.tenants (name,subdomain,pg_schema,settings,is_active)
       VALUES ('Falcon Notification Staging','notification-staging','public','{"allowed_email_domains":["example.invalid"]}'::jsonb,true) RETURNING tenant_id`,undefined,lookup);
    const role=await checkedWrite(client,"INSERT INTO public.roles (role_name,description) VALUES ('Faculty','Synthetic notification staging only') RETURNING role_id",undefined,lookup);
    const user=await checkedWrite(client,
      `INSERT INTO public.users (tenant_id,name,official_email,role_id,password_hash,is_active,onboarding_status,account_status)
       VALUES ($1,'Falcon Notification Staging Faculty',$2,$3,$4,true,'COMPLETED','ACTIVE') RETURNING user_id`,
      [tenant.rows[0].tenant_id,RECIPIENT,role.rows[0].role_id,passwordHash],lookup);
    await checkedWrite(client,'INSERT INTO public.user_roles (user_id,role_id,is_primary) VALUES ($1,$2,true)',[user.rows[0].user_id,role.rows[0].role_id],lookup);
    await assertFixtureCounts(client,true);
    const {rows}=await client.query(`SELECT u.official_email,u.is_active,u.onboarding_status,u.account_status,t.subdomain,t.is_active AS tenant_active,r.role_name,
      ur.is_primary FROM public.users u JOIN public.tenants t ON t.tenant_id=u.tenant_id JOIN public.roles r ON r.role_id=u.role_id
      JOIN public.user_roles ur ON ur.user_id=u.user_id AND ur.role_id=r.role_id`);
    invariant(rows.length===1&&rows[0].official_email===RECIPIENT&&rows[0].is_active===true&&rows[0].tenant_active===true&&rows[0].subdomain==='notification-staging'&&rows[0].role_name==='Faculty'&&rows[0].onboarding_status==='COMPLETED'&&rows[0].account_status==='ACTIVE'&&rows[0].is_primary===true,'Synthetic fixture association failed');
    await client.query('COMMIT');
    return {status:'EXECUTED',syntheticAccounts:1,tenants:1,roles:1,roleMappings:1,notificationsCreated:0,resetTokensCreated:0,emailSent:false};
  } catch(error) {await client.query('ROLLBACK').catch(()=>undefined);throw error;}
}
async function main(args=process.argv.slice(2),env=process.env,stdin=process.stdin) {
  invariant(args.length<=1&&args.every(a=>['--dry-run','--execute'].includes(a)),'Only one explicit fixture mode is allowed');reviewedFixture();
  if(!args.includes('--execute')) return {status:'PREPARED_ONLY',connected:false,executed:false,syntheticAccounts:1,notificationsCreated:0,resetTokensCreated:0,emailSent:false};
  const cfg=executionGuard(env);
  invariant(env.NOTIFICATION_STAGING_FIXTURE_APPROVAL==='approved-synthetic-only','Separate synthetic fixture approval required');
  const password=await privateInput(stdin);
  const {Client}=require('pg');const client=new Client(cfg);
  try {await client.connect();return await createFixtures(client,password);}
  finally {await client.end().catch(()=>undefined);}
}
module.exports={RECIPIENT,passwordInput,privateInput,reviewedFixture,assertFixtureCounts,createFixtures,main};
if(require.main===module) void main().then(result=>console.log(JSON.stringify(result))).catch(()=>{
  console.error('Notification staging fixture operation refused (REVIEW_REQUIRED)');process.exitCode=1;
});
