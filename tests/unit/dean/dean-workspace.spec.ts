import { DEAN_API, DEAN_ROUTES } from '../../helpers/workflow-routes';

describe('Dean workspace route registry', () => {
  it('defines dean intelligence and approval pages', () => {
    expect(DEAN_ROUTES.resultApproval).toBe('/dean/inbox');
    expect(DEAN_ROUTES.analytics).toContain('/dean/analytics');
  });

  it('maps dean API endpoints including result approvals', () => {
    expect(DEAN_API.resultApprovals).toContain('result-approvals');
    expect(DEAN_API.inbox).toContain('/dean/inbox');
  });
});
