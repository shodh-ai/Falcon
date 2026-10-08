import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

describe('Multi-tenant security (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('isolates sessions per tenant subdomain', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.faculty.email, password: TEST_PASSWORD });
    const token = login.body.token as string;

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'other-tenant')
      .expect(401);
  });

  it('prevents dean IDOR on out-of-scope department', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.dean.email, password: TEST_PASSWORD });
    await request(app)
      .get('/api/academics/dean/students?dept_id=99999')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(403);
  });
});
