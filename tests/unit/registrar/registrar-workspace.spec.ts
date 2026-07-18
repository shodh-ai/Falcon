import { REGISTRAR_API, REGISTRAR_ROUTES } from '../../helpers/workflow-routes';

describe('Registrar workspace route registry', () => {
  it('defines all primary registrar portal routes', () => {
    expect(Object.keys(REGISTRAR_ROUTES).length).toBeGreaterThanOrEqual(10);
    expect(REGISTRAR_ROUTES.dashboard).toBe('/admin/dashboard');
    expect(REGISTRAR_ROUTES.uploadHistory).toBe('/admin/upload-history');
    expect(REGISTRAR_ROUTES.verifications).toBe('/admin/verifications');
    expect(REGISTRAR_ROUTES.directory).toBe('/directory');
  });

  it('registers registrar API smoke endpoints', () => {
    expect(REGISTRAR_API.verificationsQueue).toContain('student-verifications');
    expect(REGISTRAR_API.submissionsMy).toBe('/tasks/submissions/my');
    expect(REGISTRAR_API.phdCandidates).toContain('registrar/candidates');
  });
});
