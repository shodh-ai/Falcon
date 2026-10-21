'use strict';
const fs=require('node:fs');
const GIB=1024n**3n, MIB=1024n**2n;
function assertResourceBoundary({fsApi=fs}={}) {
  try {
    const memory=fsApi.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim();
    const available=/^MemAvailable:\s+(\d+)\s+kB$/m.exec(fsApi.readFileSync('/proc/meminfo','utf8'));
    if(!/^[1-9]\d{0,11}$/.test(memory)||!available)throw new Error();
    const limit=BigInt(memory);
    if(limit<128n*MIB||limit>8n*GIB)throw new Error();
    const required=limit+512n*MIB>1536n*MIB?limit+512n*MIB:1536n*MIB;
    if(BigInt(available[1])*1024n<required)throw new Error();
    for(const path of ['/app','/app/uploads']){
      const s=fsApi.statfsSync(path,{bigint:true});
      if(s.bavail<0n||s.bsize<=0n||s.bavail*s.bsize<20n*GIB)throw new Error();
    }
    return {resource_boundary_verified:true};
  } catch {
    throw new Error('Replacement resource headroom is insufficient or unverified; keep the previous healthy release');
  }
}
module.exports={assertResourceBoundary};
if(require.main===module){
  try { console.log(JSON.stringify(assertResourceBoundary())); }
  catch(error) { console.error(error.message);process.exitCode=1; }
}
