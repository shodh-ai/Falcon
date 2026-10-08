import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

describe('API error handling (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('returns 404 for unknown routes', async () => {
    await request(app).get('/api/unknown/route').expect(404);
  });

  it('returns validation error for missing attendance fields', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.faculty.email, password: TEST_PASSWORD });
    const res = await request(app)
      .post('/api/academics/faculty/attendance')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({})
      .expect(400);
    expect(res.body.message).toMatch(/course_id/i);
  });

  it('returns auth error without bearer token', async () => {
    await request(app)
      .get('/api/academics/hod/dashboard')
      .set('x-tenant-subdomain', 'sgvu')
      .expect(401);
  });

  it('returns authorization error for wrong role', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.faculty.email, password: TEST_PASSWORD });
    await request(app)
      .get('/api/academics/dean/command-center')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(403);
  });
});
