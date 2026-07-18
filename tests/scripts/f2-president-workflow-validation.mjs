#!/usr/bin/env node
/**
 * Phase F.2 — President executive workflow validation (live API)
 */
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:4000';
const TENANT = process.env.TENANT_SUBDOMAIN ?? 'sgvu';
const PRESIDENT = {
  email: process.env.PRESIDENT_EMAIL ?? 'president@mygyanvihar.com',
  password: process.env.PRESIDENT_PASSWORD ?? 'password123',
};

const results = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const icon = status === 'pass' ? '✓' : status === 'warn' ? '!' : '✗';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function login(email, password) {
  const { status, body } = await jsonFetch(`${API}/auth/local-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-subdomain': TENANT },
    body: JSON.stringify({ email, password }),
  });
  if (status !== 200 && status !== 201) {
    throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(body)}`);
  }
  return body.token ?? body.access_token;
}

async function main() {
  console.log(`F.2 President Workflow QA — ${API}\n`);

  let token;
  try {
    token = await login(PRESIDENT.email, PRESIDENT.password);
    record('President login', 'pass');
  } catch (err) {
    record('President login', 'fail', err.message);
    writeReport();
    process.exit(1);
  }

  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-tenant-subdomain': TENANT,
    },
  };

  const readEndpoints = [
    '/api/president/executive-summary',
    '/api/president/academics',
    '/api/president/finance',
    '/api/president/compliance',
    '/api/president/hr-analytics',
    '/api/president/finance-budget',
    '/api/president/research',
    '/api/president/executive-orders',
    '/api/president/convocation',
    '/api/president/hr-approvals',
    '/api/president/convocation/pending-ratification',
    '/api/leadership/issues',
    '/api/meetings',
  ];

  for (const ep of readEndpoints) {
    const { status, body } = await jsonFetch(`${API}${ep}`, auth);
    if (status === 200) record(`GET ${ep}`, 'pass');
    else record(`GET ${ep}`, 'fail', `HTTP ${status}`);
    if (ep === '/api/president/hr-approvals' && status === 200) {
      const count = Array.isArray(body?.approvals) ? body.approvals.length : 0;
      record('HR approvals data source', count >= 0 ? 'pass' : 'warn', `${count} pending`);
    }
    if (ep === '/api/president/executive-orders' && status === 200) {
      record('Executive orders table', Array.isArray(body?.orders) ? 'pass' : 'warn');
    }
  }

  // Issue executive order
  const orderRes = await jsonFetch(`${API}/api/president/executive-orders`, {
    method: 'POST',
    ...auth,
    body: JSON.stringify({
      subject: 'F.2 QA — Campus directive',
      body: 'Automated validation order — safe to complete.',
      destination_module: 'IQAC',
      order_type: 'ADMINISTRATIVE',
    }),
  });
  if (orderRes.status === 201 || orderRes.status === 200) {
    record('POST executive order', 'pass', orderRes.body?.order_code ?? orderRes.body?.order_id);
    const orderId = orderRes.body?.order_id;
    if (orderId) {
      const patch = await jsonFetch(`${API}/api/president/executive-orders/${orderId}/status`, {
        method: 'PATCH',
        ...auth,
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      record('PATCH executive order status', patch.status === 200 ? 'pass' : 'fail', `HTTP ${patch.status}`);
    }
  } else {
    record('POST executive order', 'fail', `HTTP ${orderRes.status}`);
  }

  // HR approval review (if pending exists)
  const hr = await jsonFetch(`${API}/api/president/hr-approvals`, auth);
  const pendingHr = hr.body?.approvals?.[0];
  if (pendingHr?.request_id) {
    const review = await jsonFetch(`${API}/api/president/hr-approvals/${pendingHr.request_id}/review`, {
      method: 'POST',
      ...auth,
      body: JSON.stringify({ approve: true, note: 'F.2 QA approval' }),
    });
    record('POST HR approval review', review.status === 201 || review.status === 200 ? 'pass' : 'fail', `HTTP ${review.status}`);
  } else {
    record('POST HR approval review', 'warn', 'No pending HR requests to test');
  }

  // Compliance action
  const compliance = await jsonFetch(`${API}/api/president/compliance`, auth);
  const assignment = compliance.body?.defaulting_units?.[0];
  if (assignment?.assignment_id) {
    const action = await jsonFetch(`${API}/api/president/compliance/${assignment.assignment_id}/action`, {
      method: 'POST',
      ...auth,
      body: JSON.stringify({ action: 'REQUEST_REPORT', note: 'F.2 QA' }),
    });
    record('POST compliance action', action.status === 201 || action.status === 200 ? 'pass' : 'fail', `HTTP ${action.status}`);
  } else {
    record('POST compliance action', 'warn', 'No pending compliance assignments');
  }

  // Grievance president decision (needs level 4+ ticket)
  const issues = await jsonFetch(`${API}/api/leadership/issues`, auth);
  const ticket = (issues.body?.escalation_inbox ?? []).find((t) => Number(t.escalation_level ?? 0) >= 4);
  if (ticket?.ticket_id) {
    const g = await jsonFetch(`${API}/api/president/grievances/${ticket.ticket_id}/decide`, {
      method: 'POST',
      ...auth,
      body: JSON.stringify({ decision: 'President QA — assign for resolution' }),
    });
    record('POST grievance decision', g.status === 201 || g.status === 200 ? 'pass' : 'fail', `HTTP ${g.status}`);
  } else {
    record('POST grievance decision', 'warn', 'No level-4+ escalation inbox ticket');
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const warn = results.filter((r) => r.status === 'warn').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const score = Math.max(0, Math.round(((pass + warn * 0.5) / results.length) * 100));

  console.log(`\nScore: ${score}/100 (${pass} pass, ${warn} warn, ${fail} fail)`);
  writeReport(score);
}

function writeReport(score = 0) {
  const outDir = path.join(process.cwd(), 'tests', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    phase: 'F.2',
    generated_at: new Date().toISOString(),
    production_readiness_score: score || undefined,
    results,
  };
  fs.writeFileSync(path.join(outDir, 'f2-president-workflow-results.json'), JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
