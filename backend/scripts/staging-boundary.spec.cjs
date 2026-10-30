'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertStagingBoundary,TARGETS}=require('./staging-boundary.cjs');
function fixture(){return {env:{...TARGETS,FALCON_ENVIRONMENT:'staging',NODE_ENV:'production',
  UPLOAD_PATH:'/app/uploads',FALCON_RELEASE_ID:'a'.repeat(16),PORTAL_NOTIFICATION_QUEUE_PREFIX:'falcon-notification-staging',
  ...Object.fromEntries(['DB_PASSWORD','REDIS_PASSWORD','JWT_SECRET','EMAIL_PASSWORD'].map((k,i)=>[k,String(i).repeat(48)]))},
  storage:{baseline:{database:{host:TARGETS.DB_HOST,port:5432,name:TARGETS.DB_DATABASE,
    role:TARGETS.DB_USERNAME,enforce_least_privilege:true},
    upload_mounts:[{destination:'/app/uploads',mount_root:'/data/falcon-staging/uploads'}],
    readonly_mounts:[{destination:TARGETS.NODE_EXTRA_CA_CERTS,mount_root:'/data/falcon-staging/private/smtp-ca.pem',kind:'file'},
      {destination:'/run/falcon/staging-access',mount_root:'/data/falcon-staging/private/access',kind:'directory'}]}}};}
test('valid isolated staging policy is accepted',()=>assert.equal(assertStagingBoundary(fixture()),true));
test('ordinary production startup is unaffected',()=>assert.equal(assertStagingBoundary({env:{NODE_ENV:'production'}}),false));
test('staging cannot silently run without its environment marker',()=>{
  const f=fixture();delete f.env.FALCON_ENVIRONMENT;assert.throws(()=>assertStagingBoundary(f));
});
test('each explicit target and hardening setting is enforced',()=>{
  for(const k of Object.keys(TARGETS)){const f=fixture();f.env[k]='wrong';assert.throws(()=>assertStagingBoundary(f),k);}
});
test('external providers and alternative connection strings are rejected without leaking values',()=>{
  for(const key of ['GOOGLE_CLIENT_ID','RAZORPAY_KEY_SECRET','OPENAI_API_KEY','S3_ENDPOINT','SMTP_HOST',
    'DATABASE_URL','PGHOST','REDIS_URL','HELPDESK_WEBHOOK_URL','CUSTOM_API_KEY','AI_URL']){
    const f=fixture();f.env[key]='synthetic-sensitive-value';
    assert.throws(()=>assertStagingBoundary(f),error=>!error.message.includes('synthetic-sensitive-value'));
  }
});
test('production database, uploads and certificate paths fail closed',()=>{
  for(const change of [f=>f.storage.baseline.database.name='postgres',
    f=>f.storage.baseline.database.enforce_least_privilege=false,
    f=>f.storage.baseline.upload_mounts[0].mount_root='/data/coolify/production/uploads',
    f=>f.storage.baseline.readonly_mounts[0].mount_root='/etc/production.pem']){
    const f=fixture();change(f);assert.throws(()=>assertStagingBoundary(f));
  }
});
test('missing, weak or reused staging credentials are refused',()=>{
  for(const key of ['DB_PASSWORD','REDIS_PASSWORD','JWT_SECRET','EMAIL_PASSWORD']){
    const f=fixture();f.env[key]='short';assert.throws(()=>assertStagingBoundary(f));
  }
  const f=fixture();f.env.JWT_SECRET=f.env.DB_PASSWORD;assert.throws(()=>assertStagingBoundary(f));
});
