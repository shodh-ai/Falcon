import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import fixtureUsers from '../fixtures/users.json';

type MockUser = {
  user_id: string;
  email: string;
  role: string;
  roles: string[];
  primaryRole: string;
  tenant_id: string;
};

const TOKENS: Record<string, MockUser> = {};
const tenantSessions = new Map<string, Set<string>>();

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function resolveUserByEmail(email: string): MockUser | null {
  const key = email.trim().toLowerCase();
  const entries = Object.values(fixtureUsers).filter(
    (v): v is { email: string; role: string } =>
      typeof v === 'object' && v !== null && 'email' in v && 'role' in v,
  );
  const match = entries.find((u) => u.email.toLowerCase() === key);
  if (!match) return null;
  return {
    user_id: `mock-${normalizeRole(match.role)}`,
    email: match.email,
    role: match.role,
    roles: [match.role],
    primaryRole: match.role,
    tenant_id: 'tenant-sgvu',
  };
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const user = TOKENS[token];
  if (!user) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }
  const tenant = String(req.headers['x-tenant-subdomain'] ?? 'sgvu');
  if (!tenantSessions.get(tenant)?.has(token)) {
    res.status(401).json({ message: 'Tenant session invalid' });
    return;
  }
  (req as Request & { user: MockUser }).user = user;
  next();
}

function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: MockUser }).user;
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const userRoles = user.roles.map(normalizeRole);
    const ok = roles.some((r) => userRoles.includes(normalizeRole(r)));
    if (!ok) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    next();
  };
}

function paginated<T>(data: T[], req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const slice = data.slice(offset, offset + limit);
  return { data: slice, total: data.length, limit, offset, page };
}

/** RBAC-aware mock API for Supertest integration tests (no live Nest server). */
export function createWorkflowApiMock(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/local-login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ message: 'email and password required' });
      return;
    }
    if (password !== fixtureUsers.defaultPassword) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }
    const user = resolveUserByEmail(String(email));
    if (!user) {
      res.status(401).json({ message: 'Unknown user' });
      return;
    }
    const token = `mock-token-${normalizeRole(user.role)}-${Date.now()}`;
    TOKENS[token] = user;
    const tenant = String(req.headers['x-tenant-subdomain'] ?? 'sgvu');
    if (!tenantSessions.has(tenant)) tenantSessions.set(tenant, new Set());
    tenantSessions.get(tenant)!.add(token);
    res.json({ token, user });
  });

  app.post('/api/auth/logout', authMiddleware, (req, res) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    delete TOKENS[token];
    res.json({ ok: true });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json((req as Request & { user: MockUser }).user);
  });

  // Faculty
  app.get('/api/academics/faculty/today-classes', authMiddleware, requireRoles('Faculty'), (_req, res) => {
    res.json({ classes: [{ id: 1, name: 'Mechanics' }] });
  });
  app.get('/api/academics/faculty/attendance', authMiddleware, requireRoles('Faculty'), (_req, res) => {
    res.json({ sessions: [] });
  });
  app.post('/api/academics/faculty/attendance', authMiddleware, requireRoles('Faculty'), (req, res) => {
    if (!req.body?.course_id) {
      res.status(400).json({ message: 'course_id required' });
      return;
    }
    res.status(201).json({ status: 'PENDING_HOD_APPROVAL' });
  });

  // HOD
  app.get('/api/academics/hod/dashboard', authMiddleware, requireRoles('HOD'), (_req, res) => {
    res.json({ pendingApprovals: 2 });
  });
  app.get('/api/academics/hod/approvals/leaves', authMiddleware, requireRoles('HOD'), (req, res) => {
    res.json(paginated([{ id: 'l1', status: 'PENDING' }], req));
  });
  app.patch('/api/academics/hod/approvals/leaves/:id', authMiddleware, requireRoles('HOD'), (req, res) => {
    if (!req.body?.decision) {
      res.status(400).json({ message: 'decision required' });
      return;
    }
    res.json({ id: req.params.id, status: req.body.decision === 'approve' ? 'HOD_APPROVED' : 'REJECTED' });
  });
  app.get('/api/academics/hod/funding-requests', authMiddleware, requireRoles('HOD'), (req, res) => {
    res.json(paginated([], req));
  });

  // Dean
  app.get('/api/academics/dean/command-center', authMiddleware, requireRoles('Dean'), (_req, res) => {
    res.json({ schools: 1 });
  });
  app.get('/api/academics/dean/inbox', authMiddleware, requireRoles('Dean'), (req, res) => {
    res.json(paginated([{ type: 'result_approval', status: 'PENDING' }], req));
  });
  app.get('/api/academics/dean/intelligence/result-approvals', authMiddleware, requireRoles('Dean'), (req, res) => {
    res.json(paginated([], req));
  });
  app.patch('/api/academics/dean/funding-requests/:id', authMiddleware, requireRoles('Dean'), (req, res) => {
    res.json({ id: req.params.id, status: 'APPROVED' });
  });

  // Exam Cell
  app.get('/api/exam-cell/dashboard', authMiddleware, requireRoles('examcell', 'examadmin', 'examoperator', 'SuperAdmin'), (_req, res) => {
    res.json({ sessions: 3 });
  });
  app.get('/api/exam-cell/results', authMiddleware, requireRoles('examcell', 'examadmin', 'SuperAdmin'), (req, res) => {
    res.json(paginated([], req));
  });
  app.post('/api/exam-cell/results/publish', authMiddleware, (req, res) => {
    const user = (req as Request & { user: MockUser }).user;
    const role = normalizeRole(user.primaryRole ?? user.role);
    if (role === 'examoperator') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    if (!['examcell', 'superadmin'].includes(role)) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    res.json({ status: 'PUBLISHED' });
  });
  app.get('/api/exam-cell/audit-log', authMiddleware, requireRoles('examcell', 'examadmin', 'SuperAdmin'), (req, res) => {
    let rows = [
      { action: 'VIEW', created_at: '2025-01-01' },
      { action: 'PUBLISH', created_at: '2025-02-01' },
    ];
    const search = String(req.query.search ?? '').trim().toUpperCase();
    if (search) {
      rows = rows.filter((r) => r.action.includes(search));
    }
    const sort = String(req.query.sort ?? '');
    const order = String(req.query.order ?? 'asc').toLowerCase();
    if (sort === 'action') {
      rows = [...rows].sort((a, b) =>
        order === 'desc' ? b.action.localeCompare(a.action) : a.action.localeCompare(b.action),
      );
    }
    res.json(paginated(rows, req));
  });

  // Cross-tenant isolation probe
  app.get('/api/academics/dean/students', authMiddleware, requireRoles('Dean'), (req, res) => {
    const scopedDept = req.query.dept_id;
    if (scopedDept === '99999') {
      res.status(403).json({ message: 'Department out of scope' });
      return;
    }
    res.json(paginated([{ student_id: 's1', dept_id: scopedDept ?? 1 }], req));
  });

  app.use((_req, res) => res.status(404).json({ message: 'Not found' }));

  return app;
}

export function resetWorkflowApiMock(): void {
  for (const key of Object.keys(TOKENS)) delete TOKENS[key];
  tenantSessions.clear();
}
