import { anonymousStagingRequest } from './staging-request-policy';
describe('private staging HTTP surface',()=>{
 it.each([['GET','/health'],['GET','/api/tenants/resolve/staging'],
  ['POST','/auth/local-login'],['POST','/api/auth/local-login'],
  ['POST','/auth/forgot-password'],['POST','/auth/reset-password'],['OPTIONS','/api/users']])
 ('allows only necessary anonymous %s %s', (method,path)=>expect(anonymousStagingRequest(method,path)).toBe(true));
 it.each([['GET','/users'],['POST','/users'],['POST','/api/admissions/leads'],
  ['POST','/auth/register'],['GET','/auth/google'],['POST','/health'],
  ['GET','/api/tenants/resolve/staging/anything'],['GET','/api/tenants/resolve/../users']])
 ('requires an invited active identity for %s %s',(method,path)=>expect(anonymousStagingRequest(method,path)).toBe(false));
});
