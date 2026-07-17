import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

async function examcellToken(app: ReturnType<typeof createWorkflowApiMock>) {
  const login = await request(app)
    .post('/api/auth/local-login')
    .set('x-tenant-subdomain', 'sgvu')
    .send({ email: TEST_USERS.examcell.email, password: TEST_PASSWORD });
  return login.body.token as string;
}

describe('API search, filter, sort, pagination (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('filters audit log by search query', async () => {
    const token = await examcellToken(app);
    const res = await request(app)
      .get('/api/exam-cell/audit-log?page=1&limit=10&search=VIEW')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.data.every((row: { action: string }) => row.action.includes('VIEW'))).toBe(
      true,
    );
  });

  it('sorts audit log descending by action', async () => {
    const token = await examcellToken(app);
    const res = await request(app)
      .get('/api/exam-cell/audit-log?sort=action&order=desc')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('returns empty page when offset exceeds total', async () => {
    const token = await examcellToken(app);
    const res = await request(app)
      .get('/api/exam-cell/audit-log?page=99&limit=20')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.data).toEqual([]);
  });
});
