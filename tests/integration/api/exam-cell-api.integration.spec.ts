import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';
import { EXAM_CELL_API } from '../../helpers/workflow-routes';

async function examToken(app: ReturnType<typeof createWorkflowApiMock>, email: string) {
  const res = await request(app)
    .post('/api/auth/local-login')
    .set('x-tenant-subdomain', 'sgvu')
    .send({ email, password: TEST_PASSWORD });
  return res.body.token as string;
}

describe('Examination Cell API workflows (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('GET dashboard succeeds for examcell', async () => {
    const token = await examToken(app, TEST_USERS.examcell.email);
    await request(app)
      .get(EXAM_CELL_API.dashboard)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
  });

  it('GET audit log supports pagination and filtering params', async () => {
    const token = await examToken(app, TEST_USERS.examcell.email);
    const res = await request(app)
      .get(`${EXAM_CELL_API.auditLog}?page=1&limit=1`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.limit).toBe(1);
  });

  it('denies examoperator from results list requiring elevated role', async () => {
    const token = await examToken(app, TEST_USERS.examoperator.email);
    await request(app)
      .get(EXAM_CELL_API.results)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(403);
  });
});
