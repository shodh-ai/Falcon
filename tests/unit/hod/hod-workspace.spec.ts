import { HOD_API, HOD_ROUTES } from '../../helpers/workflow-routes';

describe('HOD workspace route registry', () => {
  it('defines approval and management pages', () => {
    expect(HOD_ROUTES.leaveApproval).toContain('/hod/approvals/');
    expect(HOD_ROUTES.funding).toContain('funding');
  });

  it('maps HOD API endpoints', () => {
    expect(HOD_API.dashboard).toContain('/api/academics/hod/');
    expect(HOD_API.leaveApprovals).toContain('leaves');
  });
});
