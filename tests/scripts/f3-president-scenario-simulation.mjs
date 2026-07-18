#!/usr/bin/env node
/**
 * Phase F.3 — President Executive Scenario Simulation
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.FALCON_API_URL || 'http://localhost:4000';
const TENANT = process.env.FALCON_TENANT || 'sgvu';
const PASSWORD = process.env.FALCON_TEST_PASSWORD || 'password123';

const PERSONAS = {
  president: 'president@mygyanvihar.com',
  registrar: 'dev.registrar@mygyanvihar.com',
  finance: 'finance@mygyanvihar.com',
  student: 'student.me@mygyanvihar.com',
};

const results = [];
const artifacts = {
  orders: [],
  hrReviews: [],
  ratifications: [],
  grievances: [],
  complianceActions: [],
  meetingItems: [],
  budgetReviews: [],
};

function record(scenario, step, status, detail = '') {
  results.push({ scenario, step, status, detail, at: new Date().toISOString() });
  const icon = status === 'PASS' ? '✓' : status === 'WARN' ? '⚠' : '✗';
  console.log(`${icon} [${scenario}] ${step}${detail ? `: ${detail}` : ''}`);
}

async function login(email) {
  const res = await fetch(`${API}/auth/local-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-subdomain': TENANT },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${email}: ${res.status}`);
  const data = await res.json();
  return { token: data.token, user: data.user };
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-tenant-subdomain': TENANT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function auditFor(token, table, recordId) {
  const q = recordId
    ? `/api/leadership/audit-log?table=${encodeURIComponent(table)}&record_id=${encodeURIComponent(recordId)}&limit=30`
    : `/api/leadership/audit-log?table=${encodeURIComponent(table)}&limit=30`;
  const res = await api(token, 'GET', q);
  const rows = Array.isArray(res.json) ? res.json : [];
  const actions = rows.map((r) => {
    try {
      const nv = typeof r.new_value === 'string' ? JSON.parse(r.new_value) : r.new_value;
      return String(nv?._meta?.action ?? r.action ?? '');
    } catch {
      return String(r.action ?? '');
    }
  });
  return { ok: res.ok, rows, actions };
}

function auditMatches(audit, pattern) {
  return audit.actions.some((a) => a.includes(pattern));
}

async function notifications(token) {
  const res = await api(token, 'GET', '/api/notifications?limit=30');
  return { ok: res.ok, items: Array.isArray(res.json) ? res.json : res.json?.items ?? [] };
}

async function executiveSummary(token) {
  return api(token, 'GET', '/api/president/executive-summary');
}

async function warehouse(token, dataset) {
  return api(token, 'GET', `/api/reports/warehouse/${dataset}`);
}

/** Scenario A — Annual Budget Approval */
async function scenarioA(president, finance) {
  const s = 'A-BudgetApproval';
  const budgetView = await api(president.token, 'GET', '/api/president/finance-budget');
  record(
    s,
    'Finance budget review API',
    budgetView.ok ? 'PASS' : 'WARN',
    `pending=${budgetView.json?.pending_approvals ?? '?'}`,
  );

  let inbox = await api(president.token, 'GET', '/api/leadership/action/approvals/inbox');
  let pending = (Array.isArray(inbox.json) ? inbox.json : []).filter(
    (r) => r.category === 'BUDGET' && r.status === 'PENDING',
  );

  if (!pending.length && finance?.token) {
    const budgets = await api(finance.token, 'GET', '/api/finance/budgets');
    const budgetId = Array.isArray(budgets.json) ? budgets.json[0]?.budget_id : budgets.json?.budgets?.[0]?.budget_id;
    if (budgetId) {
      const created = await api(finance.token, 'POST', '/api/finance/budget-expansion', {
        budget_id: budgetId,
        requested_amount: 1800000,
        reason: 'F.3 scenario — finance-prepared annual budget expansion',
      });
      record(
        s,
        'Finance prepares budget',
        created.ok ? 'PASS' : 'WARN',
        created.json?.request_id ?? created.status,
      );
      inbox = await api(president.token, 'GET', '/api/leadership/action/approvals/inbox');
      pending = (Array.isArray(inbox.json) ? inbox.json : []).filter(
        (r) => r.category === 'BUDGET' && r.status === 'PENDING',
      );
    }
  }

  record(s, 'Budget request in executive inbox', pending.length ? 'PASS' : 'WARN', `count=${pending.length}`);

  if (!pending.length) {
    record(s, 'President budget approval', 'WARN', 'No pending budget expansion to approve');
    record(s, 'Finance DB update', 'WARN', 'Skipped — no request');
    record(s, 'Audit trail', 'WARN', 'Skipped');
    record(s, 'Warehouse governance export', (await warehouse(president.token, 'governance')).ok ? 'PASS' : 'WARN');
    record(s, 'Executive dashboard refresh', (await executiveSummary(president.token)).ok ? 'PASS' : 'FAIL');
    return;
  }

  const req = pending[0];
  const before = await executiveSummary(president.token);
  const review = await api(president.token, 'POST', '/api/leadership/action/approvals/review', {
    category: 'BUDGET',
    id: req.id,
    approve: true,
    note: 'F.3 scenario — annual budget approved',
  });
  record(s, 'President budget approval', review.ok ? 'PASS' : 'FAIL', review.json?.status ?? review.status);
  artifacts.budgetReviews.push({ id: req.id, status: review.json?.status });

  const inboxAfter = await api(president.token, 'GET', '/api/leadership/action/approvals/inbox');
  const stillPending = (Array.isArray(inboxAfter.json) ? inboxAfter.json : []).some(
    (r) => r.id === req.id && r.status === 'PENDING',
  );
  record(s, 'Finance DB update (inbox cleared)', !stillPending ? 'PASS' : 'FAIL');

  const audit = await auditFor(president.token, 'fin_budget_expansion_requests', req.id);
  record(
    s,
    'Audit trail',
    auditMatches(audit, 'PRESIDENT_BUDGET') || auditMatches(audit, 'BUDGET') ? 'PASS' : 'WARN',
    `rows=${audit.rows.length}`,
  );

  const notify = await notifications(president.token);
  record(s, 'Notifications API reachable', notify.ok ? 'PASS' : 'WARN');

  const wh = await warehouse(president.token, 'governance');
  record(s, 'Warehouse governance', wh.ok ? 'PASS' : 'WARN', `rows=${wh.json?.row_count ?? 0}`);

  const after = await executiveSummary(president.token);
  record(s, 'Executive dashboard refresh', after.ok ? 'PASS' : 'FAIL');
  record(
    s,
    'Dashboard KPI delta',
    before.ok && after.ok ? 'PASS' : 'WARN',
    `pending_approvals ${before.json?.pending_governance_tasks ?? '?'} → ${after.json?.pending_governance_tasks ?? '?'}`,
  );
}

/** Scenario B — Convocation Ratification */
async function scenarioB(president, registrar) {
  const s = 'B-ConvocationRatification';
  let pending = await api(president.token, 'GET', '/api/president/convocation/pending-ratification');
  let apps = Array.isArray(pending.json) ? pending.json : [];

  if (!apps.length) {
    const regPending = await api(registrar.token, 'GET', '/api/certificate-automation/applications/pending-verification');
    const toVerify = Array.isArray(regPending.json) ? regPending.json[0] : null;
    if (toVerify?.application_id) {
      const verify = await api(registrar.token, 'POST', `/api/certificate-automation/applications/${toVerify.application_id}/verify`, {
        action: 'approve',
      });
      record(s, 'Registrar publishes (verify)', verify.ok ? 'PASS' : 'WARN', toVerify.application_id);
      pending = await api(president.token, 'GET', '/api/president/convocation/pending-ratification');
      apps = Array.isArray(pending.json) ? pending.json : [];
    } else {
      record(s, 'Registrar publishes', 'WARN', 'No applications pending verification');
    }
  } else {
    record(s, 'Registrar publishes (pre-verified)', 'PASS', `${apps.length} awaiting ratification`);
  }

  record(s, 'President review queue', apps.length ? 'PASS' : 'WARN', `count=${apps.length}`);
  if (!apps.length) {
    record(s, 'Ratify & certificate release', 'WARN', 'Skipped — no application');
    return;
  }

  const appId = apps[0].application_id;
  const ratify = await api(president.token, 'POST', `/api/president/convocation/${appId}/ratify`, {
    approve: true,
    note: 'F.3 convocation ratification',
  });
  record(s, 'President ratify', ratify.ok ? 'PASS' : 'FAIL', appId);
  artifacts.ratifications.push(appId);

  const audit = await auditFor(president.token, 'cert_applications', appId);
  record(
    s,
    'Audit trail',
    auditMatches(audit, 'CONVOCATION') || auditMatches(audit, 'CERTIFICATE') ? 'PASS' : 'WARN',
  );

  const whCert = await warehouse(president.token, 'certificates');
  const whConv = await warehouse(president.token, 'convocation');
  record(s, 'Warehouse certificates', whCert.ok ? 'PASS' : 'WARN', `rows=${whCert.json?.row_count ?? 0}`);
  record(s, 'Warehouse convocation', whConv.ok ? 'PASS' : 'WARN', `rows=${whConv.json?.row_count ?? 0}`);

  const summary = await executiveSummary(president.token);
  record(
    s,
    'President KPI update',
    summary.ok ? 'PASS' : 'FAIL',
    `pending_ratify=${summary.json?.pending_convocation_ratifications ?? '?'}`,
  );
}

/** Scenario C — HR Hiring Approval */
async function scenarioC(president) {
  const s = 'C-HR HiringApproval';
  const hr = await api(president.token, 'GET', '/api/president/hr-approvals');
  const pending = Array.isArray(hr.json?.approvals) ? hr.json.approvals : [];
  record(s, 'HR submits (inbox)', pending.length ? 'PASS' : 'WARN', `count=${pending.length}`);

  if (!pending.length) {
    record(s, 'President approves', 'WARN', 'No pending HR requests');
    return;
  }

  const req = pending[0];
  const before = await executiveSummary(president.token);
  const review = await api(president.token, 'POST', `/api/president/hr-approvals/${req.request_id}/review`, {
    approve: true,
    note: 'F.3 hiring approved',
  });
  record(s, 'President approves', review.ok ? 'PASS' : 'FAIL');
  artifacts.hrReviews.push(req.request_id);

  const tasks = await api(president.token, 'GET', '/api/leadership/action/tasks');
  const hrTask = (Array.isArray(tasks.json) ? tasks.json : []).some((t) =>
    String(t.title ?? '').includes('Execute approved HR request'),
  );
  record(s, 'HR destination task created', hrTask ? 'PASS' : 'WARN');

  const audit = await auditFor(president.token, 'executive_hr_approval_requests', req.request_id);
  record(
    s,
    'Audit trail',
    auditMatches(audit, 'HR') || audit.rows.length ? 'PASS' : 'WARN',
    `rows=${audit.rows.length}`,
  );

  const after = await executiveSummary(president.token);
  record(
    s,
    'Executive summary HR KPI',
    after.ok ? 'PASS' : 'FAIL',
    `pending_hr ${before.json?.pending_hr_approvals ?? '?'} → ${after.json?.pending_hr_approvals ?? '?'}`,
  );

  record(s, 'Employee record / payroll', 'WARN', 'Propagation via HR executive task; direct row insert not in scope');
}

/** Scenario D — Major Student Grievance */
async function scenarioD(president) {
  const s = 'D-GrievanceEscalation';
  const issues = await api(president.token, 'GET', '/api/leadership/issues');
  record(s, 'Escalation inbox API', issues.ok ? 'PASS' : 'FAIL');

  const inbox = issues.json?.escalation_inbox ?? [];
  let ticket = inbox.find(
    (t) => Number(t.escalation_level ?? 0) >= 4 && !t.president_decision,
  );
  if (!ticket) {
    ticket = inbox.find((t) => Number(t.escalation_level ?? 0) >= 4);
  }

  if (!ticket?.ticket_id) {
    record(s, 'President executive decision', 'WARN', 'No level-4+ grievance in seed data');
    return;
  }

  const decide = await api(president.token, 'POST', `/api/president/grievances/${ticket.ticket_id}/decide`, {
    decision: 'F.3 — Assign special officer for resolution within 7 days',
  });
  record(s, 'President decision', decide.ok ? 'PASS' : 'FAIL', ticket.ticket_id);
  artifacts.grievances.push(ticket.ticket_id);

  const audit = await auditFor(president.token, 'helpdesk_tickets', ticket.ticket_id);
  record(
    s,
    'Audit trail',
    auditMatches(audit, 'GRIEVANCE') || auditMatches(audit, 'PRESIDENT') ? 'PASS' : 'WARN',
    `rows=${audit.rows.length}`,
  );

  record(s, 'Dashboard refresh', (await executiveSummary(president.token)).ok ? 'PASS' : 'FAIL');
}

/** Scenario E — Compliance Escalation */
async function scenarioE(president) {
  const s = 'E-ComplianceEscalation';
  const compliance = await api(president.token, 'GET', '/api/president/compliance');
  const units = Array.isArray(compliance.json?.defaulting_units) ? compliance.json.defaulting_units : [];
  record(s, 'IQAC compliance visibility', compliance.ok ? 'PASS' : 'FAIL', `units=${units.length}`);

  if (!units.length) {
    record(s, 'President investigation action', 'WARN', 'No pending IQAC assignments in seed');
    record(s, 'Warehouse governance', (await warehouse(president.token, 'governance')).ok ? 'PASS' : 'WARN');
    return;
  }

  const assignmentId = units[0].assignment_id;
  const action = await api(president.token, 'POST', `/api/president/compliance/${assignmentId}/action`, {
    action: 'ASSIGN_INVESTIGATION',
    note: 'F.3 compliance investigation',
  });
  record(s, 'President investigation', action.ok ? 'PASS' : 'FAIL', assignmentId);
  artifacts.complianceActions.push(assignmentId);

  const audit = await auditFor(president.token, 'task_assignments', assignmentId);
  record(s, 'Audit trail', auditMatches(audit, 'COMPLIANCE') ? 'PASS' : 'WARN');

  record(s, 'Executive summary', (await executiveSummary(president.token)).ok ? 'PASS' : 'FAIL');
}

/** Scenario F — Executive Orders lifecycle */
async function scenarioF(president) {
  const s = 'F-ExecutiveOrders';
  const create = await api(president.token, 'POST', '/api/president/executive-orders', {
    subject: 'F.3 Scenario — Campus-wide audit directive',
    body: 'Complete departmental compliance packs within 14 days.',
    destination_module: 'IQAC',
    order_type: 'ADMINISTRATIVE',
  });
  record(s, 'President issues order', create.ok ? 'PASS' : 'FAIL', create.json?.order_code ?? create.status);
  const orderId = create.json?.order_id;
  artifacts.orders.push(orderId);

  const list = await api(president.token, 'GET', '/api/president/executive-orders');
  const found = (list.json?.orders ?? []).some((o) => o.order_id === orderId || o.id === create.json?.order_code);
  record(s, 'Order persisted (no disappear)', found ? 'PASS' : 'FAIL');

  if (orderId) {
    const ack = await api(president.token, 'PATCH', `/api/president/executive-orders/${orderId}/status`, {
      status: 'IN_PROGRESS',
    });
    record(s, 'Progress update', ack.ok ? 'PASS' : 'FAIL');
    const done = await api(president.token, 'PATCH', `/api/president/executive-orders/${orderId}/status`, {
      status: 'COMPLETED',
    });
    record(s, 'Completion', done.ok ? 'PASS' : 'FAIL', done.json?.status);
  }

  const audit = orderId ? await auditFor(president.token, 'leadership_executive_orders', orderId) : { rows: [], actions: [] };
  record(
    s,
    'Audit lifecycle',
    audit.rows.length >= 1 ? 'PASS' : 'WARN',
    `rows=${audit.rows.length}, actions=${audit.actions.slice(0, 3).join('|')}`,
  );

  record(s, 'Executive dashboard', (await executiveSummary(president.token)).ok ? 'PASS' : 'FAIL');
}

/** Scenario G — Executive Meeting action items */
async function scenarioG(president) {
  const s = 'G-ExecutiveMeeting';
  const meetings = await api(president.token, 'GET', '/api/meetings');
  record(s, 'Meetings API', meetings.ok ? 'PASS' : 'FAIL');
  let list = Array.isArray(meetings.json) ? meetings.json : meetings.json?.meetings ?? [];
  let meeting = list[0];

  if (!meeting?.meeting_id) {
    const eligible = await api(president.token, 'GET', '/api/meetings/eligible-participants?direction=schedule');
    const inviteeList = Array.isArray(eligible.json?.participants)
      ? eligible.json.participants
      : Array.isArray(eligible.json)
        ? eligible.json
        : [];
    const invitee = inviteeList[0]?.user_id ?? null;
    const meetingAt = new Date(Date.now() + 86400000).toISOString();
    const scheduled = await api(president.token, 'POST', '/api/meetings/schedule', {
      title: 'F.3 Executive Council',
      venue: 'Board Room',
      meeting_at: meetingAt,
      agenda: 'Scenario G simulation',
      invitee_user_ids: invitee ? [invitee] : [],
    });
    record(s, 'Schedule meeting', scheduled.ok ? 'PASS' : 'WARN', scheduled.json?.meeting_id ?? scheduled.status);
    const reload = await api(president.token, 'GET', '/api/meetings');
    list = Array.isArray(reload.json) ? reload.json : reload.json?.meetings ?? [];
    meeting = list[0];
  }
  if (!meeting?.meeting_id) {
    record(s, 'Action items from minutes', 'WARN', 'No meetings scheduled');
    return;
  }

  const assignee = meeting.participants?.find((p) => p.participant_role !== 'ORGANIZER')?.user_id
    ?? president.user.user_id;

  const items = await api(president.token, 'POST', `/api/president/meetings/${meeting.meeting_id}/action-items`, {
    items: [
      { title: 'F.3 — Submit NAAC evidence pack', assigned_to_user_id: assignee },
      { title: 'F.3 — Review faculty retention report', assigned_to_user_id: assignee },
    ],
  });
  record(s, 'Action items created', items.ok ? 'PASS' : 'FAIL', `count=${items.json?.action_item_ids?.length ?? 0}`);
  artifacts.meetingItems.push(meeting.meeting_id);

  const tasks = await api(president.token, 'GET', '/api/leadership/action/tasks');
  const linked = (Array.isArray(tasks.json) ? tasks.json : []).filter((t) =>
    String(t.title ?? '').includes('F.3 —'),
  );
  record(s, 'Executive tasks assigned', linked.length >= 1 ? 'PASS' : 'WARN', `tasks=${linked.length}`);

  const audit = await auditFor(president.token, 'meeting_executive_action_items', meeting.meeting_id);
  record(s, 'Audit trail', audit.rows.length ? 'PASS' : 'WARN');
}

async function stressTest(president) {
  const s = 'STRESS-Concurrent';
  const ops = await Promise.all([
    api(president.token, 'POST', '/api/president/executive-orders', {
      subject: 'Stress order 1',
      body: 'Parallel test',
      destination_module: 'HR',
    }),
    api(president.token, 'POST', '/api/president/executive-orders', {
      subject: 'Stress order 2',
      body: 'Parallel test',
      destination_module: 'FINANCE',
    }),
    api(president.token, 'GET', '/api/president/executive-summary'),
    api(president.token, 'GET', '/api/president/hr-approvals'),
    api(president.token, 'GET', '/api/president/compliance'),
  ]);
  const ok = ops.filter((o) => o.ok).length;
  record(s, 'Parallel president operations', ok === ops.length ? 'PASS' : 'WARN', `${ok}/${ops.length} OK`);

  const orders = await api(president.token, 'GET', '/api/president/executive-orders');
  const stressCodes = (orders.json?.orders ?? []).filter((o) => String(o.subject ?? '').startsWith('Stress order'));
  record(s, 'Order list consistency', stressCodes.length >= 2 ? 'PASS' : 'WARN', `found=${stressCodes.length}`);
}

async function regression(president) {
  const s = 'REGRESSION-ReadPaths';
  const paths = [
    '/api/president/academics',
    '/api/president/finance',
    '/api/president/research',
    '/api/president/compliance',
    '/api/president/hr-analytics',
    '/api/president/finance-budget',
    '/api/president/convocation',
    '/api/president/executive-orders',
    '/api/president/hr-approvals',
    '/api/leadership/issues',
    '/api/meetings',
  ];
  let pass = 0;
  for (const path of paths) {
    const res = await api(president.token, 'GET', path);
    if (res.ok) pass += 1;
    else record(s, path, 'FAIL', String(res.status));
  }
  record(s, 'All regression GET endpoints', pass === paths.length ? 'PASS' : 'FAIL', `${pass}/${paths.length}`);
}

function scoreResults() {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const total = results.length || 1;
  const score = Math.round(((pass + warn * 0.5) / total) * 100);
  return { pass, warn, fail, score, total };
}

async function main() {
  console.log(`F.3 President Scenario Simulation — ${API}\n`);
  let president, registrar, finance;
  try {
    president = await login(PERSONAS.president);
    record('AUTH', 'President login', 'PASS');
    registrar = await login(PERSONAS.registrar);
    record('AUTH', 'Registrar login', 'PASS');
    finance = await login(PERSONAS.finance);
    record('AUTH', 'Finance login', 'PASS');
  } catch (e) {
    record('AUTH', 'Login', 'FAIL', e.message);
    writeReport({ pass: 0, warn: 0, fail: 1, score: 0, total: 1 });
    process.exit(1);
  }

  await scenarioA(president, finance);
  await scenarioB(president, registrar);
  await scenarioC(president);
  await scenarioD(president);
  await scenarioE(president);
  await scenarioF(president);
  await scenarioG(president);
  await stressTest(president);
  await regression(president);

  const stats = scoreResults();
  console.log(`\nScore: ${stats.score}/100 (${stats.pass} PASS, ${stats.warn} WARN, ${stats.fail} FAIL)`);
  writeReport(stats);
}

function writeReport(stats) {
  const outDir = join(__dirname, '..', 'reports');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    phase: 'F.3',
    generated_at: new Date().toISOString(),
    api: API,
    tenant: TENANT,
    production_readiness_score: stats.score,
    summary: stats,
    artifacts,
    results,
  };
  writeFileSync(join(outDir, 'f3-president-scenario-results.json'), JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
