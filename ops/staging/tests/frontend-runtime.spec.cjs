'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const filename=path.join(__dirname,'../../../frontend/staging-runtime.cjs');
const moduleUnderTest=require(filename);
const {assertFrontendStaging}=moduleUnderTest;
const expected={...moduleUnderTest.expected,FALCON_RELEASE_ID:'a'.repeat(16),INTERNAL_API_URL:'http://falcon-staging-api-'+'a'.repeat(16)+':4000'};
test('frontend preloader accepts only the explicit public and private staging targets',()=>{
  assert.doesNotThrow(()=>assertFrontendStaging({...expected}));
  for(const k of Object.keys(expected))assert.throws(()=>assertFrontendStaging({...expected,[k]:'wrong'}),k);
});
test('frontend preloader rejects production API and OAuth configuration',()=>{
  for(const patch of [{API_URL:'https://apifalcon.jataka.io'},
    {NEXT_PUBLIC_API_URL:'https://apifalcon.jataka.io'},
    {NEXT_PUBLIC_GOOGLE_CLIENT_ID:'synthetic'}, {GOOGLE_CLIENT_SECRET:'synthetic'}]){
    assert.throws(()=>assertFrontendStaging({...expected,...patch}));
  }
});
test('real NODE_OPTIONS preload refuses a missing or incorrect staging marker',()=>{
  for(const marker of ['', 'production']){
    const r=spawnSync(process.execPath,['-e','process.stdout.write("started")'],{
      env:{...process.env,...expected,FALCON_ENVIRONMENT:marker,NODE_OPTIONS:'--require='+filename},encoding:'utf8'});
    assert.notEqual(r.status,0);assert.equal(r.stdout,'');
  }
});
