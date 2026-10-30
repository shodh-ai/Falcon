'use strict';
// NODE_OPTIONS preloader used only by the staging deployment. Production keeps
// the standard image command. Both build-time and server-side API URLs must be
// explicitly set; there is no fallback to a production endpoint.
const expected={FALCON_ENVIRONMENT:'staging',NEXT_PUBLIC_FALCON_ENVIRONMENT:'staging',
  NODE_ENV:'production',API_URL:'https://staging-apifalcon.jataka.io',
  NEXT_PUBLIC_API_URL:'https://staging-apifalcon.jataka.io',
  NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN:'staging',
  NEXT_PUBLIC_DEDICATED_APP_HOSTS:'staging-falcon.jataka.io,staging-apifalcon.jataka.io'};
function assertFrontendStaging(env=process.env){
  if(Object.entries(expected).some(([key,value])=>env[key]!==value) ||
    env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET ||
    !/^[0-9a-f]{16}$/.test(env.FALCON_RELEASE_ID || '') ||
    env.INTERNAL_API_URL!==`http://falcon-staging-api-${env.FALCON_RELEASE_ID}:4000`) {
    throw Error('Staging frontend boundary refused; check its explicit build and runtime targets');
  }
}
module.exports={assertFrontendStaging,expected};
if(process.env.FALCON_ENVIRONMENT==='staging' || (process.env.NODE_OPTIONS || '').includes('staging-runtime.cjs'))assertFrontendStaging();
