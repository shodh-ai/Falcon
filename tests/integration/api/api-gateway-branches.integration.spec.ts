import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

describe('Mock gateway branch coverage', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('rejects unknown login email', async () => {
    await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: 'unknown@sgvu.edu.in', password: TEST_PASSWORD })
      .expect(401);
  });

  it('returns empty HOD funding list with pagination', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.hod.email, password: TEST_PASSWORD });
    const res = await request(app)
      .get('/api/academics/hod/funding-requests?page=1&limit=10')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.total).toBe(0);
  });

  it('blocks faculty from publishing exam results', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.faculty.email, password: TEST_PASSWORD });
    await request(app)
      .post('/api/exam-cell/results/publish')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({ session_id: 's1' })
      .expect(403);
  });

  it('rejects dean student list for out-of-scope department', async () => {
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
