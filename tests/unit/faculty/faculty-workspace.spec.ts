import { FACULTY_API, FACULTY_ROUTES } from '../../helpers/workflow-routes';

describe('Faculty workspace route registry', () => {
  it('defines dashboard and core pages', () => {
    expect(FACULTY_ROUTES.dashboard).toBe('/faculty/dashboard');
    expect(FACULTY_ROUTES.attendance).toContain('/faculty/');
  });

  it('maps API endpoints for faculty workflows', () => {
    expect(FACULTY_API.attendance).toContain('/api/academics/faculty/');
    expect(FACULTY_API.research).toContain('research');
  });
});
