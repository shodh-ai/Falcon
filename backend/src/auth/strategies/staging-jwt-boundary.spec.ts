import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import * as invites from '../../common/config/staging-invites';

const tenantId='f5000000-0000-4000-8000-000000000001';
const sub='f5000000-0000-4000-8000-000000000010';
describe('staging invitation enforcement before account access',()=>{
 afterEach(()=>jest.restoreAllMocks());
 function fixture(){
  const auth={findById:jest.fn()};
  const config={get:()=> 'synthetic-jwt-key-for-unit-tests-only'};
  return {auth,strategy:new JwtStrategy(config as never,auth as never,{query:jest.fn()} as never)};
 }
 it('rejects an uninvited identity before fetching account or parent information',async()=>{
  const invite=jest.spyOn(invites,'assertInvitedStaging').mockImplementation(()=>{throw new UnauthorizedException('not invited');});
  const f=fixture();
  await expect(f.strategy.validate({sub,tenantId,authType:'parent'} as never)).rejects.toThrow('not invited');
  expect(invite).toHaveBeenCalledWith(sub,tenantId);
  expect(f.auth.findById).not.toHaveBeenCalled();
 });
 it('missing tenant context cannot reach either invitation lookup or account access',async()=>{
  const invite=jest.spyOn(invites,'assertInvitedStaging').mockImplementation(()=>{});
  const f=fixture();
  await expect(f.strategy.validate({sub} as never)).rejects.toThrow('tenant context');
  expect(invite).not.toHaveBeenCalled();expect(f.auth.findById).not.toHaveBeenCalled();
 });
});
