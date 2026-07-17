import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';
import { DEAN_API } from '../../helpers/workflow-routes';

async function deanToken(app: ReturnType<typeof createWorkflowApiMock>) {
  const res = await request(app)
    .post('/api/auth/local-login')
    .set('x-tenant-subdomain', 'sgvu')
    .send({ email: TEST_USERS.dean.email, password: TEST_PASSWORD });
  return res.body.token as string;
}

describe('Dean API workflows (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('GET command center succeeds', async () => {
    const token = await deanToken(app);
    await request(app)
      .get(DEAN_API.commandCenter)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
  });

  it('GET inbox returns paginated approvals', async () => {
    const token = await deanToken(app);
    const res = await request(app)
      .get(`${DEAN_API.inbox}?page=1&limit=5`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET result approvals endpoint accessible', async () => {
    const token = await deanToken(app);
    await request(app)
      .get(`${DEAN_API.resultApprovals}?page=1`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
  });
});
