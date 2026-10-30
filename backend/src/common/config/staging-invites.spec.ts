import { stagingInviteAllows } from './staging-invites';
const owner='f5000000-0000-4000-8000-000000000010';
const tenant='f5000000-0000-4000-8000-000000000001';
const fixture={version:1,users:[{user_id:owner,tenant_id:tenant}]};
describe('staging tester invitation boundary',()=>{
 it('permits only the exact invited user and tenant pair',()=>{
  expect(stagingInviteAllows(fixture,owner,tenant)).toBe(true);
  expect(stagingInviteAllows(fixture,owner,'f5000000-0000-4000-8000-000000000002')).toBe(false);
  expect(stagingInviteAllows(fixture,'f5000000-0000-4000-8000-000000000011',tenant)).toBe(false);
 });
 it.each([null,{}, {version:2,users:fixture.users}, {version:1,users:[]},
   {version:1,users:[...fixture.users,...fixture.users]},
   {version:1,users:[{user_id:'anything',tenant_id:tenant}]},
   {version:1,users:[{...fixture.users[0],role:'SuperAdmin'}]},
   {...fixture,password:'synthetic'}, {version:1,users:[null]}])('refuses malformed or ambiguous invitation files',value=>{
  expect(stagingInviteAllows(value,owner,tenant)).toBe(false);
 });
});
