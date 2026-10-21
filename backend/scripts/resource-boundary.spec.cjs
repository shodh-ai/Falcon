const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertResourceBoundary}=require('./resource-boundary.cjs');
const GIB=1024n**3n;
function fixture({limit=String(GIB),memory='1572864',free=20n*GIB,broken=false}={}){
  return {readFileSync:path=>{if(broken)throw new Error('private diagnostics');return path.endsWith('memory.max')?limit:`MemTotal: 9000000 kB\nMemAvailable: ${memory} kB\n`;},
    statfsSync:()=>({bavail:free/4096n,bsize:4096n})};
}
test('exact conservative memory and disk thresholds pass without writes',()=>{
  assert.equal(assertResourceBoundary({fsApi:fixture()}).resource_boundary_verified,true);
});
test('low RAM, full disk, unbounded or unknown memory limit refuse the replacement',()=>{
  for(const values of [{memory:'1572863'},{free:20n*GIB-4096n},{limit:'max'},
    {limit:'0'},{limit:'-1'},{memory:'unknown'},{broken:true}])
    assert.throws(()=>assertResourceBoundary({fsApi:fixture(values)}),/headroom.*unverified/);
});
test('a larger memory reservation requires additional available host memory',()=>{
  assert.throws(()=>assertResourceBoundary({fsApi:fixture({limit:String(2n*GIB)})}));
  assert.equal(assertResourceBoundary({fsApi:fixture({limit:String(2n*GIB),memory:'2621440'})}).resource_boundary_verified,true);
});
