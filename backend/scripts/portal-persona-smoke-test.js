/**
 * Portal persona smoke — login + primary API for each DOFA/UOS role.
 * Usage: node scripts/portal-persona-smoke-test.js
 */
const BASE = process.env.API_BASE || 'http://localhost:4000';
const TENANT = { 'x-tenant-subdomain': 'sgvu', 'Content-Type': 'application/json' };

const PERSONAS = [
  {
    key: 'CFO',
    email: 'cfo@mygyanvihar.com',
    use: 'OTP unlock / publish',
    checks: [
      { name: 'universal DOFA inbox', path: '/api/dofa/inbox', method: 'GET' },
      { name: 'P2P approvals inbox', path: '/api/operations/p2p/approvals/inbox', method: 'GET' },
      { name: 'policy graphs', path: '/api/dofa/policy/graphs', method: 'GET' },
      { name: 'fraud signals (oversight)', path: '/api/operations/p2p/analytics/fraud-signals', method: 'GET' },
    ],
  },
  {
    key: 'COO',
    email: 'coo@mygyanvihar.com',
    use: 'Write-off / ops',
    checks: [
      { name: 'ops dashboard', path: '/api/operations/dashboard', method: 'GET' },
      { name: 'universal DOFA inbox', path: '/api/dofa/inbox', method: 'GET' },
      { name: 'DOFA levels', path: '/api/operations/p2p/dofa/levels', method: 'GET' },
    ],
  },
  {
    key: 'LabAdmin',
    email: 'labadmin@mygyanvihar.com',
    use: 'P2P requestor',
    checks: [
      { name: 'assets list', path: '/api/admin-ops/assets', method: 'GET' },
      { name: 'write-offs list', path: '/api/uos/assets/writeoffs', method: 'GET' },
      { name: 'my requisitions', path: '/api/operations/p2p/requisitions', method: 'GET' },
      { name: 'research proposals', path: '/api/research/proposals', method: 'GET' },
    ],
  },
  {
    key: 'Procurement',
    email: 'procurement@mygyanvihar.com',
    use: 'Quotes',
    checks: [
      { name: 'requisitions queue', path: '/api/operations/p2p/requisitions', method: 'GET' },
      { name: 'catalog', path: '/api/operations/p2p/catalog', method: 'GET' },
    ],
  },
  {
    key: 'ProcurementHead',
    email: 'prochead@mygyanvihar.com',
    use: 'L3 sig 1',
    checks: [
      { name: 'P2P approvals inbox', path: '/api/operations/p2p/approvals/inbox', method: 'GET' },
      { name: 'fraud signals', path: '/api/operations/p2p/analytics/fraud-signals', method: 'GET' },
    ],
  },
  {
    key: 'FinanceController',
    email: 'fincontroller@mygyanvihar.com',
    use: 'L3 sig 2',
    checks: [
      { name: 'P2P approvals inbox', path: '/api/operations/p2p/approvals/inbox', method: 'GET' },
      { name: 'purchase orders', path: '/api/operations/p2p/purchase-orders', method: 'GET' },
    ],
  },
  {
    key: 'Stores',
    email: 'stores@mygyanvihar.com',
    use: 'GRN',
    checks: [
      { name: 'GRN list', path: '/api/operations/p2p/grn', method: 'GET' },
      { name: 'requisitions read', path: '/api/operations/p2p/requisitions', method: 'GET' },
    ],
  },
  {
    key: 'Finance',
    email: 'finance@mygyanvihar.com',
    use: 'AP',
    checks: [
      { name: 'purchase orders', path: '/api/operations/p2p/purchase-orders', method: 'GET' },
      { name: 'GRN list', path: '/api/operations/p2p/grn', method: 'GET' },
    ],
  },
  {
    key: 'APManager',
    email: 'apmanager@mygyanvihar.com',
    use: 'Pay',
    checks: [
      { name: 'purchase orders', path: '/api/operations/p2p/purchase-orders', method: 'GET' },
      { name: 'fraud signals', path: '/api/operations/p2p/analytics/fraud-signals', method: 'GET' },
    ],
  },
  {
    key: 'InternalAuditor',
    email: 'auditor@mygyanvihar.com',
    use: 'Fraud read-only',
    checks: [
      { name: 'fraud signals', path: '/api/operations/p2p/analytics/fraud-signals', method: 'GET' },
      { name: 'org pillars', path: '/api/operations/org/pillars', method: 'GET' },
      { name: 'POST split-scan denied', path: '/api/operations/p2p/analytics/invoice-split-scan', method: 'POST', expectForbidden: true },
    ],
  },
  {
    key: 'DeanOfResearch',
    email: 'dean.research@mygyanvihar.com',
    use: 'RMS',
    checks: [
      { name: 'research proposals', path: '/api/research/proposals', method: 'GET' },
      { name: 'research grants', path: '/api/research/grants', method: 'GET' },
    ],
  },
  {
    key: 'Legal',
    email: 'legal@mygyanvihar.com',
    use: 'MOU',
    checks: [
      { name: 'MOU list', path: '/api/uos/legal/mous', method: 'GET' },
    ],
  },
  {
    key: 'Estate',
    email: 'estate@mygyanvihar.com',
    use: 'Space',
    checks: [
      { name: 'space bookings', path: '/api/uos/space/bookings', method: 'GET' },
      { name: 'ESM queues', path: '/api/operations/esm/queues', method: 'GET' },
    ],
  },
  {
    key: 'Buyer',
    email: 'buyer.it@mygyanvihar.com',
    use: 'Org pillars',
    checks: [
      { name: 'requisitions read', path: '/api/operations/p2p/requisitions', method: 'GET' },
      { name: 'catalog', path: '/api/operations/p2p/catalog', method: 'GET' },
    ],
  },
];

const results = [];

async function req(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function login(email) {
  const res = await req('POST', '/api/auth/local-login', null, {
    email,
    password: 'password123',
  });
  if (!res.ok || !res.data?.token) {
    throw new Error(`${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function main() {
  console.log(`Portal persona smoke → ${BASE}\n`);
  const summary = [];

  for (const persona of PERSONAS) {
    console.log(`\n=== ${persona.key} (${persona.email}) — ${persona.use} ===`);
    let token;
    let role;
    try {
      const session = await login(persona.email);
      token = session.token;
      role = session.user?.primaryRole ?? session.user?.role ?? '?';
      console.log(`  PASS  login — role=${role}`);
      results.push({ persona: persona.key, check: 'login', ok: true });
    } catch (e) {
      console.log(`  FAIL  login: ${e.message}`);
      results.push({ persona: persona.key, check: 'login', ok: false, detail: e.message });
      summary.push({ persona: persona.key, ok: false, failed: ['login'] });
      continue;
    }

    const failed = [];
    for (const check of persona.checks) {
      const r = await req(check.method || 'GET', check.path, token);
      const pass = check.expectForbidden
        ? r.status === 403
        : r.ok;
      const label = `${check.name} [${check.method || 'GET'} ${check.path}]`;
      if (pass) {
        console.log(`  PASS  ${label}${!check.expectForbidden && Array.isArray(r.data) ? ` (n=${r.data.length})` : ''}`);
        results.push({ persona: persona.key, check: check.name, ok: true });
      } else {
        const detail = `${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`;
        console.log(`  FAIL  ${label}: ${detail}`);
        results.push({ persona: persona.key, check: check.name, ok: false, detail });
        failed.push(check.name);
      }
    }
    summary.push({ persona: persona.key, ok: failed.length === 0, failed, role });
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n======== ${passed} passed, ${failed} failed / ${results.length} checks ========\n`);
  console.log('Summary by persona:');
  for (const s of summary) {
    console.log(
      `  ${s.ok ? 'OK ' : 'BAD'} ${s.persona}${s.role ? ` (${s.role})` : ''}${s.failed?.length ? ` — failed: ${s.failed.join(', ')}` : ''}`,
    );
  }

  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
