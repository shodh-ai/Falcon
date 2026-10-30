import { remainingLeadershipApprovers, resolveLeadershipChain } from './approval-chain';

const tenantId = 'tenant';
const staff = 'staff';
const hod = 'hod';
const principal = 'principal';
const dean = 'dean';
const higher = 'higher';

function row(structure: string, overrides: Record<string, unknown> = {}) {
  return {
    dept_id: 17,
    revision: 3,
    structure,
    hod_user_id: structure.includes('HOD') ? hod : null,
    principal_user_id: structure.includes('PRINCIPAL') ? principal : null,
    dean_enabled: false,
    dean_user_id: null,
    higher_officer_id: higher,
    ...overrides,
  };
}

async function chain(requesterId: string, config: ReturnType<typeof row>) {
  return resolveLeadershipChain(async () => [config], tenantId, requesterId);
}

describe('configured department HR chain', () => {
  it.each([
    ['PRINCIPAL_HOD', [hod, principal]],
    ['HOD_ONLY', [hod]],
    ['PRINCIPAL_ONLY', [principal]],
    ['NONE', [higher]],
  ])('%s routes a staff request through enabled levels', async (structure, expected) => {
    expect((await chain(staff, row(structure as string)))?.approverIds).toEqual(expected);
  });

  it.each([
    ['NONE', [dean]],
    ['HOD_ONLY', [hod]],
    ['PRINCIPAL_ONLY', [principal]],
    ['PRINCIPAL_HOD', [hod, principal]],
  ])('with Dean enabled, %s keeps the correct routine approvals', async (structure, expected) => {
    expect((await chain(staff, row(structure as string, {
      dean_enabled: true, dean_user_id: dean,
    })))?.approverIds).toEqual(expected);
  });

  it('routes a HOD request to Principal, and Principal to Dean', async () => {
    const config = row('PRINCIPAL_HOD', { dean_enabled: true, dean_user_id: dean });
    expect((await chain(hod, config))?.approverIds).toEqual([principal]);
    expect((await chain(principal, config))?.approverIds).toEqual([dean]);
  });

  it('routes Dean to the independent higher officer', async () => {
    expect((await chain(dean, row('NONE', {
      dean_enabled: true, dean_user_id: dean,
    })))?.approverIds).toEqual([higher]);
  });

  it('prevents the only reporting officer from approving their own request', async () => {
    await expect(chain(higher, row('NONE'))).rejects.toThrow('No independent reporting officer');
  });

  it('fails closed when an enabled office is vacant', async () => {
    await expect(chain(staff, row('HOD_ONLY', { hod_user_id: null })))
      .rejects.toThrow('unfilled enabled office');
  });
});

describe('pending request rerouting', () => {
  it('retains completed stages and moves only unfinished work', () => {
    expect(remainingLeadershipApprovers(['new-hod', principal], 1, [hod]))
      .toEqual([principal]);
  });

  it('requires an explicit final decision after a chain is shortened', () => {
    expect(remainingLeadershipApprovers(['new-hod'], 1, [hod]))
      .toEqual(['new-hod']);
  });

  it('does not repeat a completed actor in a remaining stage', () => {
    expect(remainingLeadershipApprovers([hod, principal], 0, [hod]))
      .toEqual([principal]);
  });
});
